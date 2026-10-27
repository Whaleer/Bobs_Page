import {
  colorForTheme,
  coverCrop,
  desktopWindAt,
  foliageCells,
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

interface Tile {
  x: number;
  y: number;
  sourceX: number;
  sourceY: number;
  width: number;
  height: number;
  active: boolean;
}

const TILE_COLUMNS = 8;
const TILE_ROWS = 4;

export class AsciiRenderer {
  private context: CanvasRenderingContext2D;
  private cache = document.createElement("canvas");
  private still = document.createElement("canvas");
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
  private foliage: boolean[] = [];
  private stationaryRegions: Point[][] = [];
  private stationaryPath = new Path2D();
  private cells: Cell[] = [];
  private tiles: Tile[] = [];
  private tileColumns = 0;
  private tilePadding = 0;
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

  setStationaryRegions(regions: Point[][]) {
    this.stationaryRegions = regions;
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
    this.context.canvas.width = Math.round(width * ratio);
    this.context.canvas.height = Math.round(height * ratio);
    this.still.width = width >= 1024 ? this.context.canvas.width : 1;
    this.still.height = width >= 1024 ? this.context.canvas.height : 1;
    this.prepareCache();
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
    context.clearRect(
      0,
      0,
      this.cache.width / this.ratio,
      this.cache.height / this.ratio,
    );
    this.font(context);
    const still = this.still.getContext("2d")!;
    still.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    still.clearRect(0, 0, this.width, this.height);
    this.font(still);
    for (const tile of this.tiles) tile.active = false;
    this.cells = this.samples.map((sample, index) => ({
      x: ((index % this.columns) + 0.5) * this.cellWidth,
      y: (Math.floor(index / this.columns) + 0.5) * this.cellHeight,
      glyph: glyphForLuminance(sample.luminance, this.isLight),
      color: colorForTheme(sample, this.isLight),
      alpha: sample.alpha * (this.isLight ? 0.78 : 0.8),
    }));
    for (const [index, cell] of this.cells.entries()) {
      if (this.tiles.length) {
        if (!this.foliage[index]) {
          this.drawCell(still, cell, cell.x, cell.y);
          continue;
        }
        const row = Math.floor(index / this.columns);
        const col = index % this.columns;
        const tile =
          this.tiles[
            Math.floor(row / TILE_ROWS) * this.tileColumns +
              Math.floor(col / TILE_COLUMNS)
          ];
        if (cell.glyph !== " " && cell.alpha > 0) tile.active = true;
        this.drawCell(
          context,
          cell,
          tile.sourceX / this.ratio + this.tilePadding + cell.x - tile.x,
          tile.sourceY / this.ratio + this.tilePadding + cell.y - tile.y,
        );
      } else this.drawCell(context, cell, cell.x, cell.y);
    }
    context.globalAlpha = 1;
    still.globalAlpha = 1;
  }

  render(time: number, animate: boolean) {
    if (!this.cells.length) return;
    const context = this.context;
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    context.globalAlpha = 1;
    if (this.tiles.length) {
      for (const tile of this.tiles) {
        if (!tile.active) continue;
        const wind = animate
          ? desktopWindAt(
              time,
              tile.x + (this.cellWidth * TILE_COLUMNS) / 2,
              tile.y + (this.cellHeight * TILE_ROWS) / 2,
              this.cellWidth,
            )
          : { x: 0, y: 0, alpha: 1 };
        context.globalAlpha = wind.alpha;
        context.drawImage(
          this.cache,
          tile.sourceX,
          tile.sourceY,
          tile.width,
          tile.height,
          tile.x - this.tilePadding + wind.x,
          tile.y - this.tilePadding + wind.y,
          tile.width / this.ratio,
          tile.height / this.ratio,
        );
      }
      // Leaves can pass behind a branch, but never repaint its fixed silhouette.
      if (animate && this.stationaryRegions.length) {
        context.save();
        context.clip(this.stationaryPath);
        context.clearRect(0, 0, this.width, this.height);
        context.restore();
      }
      context.globalAlpha = 1;
      context.drawImage(this.still, 0, 0, this.width, this.height);
    } else if (animate) {
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

  private prepareCache() {
    this.tiles = [];
    if (this.width < 1024) {
      this.cache.width = Math.round(this.width * this.ratio);
      this.cache.height = Math.round(this.height * this.ratio);
      return;
    }
    this.tileColumns = Math.ceil(this.columns / TILE_COLUMNS);
    const tileRows = Math.ceil(this.rows / TILE_ROWS);
    const padding = Math.ceil(2 * this.ratio);
    this.tilePadding = padding / this.ratio;
    const slotWidth =
      Math.ceil(this.cellWidth * TILE_COLUMNS * this.ratio) + padding * 2;
    const slotHeight =
      Math.ceil(this.cellHeight * TILE_ROWS * this.ratio) + padding * 2;
    this.cache.width = this.tileColumns * slotWidth;
    this.cache.height = tileRows * slotHeight;
    // Each atlas slot contains only its own complete glyphs. Transparent gutters
    // keep moving tiles from clipping letters or duplicating a neighbor's pixels.
    for (let row = 0; row < tileRows; row++)
      for (let col = 0; col < this.tileColumns; col++)
        this.tiles.push({
          x:
            Math.floor(col * this.cellWidth * TILE_COLUMNS * this.ratio) /
            this.ratio,
          y:
            Math.floor(row * this.cellHeight * TILE_ROWS * this.ratio) /
            this.ratio,
          sourceX: col * slotWidth,
          sourceY: row * slotHeight,
          width: slotWidth,
          height: slotHeight,
          active: false,
        });
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
    this.foliage = foliageCells(
      this.samples,
      this.columns,
      this.rows,
      crop,
      this.image.naturalWidth,
      this.image.naturalHeight,
      this.stationaryRegions,
    );
    this.stationaryPath = new Path2D();
    for (const polygon of this.stationaryRegions) {
      polygon.forEach((point, index) => {
        const x =
          ((point.x * this.image!.naturalWidth - crop.x) / crop.width) *
          this.width;
        const y =
          ((point.y * this.image!.naturalHeight - crop.y) / crop.height) *
          this.height;
        if (index === 0) this.stationaryPath.moveTo(x, y);
        else this.stationaryPath.lineTo(x, y);
      });
      this.stationaryPath.closePath();
    }
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
