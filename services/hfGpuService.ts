type HfImage = { url: string; content_type?: string; width?: number; height?: number };

type HfImg2ImgResponse = {
  images?: HfImage[];
  seed?: number;
  request_id?: string;
  error?: string;
};

function assertOk(res: Response, message: string) {
  if (!res.ok) throw new Error(`${message} (HTTP ${res.status})`);
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  assertOk(res, 'Nepodařilo se stáhnout výstup z HF GPU');
  const blob = await res.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Nepodařilo se načíst výstupní obrázek.'));
    r.readAsDataURL(blob);
  });
  return base64;
}

export async function runHfGpuImg2Img(params: {
  modelName: string;
  imageUrl: string;
  cfg: number;
  denoise: number;
  steps: number;
  seed?: number;
  numImages: 1 | 2 | 3;
  loras?: Array<{ path: string; scale?: number }>;
}): Promise<{ images: string[]; usedSeed?: number }> {
  const input: Record<string, any> = {
    model_name: params.modelName,
    image_url: params.imageUrl,
    guidance_scale: params.cfg,
    noise_strength: params.denoise,
    num_inference_steps: params.steps,
    num_images: params.numImages,
  };

  if (typeof params.seed === 'number' && Number.isFinite(params.seed)) input.seed = Math.floor(params.seed);
  if (Array.isArray(params.loras) && params.loras.length > 0) input.loras = params.loras;

  const res = await fetch('/api/hf/img2img', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });

  assertOk(res, 'HF GPU request selhal');
  const payload = (await res.json()) as HfImg2ImgResponse;
  if (payload?.error) throw new Error(payload.error);

  const urls = (payload.images || []).map((i) => i?.url).filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (urls.length === 0) throw new Error('HF GPU nevrátil žádné obrázky.');

  const out: string[] = [];
  for (const u of urls) out.push(await fetchAsDataUrl(u));

  return { images: out, usedSeed: typeof payload.seed === 'number' ? payload.seed : undefined };
}

