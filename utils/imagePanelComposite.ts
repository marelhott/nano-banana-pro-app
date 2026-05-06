import type { ImageInput } from '../services/aiProvider';

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek.'));
    img.src = dataUrl;
  });
}

function drawContain(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const iw = (img as any).width as number;
  const ih = (img as any).height as number;
  if (!iw || !ih) return;
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

export async function createReferenceStyleComposite(params: {
  referenceImages: ImageInput[];
  styleImages: ImageInput[];
  size?: number;
  outputMimeType?: 'image/png' | 'image/jpeg';
  outputQuality?: number;
}): Promise<ImageInput> {
  const {
    referenceImages,
    styleImages,
    size = 1024,
    outputMimeType = 'image/png',
    outputQuality = 0.9,
  } = params;
  const left = referenceImages.slice(0, 1);
  const right = styleImages.slice(0, 1);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas není dostupný.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#060807';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const padding = Math.round(size * 0.025);
  const targetImg = left[0] ? await loadImage(left[0].data) : null;
  const sourceImg = right[0] ? await loadImage(right[0].data) : null;

  if (targetImg) {
    drawContain(ctx, targetImg, padding, padding, canvas.width - padding * 2, canvas.height - padding * 2);
  }

  if (sourceImg) {
    const insetW = Math.round(canvas.width * 0.24);
    const insetH = Math.round(canvas.height * 0.24);
    const insetX = canvas.width - insetW - padding;
    const insetY = padding;

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(insetX - 6, insetY - 6, insetW + 12, insetH + 30);
    drawContain(ctx, sourceImg, insetX, insetY, insetW, insetH);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `${Math.max(11, Math.round(size * 0.018))}px sans-serif`;
    ctx.fillText('SOURCE IDENTITY', insetX, insetY + insetH + 18);
  }

  return {
    data: outputMimeType === 'image/jpeg'
      ? canvas.toDataURL('image/jpeg', Math.max(0.3, Math.min(1, outputQuality)))
      : canvas.toDataURL('image/png'),
    mimeType: outputMimeType,
  };
}
