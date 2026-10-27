import {
  colorForTheme,
  coverCrop,
  glyphForLuminance,
  readabilityAt,
  samplePixels,
  type Point,
  type Rect,
  type Sample,
} from "./model.ts";

interface Cell {
  x: number;
  y: number;
  glyph: string;
  color: string;
  alpha: number;
}

export class AsciiRenderer {
  private context: CanvasRenderingContext2D;
  private cache = document.createElement("canvas");
  private mask = document.createElement("canvas");
  private sampler = document.createElement("canvas");
  private width = 0;
  private height = 0;
  private ratio = 1;
  private columns = 0;
  private rows = 0;
  private cellWidth = 8;
  private cellHeight = 13.2;
  private samples: Sample[] = [];
  private cells: Cell[] = [];
  private image?: HTMLImageElement;
  private focus: Point = { x: 0.5, y: 0.5 };
  private isLight = false;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
  }

  setImage(image: HTMLImageElement) {
    this.image = image;
    this.resample();
  }

  setTheme(isLight: boolean) {
    if (this.isLight === isLight) return;
    this.isLight = isLight;
    this.refreshFont();
  }

  resize(width: number, height: number, focus: Point) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (
      width === this.width &&
      height === this.height &&
      ratio === this.ratio &&
      focus.x === this.focus.x &&
      focus.y === this.focus.y
    )
      return;
    this.width = width;
    this.height = height;
    this.focus = focus;
    this.ratio = ratio;
    this.columns = Math.min(240, Math.ceil(width / (width < 768 ? 6 : 8)));
    this.cellWidth = width / this.columns;
    this.cellHeight = this.cellWidth * 1.65;
    this.rows = Math.ceil(height / this.cellHeight);
    for (const surface of [this.context.canvas, this.cache]) {
      surface.width = Math.round(width * ratio);
      surface.height = Math.round(height * ratio);
    }
    this.resample();
  }

  setContent(rectangles: Rect[]) {
    if (!this.width || !this.height) return;
    // A low-resolution alpha field gives the text a continuous feather, without a visible card edge.
    this.mask.width = Math.ceil(this.width / 4);
    this.mask.height = Math.ceil(this.height / 4);
    const context = this.mask.getContext("2d")!;
    const pixels = context.createImageData(this.mask.width, this.mask.height);
    for (let row = 0; row < this.mask.height; row++)
      for (let col = 0; col < this.mask.width; col++) {
        const offset = (row * this.mask.width + col) * 4;
        pixels.data[offset] =
          pixels.data[offset + 1] =
          pixels.data[offset + 2] =
            255;
        pixels.data[offset + 3] = Math.round(
          readabilityAt(
            ((col + 0.5) / this.mask.width) * this.width,
            ((row + 0.5) / this.mask.height) * this.height,
            rectangles,
          ) * 255,
        );
      }
    context.putImageData(pixels, 0, 0);
  }

  refreshFont() {
    if (!this.samples.length) return;
    const context = this.cache.getContext("2d")!;
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    this.font(context);
    this.cells = this.samples.map((sample, index) => ({
      x: ((index % this.columns) + 0.5) * this.cellWidth,
      y: (Math.floor(index / this.columns) + 0.5) * this.cellHeight,
      glyph: glyphForLuminance(sample.luminance, this.isLight),
      color: colorForTheme(sample, this.isLight),
      alpha: sample.alpha * (this.isLight ? 0.78 : 0.8),
    }));
    for (const cell of this.cells) this.drawCell(context, cell, cell.x, cell.y);
    context.globalAlpha = 1;
  }

  render(time: number, animate: boolean) {
    if (!this.cells.length) return;
    const context = this.context;
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    context.globalAlpha = 1;
    if (animate) {
      // Each band contains complete glyph rows; wind never resamples or changes the characters.
      const bandHeight = this.cellHeight * 2;
      for (let y = 0, band = 0; y < this.height; y += bandHeight, band++) {
        const height = Math.min(bandHeight, this.height - y);
        context.drawImage(
          this.cache,
          0,
          y * this.ratio,
          this.cache.width,
          height * this.ratio,
          this.wind(time, band),
          y,
          this.width,
          height,
        );
      }
    } else context.drawImage(this.cache, 0, 0, this.width, this.height);

    context.globalAlpha = 1;
    context.globalCompositeOperation = "destination-in";
    context.drawImage(this.mask, 0, 0, this.width, this.height);
    context.globalCompositeOperation = "source-over";
  }

  private resample() {
    if (!this.image || !this.width || !this.height) return;
    const crop = coverCrop(
      this.image.naturalWidth,
      this.image.naturalHeight,
      this.width,
      this.height,
      this.focus,
    );
    this.sampler.width = this.columns;
    this.sampler.height = this.rows;
    const context = this.sampler.getContext("2d", {
      willReadFrequently: true,
    })!;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      this.image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      this.columns,
      this.rows,
    );
    this.samples = samplePixels(
      context.getImageData(0, 0, this.columns, this.rows).data,
      this.columns,
      this.rows,
    );
    this.refreshFont();
  }

  private wind(time: number, band: number) {
    return (
      Math.sin(time * 0.55 + band * 0.16) * 1.4 +
      Math.sin(time * 0.23 - band * 0.09) * 0.5
    );
  }
  private font(context: CanvasRenderingContext2D) {
    context.font = `400 ${this.cellWidth * 1.5}px "Geist Mono", ui-monospace, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
  }
  private drawCell(
    context: CanvasRenderingContext2D,
    cell: Cell,
    x: number,
    y: number,
  ) {
    if (cell.glyph === " " || cell.alpha === 0) return;
    context.globalAlpha = cell.alpha;
    context.fillStyle = cell.color;
    context.fillText(cell.glyph, x, y);
  }
}
