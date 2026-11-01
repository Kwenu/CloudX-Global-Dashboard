/**
 * Turns a drawn signature (canvas) or an uploaded photo / scan into a small, trimmed PNG with a
 * transparent background, so it can sit naturally on the signature line of an invoice or quotation.
 */

const MAX_WIDTH = 900;
const PADDING = 8;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('The signature could not be prepared.')), 'image/png');
  });
}

/** Crops transparent margins, limits the width, and returns a PNG. Throws if nothing was drawn. */
async function trimToPng(source: HTMLCanvasElement): Promise<Blob> {
  const ctx = source.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot process images.');
  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('No signature was found. Please sign again, or use a clearer image.');

  const sx = Math.max(0, minX - PADDING);
  const sy = Math.max(0, minY - PADDING);
  const sw = Math.min(width, maxX + PADDING + 1) - sx;
  const sh = Math.min(height, maxY + PADDING + 1) - sy;
  const scale = Math.min(1, MAX_WIDTH / sw);

  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Your browser cannot process images.');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return toBlob(out);
}

/** A signature drawn on the pad (transparent canvas, dark ink). */
export function signatureFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return trimToPng(canvas);
}

/**
 * An uploaded photo or scan of a signature on paper: the white paper is made transparent and the
 * ink is darkened, so it prints cleanly. Images that are already transparent are kept as they are.
 */
export async function signatureFromFile(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser cannot process images.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    // paper (bright) → transparent, ink (dark) → opaque, with a soft edge in between
    const inkAlpha = Math.min(1, Math.max(0, (232 - lum) / 90));
    px[i + 3] = Math.round(Math.min(px[i + 3], inkAlpha * 255));
    px[i] = Math.round(px[i] * 0.35);
    px[i + 1] = Math.round(px[i + 1] * 0.35);
    px[i + 2] = Math.round(px[i + 2] * 0.35);
  }
  ctx.putImageData(image, 0, 0);
  return trimToPng(canvas);
}
