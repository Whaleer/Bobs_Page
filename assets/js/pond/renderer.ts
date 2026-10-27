import {
  clamp,
  smooth,
  type Fish,
  type Point,
  type PondWorld,
  type Rect,
} from "./world.ts";

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const noise = (a: number, b: number, seed: number) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + seed * 19.19) * 43758.5453;
  return n - Math.floor(n);
};
const pack = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const dark = {
  white: pack(171, 171, 160),
  red: pack(172, 65, 29),
  ink: pack(61, 60, 53),
  glyph: "#262521",
  water: "#a29e8f",
  food: "#d4ac77",
};
const light = {
  white: pack(169, 165, 150),
  red: pack(180, 61, 30),
  ink: pack(62, 60, 52),
  glyph: "#514c41",
  water: "#8c8778",
  food: "#966339",
};
interface Trail extends Point {
  age: number;
}

/** Rasterizes an animated silhouette into a sparse grid of characters and tiles. */
export class PondRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private cell = 8;
  private rowHeight = 10;
  private cols = 1;
  private rows = 1;
  private dpr = 1;
  private glyph = new Uint16Array(1);
  private color = new Uint32Array(1);
  private alpha = new Float32Array(1);
  private dim = new Float32Array(1);
  private colors = new Map<number, string>();
  private palette = dark;
  private trails: Trail[] = [];
  private spine: Point[] = [];

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    this.ctx = ctx;
  }

  setTheme(isLight: boolean) {
    this.palette = isLight ? light : dark;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cell = clamp(Math.round(width / 140), 8, 10);
    this.rowHeight = this.cell + 2;
    this.cols = Math.ceil(width / this.cell);
    this.rows = Math.ceil(height / this.rowHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.ctx.canvas.width = Math.round(width * this.dpr);
    this.ctx.canvas.height = Math.round(height * this.dpr);
    const count = this.cols * this.rows;
    this.glyph = new Uint16Array(count);
    this.color = new Uint32Array(count);
    this.alpha = new Float32Array(count);
    this.dim = new Float32Array(count).fill(1);
    this.trails = [];
  }

  setContent(rects: Rect[]) {
    this.dim.fill(1);
    for (const rect of rects) {
      const margin = 35;
      const x0 = Math.max(0, Math.floor((rect.left - margin) / this.cell));
      const x1 = Math.min(
        this.cols - 1,
        Math.ceil((rect.right + margin) / this.cell),
      );
      const y0 = Math.max(0, Math.floor((rect.top - margin) / this.rowHeight));
      const y1 = Math.min(
        this.rows - 1,
        Math.ceil((rect.bottom + margin) / this.rowHeight),
      );
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = (x + 0.5) * this.cell;
          const py = (y + 0.5) * this.rowHeight;
          const distance = Math.hypot(
            Math.max(rect.left - px, 0, px - rect.right),
            Math.max(rect.top - py, 0, py - rect.bottom),
          );
          const index = y * this.cols + x;
          this.dim[index] = Math.min(
            this.dim[index],
            0.1 + 0.9 * smooth(distance / margin),
          );
        }
    }
  }

  render(world: PondWorld, dt: number) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    c.font = `400 ${this.rowHeight * 0.82}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    this.glyph.fill(0);
    this.alpha.fill(0);
    for (const fish of [...world.fish].sort((a, b) => a.depth - b.depth))
      this.rasterize(fish);
    this.drawWater(world, dt);
    for (let i = 0; i < this.glyph.length; i++) {
      if (!this.glyph[i]) continue;
      const x = (i % this.cols) * this.cell;
      const y = Math.floor(i / this.cols) * this.rowHeight;
      const opacity = this.alpha[i] * this.dim[i];
      c.globalAlpha = opacity;
      c.fillStyle = this.style(this.color[i]);
      c.fillRect(x + 0.6, y + 0.7, this.cell - 1.3, this.rowHeight - 1.5);
      c.globalAlpha = opacity * 0.7;
      c.fillStyle = this.palette.glyph;
      c.fillText(
        String.fromCharCode(this.glyph[i]),
        x + this.cell / 2,
        y + this.rowHeight / 2 + 0.6,
      );
    }
    c.fillStyle = this.palette.food;
    for (const pellet of world.food) {
      const age = world.time - pellet.born;
      const landing = clamp(age / pellet.delay, 0, 1);
      c.globalAlpha = Math.min(1, (14 - age) / 5) * (0.6 + 0.4 * landing);
      c.fillText(
        "·",
        this.snapX(pellet.x),
        this.snapY(pellet.y - (1 - landing) * 36),
      );
    }
    for (const bite of world.bites) {
      c.globalAlpha = 0.9;
      c.fillText("+", this.snapX(bite.x), this.snapY(bite.y));
    }
    c.globalAlpha = 1;
  }

  private widthAt(t: number, length: number) {
    if (t > 0.79)
      return length * (0.009 + 0.085 * Math.pow((t - 0.79) / 0.21, 1.3));
    const knots = [
      [0, 0.036],
      [0.09, 0.072],
      [0.24, 0.115],
      [0.4, 0.1],
      [0.58, 0.062],
      [0.72, 0.024],
      [0.79, 0.009],
    ];
    for (let i = 1; i < knots.length; i++)
      if (t <= knots[i][0]) {
        const u = smooth(
          (t - knots[i - 1][0]) / (knots[i][0] - knots[i - 1][0]),
        );
        return length * mix(knots[i - 1][1], knots[i][1], u);
      }
    return length * 0.009;
  }

  private rasterize(fish: Fish) {
    this.spine = fish.nodes.map((node, i, nodes) => {
      const t = i / (nodes.length - 1);
      const before = nodes[Math.max(0, i - 1)];
      const after = nodes[Math.min(nodes.length - 1, i + 1)];
      const angle = Math.atan2(after.y - before.y, after.x - before.x);
      const wave = Math.sin(fish.phase - t * 5.5) * fish.length * 0.026 * t * t;
      return {
        x: node.x - Math.sin(angle) * wave,
        y: node.y + Math.cos(angle) * wave,
      };
    });
    const padding = fish.length * 0.13;
    const minX = Math.min(...this.spine.map((p) => p.x)) - padding;
    const maxX = Math.max(...this.spine.map((p) => p.x)) + padding;
    const minY = Math.min(...this.spine.map((p) => p.y)) - padding;
    const maxY = Math.max(...this.spine.map((p) => p.y)) + padding;
    const x0 = clamp(Math.floor(minX / this.cell), 0, this.cols - 1);
    const x1 = clamp(Math.ceil(maxX / this.cell), 0, this.cols - 1);
    const y0 = clamp(Math.floor(minY / this.rowHeight), 0, this.rows - 1);
    const y1 = clamp(Math.ceil(maxY / this.rowHeight), 0, this.rows - 1);
    for (let row = y0; row <= y1; row++)
      for (let col = x0; col <= x1; col++) {
        const x = (col + 0.5) * this.cell;
        const y = (row + 0.5) * this.rowHeight;
        let nearest = Infinity;
        let along = 0;
        let cross = 0;
        for (let n = 0; n < this.spine.length - 1; n++) {
          const a = this.spine[n];
          const b = this.spine[n + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const length2 = dx * dx + dy * dy;
          const fraction = clamp(
            ((x - a.x) * dx + (y - a.y) * dy) / (length2 || 1),
            0,
            1,
          );
          const distance2 =
            (x - a.x - dx * fraction) ** 2 + (y - a.y - dy * fraction) ** 2;
          if (distance2 < nearest) {
            nearest = distance2;
            along = (n + fraction) / (this.spine.length - 1);
            cross =
              Math.sign(dx * (y - a.y) - dy * (x - a.x)) * Math.sqrt(distance2);
          }
        }
        const width = this.widthAt(along, fish.length);
        const across = cross / width;
        const distance = Math.sqrt(nearest);
        let fin = false;
        if (distance > width) {
          const spread = Math.max(0, 1 - Math.abs(along - 0.3) / 0.105);
          if (spread < 0.1 || distance > width + spread * fish.length * 0.058)
            continue;
          fin = true;
        }
        // The tail forks inward in the middle instead of ending in a solid fan.
        if (along > 0.9 && Math.abs(across) < (along - 0.9) * 5.8) continue;
        const index = row * this.cols + col;
        const edge = clamp((width - distance) / this.cell + 0.8, 0.22, 1);
        const tail = along > 0.79;
        const cellNoise = noise(
          Math.floor(along * 28),
          Math.floor(across * 5),
          fish.seed,
        );
        let color = this.palette.white;
        let opacity = (0.62 + fish.depth * 0.25) * edge;
        let glyph = cellNoise > 0.7 ? ":" : cellNoise > 0.35 ? "+" : ".";
        if (tail || fin) {
          color = this.palette.ink;
          opacity = (fin ? 0.38 : 0.6) * edge;
          glyph = Math.abs(across) > 0.6 ? "/" : ":";
        } else {
          const patch1 =
            ((along - 0.27) / 0.12) ** 2 +
            ((across - Math.sin(fish.seed) * 0.3) / 0.95) ** 2;
          const patch2 =
            ((along - 0.54) / 0.12) ** 2 + ((across + 0.35) / 1.05) ** 2;
          const patch3 =
            ((along - 0.68) / 0.075) ** 2 + ((across - 0.2) / 0.75) ** 2;
          const red =
            fish.kind === 1
              ? ((along - 0.12) / 0.07) ** 2 + (across / 0.8) ** 2 < 1
              : Math.min(patch1, patch2, patch3) < 0.86 + cellNoise * 0.35;
          if (red) {
            color = this.palette.red;
            glyph = cellNoise > 0.5 ? "#" : "+";
          }
          if (fish.kind === 2 && along > 0.25 && cellNoise > 0.91) {
            color = this.palette.ink;
            glyph = "=";
          }
          if (along > 0.05 && along < 0.14 && Math.abs(across) > 0.62) {
            color = this.palette.ink;
            glyph = "o";
            opacity = 1;
          }
        }
        this.glyph[index] = glyph.charCodeAt(0);
        this.color[index] = color;
        this.alpha[index] = opacity;
      }
    const head = this.spine[0];
    const tangent = Math.atan2(
      this.spine[1].y - head.y,
      this.spine[1].x - head.x,
    );
    for (const side of [-1, 1]) {
      for (let n = 1; n <= 2; n++) {
        const x =
          head.x - Math.cos(tangent) * n * 7 + Math.sin(tangent) * side * n * 4;
        const y =
          head.y - Math.sin(tangent) * n * 7 - Math.cos(tangent) * side * n * 4;
        const col = Math.floor(x / this.cell);
        const row = Math.floor(y / this.rowHeight);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows)
          continue;
        const index = row * this.cols + col;
        if (!this.glyph[index]) {
          this.glyph[index] = (side > 0 ? "/" : "\\").charCodeAt(0);
          this.color[index] = this.palette.white;
          this.alpha[index] = 0.35;
        }
      }
    }
  }

  private drawWater(world: PondWorld, dt: number) {
    const ctx = this.ctx;
    ctx.fillStyle = this.palette.water;
    this.trails = this.trails.filter((trail) => (trail.age += dt) < 1.6);
    if (dt > 0)
      for (const fish of world.fish) {
        const tail = fish.nodes[fish.nodes.length - 1];
        this.trails.push({ x: tail.x, y: tail.y, age: 0 });
      }
    for (const trail of this.trails) {
      const col = Math.floor(trail.x / this.cell);
      const row = Math.floor(trail.y / this.rowHeight);
      const index = row * this.cols + col;
      if (
        col < 0 ||
        col >= this.cols ||
        row < 0 ||
        row >= this.rows ||
        this.glyph[index]
      )
        continue;
      ctx.globalAlpha = (1 - trail.age / 1.6) * 0.12 * this.dim[index];
      ctx.fillText(".", this.snapX(trail.x), this.snapY(trail.y));
    }
    for (const ring of world.rings) {
      const age = world.time - ring.born;
      if (age < 0) continue;
      const radius = age * 48;
      const count = Math.max(8, Math.ceil(radius / 3));
      ctx.globalAlpha =
        Math.pow(Math.max(0, 1 - age / 2.3), 1.5) * ring.strength * 0.4;
      for (let n = 0; n < count; n++) {
        const angle = (n / count) * Math.PI * 2;
        const x = ring.x + Math.cos(angle) * radius;
        const y = ring.y + Math.sin(angle) * radius;
        const col = Math.floor(x / this.cell);
        const row = Math.floor(y / this.rowHeight);
        if (
          col < 0 ||
          col >= this.cols ||
          row < 0 ||
          row >= this.rows ||
          this.glyph[row * this.cols + col]
        )
          continue;
        ctx.fillText(
          Math.abs(Math.sin(angle)) > 0.7 ? "−" : ".",
          this.snapX(x),
          this.snapY(y),
        );
      }
    }
  }

  private snapX(x: number) {
    return (Math.floor(x / this.cell) + 0.5) * this.cell;
  }
  private snapY(y: number) {
    return (Math.floor(y / this.rowHeight) + 0.5) * this.rowHeight;
  }
  private style(color: number) {
    let value = this.colors.get(color);
    if (!value) {
      value = `rgb(${color >>> 16},${(color >>> 8) & 255},${color & 255})`;
      this.colors.set(color, value);
    }
    return value;
  }
}
