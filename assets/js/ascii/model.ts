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
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Sample {
  red: number;
  green: number;
  blue: number;
  alpha: number;
  luminance: number;
}

export function motionMode(state: {
  ready: boolean;
  hidden: boolean;
  visible: boolean;
  pageActive: boolean;
  menuOpen: boolean;
  reduced: boolean;
}): "paused" | "static" | "running" {
  if (
    !state.ready ||
    state.hidden ||
    !state.visible ||
    !state.pageActive ||
    state.menuOpen
  )
    return "paused";
  return state.reduced ? "static" : "running";
}

export const GLYPHS = " .:-=+*#%@";
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function insidePolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (
      Math.abs(cross) < 1e-10 &&
      point.x >= Math.min(a.x, b.x) &&
      point.x <= Math.max(a.x, b.x) &&
      point.y >= Math.min(a.y, b.y) &&
      point.y <= Math.max(a.y, b.y)
    )
      return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

export function projectTrunkRegions(
  regions: Point[][],
  crop: Crop,
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
) {
  return regions.map((region) =>
    region.map((point) => ({
      x: ((point.x * imageWidth - crop.x) / crop.width) * width,
      y: ((point.y * imageHeight - crop.y) / crop.height) * height,
    })),
  );
}

/** A soft distance field reduces motion without separating or clipping the image. */
export function trunkWindScale(
  point: Point,
  regions: Point[][],
  cellWidth: number,
) {
  let distance = Infinity;
  for (const polygon of regions) {
    if (insidePolygon(point, polygon)) return 0.2;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j];
      const b = polygon[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = clamp(
        ((point.x - a.x) * dx + (point.y - a.y) * dy) /
          (dx * dx + dy * dy || 1),
        0,
        1,
      );
      distance = Math.min(
        distance,
        Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t),
      );
    }
  }
  const t = clamp(distance / (cellWidth * 24), 0, 1);
  return 0.2 + 0.8 * t * t * (3 - 2 * t);
}

/** A continuous field keeps nearby leaf groups moving together, without random phases. */
export function desktopWindAt(
  time: number,
  x: number,
  y: number,
  cellWidth: number,
  strength = 1,
) {
  const amplitude = clamp(cellWidth * 0.7, 5, 8);
  const phaseX = x / 360;
  const phaseY = y / 300;
  return {
    x:
      amplitude *
      (Math.sin(time * 0.92 + phaseY + phaseX * 0.45) * 0.74 +
        Math.sin(time * 1.26 - phaseX * 0.8 + phaseY * 0.3) * 0.26) *
      strength,
    y:
      clamp(amplitude * 0.25, 1, 2) *
      (Math.sin(time * 0.83 + phaseX * 0.75 - phaseY * 0.35) * 0.7 +
        Math.sin(time * 1.17 + phaseY * 0.8) * 0.3) *
      strength,
    alpha:
      1 +
      (0.97 + Math.sin(time * 0.88 + phaseX * 0.7 + phaseY * 0.65) * 0.03 - 1) *
        strength,
  };
}

export function readabilityAt(
  x: number,
  y: number,
  rectangles: Rect[],
  feather = 60,
) {
  let opacity = 1;
  for (const rect of rectangles) {
    const distance = Math.hypot(
      Math.max(rect.left - x, 0, x - rect.right),
      Math.max(rect.top - y, 0, y - rect.bottom),
    );
    const t = clamp(distance / feather, 0, 1);
    opacity = Math.min(opacity, 0.08 + 0.92 * t * t * (3 - 2 * t));
  }
  return opacity;
}

/** The focus is a point in the source image, rather than a stretching offset. */
export function coverCrop(
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
  focus: Point,
): Crop {
  if (
    ![imageWidth, imageHeight, width, height].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new RangeError("Image and viewport dimensions must be positive");
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  return {
    x: clamp(
      clamp(focus.x, 0, 1) * imageWidth - cropWidth / 2,
      0,
      imageWidth - cropWidth,
    ),
    y: clamp(
      clamp(focus.y, 0, 1) * imageHeight - cropHeight / 2,
      0,
      imageHeight - cropHeight,
    ),
    width: cropWidth,
    height: cropHeight,
  };
}

export function glyphForLuminance(luminance: number, isLight: boolean) {
  const contrast = clamp((luminance - 0.04) / 0.92, 0, 1);
  const density = isLight ? 1 - contrast : contrast;
  return GLYPHS[Math.round(Math.pow(density, 0.9) * (GLYPHS.length - 1))];
}

/** Pixels are downsampled by the image canvas once, never read in the animation loop. */
export function samplePixels(
  pixels: ArrayLike<number>,
  columns: number,
  rows: number,
): Sample[] {
  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 1 ||
    rows < 1 ||
    pixels.length !== columns * rows * 4
  )
    throw new RangeError("RGBA data does not match the sampling grid");
  return Array.from({ length: columns * rows }, (_, index) => {
    const offset = index * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    return {
      red,
      green,
      blue,
      alpha: pixels[offset + 3] / 255,
      luminance: (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255,
    };
  });
}

export function colorForTheme(sample: Sample, isLight: boolean) {
  const factor = isLight ? 0.82 : 1;
  return `rgb(${Math.round(sample.red * factor)},${Math.round(sample.green * factor)},${Math.round(sample.blue * factor)})`;
}
