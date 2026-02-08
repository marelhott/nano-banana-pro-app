import type React from 'react';

export type ImageSlot = {
  file: File;
  dataUrl: string;
};

export type OutputItem = {
  id: string;
  url?: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  error?: string;
};

export const STYLE_REFERENCE_LIMIT = 3;

export function getDataUrlMime(dataUrl: string): string {
  const header = dataUrl.split(',')[0] || '';
  const m = header.match(/data:(.*?);base64/);
  return m?.[1] || 'image/jpeg';
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Nepodařilo se načíst soubor.'));
    r.readAsDataURL(file);
  });
}

export async function resolveDropToFile(e: React.DragEvent): Promise<File | null> {
  const internal = e.dataTransfer.getData('application/x-mulen-image');
  if (internal) {
    const parsed = JSON.parse(internal) as { url: string; fileName?: string; fileType?: string };
    if (parsed?.url) {
      const resp = await fetch(parsed.url);
      if (!resp.ok) {
        throw new Error('Nepodařilo se stáhnout obrázek z interního odkazu.');
      }
      const blob = await resp.blob();
      if (!(blob.type || '').startsWith('image/')) {
        throw new Error('Interní odkaz nevrátil obrázek.');
      }
      return new File([blob], parsed.fileName || 'image.jpg', { type: parsed.fileType || blob.type || 'image/jpeg' });
    }
  }

  const files = Array.from(e.dataTransfer.files as FileList).filter((f) => f.type.startsWith('image/'));
  if (files.length > 0) return files[0];

  const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (url) {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error('Nepodařilo se stáhnout obrázek z URL.');
    }
    const blob = await resp.blob();
    if (!(blob.type || '').startsWith('image/')) {
      throw new Error('URL neobsahuje obrázek.');
    }
    return new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' });
  }

  return null;
}

export async function createStylePatches(styleDataUrl: string): Promise<string[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Nepodařilo se načíst obrázek pro analýzu detailů.'));
    i.src = styleDataUrl;
  });

  const base = Math.min(img.width, img.height);
  const cropSize = Math.max(64, Math.floor(base * 0.5));

  const points: Array<{ x: number; y: number }> = [
    { x: 0, y: 0 },
    { x: img.width - cropSize, y: 0 },
    { x: 0, y: img.height - cropSize },
    { x: img.width - cropSize, y: img.height - cropSize },
    { x: Math.floor((img.width - cropSize) / 2), y: Math.floor((img.height - cropSize) / 2) },
  ].map((p) => ({ x: Math.max(0, p.x), y: Math.max(0, p.y) }));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas není dostupný.');

  canvas.width = cropSize;
  canvas.height = cropSize;

  const patches: string[] = [];
  for (const p of points) {
    ctx.clearRect(0, 0, cropSize, cropSize);
    ctx.drawImage(img, p.x, p.y, cropSize, cropSize, 0, 0, cropSize, cropSize);
    patches.push(canvas.toDataURL('image/jpeg', 0.92));
  }

  return patches;
}

export async function composeStyleReferencesBoard(styleDataUrls: string[]): Promise<string> {
  const refs = styleDataUrls.filter((url) => typeof url === 'string' && url.length > 0).slice(0, STYLE_REFERENCE_LIMIT);
  if (refs.length === 0) {
    throw new Error('Chybí stylové reference.');
  }
  if (refs.length === 1) {
    return refs[0];
  }

  const loaded = await Promise.all(
    refs.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Nepodařilo se načíst stylový obrázek.'));
          img.src = src;
        }),
    ),
  );

  const tile = 512;
  const boardWidth = refs.length === 2 ? tile * 2 : tile * 2;
  const boardHeight = refs.length === 2 ? tile : tile * 2;
  const canvas = document.createElement('canvas');
  canvas.width = boardWidth;
  canvas.height = boardHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas není dostupný.');

  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, boardWidth, boardHeight);

  const layout =
    refs.length === 2
      ? [
          { x: 0, y: 0, w: tile, h: tile },
          { x: tile, y: 0, w: tile, h: tile },
        ]
      : [
          { x: 0, y: 0, w: tile, h: tile },
          { x: tile, y: 0, w: tile, h: tile },
          { x: 0, y: tile, w: tile * 2, h: tile },
        ];

  const drawCover = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const srcAspect = img.width / img.height;
    const dstAspect = w / h;
    let sx = 0;
    let sy = 0;
    let sw = img.width;
    let sh = img.height;

    if (srcAspect > dstAspect) {
      sw = Math.round(img.height * dstAspect);
      sx = Math.round((img.width - sw) / 2);
    } else {
      sh = Math.round(img.width / dstAspect);
      sy = Math.round((img.height - sh) / 2);
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  };

  loaded.forEach((img, idx) => {
    const slot = layout[idx];
    drawCover(img, slot.x, slot.y, slot.w, slot.h);
  });

  return canvas.toDataURL('image/jpeg', 0.92);
}

function makeSeededRng(seed: number) {
  // xorshift32: small + deterministic; good enough for patch placement.
  let x = (seed | 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Convert to [0, 1)
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

/**
 * Create a "texture board" from 1-3 style images by sampling random patches.
 * This tends to work much better for real style-transfer models than a collage layout.
 */
export async function composeStylePatchwork(styleDataUrls: string[], opts?: { size?: number; seed?: number }): Promise<string> {
  const refs = styleDataUrls.filter((url) => typeof url === 'string' && url.length > 0).slice(0, STYLE_REFERENCE_LIMIT);
  if (refs.length === 0) throw new Error('Chybí stylové reference.');
  if (refs.length === 1) return refs[0];

  const size = Math.max(512, Math.min(1536, Math.round(opts?.size ?? 1024)));
  const seed = (opts?.seed ?? Date.now()) | 0;
  const rnd = makeSeededRng(seed);

  const loaded = await Promise.all(
    refs.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Nepodařilo se načíst stylový obrázek.'));
          img.src = src;
        }),
    ),
  );

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas není dostupný.');

  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, size, size);

  // More tiles = more texture mixing. Keep reasonable for performance.
  const tiles = size >= 1024 ? 8 : 6;
  const tile = Math.floor(size / tiles);

  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const img = pick(loaded);
      const minFrac = 0.18;
      const maxFrac = 0.55;
      const frac = minFrac + rnd() * (maxFrac - minFrac);
      const cropW = Math.max(32, Math.floor(img.width * frac));
      const cropH = Math.max(32, Math.floor(img.height * frac));
      const sx = Math.max(0, Math.floor(rnd() * Math.max(1, img.width - cropW)));
      const sy = Math.max(0, Math.floor(rnd() * Math.max(1, img.height - cropH)));

      const dx = x * tile;
      const dy = y * tile;

      // Occasional flips to break seams.
      const flipX = rnd() < 0.25;
      const flipY = rnd() < 0.15;
      ctx.save();
      ctx.translate(dx + tile / 2, dy + tile / 2);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.translate(-(dx + tile / 2), -(dy + tile / 2));
      ctx.drawImage(img, sx, sy, cropW, cropH, dx, dy, tile, tile);
      ctx.restore();
    }
  }

  // Slight blur-like blending via down/upscale to reduce harsh tile edges.
  const soften = document.createElement('canvas');
  const sctx = soften.getContext('2d');
  if (sctx) {
    soften.width = Math.floor(size / 2);
    soften.height = Math.floor(size / 2);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(canvas, 0, 0, soften.width, soften.height);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(soften, 0, 0, size, size);
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}
