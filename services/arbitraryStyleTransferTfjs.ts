// Fast, promptless image-to-image style transfer (Ostagram-like).
//
// Implementation: "Arbitrary Image Stylization" using two TFJS GraphModels:
// - styleNet: predicts 100D style bottleneck from a style image
// - transformNet: applies that bottleneck to a content image
//
// Models are served locally from /public/style-transfer/ so there is no external
// GPU queue or API dependency.

export type ArbitraryStyleTransferOptions = {
  contentDataUrl: string;
  styleDataUrls: string[]; // 1..3 (or more, we average)
  strength01: number; // 0..1 (0 -> keep content identity, 1 -> full style)
  maxDim: number; // e.g. 512 or 1024
  preserveContentColors: boolean;
  variantSeed?: number;
};

let modelsPromise: Promise<{
  tf: typeof import('@tensorflow/tfjs');
  styleNet: any;
  transformNet: any;
}> | null = null;

async function loadModels() {
  if (modelsPromise) return modelsPromise;
  modelsPromise = (async () => {
    const tf = await import('@tensorflow/tfjs');

    // Mirrors a known perf workaround used by the original TFJS demo.
    try {
      // @ts-expect-error - ENV is not typed in all TFJS builds.
      tf.ENV.set('WEBGL_PACK', false);
    } catch {
      // ignore
    }

    // Prefer WebGL backend for speed/compat. (WebGPU could be faster but is less consistent.)
    try {
      await tf.setBackend('webgl');
    } catch {
      // If webgl backend is unavailable, let TFJS pick.
    }
    await tf.ready();

    const styleUrl = '/style-transfer/saved_model_style_js/model.json';
    const transformUrl = '/style-transfer/saved_model_transformer_separable_js/model.json';

    // loadGraphModel works with local static assets (model.json + shards).
    const [styleNet, transformNet] = await Promise.all([
      tf.loadGraphModel(styleUrl),
      tf.loadGraphModel(transformUrl),
    ]);

    return { tf, styleNet, transformNet };
  })();
  return modelsPromise;
}

function clamp01(v: number) {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek.'));
    img.src = dataUrl;
  });
}

function canvasFromImage(
  img: HTMLImageElement,
  opts: { maxDim: number; cropSquare?: boolean; seed?: number },
): HTMLCanvasElement {
  const maxDim = Math.max(1, Math.floor(opts.maxDim));
  const cropSquare = !!opts.cropSquare;

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  // Optional randomized crop (used to get slightly different variants).
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;

  if (cropSquare) {
    const side = Math.min(iw, ih);
    const maxX = Math.max(0, iw - side);
    const maxY = Math.max(0, ih - side);
    const seed = (opts.seed ?? 0) >>> 0;
    const rx = (Math.sin(seed * 12.9898 + 0.1) * 43758.5453) % 1;
    const ry = (Math.sin(seed * 78.233 + 0.2) * 43758.5453) % 1;
    sx = Math.floor(Math.abs(rx) * (maxX + 1));
    sy = Math.floor(Math.abs(ry) * (maxY + 1));
    sw = side;
    sh = side;
  }

  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return canvas;
}

function preserveColors(contentCanvas: HTMLCanvasElement, stylizedCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = stylizedCanvas.width;
  const h = stylizedCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctxOut = out.getContext('2d');
  const ctxContent = contentCanvas.getContext('2d');
  const ctxStylized = stylizedCanvas.getContext('2d');
  if (!ctxOut || !ctxContent || !ctxStylized) return stylizedCanvas;

  // Ensure content is same size.
  const tmpContent = document.createElement('canvas');
  tmpContent.width = w;
  tmpContent.height = h;
  const tmpCtx = tmpContent.getContext('2d');
  if (!tmpCtx) return stylizedCanvas;
  tmpCtx.drawImage(contentCanvas, 0, 0, w, h);

  const c = tmpCtx.getImageData(0, 0, w, h);
  const s = ctxStylized.getImageData(0, 0, w, h);
  const d = ctxOut.createImageData(w, h);

  for (let i = 0; i < d.data.length; i += 4) {
    const cr = c.data[i];
    const cg = c.data[i + 1];
    const cb = c.data[i + 2];

    const sr = s.data[i];
    const sg = s.data[i + 1];
    const sb = s.data[i + 2];

    const yC = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
    const yS = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
    const scale = yS / (yC + 1e-3);

    d.data[i] = Math.max(0, Math.min(255, cr * scale));
    d.data[i + 1] = Math.max(0, Math.min(255, cg * scale));
    d.data[i + 2] = Math.max(0, Math.min(255, cb * scale));
    d.data[i + 3] = 255;
  }

  ctxOut.putImageData(d, 0, 0);
  return out;
}

