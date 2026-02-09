/**
 * Upscaling — zvětšení obrázku pomocí AI modelu přes Replicate.
 * Používá Real-ESRGAN pro 2× nebo 4× zvětšení.
 */

import { runReplicatePrediction } from '../services/replicateService';

export interface UpscaleOptions {
  token: string;
  imageDataUrl: string;
  factor: 2 | 4;
}

export interface UpscaleResult {
  imageDataUrl: string;
  originalWidth: number;
  originalHeight: number;
  newWidth: number;
  newHeight: number;
}

/**
 * Zvětší obrázek pomocí Real-ESRGAN na Replicate.
 */
export async function upscaleImage(options: UpscaleOptions): Promise<UpscaleResult> {
  const { token, imageDataUrl, factor } = options;

  // Zjistit originální rozměry
  const dims = await getImageDimensions(imageDataUrl);

  const prediction = await runReplicatePrediction({
    token,
    model: 'nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
    input: {
      image: imageDataUrl,
      scale: factor,
      face_enhance: true,
    },
    timeoutMs: 180_000,
  });

  if (prediction.status !== 'succeeded') {
    throw new Error(prediction.error || 'Upscaling selhal.');
  }

  const output = prediction.output as any;
  const url = typeof output === 'string' ? output : Array.isArray(output) ? output[0] : null;

  if (!url || typeof url !== 'string') {
    throw new Error('Upscaler nevrátil žádný výstup.');
  }

  // Stáhnout výsledek jako dataURL
  const response = await fetch(url);
  if (!response.ok) throw new Error('Nepodařilo se stáhnout zvětšený obrázek.');
  const blob = await response.blob();
  const resultDataUrl = await blobToDataUrl(blob);

  return {
    imageDataUrl: resultDataUrl,
    originalWidth: dims.width,
    originalHeight: dims.height,
    newWidth: dims.width * factor,
    newHeight: dims.height * factor,
  };
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error('Nelze načíst obrázek pro zjištění rozměrů.'));
    img.src = dataUrl;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Nelze převést blob na dataURL.'));
    reader.readAsDataURL(blob);
  });
}
