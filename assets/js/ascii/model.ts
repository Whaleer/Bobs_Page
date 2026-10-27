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

/** Conservative green selection leaves blue sky and dark wood in the still layer. */
export function isFoliage(sample: Sample) {
  return (
    sample.alpha > 0 &&
    sample.luminance > 0.24 &&
    sample.green - sample.red > 5 &&
    sample.green - sample.blue > 12
  );
}

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

export function foliageCells(
  samples: Sample[],
  columns: number,
  rows: number,
  crop: Crop,
  imageWidth: number,
  imageHeight: number,
  stationaryRegions: Point[][],
) {
  return samples.map((sample, index) => {
    const point = {
      x:
        (crop.x + (((index % columns) + 0.5) / columns) * crop.width) /
        imageWidth,
      y:
        (crop.y + ((Math.floor(index / columns) + 0.5) / rows) * crop.height) /
        imageHeight,
    };
    return (
      isFoliage(sample) &&
      !stationaryRegions.some((region) => insidePolygon(point, region))
    );
  });
}

/** A continuous field keeps nearby leaf groups moving together, without random phases. */
export function desktopWindAt(
  time: number,
  x: number,
  y: number,
  cellWidth: number,
) {
  const amplitude = clamp(cellWidth * 0.7, 5, 8);
  const phaseX = x / 360;
  const phaseY = y / 300;
  return {
    x:
      amplitude *
      (Math.sin(time * 0.92 + phaseY + phaseX * 0.45) * 0.74 +
        Math.sin(time * 1.26 - phaseX * 0.8 + phaseY * 0.3) * 0.26),
    y:
      clamp(amplitude * 0.25, 1, 2) *
      (Math.sin(time * 0.83 + phaseX * 0.75 - phaseY * 0.35) * 0.7 +
        Math.sin(time * 1.17 + phaseY * 0.8) * 0.3),
    alpha: 0.97 + Math.sin(time * 0.88 + phaseX * 0.7 + phaseY * 0.65) * 0.03,
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
