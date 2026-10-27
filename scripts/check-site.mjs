import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  cpSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "bobs-pond-check-"));
const output = join(temporary, "public");
const base = "https://bobliu.cc/";
const build = (source = root) =>
  execFileSync(
    "hugo",
    [
      "--gc",
      "--minify",
      "--baseURL",
      base,
      "--destination",
      output,
      "--cleanDestinationDir",
    ],
    { cwd: source, stdio: "pipe" },
  );
const text = (path) => readFileSync(join(output, path), "utf8");
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
}

try {
  build();
  const index = JSON.parse(text("index.json"));
  assert.equal(index.length, 4, "All four posts must be searchable");
  assert.ok(
    index.some((entry) => entry.title === "Hugo Learning"),
    "Malformed front matter must be repaired",
  );
  const legacy = [
    "posts/post_01/personal-page-build/",
    "posts/post_02/hugo_learning/",
    "posts/post_03/在远程服务器上配置codex/",
    "posts/post_04/web-access-skill-完全指南/",
  ];
  for (const path of [
    ...legacy,
    "blog/",
    "projects/",
    "gallery/",
    "about/",
    "archives/",
    "search/",
    "tags/",
  ]) {
    assert.ok(
      existsSync(join(output, path, "index.html")),
      `Missing preserved route: ${path}`,
    );
  }
  for (const entry of index)
    assert.ok(
      entry.title &&
        entry.url &&
        entry.content &&
        !entry.content.startsWith("[[]]"),
    );
  assert.match(text("projects/index.html"), /coming soon\./);
  assert.match(text("gallery/index.html"), /coming soon\./);
  const home = text("index.html");
  assert.match(home, /id=ascii-background/);
  assert.ok(
    !home.includes("data-koi-count") && !home.includes("data-food-count"),
  );
  const background = home.match(/data-image=(?:"([^"]+)"|([^\s>]+))/);
  assert.ok(background, "Homepage must reference the ASCII image source");
  const backgroundFile = join(
    output,
    decodeURIComponent(background[1] || background[2]),
  );
  assert.ok(
    existsSync(backgroundFile),
    "The fingerprinted background must be published",
  );
  assert.ok(
    statSync(backgroundFile).size < 400 * 1024,
    "Publish an optimized image instead of the original photo",
  );
  assert.match(
    text("posts/post_02/hugo_learning/index.html"),
    /<title>Hugo Learning/,
  );
  assert.ok(
    !text("sitemap.xml").includes("localhost"),
    "Sitemap must use the production domain",
  );
  assert.equal((text("index.xml").match(/<item>/g) || []).length, 4);
  assert.ok(
    !text("index.xml").includes("&amp;lt;p&amp;gt;"),
    "RSS body must not be double-escaped",
  );

  for (const file of files(output).filter((path) => path.endsWith(".html"))) {
    const html = readFileSync(file, "utf8");
    for (const match of html.matchAll(
      /\s(?:href|src|data-image)=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g,
    )) {
      const href = match[1] || match[2] || match[3];
      if (href.startsWith("#")) continue;
      if (/^(?:mailto:|tel:|data:|javascript:)/.test(href)) continue;
      const url = new URL(
        href,
        base + file.slice(output.length + 1).replace(/index\.html$/, ""),
      );
      if (url.origin !== new URL(base).origin) continue;
      const path = join(output, decodeURIComponent(url.pathname));
      assert.ok(
        existsSync(path) || existsSync(join(path, "index.html")),
        `Broken local link in ${file.slice(output.length)}: ${href}`,
      );
    }
  }
  console.log(
    "✓ Production build, four legacy article routes, search index, RSS, sitemap, and local assets",
  );

  const fixtureRoot = join(temporary, "fixture");
  mkdirSync(fixtureRoot);
  for (const dir of ["config", "layouts", "assets", "static"])
    cpSync(join(root, dir), join(fixtureRoot, dir), { recursive: true });
  const content = join(fixtureRoot, "content");
  const data = join(fixtureRoot, "data");
  cpSync(join(root, "content"), content, { recursive: true });
  cpSync(join(root, "data"), data, { recursive: true });
  mkdirSync(join(content, "projects/test-project"), { recursive: true });
  writeFileSync(
    join(content, "projects/test-project/index.md"),
    '---\ntitle: Test project\ndate: 2026-01-01\nyear: "2026"\nsummary: Test summary\ncover: cover.svg\n---\n\n## A real content template\n\nBody text.',
  );
  writeFileSync(
    join(content, "projects/test-project/cover.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#b35c3e"/></svg>',
  );
  rmSync(join(data, "gallery.yaml"));
  writeFileSync(
    join(data, "gallery.json"),
    JSON.stringify({
      works: [
        {
          title: "Test artwork",
          image: "/apple-touch-icon.png",
          year: "2026",
          description: "Temporary QA fixture",
          order: 2,
        },
        {
          title: "Another work",
          image: "/favicon-32x32.png",
          year: "2025",
          order: 1,
        },
      ],
    }),
  );
  build(fixtureRoot);
  assert.match(text("projects/index.html"), /class=project-card/);
  assert.match(
    text("projects/index.html"),
    /\/projects\/test-project\/cover.svg/,
  );
  assert.match(
    text("projects/test-project/index.html"),
    /A real content template/,
  );
  assert.match(text("gallery/index.html"), /gallery-lightbox/);
  assert.equal(
    (text("gallery/index.html").match(/data-gallery-open/g) || []).length,
    2,
  );
  console.log(
    "✓ Populated project and gallery templates using isolated, temporary fixtures",
  );
} finally {
  if (process.env.KEEP_PREVIEW_FIXTURES === "1")
    console.log(`QA files retained at ${temporary}`);
  else rmSync(temporary, { recursive: true, force: true });
}
