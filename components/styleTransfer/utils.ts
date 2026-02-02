import type React from 'react';

export type ImageSlot = {
  file: File;
  dataUrl: string;
};

export type StyleTransferAnalysis = {
  recommendedStrength: number;
  styleDescription: string;
  negativePrompt: string;
};

export type StyleTransferEngine = 'gemini' | 'replicate_flux_kontext_pro' | 'replicate_ip_adapter';

export type OutputItem = {
  id: string;
  url?: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  error?: string;
};

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
      const blob = await resp.blob();
      return new File([blob], parsed.fileName || 'image.jpg', { type: parsed.fileType || blob.type || 'image/jpeg' });
    }
  }

  const files = Array.from(e.dataTransfer.files as FileList).filter((f) => f.type.startsWith('image/'));
  if (files.length > 0) return files[0];

  const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (url) {
    const resp = await fetch(url);
    const blob = await resp.blob();
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
