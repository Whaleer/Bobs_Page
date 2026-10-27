const root = document.documentElement;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

function updateThemeLabels() {
  const next = root.dataset.theme === "light" ? "dark" : "light";
  document
    .querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")
    .forEach((button) => {
      button.setAttribute("aria-label", `Switch to ${next} mode`);
      button.title = `Switch to ${next} mode`;
    });
}

document
  .querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
      try {
        localStorage.setItem("pref-theme", root.dataset.theme);
      } catch {
        /* Storage may be unavailable. */
      }
      updateThemeLabels();
      window.dispatchEvent(new Event("site:theme"));
    });
  });
updateThemeLabels();

const menu = document.querySelector<HTMLDialogElement>("#mobile-menu");
const menuToggle =
  document.querySelector<HTMLButtonElement>("[data-menu-toggle]");
if (menu && menuToggle) {
  menuToggle.addEventListener("click", () => {
    menu.showModal();
    menuToggle.setAttribute("aria-expanded", "true");
  });
  menu
    .querySelector("[data-menu-close]")
    ?.addEventListener("click", () => menu.close());
  menu
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", () => menu.close()));
  menu.addEventListener("close", () => {
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.focus({ preventScroll: true });
  });
  window
    .matchMedia("(min-width:1024px)")
    .addEventListener("change", (event) => {
      if (event.matches && menu.open) menu.close();
    });
}

document.querySelectorAll<HTMLElement>(".prose pre").forEach((pre) => {
  const block = pre.parentElement?.classList.contains("highlight") ? pre.parentElement : pre;
  const code = pre.querySelector("code");
  if (!code) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-copy";
  button.textContent = "copy";
  button.setAttribute("aria-label", "Copy code");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent || "");
      button.textContent = "copied ✓";
      button.setAttribute("aria-label", "Copied to clipboard");
    } catch {
      button.textContent = "select code";
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    window.setTimeout(() => {
      button.textContent = "copy";
      button.setAttribute("aria-label", "Copy code");
    }, 1800);
  });
  block.append(button);
});

interface SearchEntry {
  title: string;
  url: string;
  summary: string;
  content: string;
  tags: string[];
  date: string;
}
const search = document.querySelector<HTMLInputElement>("#search-input");
const results = document.querySelector<HTMLElement>("#search-results");
const searchStatus = document.querySelector<HTMLElement>(".search-status");
if (search && results && searchStatus) {
  let entries: Promise<SearchEntry[]> | undefined;
  let generation = 0;
  const load = (): Promise<SearchEntry[]> =>
    (entries ??= fetch(search.dataset.searchIndex || "/index.json")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load index");
        return response.json();
      })
      .catch((error) => {
        entries = undefined;
        throw error;
      }));
  const render = async () => {
    const current = ++generation;
    const query = search.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    if (!query) {
      searchStatus.textContent = "Search in English or Chinese.";
      return;
    }
    searchStatus.textContent = "Searching…";
    try {
      const index = await load();
      if (current !== generation) return;
      const words = query.split(/\s+/);
      const ranked = index
        .map((entry) => {
          const title = entry.title.toLocaleLowerCase();
          const tags = entry.tags.join(" ").toLocaleLowerCase();
          const text = `${title} ${tags} ${entry.content}`.toLocaleLowerCase();
          const matches = words.every((word) => text.includes(word));
          return {
            entry,
            score: matches
              ? words.reduce(
                  (sum, word) =>
                    sum +
                    (title.includes(word) ? 10 : tags.includes(word) ? 5 : 1),
                  0,
                )
              : 0,
          };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);
      searchStatus.textContent = ranked.length
        ? `${ranked.length} ${ranked.length === 1 ? "note" : "notes"} found.`
        : "No notes found. Try a different word.";
      for (const { entry } of ranked) {
        const link = document.createElement("a");
        link.className = "post-row";
        link.href = entry.url;
        const date = document.createElement("time");
        date.textContent = entry.date.split(",")[0];
        const body = document.createElement("div");
        const title = document.createElement("h2");
        title.textContent = entry.title;
        const summary = document.createElement("p");
        summary.className = "search-summary";
        summary.textContent = entry.summary;
        const arrow = document.createElement("span");
        arrow.className = "post-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "↗";
        body.append(title, summary);
        link.append(date, body, arrow);
        results.append(link);
      }
    } catch {
      if (current === generation)
        searchStatus.textContent =
          "Could not load search. Type again to retry, or browse the archive.";
    }
  };
  search.addEventListener("input", render);
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      !(event.target instanceof HTMLInputElement) &&
      !(event.target instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault();
      search.focus();
    }
  });
  const initialQuery = new URLSearchParams(window.location.search).get("q");
  if (initialQuery) {
    search.value = initialQuery;
    void render();
  }
}

const strip = document.querySelector<HTMLElement>("[data-project-strip]");
if (strip) {
  let target = strip.scrollLeft;
  let frame = 0;
  const animate = () => {
    const distance = target - strip.scrollLeft;
    strip.scrollLeft += distance * 0.18;
    if (Math.abs(distance) > 0.5) frame = requestAnimationFrame(animate);
    else {
      strip.scrollLeft = target;
      frame = 0;
    }
  };
  strip.addEventListener(
    "wheel",
    (event) => {
      if (
        !window.matchMedia("(min-width:1024px)").matches ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
        event.ctrlKey
      )
        return;
      event.preventDefault();
      if (!frame) target = strip.scrollLeft;
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? strip.clientWidth
            : 1);
      target = Math.max(
        0,
        Math.min(strip.scrollWidth - strip.clientWidth, target + delta),
      );
      if (reduced.matches) strip.scrollLeft = target;
      else if (!frame) frame = requestAnimationFrame(animate);
    },
    { passive: false },
  );
}

const galleryItems = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-gallery-open]"),
);
const viewer = document.querySelector<HTMLDialogElement>("#gallery-lightbox");
const viewerImage = document.querySelector<HTMLImageElement>("#lightbox-image");
const viewerCaption = document.querySelector<HTMLElement>("#lightbox-caption");
if (galleryItems.length && viewer && viewerImage && viewerCaption) {
  let active = 0;
  let opener: HTMLButtonElement | undefined;
  const previous = viewer.querySelector<HTMLButtonElement>(
    "[data-lightbox-prev]",
  )!;
  const next = viewer.querySelector<HTMLButtonElement>("[data-lightbox-next]")!;
  previous.disabled = next.disabled = galleryItems.length < 2;
  const show = (index: number) => {
    active = (index + galleryItems.length) % galleryItems.length;
    const item = galleryItems[active].dataset;
    viewerImage.src = item.image || "";
    viewerImage.alt = item.title || "";
    viewerCaption.textContent = [item.title, item.year, item.description]
      .filter(Boolean)
      .join(" · ");
  };
  galleryItems.forEach((item, index) =>
    item.addEventListener("click", () => {
      opener = item;
      show(index);
      viewer.showModal();
    }),
  );
  previous.addEventListener("click", () => show(active - 1));
  next.addEventListener("click", () => show(active + 1));
  viewer
    .querySelector("[data-lightbox-close]")
    ?.addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      show(active + (event.key === "ArrowLeft" ? -1 : 1));
    }
  });
  viewer.addEventListener("close", () =>
    opener?.focus({ preventScroll: true }),
  );
}
