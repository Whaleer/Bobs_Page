import test from "node:test";
import assert from "node:assert/strict";
import { PondWorld } from "../assets/js/pond/world.ts";

function seeded(seed = 42) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test("a mobile pond remains finite and inside the viewport during sustained motion", () => {
  const world = new PondWorld(390, 844, seeded());
  world.obstacles = [{ left: 24, right: 366, top: 560, bottom: 810 }];
  for (let n = 0; n < 60 * 120; n++) {
    if (n % 240 === 0) world.feed(200, 300);
    world.step(1 / 60);
  }
  assert.equal(world.fish.length, 3);
  for (const fish of world.fish) {
    assert.ok(fish.x >= 0 && fish.x <= 390);
    assert.ok(fish.y >= 0 && fish.y <= 844);
    assert.ok(Number.isFinite(fish.angle));
    for (const node of fish.nodes)
      assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
  }
});

test("feeding is bounded and old pellets expire", () => {
  const world = new PondWorld(1440, 900, seeded());
  for (let i = 0; i < 100; i++) world.feed(700, 400);
  assert.equal(world.food.length, 32);
  for (let i = 0; i < 15 * 60; i++) world.step(1 / 60);
  assert.equal(world.food.length, 0);
  world.feed(NaN, Infinity);
  assert.equal(world.food.length, 0);
});

test("a koi takes nearby food before it expires", () => {
  const world = new PondWorld(1440, 900, seeded());
  const fish = world.fish[0];
  world.feed(fish.x, fish.y);
  for (let i = 0; i < 120; i++) world.step(1 / 60);
  assert.ok(world.food.length < 7);
  assert.ok(world.time < 14);
});

test("resize scales the complete body, while invalid time steps do not poison the simulation", () => {
  const world = new PondWorld(400, 800, seeded());
  const before = world.fish[0].nodes.map((node) => ({ ...node }));
  world.resize(800, 400);
  for (let i = 0; i < before.length; i++) {
    assert.equal(world.fish[0].nodes[i].x, before[i].x * 2);
    assert.equal(world.fish[0].nodes[i].y, before[i].y * 0.5);
  }
  world.step(NaN);
  world.step(-1);
  assert.equal(world.time, 0);
  world.step(10);
  assert.equal(world.time, 0.1);
});
