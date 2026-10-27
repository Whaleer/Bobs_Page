export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface Fish extends Point {
  angle: number;
  speed: number;
  length: number;
  phase: number;
  wander: number;
  panic: number;
  seed: number;
  depth: number;
  kind: number;
  nodes: Point[];
}
export interface Food extends Point {
  born: number;
  delay: number;
  driftX: number;
  driftY: number;
}
export interface Ring extends Point {
  born: number;
  strength: number;
}
export interface Pointer extends Point {
  active: boolean;
  speed: number;
}
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export const turn = (angle: number) =>
  Math.atan2(Math.sin(angle), Math.cos(angle));
export const smooth = (value: number) => {
  const v = clamp(value, 0, 1);
  return v * v * (3 - 2 * v);
};

/** A fixed-step, DOM-independent simulation. The renderer never changes its state. */
export class PondWorld {
  width: number;
  height: number;
  time = 0;
  fish: Fish[] = [];
  food: Food[] = [];
  rings: Ring[] = [];
  bites: Point[] = [];
  obstacles: Rect[] = [];
  pointer: Pointer = { x: 0, y: 0, active: false, speed: 0 };
  private random: () => number;
  private lastFeed = -100;

  constructor(width: number, height: number, random = Math.random) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.random = random;
    const count = clamp(Math.round((width * height) / 240000), 3, 6);
    const size = clamp(Math.min(width, height) * 0.27, 115, 205);
    for (let i = 0; i < count; i++) {
      const length = size * (0.8 + this.random() * 0.4);
      const x = this.width * (0.18 + 0.64 * this.random());
      const y = this.height * (0.15 + 0.7 * this.random());
      const angle = this.random() * Math.PI * 2;
      this.fish.push({
        x,
        y,
        angle,
        length,
        speed: 28 + this.random() * 14,
        phase: this.random() * Math.PI * 2,
        wander: 0,
        panic: 0,
        seed: this.random() * 1000,
        depth: 0.65 + this.random() * 0.35,
        kind: i % 3,
        nodes: Array.from({ length: 22 }, (_, n) => ({
          x: x - (Math.cos(angle) * n * length) / 21,
          y: y - (Math.sin(angle) * n * length) / 21,
        })),
      });
    }
  }

  resize(width: number, height: number) {
    const xScale = Math.max(1, width) / this.width;
    const yScale = Math.max(1, height) / this.height;
    for (const fish of this.fish) {
      fish.x *= xScale;
      fish.y *= yScale;
      for (const node of fish.nodes) {
        node.x *= xScale;
        node.y *= yScale;
      }
    }
    for (const food of this.food) {
      food.x *= xScale;
      food.y *= yScale;
    }
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  feed(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x = clamp(x, 0, this.width);
    y = clamp(y, 0, this.height);
    this.lastFeed = this.time;
    const count = Math.min(7, 32 - this.food.length);
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = Math.sqrt(this.random()) * 28;
      this.food.push({
        x: clamp(x + Math.cos(angle) * radius, 0, this.width),
        y: clamp(y + Math.sin(angle) * radius, 0, this.height),
        born: this.time,
        delay: 0.1 + this.random() * 0.25,
        driftX: Math.cos(angle) * 3,
        driftY: Math.sin(angle) * 3,
      });
    }
    this.rings.push({ x, y, born: this.time + 0.15, strength: 0.8 });
  }

  step(dt: number) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.pointer.speed *= Math.exp(-dt * 5);
    this.bites = [];
    this.food = this.food.filter((pellet) => this.time - pellet.born < 14);
    this.rings = this.rings.filter((ring) => this.time - ring.born < 2.3);
    for (const pellet of this.food) {
      pellet.x = clamp(pellet.x + pellet.driftX * dt, 0, this.width);
      pellet.y = clamp(pellet.y + pellet.driftY * dt, 0, this.height);
      pellet.driftX *= Math.exp(-dt * 0.2);
      pellet.driftY *= Math.exp(-dt * 0.2);
    }
    for (const fish of this.fish) this.swim(fish, dt);
  }

  private swim(fish: Fish, dt: number) {
    fish.wander = clamp(
      fish.wander + (this.random() - 0.5) * dt * 2,
      -0.65,
      0.65,
    );
    let dx = Math.cos(fish.angle + fish.wander * 0.6);
    let dy = Math.sin(fish.angle + fish.wander * 0.6);
    let closest: Food | undefined;
    let distanceToFood = 650;
    for (const pellet of this.food) {
      if (this.time - pellet.born < pellet.delay) continue;
      const distance = Math.hypot(pellet.x - fish.x, pellet.y - fish.y);
      if (distance < distanceToFood) {
        distanceToFood = distance;
        closest = pellet;
      }
    }
    const pointerDistance = Math.hypot(
      fish.x - this.pointer.x,
      fish.y - this.pointer.y,
    );
    if (
      this.pointer.active &&
      this.pointer.speed > 850 &&
      pointerDistance < fish.length &&
      this.time - this.lastFeed > 2 &&
      !closest
    )
      fish.panic = 1;
    fish.panic = Math.max(0, fish.panic - dt * 0.65);
    if (closest) {
      const distance = Math.max(1, distanceToFood);
      dx += ((closest.x - fish.x) / distance) * 3.4;
      dy += ((closest.y - fish.y) / distance) * 3.4;
      if (distanceToFood < Math.max(12, fish.length * 0.065)) {
        this.food.splice(this.food.indexOf(closest), 1);
        this.bites.push({ x: closest.x, y: closest.y });
        this.rings.push({
          x: closest.x,
          y: closest.y,
          born: this.time,
          strength: 0.3,
        });
      }
    } else if (this.pointer.active) {
      const distance = Math.max(1, pointerDistance);
      if (fish.panic > 0.1) {
        dx += ((fish.x - this.pointer.x) / distance) * fish.panic * 4;
        dy += ((fish.y - this.pointer.y) / distance) * fish.panic * 4;
      } else if (distance < 260) {
        const curiosity = (1 - distance / 260) * 1.1;
        const orbit = 1 - smooth((distance - 30) / 80);
        dx +=
          ((this.pointer.x - fish.x - (this.pointer.y - fish.y) * orbit) /
            distance) *
          curiosity;
        dy +=
          ((this.pointer.y - fish.y + (this.pointer.x - fish.x) * orbit) /
            distance) *
          curiosity;
      }
    }
    const margin = Math.min(
      fish.length * 0.7,
      Math.min(this.width, this.height) * 0.22,
    );
    if (fish.x < margin) dx += (1 - fish.x / margin) * 4;
    if (fish.x > this.width - margin)
      dx -= ((fish.x - this.width + margin) / margin) * 4;
    if (fish.y < margin) dy += (1 - fish.y / margin) * 4;
    if (fish.y > this.height - margin)
      dy -= ((fish.y - this.height + margin) / margin) * 4;
    for (const other of this.fish) {
      if (other === fish) continue;
      const x = fish.x - other.x;
      const y = fish.y - other.y;
      const distance = Math.hypot(x, y);
      const separation = fish.length * 0.65;
      if (distance > 0 && distance < separation) {
        const force = (1 - distance / separation) * 2;
        dx += (x / distance) * force;
        dy += (y / distance) * force;
      }
    }
    for (const rect of this.obstacles) {
      const padding = 36;
      let x = fish.x - clamp(fish.x, rect.left, rect.right);
      let y = fish.y - clamp(fish.y, rect.top, rect.bottom);
      let distance = Math.hypot(x, y);
      if (distance > padding) continue;
      if (distance < 1) {
        const edges = [
          Math.abs(fish.x - rect.left),
          Math.abs(fish.x - rect.right),
          Math.abs(fish.y - rect.top),
          Math.abs(fish.y - rect.bottom),
        ];
        const side = edges.indexOf(Math.min(...edges));
        x = side === 0 ? -1 : side === 1 ? 1 : 0;
        y = side === 2 ? -1 : side === 3 ? 1 : 0;
        distance = 1;
      }
      const force = 2.3 * (1 - distance / padding);
      dx += (x / distance) * force;
      dy += (y / distance) * force;
    }
    const goal = Math.atan2(dy, dx);
    const maxTurn = (closest ? 1.15 : 0.5) + fish.panic * 1.2;
    fish.angle += clamp(turn(goal - fish.angle), -maxTurn * dt, maxTurn * dt);
    const cruise = 25 + (fish.seed % 15);
    const targetSpeed = closest
      ? cruise * (distanceToFood < 50 ? 0.75 : 1.8)
      : cruise * (1 + fish.panic * 1.9);
    fish.speed += (targetSpeed - fish.speed) * Math.min(1, dt * 2);
    fish.x = clamp(
      fish.x + Math.cos(fish.angle) * fish.speed * dt,
      8,
      Math.max(8, this.width - 8),
    );
    fish.y = clamp(
      fish.y + Math.sin(fish.angle) * fish.speed * dt,
      8,
      Math.max(8, this.height - 8),
    );
    fish.phase += dt * (1.8 + fish.speed * 0.025);
    fish.nodes[0].x = fish.x;
    fish.nodes[0].y = fish.y;
    const spacing = fish.length / (fish.nodes.length - 1);
    let direction = fish.angle;
    for (let i = 1; i < fish.nodes.length; i++) {
      const previous = fish.nodes[i - 1];
      const node = fish.nodes[i];
      const angle = Math.atan2(previous.y - node.y, previous.x - node.x);
      direction += clamp(turn(angle - direction), -0.085, 0.085);
      node.x = previous.x - Math.cos(direction) * spacing;
      node.y = previous.y - Math.sin(direction) * spacing;
    }
  }
}
