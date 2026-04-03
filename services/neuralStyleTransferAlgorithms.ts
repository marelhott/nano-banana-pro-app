import type * as TF from '@tensorflow/tfjs';

type BaseOptions = {
  contentDataUrl: string;
  styleDataUrls: string[];
  strength01: number;
  maxDim: number;
  preserveContentColors: boolean;
  merge01?: number;
  variantSeed?: number;
};

type VggContext = {
  tf: typeof TF;
  extractor: TF.LayersModel;
  styleLayerCount: number;
  preprocessMode: 'vgg' | 'mobilenet';
  inputSize: number | null;
};

let vggContextPromise: Promise<VggContext> | null = null;

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function pickFirst(names: string[], wanted: string[]): string | null {
  for (const w of wanted) {
    if (names.includes(w)) return w;
  }
  return null;
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek.'));
    img.src = dataUrl;
  });
}

function canvasFromImage(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
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

async function getVggContext(): Promise<VggContext> {
  if (vggContextPromise) return vggContextPromise;
  vggContextPromise = (async () => {
    const tf = await import('@tensorflow/tfjs');
    try {
      await tf.setBackend('webgl');
    } catch {
      // fallback to default backend
    }
    await tf.ready();

    const CANDIDATES = [
      {
        id: 'vgg16_savedmodel',
        url: 'https://storage.googleapis.com/tfjs-models/savedmodel/vgg16/model.json',
        preprocessMode: 'vgg',
        style: [
          ['block1_conv2', 'block1_conv1'],
          ['block2_conv2', 'block2_conv1'],
          ['block3_conv3', 'block3_conv2', 'block3_conv1'],
          ['block4_conv3', 'block4_conv2', 'block4_conv1'],
        ],
        content: ['block4_conv2', 'block4_conv3', 'block3_conv3'],
        wct: ['block4_conv3', 'block4_conv2', 'block3_conv3'],
      },
      {
        id: 'vgg16_tfjs',
        url: 'https://storage.googleapis.com/tfjs-models/tfjs/vgg16/model.json',
        preprocessMode: 'vgg',
        style: [
          ['block1_conv2', 'block1_conv1'],
          ['block2_conv2', 'block2_conv1'],
          ['block3_conv3', 'block3_conv2', 'block3_conv1'],
          ['block4_conv3', 'block4_conv2', 'block4_conv1'],
        ],
        content: ['block4_conv2', 'block4_conv3', 'block3_conv3'],
        wct: ['block4_conv3', 'block4_conv2', 'block3_conv3'],
      },
      {
        id: 'mobilenet_v1',
        url: 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_1.0_224/model.json',
        preprocessMode: 'mobilenet',
        style: [
          ['conv_pw_1_relu'],
          ['conv_pw_3_relu'],
          ['conv_pw_5_relu'],
          ['conv_pw_11_relu'],
        ],
        content: ['conv_pw_13_relu', 'conv_pw_11_relu'],
        wct: ['conv_pw_11_relu', 'conv_pw_9_relu'],
      },
    ] as const;

    const errors: string[] = [];
    for (const candidate of CANDIDATES) {
      try {
        const base = await tf.loadLayersModel(candidate.url);
        const allNames = base.layers.map((l) => l.name);
        const styleNames = candidate.style
          .map((alts) => pickFirst(allNames, [...alts]))
          .filter((x): x is string => Boolean(x));
        if (styleNames.length < 2) {
          throw new Error(`Nedostupné style vrstvy (${candidate.id}).`);
        }
        const contentName = pickFirst(allNames, [...candidate.content]) || styleNames[styleNames.length - 1];
        const wctName = pickFirst(allNames, [...candidate.wct]) || contentName;
        if (!contentName || !wctName) {
          throw new Error(`Nedostupné content/WCT vrstvy (${candidate.id}).`);
        }
        const outputNames = [...styleNames, contentName, wctName];
        const outputs = outputNames.map((name) => {
          const layer = base.getLayer(name);
          return layer.output as TF.SymbolicTensor;
        });
        const extractor = tf.model({ inputs: base.inputs, outputs });
        const inputShape = base.inputs?.[0]?.shape || [];
        const inputSize = typeof inputShape?.[1] === 'number' && Number.isFinite(inputShape[1]) ? Number(inputShape[1]) : null;
        console.info(`[StyleTransfer] Backbone loaded: ${candidate.id}`);
        return { tf, extractor, styleLayerCount: styleNames.length, preprocessMode: candidate.preprocessMode, inputSize };
      } catch (err: any) {
        errors.push(`${candidate.id}: ${String(err?.message || err)}`);
      }
    }

    throw new Error(`Nelze načíst backbone model pro Gatys/WCT. ${errors.join(' | ')}`);
  })();
  return vggContextPromise;
}

function preprocessForBackbone(ctx: VggContext, pixel255: TF.Tensor4D): TF.Tensor4D {
  const { tf } = ctx;
  let x: TF.Tensor4D = pixel255;
  if (ctx.inputSize && (pixel255.shape[1] !== ctx.inputSize || pixel255.shape[2] !== ctx.inputSize)) {
    x = tf.image.resizeBilinear(pixel255, [ctx.inputSize, ctx.inputSize], true) as TF.Tensor4D;
  }
  if (ctx.preprocessMode === 'mobilenet') {
    const out = x.div(tf.scalar(127.5)).sub(tf.scalar(1)) as TF.Tensor4D;
    if (x !== pixel255) x.dispose();
    return out;
  }
  const [r, g, b] = tf.split(x, 3, 3);
  const out = tf.concat([
    (b as TF.Tensor).sub(tf.scalar(103.939)),
    (g as TF.Tensor).sub(tf.scalar(116.779)),
    (r as TF.Tensor).sub(tf.scalar(123.68)),
  ], 3) as TF.Tensor4D;
  (r as TF.Tensor).dispose();
  (g as TF.Tensor).dispose();
  (b as TF.Tensor).dispose();
  if (x !== pixel255) x.dispose();
  return out;
}

function gramMatrix(tf: typeof TF, feature: TF.Tensor4D): TF.Tensor2D {
  const [_, h, w, c] = feature.shape;
  const x = feature.reshape([h * w, c]);
  const gram = x.transpose().matMul(x).div(tf.scalar(h * w * c)) as TF.Tensor2D;
  x.dispose();
  return gram;
}

function svdDecompose(tf: typeof TF, cov: TF.Tensor2D): { u: TF.Tensor2D; s: TF.Tensor1D } {
  const raw: any = (tf as any).linalg.svd(cov, true);
  if (!Array.isArray(raw) || raw.length < 2) throw new Error('SVD selhalo.');
  const a = raw[0] as TF.Tensor;
  const b = raw[1] as TF.Tensor;
  if (a.shape.length === 2) {
    return { u: a as TF.Tensor2D, s: b as TF.Tensor1D };
  }
  return { u: b as TF.Tensor2D, s: a as TF.Tensor1D };
}

function wctTransform(tf: typeof TF, contentFeat: TF.Tensor4D, styleFeat: TF.Tensor4D, strength01: number): TF.Tensor4D {
  return tf.tidy(() => {
    const c = contentFeat.squeeze() as TF.Tensor3D; // [H, W, C]
    const s = styleFeat.squeeze() as TF.Tensor3D;
    const [hc, wc, cc] = c.shape;
    const [hs, ws] = s.shape;
    const nc = hc * wc;
    const ns = hs * ws;
    const cMat = c.reshape([nc, cc]).transpose(); // [C, N]
    const sMat = s.reshape([ns, cc]).transpose(); // [C, N]

    const cMean = cMat.mean(1, true);
    const sMean = sMat.mean(1, true);
    const cCentered = cMat.sub(cMean);
    const sCentered = sMat.sub(sMean);

    const eye = tf.eye(cc);
    const eps = tf.scalar(1e-5);
    const covC = cCentered.matMul(cCentered.transpose()).div(tf.scalar(Math.max(1, nc - 1))).add(eye.mul(eps));
    const covS = sCentered.matMul(sCentered.transpose()).div(tf.scalar(Math.max(1, ns - 1))).add(eye.mul(eps));

    const { u: uC, s: sigmaC } = svdDecompose(tf, covC as TF.Tensor2D);
    const { u: uS, s: sigmaS } = svdDecompose(tf, covS as TF.Tensor2D);
    const cInvSqrt = tf.diag(sigmaC.add(tf.scalar(1e-5)).pow(tf.scalar(-0.5)) as TF.Tensor1D);
    const sSqrt = tf.diag(sigmaS.add(tf.scalar(1e-5)).pow(tf.scalar(0.5)) as TF.Tensor1D);

    const whiten = uC.matMul(cInvSqrt).matMul(uC.transpose()).matMul(cCentered);
    const colored = uS.matMul(sSqrt).matMul(uS.transpose()).matMul(whiten).add(sMean);
    const blended = colored.mul(tf.scalar(strength01)).add(cMat.mul(tf.scalar(1 - strength01)));
    const out = blended.transpose().reshape([1, hc, wc, cc]) as TF.Tensor4D;
    return out;
  });
}

function toCanvasFromPixels255(tf: typeof TF, pixels255: TF.Tensor4D, w: number, h: number): Promise<HTMLCanvasElement> {
  const clamped = pixels255.clipByValue(0, 255).squeeze().cast('int32') as TF.Tensor3D;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return tf.browser.toPixels(clamped, canvas).then(() => {
    clamped.dispose();
    return canvas;
  });
}

export async function runGatysStyleTransfer(opts: BaseOptions): Promise<{ dataUrl: string }> {
  const ctx = await getVggContext();
  const { tf, extractor, styleLayerCount } = ctx;
  const strength01 = clamp01(opts.strength01);
  const merge01 = clamp01(opts.merge01 ?? 0.5);
  const contentImg = await loadImage(opts.contentDataUrl);
  const styleImgs = await Promise.all((opts.styleDataUrls || []).filter(Boolean).map((u) => loadImage(u)));
  if (styleImgs.length === 0) throw new Error('Chybí stylový obrázek.');

  const contentCanvas = canvasFromImage(contentImg, opts.maxDim);
  const styleCanvases = styleImgs.map((img) => canvasFromImage(img, 512));

  const contentTensor = tf.browser.fromPixels(contentCanvas).toFloat().expandDims(0) as TF.Tensor4D;
  const styleTensors = styleCanvases.map((c) => tf.browser.fromPixels(c).toFloat().expandDims(0) as TF.Tensor4D);
  const contentPre = preprocessForBackbone(ctx, contentTensor);
  const contentPred = extractor.predict(contentPre) as TF.Tensor[];
  const contentTarget = (contentPred[styleLayerCount] as TF.Tensor4D).clone();

  const styleTargets = tf.tidy(() => {
    const grams: TF.Tensor2D[] = [];
    for (let i = 0; i < styleLayerCount; i++) {
      let acc: TF.Tensor2D | null = null;
      for (const st of styleTensors) {
        const sp = preprocessForBackbone(ctx, st);
        const preds = extractor.predict(sp) as TF.Tensor[];
        const g = gramMatrix(tf, preds[i] as TF.Tensor4D);
        preds.forEach((t) => t.dispose());
        sp.dispose();
        if (!acc) acc = g;
        else {
          const next = acc.add(g) as TF.Tensor2D;
          acc.dispose();
          g.dispose();
          acc = next;
        }
      }
      const avg = (acc as TF.Tensor2D).div(tf.scalar(styleTensors.length)) as TF.Tensor2D;
      grams.push(avg.clone());
      (acc as TF.Tensor2D).dispose();
    }
    return grams;
  });

  const seedNoise = opts.variantSeed ? Math.abs(Math.sin(opts.variantSeed * 0.00001337)) : 0;
  const init = tf.tidy(() => contentTensor.add(tf.randomNormal(contentTensor.shape, 0, 6 + seedNoise * 4)).clipByValue(0, 255)) as TF.Tensor4D;
  const imageVar = tf.variable(init);
  init.dispose();

  const steps = Math.round(40 + merge01 * 120);
  const contentWeight = 1.0;
  const styleWeight = 4.0 * (0.2 + strength01 * 1.8);
  const tvWeight = 1e-4 * (0.5 + merge01);
  const optimizer = tf.train.adam(3.5 * (0.65 + (1 - merge01) * 0.35));

  for (let i = 0; i < steps; i++) {
    tf.tidy(() => {
      const { grads } = tf.variableGrads(() => {
        const pre = preprocessForBackbone(ctx, imageVar as TF.Tensor4D);
        const preds = extractor.predict(pre) as TF.Tensor[];
        let sLoss = tf.scalar(0);
        for (let k = 0; k < styleLayerCount; k++) {
          const gram = gramMatrix(tf, preds[k] as TF.Tensor4D);
          const l = tf.losses.meanSquaredError(styleTargets[k], gram).mean() as TF.Tensor;
          const next = sLoss.add(l) as TF.Scalar;
          sLoss.dispose();
          l.dispose();
          gram.dispose();
          sLoss = next;
        }
        const cLoss = tf.losses.meanSquaredError(contentTarget, preds[styleLayerCount] as TF.Tensor4D).mean() as TF.Tensor;
        const tv = ((tf.image as any).totalVariation(imageVar as TF.Tensor4D) as TF.Tensor).mean() as TF.Tensor;
        const loss = cLoss.mul(tf.scalar(contentWeight))
          .add(sLoss.mul(tf.scalar(styleWeight)))
          .add(tv.mul(tf.scalar(tvWeight))) as TF.Scalar;

        preds.forEach((t) => t.dispose());
        pre.dispose();
        cLoss.dispose();
        tv.dispose();
        sLoss.dispose();
        return loss;
      }, [imageVar]);
      optimizer.applyGradients(grads as any);
      Object.values(grads).forEach((g) => g.dispose());
      imageVar.assign(imageVar.clipByValue(0, 255) as TF.Tensor4D);
    });
    if (i % 8 === 0) await tf.nextFrame();
  }

  const outCanvas = await toCanvasFromPixels255(tf, imageVar as TF.Tensor4D, contentCanvas.width, contentCanvas.height);
  const finalCanvas = opts.preserveContentColors ? preserveColors(contentCanvas, outCanvas) : outCanvas;
  const dataUrl = finalCanvas.toDataURL('image/png');

  imageVar.dispose();
  contentTensor.dispose();
  contentPre.dispose();
  contentPred.forEach((t) => t.dispose());
  contentTarget.dispose();
  styleTensors.forEach((t) => t.dispose());
  styleTargets.forEach((t) => t.dispose());

  return { dataUrl };
}

export async function runWctStyleTransfer(opts: BaseOptions): Promise<{ dataUrl: string }> {
  const ctx = await getVggContext();
  const { tf, extractor, styleLayerCount } = ctx;
  const strength01 = clamp01(opts.strength01);
  const merge01 = clamp01(opts.merge01 ?? 0.5);
  const contentImg = await loadImage(opts.contentDataUrl);
  const styleImgs = await Promise.all((opts.styleDataUrls || []).filter(Boolean).map((u) => loadImage(u)));
  if (styleImgs.length === 0) throw new Error('Chybí stylový obrázek.');

  const contentCanvas = canvasFromImage(contentImg, opts.maxDim);
  const styleCanvas = canvasFromImage(styleImgs[0], 512);
  const contentTensor = tf.browser.fromPixels(contentCanvas).toFloat().expandDims(0) as TF.Tensor4D;
  const styleTensor = tf.browser.fromPixels(styleCanvas).toFloat().expandDims(0) as TF.Tensor4D;

  const contentPre = preprocessForBackbone(ctx, contentTensor);
  const stylePre = preprocessForBackbone(ctx, styleTensor);
  const contentPred = extractor.predict(contentPre) as TF.Tensor[];
  const stylePred = extractor.predict(stylePre) as TF.Tensor[];
  const contentFeat = (contentPred[styleLayerCount + 1] as TF.Tensor4D).clone();
  const styleFeat = (stylePred[styleLayerCount + 1] as TF.Tensor4D).clone();
  const contentTarget = (contentPred[styleLayerCount] as TF.Tensor4D).clone();
  const wctTarget = wctTransform(tf, contentFeat, styleFeat, strength01);

  const init = tf.clone(contentTensor) as TF.Tensor4D;
  const imageVar = tf.variable(init);
  init.dispose();

  const steps = Math.round(28 + merge01 * 70);
  const wctWeight = 2.2 + strength01 * 2.5;
  const contentWeight = 1.0 + (1 - strength01) * 1.2;
  const tvWeight = 8e-5 * (0.6 + merge01);
  const optimizer = tf.train.adam(2.4);

  for (let i = 0; i < steps; i++) {
    tf.tidy(() => {
      const { grads } = tf.variableGrads(() => {
        const pre = preprocessForBackbone(ctx, imageVar as TF.Tensor4D);
        const preds = extractor.predict(pre) as TF.Tensor[];
        const featLoss = tf.losses.meanSquaredError(wctTarget, preds[styleLayerCount + 1] as TF.Tensor4D).mean() as TF.Tensor;
        const cLoss = tf.losses.meanSquaredError(contentTarget, preds[styleLayerCount] as TF.Tensor4D).mean() as TF.Tensor;
        const tv = ((tf.image as any).totalVariation(imageVar as TF.Tensor4D) as TF.Tensor).mean() as TF.Tensor;
        const loss = featLoss.mul(tf.scalar(wctWeight))
          .add(cLoss.mul(tf.scalar(contentWeight)))
          .add(tv.mul(tf.scalar(tvWeight))) as TF.Scalar;
        preds.forEach((t) => t.dispose());
        pre.dispose();
        featLoss.dispose();
        cLoss.dispose();
        tv.dispose();
        return loss;
      }, [imageVar]);
      optimizer.applyGradients(grads as any);
      Object.values(grads).forEach((g) => g.dispose());
      imageVar.assign(imageVar.clipByValue(0, 255) as TF.Tensor4D);
    });
    if (i % 8 === 0) await tf.nextFrame();
  }

  const outCanvas = await toCanvasFromPixels255(tf, imageVar as TF.Tensor4D, contentCanvas.width, contentCanvas.height);
  const finalCanvas = opts.preserveContentColors ? preserveColors(contentCanvas, outCanvas) : outCanvas;
  const dataUrl = finalCanvas.toDataURL('image/png');

  imageVar.dispose();
  contentTensor.dispose();
  styleTensor.dispose();
  contentPre.dispose();
  stylePre.dispose();
  contentPred.forEach((t) => t.dispose());
  stylePred.forEach((t) => t.dispose());
  contentFeat.dispose();
  styleFeat.dispose();
  contentTarget.dispose();
  wctTarget.dispose();

  return { dataUrl };
}
