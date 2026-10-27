import test from "node:test";
import assert from "node:assert/strict";
import {
  GLYPHS,
  coverCrop,
  glyphForLuminance,
  samplePixels,
  colorForTheme,
  motionMode,
  readabilityAt,
  desktopWindAt,
  isFoliage,
  insidePolygon,
  foliageCells,
} from "../assets/js/ascii/model.ts";

test("only green foliage enters the moving layer, excluding sky and wood", () => {
  const sample = (r, g, b) => samplePixels([r, g, b, 255], 1, 1)[0];
  assert.equal(isFoliage(sample(70, 120, 45)), true);
  assert.equal(isFoliage(sample(180, 205, 110)), true);
  for (const rgb of [
    [70, 150, 200],
    [100, 170, 180],
    [18, 45, 50],
    [130, 100, 60],
  ])
    assert.equal(isFoliage(sample(...rgb)), false);
});

test("trunk protection stays anchored to the source image through different crops", () => {
  const region = [
    { x: 0.4, y: 0.4 },
    { x: 0.6, y: 0.4 },
    { x: 0.6, y: 1 },
    { x: 0.4, y: 1 },
  ];
  assert.equal(insidePolygon({ x: 0.5, y: 0.5 }, region), true);
  assert.equal(insidePolygon({ x: 0.4, y: 0.5 }, region), true);
  assert.equal(insidePolygon({ x: 0.2, y: 0.5 }, region), false);
  const green = samplePixels([70, 120, 45, 255], 1, 1)[0];
  const samples = Array(9).fill(green);
  const full = foliageCells(
    samples,
    3,
    3,
    { x: 0, y: 0, width: 1200, height: 673 },
    1200,
    673,
    [region],
  );
  assert.equal(full[4], false);
  assert.equal(full[7], false);
  assert.equal(full[3], true);
  assert.deepEqual(
    foliageCells(
      [green, green],
      2,
      1,
      { x: 400, y: 0, width: 400, height: 673 },
      1200,
      673,
      [region],
    ),
    [false, false],
  );
  assert.deepEqual(
    foliageCells(
      [green, green],
      2,
      1,
      { x: 0, y: 0, width: 400, height: 673 },
      1200,
      673,
      [region],
    ),
    [true, true],
  );
});

test("desktop wind is visible over a cycle and stays within gentle displacement and shade limits", () => {
  for (const cellWidth of [8, 2560 / 240, 16]) {
    const horizontal = [];
    const vertical = [];
    for (let step = 0; step <= 600; step++) {
      const wind = desktopWindAt(step / 30, 480, 300, cellWidth);
      assert.ok(Math.abs(wind.x) <= 8);
      assert.ok(Math.abs(wind.y) <= 2);
      assert.ok(wind.alpha >= 0.94 && wind.alpha <= 1);
      horizontal.push(wind.x);
      vertical.push(wind.y);
    }
    assert.ok(Math.max(...horizontal) - Math.min(...horizontal) > 5);
    assert.ok(Math.max(...vertical) - Math.min(...vertical) > 1.5);
  }
});

test("desktop wind changes smoothly over time and across neighboring leaf groups", () => {
  for (const cellWidth of [8, 2560 / 240, 16]) {
    for (const x of [0, 480, 1920])
      for (const y of [0, 300, 900])
        for (let time = 0; time < 16; time += 0.1) {
          const current = desktopWindAt(time, x, y, cellWidth);
          const next = desktopWindAt(time + 1 / 30, x, y, cellWidth);
          assert.ok(Math.abs(next.x - current.x) < 0.35);
          assert.ok(Math.abs(next.y - current.y) < 0.1);
          assert.ok(Math.abs(next.alpha - current.alpha) < 0.001);
          for (const [dx, dy] of [
            [cellWidth * 8, 0],
            [0, cellWidth * 1.65 * 4],
          ]) {
            const neighbor = desktopWindAt(time, x + dx, y + dy, cellWidth);
            assert.ok(Math.abs(neighbor.x - current.x) < 2.5);
            assert.ok(Math.abs(neighbor.y - current.y) < 0.8);
            assert.ok(Math.abs(neighbor.alpha - current.alpha) < 0.01);
          }
        }
  }
});

