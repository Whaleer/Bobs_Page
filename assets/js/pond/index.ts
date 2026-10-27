import { PondWorld, type Rect } from "./world.ts";
import { PondRenderer } from "./renderer.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#pond");
if (canvas) {
  try {
    startPond(canvas);
  } catch {
    /* The page remains fully readable when canvas is unavailable. */
  }
}

function startPond(canvas: HTMLCanvasElement) {
  const world = new PondWorld(window.innerWidth, window.innerHeight);
  const renderer = new PondRenderer(canvas);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let last = 0;
  let accumulator = 0;
  let frameCount = 0;
  let intersecting = true;
  let pointerTime = 0;
  let previousFood = -1;
  let destroyed = false;
  const koiLabel = document.querySelector<HTMLElement>("[data-koi-count]");
  const foodLabel = document.querySelector<HTMLElement>("[data-food-count]");

  const content = () => {
    const origin = canvas.getBoundingClientRect();
    const rects: Rect[] = [];
    document
      .querySelectorAll<HTMLElement>("[data-pond-avoid]")
      .forEach((element) => {
        const b = element.getBoundingClientRect();
        if (!b.width || !b.height) return;
        const next = {
          left: b.left - origin.left,
          top: b.top - origin.top,
          right: b.right - origin.left,
          bottom: b.bottom - origin.top,
        };
        const nearby = rects.find(
          (rect) =>
            next.top < rect.bottom + 90 &&
            next.bottom > rect.top - 90 &&
            next.left < rect.right + 90 &&
            next.right > rect.left - 90,
        );
        if (nearby) {
          nearby.left = Math.min(nearby.left, next.left);
          nearby.top = Math.min(nearby.top, next.top);
          nearby.right = Math.max(nearby.right, next.right);
          nearby.bottom = Math.max(nearby.bottom, next.bottom);
        } else rects.push(next);
      });
    world.obstacles = rects;
    renderer.setContent(rects);
  };

  const stats = () => {
    if (koiLabel) koiLabel.textContent = String(world.fish.length);
    if (foodLabel && previousFood !== world.food.length) {
      foodLabel.textContent = String(world.food.length);
      if (!reduced.matches) {
        foodLabel.classList.remove("food-flash");
        void foodLabel.offsetWidth;
        foodLabel.classList.add("food-flash");
      }
      previousFood = world.food.length;
    }
  };

  const theme = () => {
    renderer.setTheme(document.documentElement.dataset.theme === "light");
    if (reduced.matches) renderer.render(world, 0);
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    world.resize(rect.width, rect.height);
    renderer.resize(rect.width, rect.height);
    content();
    theme();
    renderer.render(world, 0);
  };

  const animate = (now: number) => {
    if (destroyed) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= 1 / 60 && steps < 4) {
      world.step(1 / 60);
      accumulator -= 1 / 60;
      steps++;
    }
    if (steps === 4) accumulator = 0;
    if (++frameCount % 30 === 0) content();
    renderer.render(world, dt);
    stats();
    frame = requestAnimationFrame(animate);
  };

  const schedule = () => {
    cancelAnimationFrame(frame);
    if (destroyed || document.hidden || !intersecting) return;
    if (reduced.matches) {
      if (world.time < 3) for (let i = 0; i < 180; i++) world.step(1 / 60);
      content();
      renderer.render(world, 0);
      stats();
      return;
    }
    last = performance.now();
    accumulator = 0;
    frame = requestAnimationFrame(animate);
  };

  const pointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dt = Math.max(8, event.timeStamp - pointerTime) / 1000;
    world.pointer.speed = Math.min(
      4000,
      Math.hypot(x - world.pointer.x, y - world.pointer.y) / dt,
    );
    world.pointer.x = x;
    world.pointer.y = y;
    world.pointer.active =
      event.pointerType !== "touch" && !document.querySelector("dialog[open]");
    pointerTime = event.timeStamp;
  };
  const leave = () => {
    world.pointer.active = false;
    world.pointer.speed = 0;
  };
  const click = (event: MouseEvent) => {
    if (
      reduced.matches ||
      document.querySelector("dialog[open]") ||
      window.getSelection()?.toString()
    )
      return;
    if (
      event
        .composedPath()
        .some(
          (target) =>
            target instanceof Element &&
            target.matches(
              'a,button,input,textarea,select,summary,[role="button"],[data-pond-avoid]',
            ),
        )
    )
      return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
      world.feed(x, y);
      stats();
    }
  };

  const resizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver((entries) => {
    intersecting = entries[0].isIntersecting;
    schedule();
  });
  resizeObserver.observe(canvas);
  visibilityObserver.observe(canvas);
  window.addEventListener("pointermove", pointerMove, { passive: true });
  window.addEventListener("click", click);
  window.addEventListener("site:theme", theme);
  window.addEventListener("blur", leave);
  document.documentElement.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", schedule);
  reduced.addEventListener("change", schedule);
  window.addEventListener("pagehide", (event) => {
    cancelAnimationFrame(frame);
    if (event.persisted) return;
    destroyed = true;
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    window.removeEventListener("pointermove", pointerMove);
    window.removeEventListener("click", click);
    window.removeEventListener("site:theme", theme);
    window.removeEventListener("blur", leave);
    document.documentElement.removeEventListener("pointerleave", leave);
    document.removeEventListener("visibilitychange", schedule);
    reduced.removeEventListener("change", schedule);
  });
  window.addEventListener("pageshow", schedule);
  document.fonts.ready.then(() => {
    if (!destroyed) {
      content();
      renderer.render(world, 0);
    }
  });
  resize();
  stats();
  schedule();
}
