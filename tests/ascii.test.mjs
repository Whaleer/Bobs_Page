import test from "node:test";
import assert from "node:assert/strict";
import {
  GLYPHS,
  coverCrop,
  glyphForLuminance,
  samplePixels,
  pointerDisplacement,
  colorForTheme,
  motionMode,
  readabilityAt,
} from "../assets/js/ascii/model.ts";

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

test("pointer disturbance is local, bounded, and settles continuously to zero", () => {
  const pointer = { x: 200, y: 200, strength: 1 };
  assert.deepEqual(pointerDisplacement(320, 200, pointer), { x: 0, y: 0 });
  assert.deepEqual(pointerDisplacement(200, 200, pointer), { x: 0, y: 0 });
  const near = pointerDisplacement(220, 200, pointer);
  const far = pointerDisplacement(300, 200, pointer);
  assert.ok(near.x > far.x && near.x <= 12 && near.y === 0);
  const fading = pointerDisplacement(220, 200, { ...pointer, strength: 0.1 });
  assert.ok(fading.x < near.x);
  assert.deepEqual(pointerDisplacement(220, 200, { ...pointer, strength: 0 }), {
    x: 0,
    y: 0,
  });
});
