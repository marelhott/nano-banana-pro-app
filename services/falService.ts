type FalLoraConfig = { path: string; scale?: number };

type FalImage = { url: string; content_type?: string; width?: number; height?: number };

type FalLoraImg2ImgResponse = {
  images?: FalImage[];
  seed?: number;
  request_id?: string;
};

function assertOk(res: Response, message: string) {
  if (!res.ok) throw new Error(`${message} (HTTP ${res.status})`);
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  assertOk(res, 'Nepodařilo se stáhnout výstup z fal.ai');
  const blob = await res.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Nepodařilo se načíst výstupní obrázek.'));
    r.readAsDataURL(blob);
  });
  return base64;
}

export async function runFalLoraImg2Img(params: {
  modelName: string;
  imageUrlOrDataUrl: string;
  prompt: string;
  negativePrompt?: string;
  cfg: number;
  denoise: number;
  steps: number;
  seed?: number;
  numImages: 1 | 2 | 3;
  loras?: FalLoraConfig[];
}): Promise<{ images: string[]; usedSeed?: number }> {
  const input: Record<string, any> = {
    model_name: params.modelName,
    image_url: params.imageUrlOrDataUrl,
    prompt: params.prompt,
    guidance_scale: params.cfg,
    noise_strength: params.denoise,
    num_inference_steps: params.steps,
    num_images: params.numImages,
  };

  if (params.negativePrompt?.trim()) input.negative_prompt = params.negativePrompt.trim();
  if (typeof params.seed === 'number' && Number.isFinite(params.seed)) input.seed = Math.floor(params.seed);
  if (Array.isArray(params.loras) && params.loras.length > 0) input.loras = params.loras;

  const res = await fetch('/api/fal/lora-img2img', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });

  assertOk(res, 'fal.ai request selhal');
  const payload = (await res.json()) as FalLoraImg2ImgResponse;

  const urls = (payload.images || []).map((i) => i?.url).filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (urls.length === 0) throw new Error('fal.ai nevrátil žádné obrázky.');

  const out: string[] = [];
  for (const u of urls) out.push(await fetchAsDataUrl(u));

  return { images: out, usedSeed: typeof payload.seed === 'number' ? payload.seed : undefined };
}

