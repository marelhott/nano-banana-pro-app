import type { AIProvider, GenerateImageResult, ImageInput } from './aiProvider';
import { AIProviderType } from './aiProvider';

type ReplicatePrediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string | null;
  urls?: { get?: string };
};

function assertOk(res: Response, message: string) {
  if (!res.ok) throw new Error(`${message} (${res.status})`);
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  assertOk(res, 'Nepodařilo se stáhnout výstup z Replicate');
  const blob = await res.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Nepodařilo se načíst výstupní obrázek.'));
    r.readAsDataURL(blob);
  });
  return base64;
}

export async function runReplicatePrediction(params: {
  token: string;
  model: string;
  input: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<ReplicatePrediction> {
  const { token, model, input, timeoutMs = 120_000 } = params;
  const start = Date.now();

  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({ version: model, input }),
  });

  assertOk(createRes, 'Replicate request selhal');
  let prediction = (await createRes.json()) as ReplicatePrediction;

  while (prediction.status === 'starting' || prediction.status === 'processing') {
    if (!prediction.urls?.get) throw new Error('Replicate nevrátil URL pro polling.');
    if (Date.now() - start > timeoutMs) throw new Error('Replicate generování trvá příliš dlouho.');
    await new Promise((r) => setTimeout(r, 1200));
    const pollRes = await fetch(prediction.urls.get, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    assertOk(pollRes, 'Replicate polling selhal');
    prediction = (await pollRes.json()) as ReplicatePrediction;
  }

  return prediction;
}

export async function runFluxKontextProMultiImage(params: {
  token: string;
  image1: string;
  image2: string;
  prompt: string;
  seed?: number;
  aspect_ratio?: string;
}): Promise<string> {
  const prediction = await runReplicatePrediction({
    token: params.token,
    model: 'flux-kontext-apps/multi-image-kontext-pro',
    input: {
      prompt: params.prompt,
      input_image_1: params.image1,
      input_image_2: params.image2,
      seed: params.seed,
      aspect_ratio: params.aspect_ratio || 'match_input_image',
      output_format: 'png',
      safety_tolerance: 2,
    },
  });

  if (prediction.status !== 'succeeded') {
    throw new Error(prediction.error || 'Replicate generování selhalo.');
  }

  const output = prediction.output as any;
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Replicate nevrátil URL obrázku.');
  }
  return await fetchAsDataUrl(url);
}

export async function runIpAdapterStyleTransfer(params: {
  token: string;
  contentImage: string;
  styleImage: string;
  prompt: string;
  negativePrompt?: string;
  cfgScale: number;
  denoise: number;
  ipAdapterWeight: number;
  numOutputs: number;
  seed?: number;
}): Promise<string[]> {
  const prediction = await runReplicatePrediction({
    token: params.token,
    model: '7a904d90b4a018eeb8e47dd850470ef651a6f4563fa20dc8b62deb0f344cb13a',
    input: {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || 'text, watermark, logo, blur, artifacts',
      guidance_scale: params.cfgScale,
      eta: 0,
      seed: params.seed,
      num_outputs: params.numOutputs,
      img2img_image: params.contentImage,
      img2img_strength: params.denoise,
      ip_adapter_image: params.styleImage,
      ip_adapter_weight: params.ipAdapterWeight,
      disable_safety_check: false,
    },
    timeoutMs: 240_000,
  });

  if (prediction.status !== 'succeeded') {
    throw new Error(prediction.error || 'Replicate generování selhalo.');
  }

  const output = prediction.output as any;
  const urls = Array.isArray(output) ? output : [output];
  const first = urls[0];
  if (typeof first !== 'string' || first.length === 0) throw new Error('Replicate nevrátil URL obrázku.');

  const results: string[] = [];
  for (const u of urls) {
    if (typeof u === 'string' && u.length > 0) {
      results.push(await fetchAsDataUrl(u));
    }
  }
  return results;
}

export class ReplicateProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'Replicate (FLUX Kontext Pro)';
  }

  getType(): AIProviderType {
    return AIProviderType.REPLICATE;
  }

  async enhancePrompt(shortPrompt: string): Promise<string> {
    return shortPrompt;
  }

  async generateImage(
    images: ImageInput[],
    prompt: string,
    _resolution?: string,
    _aspectRatio?: string,
    _useGrounding?: boolean
  ): Promise<GenerateImageResult> {
    if (!images[0]?.data) throw new Error('Chybí vstupní obrázek.');

    const prediction = await runReplicatePrediction({
      token: this.apiKey,
      model: 'black-forest-labs/flux-kontext-pro',
      input: {
        prompt,
        input_image: images[0].data,
        aspect_ratio: 'match_input_image',
        output_format: 'png',
        safety_tolerance: 2,
      },
    });

    if (prediction.status !== 'succeeded') {
      throw new Error(prediction.error || 'Replicate generování selhalo.');
    }

    const output = prediction.output as any;
    const url = Array.isArray(output) ? output[0] : output;
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error('Replicate nevrátil URL obrázku.');
    }

    return { imageBase64: await fetchAsDataUrl(url) };
  }
}
