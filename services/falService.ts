type FalLoraConfig = { path: string; scale?: number };

type FalImage = { url: string; content_type?: string; width?: number; height?: number };

type FalLoraImg2ImgResponse = {
  images?: FalImage[];
  seed?: number;
  request_id?: string;
  statusUrl?: string;
};

function assertOk(res: Response, message: string) {
  if (!res.ok) throw new Error(`${message} (HTTP ${res.status})`);
}

function getFalKeyFromStorage(): string {
  try {
    const raw = localStorage.getItem('providerSettings');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    const v = String(parsed?.fal?.apiKey || '').trim();
    return v;
  } catch {
    return '';
  }
}

async function fetchAsDataUrl(url: string): Promise<string> {
  // Some upstreams may return http URLs; enforce https to avoid Mixed Content blocks.
  const safeUrl = url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
  const res = await fetch(safeUrl);
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

  const falKey = getFalKeyFromStorage();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // If present, we send the key to our Netlify function. That function can also
  // fall back to server-side FAL_KEY env (more secure), but the user asked for UI entry.
  if (falKey) headers['x-fal-key'] = falKey;

  const res = await fetch('/api/fal/lora-img2img', {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    // Surface upstream validation errors (422) and other details.
    let detail = rawText;
    try {
      const j = JSON.parse(rawText);
      detail = j?.detail || j?.error || j?.message || rawText;
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch {
      // keep raw text
    }
    const suffix = detail ? `: ${String(detail).slice(0, 500)}` : '';
    throw new Error(`fal.ai request selhal (HTTP ${res.status})${suffix}`);
  }

  let payload: FalLoraImg2ImgResponse = {};
  try {
    payload = JSON.parse(rawText) as FalLoraImg2ImgResponse;
  } catch {
    throw new Error('fal.ai vrátil neplatnou odpověď (není to JSON).');
  }

  const urls = (payload.images || []).map((i) => i?.url).filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (urls.length === 0) throw new Error('fal.ai nevrátil žádné obrázky.');

  const out: string[] = [];
  for (const u of urls) out.push(await fetchAsDataUrl(u));

  return { images: out, usedSeed: typeof payload.seed === 'number' ? payload.seed : undefined };
}

async function submitFalJob(headers: Record<string, string>, input: Record<string, any>): Promise<{ statusUrl: string }> {
  const res = await fetch('/api/fal/lora-img2img', {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'submit', input }),
  });
  const rawText = await res.text();
  if (!res.ok) {
    let detail = rawText;
    try {
      const j = JSON.parse(rawText);
      detail = j?.detail || j?.error || j?.message || rawText;
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch {}
    throw new Error(`fal.ai submit selhal (HTTP ${res.status}): ${String(detail).slice(0, 500)}`);
  }
  let payload: any = {};
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error('fal.ai submit vrátil neplatnou odpověď (není to JSON).');
  }
  const statusUrl = String(payload?.statusUrl || payload?.status_url || '').trim();
  if (!statusUrl) throw new Error('fal.ai submit: chybí statusUrl (nelze pollovat).');
  return { statusUrl };
}

async function pollFalJob(headers: Record<string, string>, statusUrl: string): Promise<FalLoraImg2ImgResponse> {
  const res = await fetch('/api/fal/lora-img2img', {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'status', statusUrl }),
  });
  const rawText = await res.text();
  if (!res.ok) {
    let detail = rawText;
    try {
      const j = JSON.parse(rawText);
      detail = j?.detail || j?.error || j?.message || rawText;
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch {}
    throw new Error(`fal.ai status selhal (HTTP ${res.status}): ${String(detail).slice(0, 500)}`);
  }
  try {
    return JSON.parse(rawText) as FalLoraImg2ImgResponse;
  } catch {
    throw new Error('fal.ai status vrátil neplatnou odpověď (není to JSON).');
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runFalLoraImg2ImgQueued(params: {
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
  maxWaitMs?: number;
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

  const falKey = getFalKeyFromStorage();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (falKey) headers['x-fal-key'] = falKey;

  const { statusUrl } = await submitFalJob(headers, input);

  const deadline = Date.now() + Math.max(30_000, Math.min(15 * 60_000, params.maxWaitMs ?? 12 * 60_000));
  let delayMs = 800;
  while (Date.now() < deadline) {
    const payload: any = await pollFalJob(headers, statusUrl);

    // fal queue payloads vary; support common shapes.
    const status = String(payload?.status || payload?.state || '').toLowerCase();
    if (status === 'completed' || status === 'succeeded' || payload?.images) {
      const urls = (payload.images || payload?.output?.images || [])
        .map((i: any) => i?.url)
        .filter((u: any) => typeof u === 'string' && u.length > 0);
      if (urls.length === 0) throw new Error('fal.ai: job dokončen, ale nevrátil obrázky.');
      const out: string[] = [];
      for (const u of urls) out.push(await fetchAsDataUrl(u));
      const usedSeed = typeof payload.seed === 'number' ? payload.seed : (typeof payload?.output?.seed === 'number' ? payload.output.seed : undefined);
      return { images: out, usedSeed };
    }
    if (status === 'failed' || status === 'error') {
      const detail = payload?.error || payload?.detail || payload?.message || 'fal.ai job selhal';
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }

    await sleep(delayMs);
    delayMs = Math.min(2500, Math.floor(delayMs * 1.25));
  }

  throw new Error('fal.ai job trvá příliš dlouho (timeout).');
}
