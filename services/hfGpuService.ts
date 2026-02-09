type HfImage = { url: string; content_type?: string; width?: number; height?: number };

type HfImg2ImgResponse = {
  images?: HfImage[];
  seed?: number;
  request_id?: string;
  elapsed_ms?: number;
  error?: string;
};

function assertOk(res: Response, message: string) {
  if (!res.ok) throw new Error(`${message} (HTTP ${res.status})`);
}

function getDirectEndpoint(): string {
  const v = String((import.meta as any)?.env?.VITE_HF_IMG2IMG_URL || '').trim();
  return v;
}

function normalizeHfUrl(url: string): string {
  // HF Spaces sometimes return `http://...hf.space/files/...` in responses.
  // Browsers block that as mixed content when our app is served over HTTPS.
  try {
    const u = new URL(url);
    // If HF Space is private or doesn't send CORS headers, browser fetch() will fail.
    // In that case, route file downloads through our Netlify proxy (same-origin),
    // which can attach HF_TOKEN server-side.
    if (u.hostname.endsWith('.hf.space') && u.pathname.startsWith('/files/')) {
      const name = (u.pathname.split('/').pop() || '').trim();
      if (name) return `/api/hf/files/${encodeURIComponent(name)}`;
    }
    if (
      u.protocol === 'http:' &&
      (u.hostname.endsWith('.hf.space') ||
        u.hostname === 'huggingface.co' ||
        u.hostname.endsWith('.huggingface.co') ||
        u.hostname === 'hf.co' ||
        u.hostname.endsWith('.hf.co'))
    ) {
      u.protocol = 'https:';
      return u.toString();
    }
  } catch {
    // ignore
  }
  return url;
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(normalizeHfUrl(url));
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
  prompt?: string;
  negativePrompt?: string;
  seed?: number;
  numImages: 1 | 2 | 3;
  loras?: Array<{ path: string; scale?: number }>;
}): Promise<{
  images: string[];
  usedSeed?: number;
  requestId?: string;
  elapsedMs?: number;
  transport: 'direct' | 'proxy';
  endpoint: string;
}> {
  const input: Record<string, any> = {
    model_name: params.modelName,
    image_url: params.imageUrl,
    guidance_scale: params.cfg,
    noise_strength: params.denoise,
    num_inference_steps: params.steps,
    num_images: params.numImages,
  };

  if (params.prompt?.trim()) input.prompt = params.prompt.trim();
  if (params.negativePrompt?.trim()) input.negative_prompt = params.negativePrompt.trim();
  if (typeof params.seed === 'number' && Number.isFinite(params.seed)) input.seed = Math.floor(params.seed);
  if (Array.isArray(params.loras) && params.loras.length > 0) input.loras = params.loras;

  const directEndpoint = getDirectEndpoint();
  const endpoint = directEndpoint || '/api/hf/img2img';
  const transport: 'direct' | 'proxy' = directEndpoint ? 'direct' : 'proxy';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });

  assertOk(res, 'HF GPU request selhal');
  const payload = (await res.json()) as HfImg2ImgResponse;
  if (payload?.error) throw new Error(payload.error);

  const urls = (payload.images || [])
    .map((i) => i?.url)
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
    .map(normalizeHfUrl);
  if (urls.length === 0) throw new Error('HF GPU nevrátil žádné obrázky.');

  const out: string[] = [];
  for (const u of urls) out.push(await fetchAsDataUrl(u));

  return {
    images: out,
    usedSeed: typeof payload.seed === 'number' ? payload.seed : undefined,
    requestId: typeof payload.request_id === 'string' ? payload.request_id : undefined,
    elapsedMs: typeof payload.elapsed_ms === 'number' ? payload.elapsed_ms : undefined,
    transport,
    endpoint,
  };
}