export async function runArbitraryStyleTransferTfjs(opts: ArbitraryStyleTransferOptions): Promise<{ dataUrl: string }> {
  const { tf, styleNet, transformNet } = await loadModels();

  const strength01 = clamp01(opts.strength01);
  const styleUrls = (opts.styleDataUrls || []).filter(Boolean);
  if (!opts.contentDataUrl || styleUrls.length === 0) throw new Error('Chybí content nebo stylový obrázek.');

  const [contentImg, ...styleImgs] = await Promise.all([
    loadImage(opts.contentDataUrl),
    ...styleUrls.map((u) => loadImage(u)),
  ]);

  const contentCanvas = canvasFromImage(contentImg, { maxDim: opts.maxDim, cropSquare: false });

  // Style bottleneck is computed on smaller crops for speed.
  const STYLE_SIZE = 256;
  const seedBase = (opts.variantSeed ?? 0) | 0;
  const styleCanvases = styleImgs.map((img, idx) =>
    canvasFromImage(img, { maxDim: STYLE_SIZE, cropSquare: true, seed: seedBase + idx * 1013 }),
  );
  const contentForIdentity = canvasFromImage(contentImg, { maxDim: STYLE_SIZE, cropSquare: false });

  const toNorm4D = (c: HTMLCanvasElement) => tf.browser.fromPixels(c).toFloat().div(tf.scalar(255)).expandDims(0);

  // Manual disposal because toPixels is async and tf.tidy doesn't track across awaits.
  const tensorsToDispose: any[] = [];
  const make = <T>(t: T) => {
    tensorsToDispose.push(t);
    return t;
  };

  let stylizedCanvas: HTMLCanvasElement;
  try {
    const styleBottlenecks = styleCanvases.map((c) => make(styleNet.predict(make(toNorm4D(c)))));
    const styleAvg =
      styleBottlenecks.length === 1
        ? styleBottlenecks[0]
        : make(tf.addN(styleBottlenecks).div(tf.scalar(styleBottlenecks.length)));

    const identity = make(styleNet.predict(make(toNorm4D(contentForIdentity))));

    // Blend style with content identity (lets you go from subtle to heavy).
    const bottleneck = make(styleAvg.mul(tf.scalar(strength01)).add(identity.mul(tf.scalar(1 - strength01))));

    // Optional micro-variation: tiny noise in style vector for variants.
    const noiseSigma = 0.015;
    const noise = (opts.variantSeed ?? 0)
      ? make(tf.randomNormal(bottleneck.shape, 0, noiseSigma))
      : make(tf.zerosLike(bottleneck));
    const bottleneckNoisy = make(bottleneck.add(noise));

    const contentTensor = make(toNorm4D(contentCanvas));
    const stylizedRaw = make(transformNet.predict([contentTensor, bottleneckNoisy]));
    const stylized = make(stylizedRaw.squeeze());

    stylizedCanvas = document.createElement('canvas');
    stylizedCanvas.width = contentCanvas.width;
    stylizedCanvas.height = contentCanvas.height;
    await tf.browser.toPixels(stylized, stylizedCanvas);
  } finally {
    for (const t of tensorsToDispose) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (t && typeof (t as any).dispose === 'function') (t as any).dispose();
      } catch {
        // ignore
      }
    }
  }

  const finalCanvas = opts.preserveContentColors ? preserveColors(contentCanvas, stylizedCanvas) : stylizedCanvas;
  const dataUrl = finalCanvas.toDataURL('image/png');

  // Hint to browser GC: these canvases can be large.
  try {
    contentCanvas.width = 1;
    contentCanvas.height = 1;
  } catch {
    // ignore
  }

  return { dataUrl };
}