test("the reading mask fades continuously from the text into the image", () => {
  const boxes = [{ left: 100, top: 100, right: 300, bottom: 200 }];
  assert.equal(readabilityAt(200, 150, boxes), 0.08);
  assert.equal(readabilityAt(300, 150, boxes), 0.08);
  assert.ok(readabilityAt(301, 150, boxes) < 0.081);
  assert.ok(readabilityAt(330, 150, boxes) > readabilityAt(310, 150, boxes));
  assert.equal(readabilityAt(360, 150, boxes), 1);
  assert.equal(readabilityAt(200, 150, []), 1);
});

test("motion respects reduced motion, hidden tabs, menus, navigation, and image failures", () => {
  const ready = {
    ready: true,
    hidden: false,
    visible: true,
    pageActive: true,
    menuOpen: false,
    reduced: false,
  };
  assert.equal(motionMode(ready), "running");
  assert.equal(motionMode({ ...ready, reduced: true }), "static");
  for (const change of [
    { hidden: true },
    { visible: false },
    { pageActive: false },
    { menuOpen: true },
    { ready: false },
  ]) {
    assert.equal(motionMode({ ...ready, ...change }), "paused");
    assert.equal(motionMode({ ...ready, reduced: true, ...change }), "paused");
  }
  assert.equal(motionMode({ ...ready, menuOpen: false }), "running");
});

test("cover cropping preserves aspect ratio and keeps the mobile tree focus visible", () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [844, 390],
  ]) {
    const focus = { x: width < 768 ? 0.64 : 0.5, y: 0.55 };
    const crop = coverCrop(1200, 673, width, height, focus);
    assert.ok(Math.abs(crop.width / crop.height - width / height) < 1e-10);
    assert.ok(crop.x >= 0 && crop.y >= 0);
    assert.ok(
      crop.x + crop.width <= 1200 + 1e-10 &&
        crop.y + crop.height <= 673 + 1e-10,
    );
    assert.ok(
      focus.x * 1200 >= crop.x && focus.x * 1200 <= crop.x + crop.width,
    );
  }
  assert.throws(
    () => coverCrop(0, 673, 390, 844, { x: 0.5, y: 0.5 }),
    RangeError,
  );
});

test("glyph density follows luminance in dark mode and reverses for a light background", () => {
  for (const light of [false, true]) {
    const indices = Array.from({ length: 101 }, (_, value) =>
      GLYPHS.indexOf(glyphForLuminance(value / 100, light)),
    );
    for (let i = 1; i < indices.length; i++)
      assert.ok(
        light ? indices[i] <= indices[i - 1] : indices[i] >= indices[i - 1],
      );
  }
  assert.equal(glyphForLuminance(0, false), " ");
  assert.equal(glyphForLuminance(1, true), " ");
  assert.equal(glyphForLuminance(1, false), "@");
});

test("RGBA sampling preserves per-cell color and alpha in row-major order", () => {
  const samples = samplePixels(
    new Uint8ClampedArray([
      0, 255, 0, 255, 0, 0, 255, 128, 255, 0, 0, 0, 255, 255, 255, 255,
    ]),
    2,
    2,
  );
  assert.equal(samples.length, 4);
  assert.equal(samples[0].green, 255);
  assert.equal(samples[1].blue, 255);
  assert.equal(samples[1].alpha, 128 / 255);
  assert.equal(samples[2].alpha, 0);
  assert.ok(samples[0].luminance > samples[1].luminance);
  assert.equal(colorForTheme(samples[0], false), "rgb(0,255,0)");
  assert.notEqual(
    colorForTheme(samples[0], true),
    colorForTheme(samples[0], false),
  );
  assert.throws(() => samplePixels([255, 255], 1, 1), RangeError);
});
