import type { ImageRecord, Project } from '../types';
import { getRepository } from './db';
import { uid } from './model';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

export function isAcceptedImage(file: File) {
  return ACCEPTED.includes(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
}

function decodeSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

export const MAX_IMAGE_WIDTH = 1920;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  // Try compact formats and keep the smallest. WebP usually wins; Safari can't encode WebP,
  // and flat UI screenshots are often smaller as PNG than JPEG, so compare.
  const candidates: Blob[] = [];
  const webp = await canvasToBlob(canvas, 'image/webp', 0.9);
  if (webp && webp.type === 'image/webp') candidates.push(webp);
  else {
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    if (jpeg) candidates.push(jpeg);
  }
  const png = await canvasToBlob(canvas, 'image/png');
  if (png) candidates.push(png);
  return candidates.sort((a, b) => a.size - b.size)[0];
}

/** Downscale very wide screenshots and re-encode compactly. Returns the original if that's still smaller. */
export async function optimizeImage(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await encode(canvas);
  // Never make a screenshot bigger (Safari's encoders sometimes do on text-heavy images).
  return out.size < blob.size ? out : blob;
}

export type RedactStyle = 'black' | 'white' | 'pixelate';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Permanently paint over regions (percent rects) of a screenshot. */
export async function redactImage(blob: Blob, rects: Rect[], style: RedactStyle): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  for (const r of rects) {
    const x = Math.floor((r.x / 100) * canvas.width);
    const y = Math.floor((r.y / 100) * canvas.height);
    const w = Math.ceil((r.w / 100) * canvas.width);
    const h = Math.ceil((r.h / 100) * canvas.height);
    if (style === 'pixelate') {
      // Large blocks so the original text can't be reconstructed.
      const block = Math.max(16, Math.round(Math.min(w, h) / 2));
      const tiny = document.createElement('canvas');
      tiny.width = Math.max(1, Math.round(w / block));
      tiny.height = Math.max(1, Math.round(h / block));
      tiny.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, tiny.width, tiny.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle = style === 'black' ? '#111' : '#fff';
      ctx.fillRect(x, y, w, h);
    }
  }
  return (await canvasToBlob(canvas, 'image/png'))!;
}

/** Store a screenshot locally (never uploaded anywhere). */
export async function storeImage(input: Blob, opts: { optimize?: boolean } = {}): Promise<ImageRecord> {
  let blob = input;
  if (opts.optimize) {
    try {
      blob = await optimizeImage(input);
    } catch {
      blob = input; // keep the original if the browser can't re-encode it
    }
  }
  const { width, height } = await decodeSize(blob);
  const rec: ImageRecord = { id: uid('img_'), blob, width, height };
  await getRepository().saveImage(rec);
  return rec;
}

const urlCache = new Map<string, Promise<string>>();

/** Object URL for a stored image (cached for the session). */
export function imageUrl(id: string): Promise<string> {
  let p = urlCache.get(id);
  if (!p) {
    p = getRepository()
      .getImage(id)
      .then((rec) => (rec ? URL.createObjectURL(rec.blob) : ''));
    urlCache.set(id, p);
  }
  return p;
}

export function forgetImageUrl(id: string) {
  const p = urlCache.get(id);
  urlCache.delete(id);
  p?.then((u) => u && URL.revokeObjectURL(u));
}

export async function imageUrlsFor(project: Project): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(project.screens.map(async (s) => (out[s.imageId] = await imageUrl(s.imageId))));
  return out;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export function fileNameFromLabel(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Screen';
}
