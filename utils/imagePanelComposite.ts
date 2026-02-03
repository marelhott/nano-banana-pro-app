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

function getGrid(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  return { cols: 3, rows: 2 };
}

export async function createReferenceStyleComposite(params: {
  referenceImages: ImageInput[];
  styleImages: ImageInput[];
  size?: number;
}): Promise<ImageInput> {
  const { referenceImages, styleImages, size = 1024 } = params;
  const left = referenceImages.slice(0, 6);
  const right = styleImages.slice(0, 6);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = Math.round(size / 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas není dostupný.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#060807';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const panelW = Math.floor(size / 2);
  const panelH = canvas.height;
  const padding = 12;
  const gutter = 8;

  const drawPanel = async (images: ImageInput[], x0: number) => {
    const imgs = await Promise.all(images.map((i) => loadImage(i.data)));
    const { cols, rows } = getGrid(imgs.length);
    const cellW = Math.floor((panelW - padding * 2 - gutter * (cols - 1)) / cols);
    const cellH = Math.floor((panelH - padding * 2 - gutter * (rows - 1)) / rows);
    imgs.forEach((img, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      if (row >= rows) return;
      const x = x0 + padding + col * (cellW + gutter);
      const y = padding + row * (cellH + gutter);
      drawContain(ctx, img, x, y, cellW, cellH);
    });
  };

  await drawPanel(left, 0);
  await drawPanel(right, panelW);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(panelW - 1, 0, 2, panelH);

  return {
    data: canvas.toDataURL('image/png'),
    mimeType: 'image/png',
  };
}

