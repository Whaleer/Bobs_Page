import { clamp, motionMode, type Point, type Rect } from "./model.ts";
import { AsciiRenderer } from "./renderer.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#ascii-background");
if (canvas) {
  try {
    startBackground(canvas);
  } catch {
    canvas.dataset.state = "error";
  }
}

function startBackground(canvas: HTMLCanvasElement) {
  const renderer = new AsciiRenderer(canvas);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const image = new Image();
  const dialogs = Array.from(
    document.querySelectorAll<HTMLDialogElement>("dialog"),
  );
  let ready = false;
  let destroyed = false;
  let visible = true;
  let pageActive = true;
  let frame = 0;
  let resizeFrame = 0;
  let last = 0;
  let elapsed = 0;
  canvas.dataset.state = "loading";

  const focus = (): Point => {
    const mode = canvas.clientWidth < 768 ? "Mobile" : "Desktop";
    const number = (value: string | undefined, fallback: number) => {
      const parsed = value === undefined ? NaN : Number(value);
      return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : fallback;
    };
    return {
      x: number(
        canvas.dataset[`focus${mode}X`],
        mode === "Mobile" ? 0.64 : 0.5,
      ),
      y: number(canvas.dataset[`focus${mode}Y`], 0.5),
    };
  };

  const measure = () => {
    const origin = canvas.getBoundingClientRect();
    const boxes: Rect[] = [];
    document
      .querySelectorAll<HTMLElement>("[data-background-avoid]")
      .forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width && rect.height)
          boxes.push({
            left: rect.left - origin.left,
            top: rect.top - origin.top,
            right: rect.right - origin.left,
            bottom: rect.bottom - origin.top,
          });
      });
    renderer.setContent(boxes);
  };

  const drawStill = () => {
    if (ready) renderer.render(0, false);
  };
  const animate = (now: number) => {
    frame = requestAnimationFrame(animate);
    const milliseconds = now - last;
    if (milliseconds < 1000 / 30) return;
    const dt = Math.min(milliseconds / 1000, 0.08);
    last = now - (milliseconds % (1000 / 30));
    elapsed += dt;
    renderer.render(elapsed, true);
  };

  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    const mode = motionMode({
      ready: ready && !destroyed,
      hidden: document.hidden,
      visible,
      pageActive,
      menuOpen: dialogs.some((dialog) => dialog.open),
      reduced: reduced.matches,
    });
    canvas.dataset.motion = mode;
    if (mode === "paused") return;
    if (mode === "static") {
      drawStill();
      return;
    }
    last = performance.now();
    frame = requestAnimationFrame(animate);
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (destroyed || !rect.width || !rect.height) return;
    renderer.resize(rect.width, rect.height, focus());
    measure();
    if (ready) renderer.render(reduced.matches ? 0 : elapsed, !reduced.matches);
  };
  const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resize);
  });
  resizeObserver.observe(canvas);
  document
    .querySelectorAll<HTMLElement>("[data-background-avoid]")
    .forEach((element) => resizeObserver.observe(element));
  const visibilityObserver = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    schedule();
  });
  visibilityObserver.observe(canvas);
  const dialogObserver = new MutationObserver(schedule);
  for (const dialog of dialogs)
    dialogObserver.observe(dialog, {
      attributes: true,
      attributeFilter: ["open"],
    });

  const theme = () => {
    renderer.setTheme(document.documentElement.dataset.theme === "light");
    if (ready) renderer.render(reduced.matches ? 0 : elapsed, !reduced.matches);
  };
  const hide = (event: PageTransitionEvent) => {
    pageActive = false;
    schedule();
    if (event.persisted) return;
    destroyed = true;
    cancelAnimationFrame(resizeFrame);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    dialogObserver.disconnect();
    window.removeEventListener("site:theme", theme);
    window.removeEventListener("pageshow", show);
    window.removeEventListener("pagehide", hide);
    document.removeEventListener("visibilitychange", schedule);
    reduced.removeEventListener("change", schedule);
    image.onload = image.onerror = null;
  };
  const show = () => {
    pageActive = true;
    resize();
    schedule();
  };
  window.addEventListener("site:theme", theme);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  document.addEventListener("visibilitychange", schedule);
  reduced.addEventListener("change", schedule);

  image.decoding = "async";
  image.onload = () => {
    if (destroyed) return;
    try {
      renderer.setImage(image);
      ready = true;
      canvas.dataset.state = "ready";
      resize();
      schedule();
    } catch {
      canvas.dataset.state = "error";
      ready = false;
      schedule();
    }
  };
  image.onerror = () => {
    if (!destroyed) {
      canvas.dataset.state = "error";
      ready = false;
      schedule();
    }
  };
  document.fonts.ready.then(() => {
    if (!destroyed) {
      renderer.refreshFont();
      measure();
      if (ready)
        renderer.render(reduced.matches ? 0 : elapsed, !reduced.matches);
    }
  });
  theme();
  resize();
  image.src = canvas.dataset.image || "";
}
