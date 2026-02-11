type FalLoraConfig = { path: string; scale?: number };

type FalImage = { url: string; content_type?: string; width?: number; height?: number };

// These types mirror fal's documented schema loosely; we pass through only what UI exposes.
type FalEmbedding = { path: string; token?: string };
type FalControlNet = {
  path: string;
  image_url: string;
  conditioning_scale?: number;
  start_step?: number;
  end_step?: number;
};
type FalIPAdapter = {
  ip_adapter_image_url: string | string[];
  ip_adapter_mask_url?: string;
  path: string;
  model_subfolder?: string;
  weight_name?: string;
  insight_face_model_path?: string;
  scale?: number;
  scale_json?: any;
  unconditional_noising_factor?: number;
};

type FalLoraImg2ImgResponse = {
  images?: FalImage[];
  seed?: number;
  request_id?: string;
  statusUrl?: string;
  resultUrl?: string;
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

function buildFalLoras(loras: FalLoraConfig[] | undefined): any[] | undefined {
  if (!Array.isArray(loras) || loras.length === 0) return undefined;
  const nonce = Date.now().toString(36);
  return loras.map((l, idx) => {
    const scale = typeof l.scale === 'number' && Number.isFinite(l.scale) ? l.scale : 1;
    // fal/diffusers sometimes requires unique adapter names; never derive from URL query.
    const adapter = `lora_${nonce}_${idx}`;
    return {
      path: l.path,
      scale,
      // Try both field names; fal schemas vary.
      adapter_name: adapter,
      name: adapter,
    };
  });
}

export async function runFalLoraImg2Img(params: {
  endpointId?: 'fal-ai/lora/image-to-image';
  modelName: string;
  imageUrlOrDataUrl: string;
  prompt: string;
  negativePrompt?: string;
  cfg: number;
  denoise: number;
  steps: number;
  seed?: number;
  numImages: 1 | 2 | 3 | 4 | 5;
  loras?: FalLoraConfig[];
  embeddings?: FalEmbedding[];
  controlnets?: FalControlNet[];
  controlnetGuessMode?: boolean;
  ipAdapter?: FalIPAdapter[];
  imageEncoderPath?: string;
  imageEncoderSubfolder?: string;
  imageEncoderWeightName?: string;
  icLightModelUrl?: string;
  icLightModelBackgroundImageUrl?: string;
  icLightImageUrl?: string;
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
  const loras = buildFalLoras(params.loras);
  if (loras) input.loras = loras;
  if (Array.isArray(params.embeddings) && params.embeddings.length > 0) input.embeddings = params.embeddings;
  if (Array.isArray(params.controlnets) && params.controlnets.length > 0) input.controlnets = params.controlnets;
  if (typeof params.controlnetGuessMode === 'boolean') input.controlnet_guess_mode = params.controlnetGuessMode;
  if (Array.isArray(params.ipAdapter) && params.ipAdapter.length > 0) input.ip_adapter = params.ipAdapter;
  if (params.imageEncoderPath?.trim()) input.image_encoder_path = params.imageEncoderPath.trim();
  if (params.imageEncoderSubfolder?.trim()) input.image_encoder_subfolder = params.imageEncoderSubfolder.trim();
  if (params.imageEncoderWeightName?.trim()) input.image_encoder_weight_name = params.imageEncoderWeightName.trim();
  if (params.icLightModelUrl?.trim()) input.ic_light_model_url = params.icLightModelUrl.trim();
  if (params.icLightModelBackgroundImageUrl?.trim()) input.ic_light_model_background_image_url = params.icLightModelBackgroundImageUrl.trim();
  if (params.icLightImageUrl?.trim()) input.ic_light_image_url = params.icLightImageUrl.trim();

  const falKey = getFalKeyFromStorage();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // If present, we send the key to our Netlify function. That function can also
  // fall back to server-side FAL_KEY env (more secure), but the user asked for UI entry.
  if (falKey) headers['x-fal-key'] = falKey;

  const res = await fetch('/api/fal/lora-img2img', {
    method: 'POST',
    headers,
    body: JSON.stringify({ endpointId: params.endpointId || 'fal-ai/lora/image-to-image', input }),
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

async function submitFalJob(
  headers: Record<string, string>,
  input: Record<string, any>,
  endpointId: string
): Promise<{ statusUrl: string; resultUrl?: string }> {
  const res = await fetch('/api/fal/lora-img2img', {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'submit', endpointId, input }),
  });
  const rawText = await res.text();
  if (!res.ok) {
    let detail = rawText;
    try {
      const j = JSON.parse(rawText);
      detail = j?.detail || j?.error || j?.message || rawText;
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch { }
    throw new Error(`fal.ai submit selhal (HTTP ${res.status}): ${String(detail).slice(0, 500)}`);
  }
  let payload: any = {};
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error('fal.ai submit vrátil neplatnou odpověď (není to JSON).');
  }
  const statusUrl = String(payload?.statusUrl || payload?.status_url || '').trim();
  const resultUrl = String(payload?.resultUrl || payload?.result_url || payload?.response_url || payload?.responseUrl || '').trim();
  if (!statusUrl) throw new Error('fal.ai submit: chybí statusUrl (nelze pollovat).');
  return { statusUrl, resultUrl: resultUrl || undefined };
}

async function pollFalJob(headers: Record<string, string>, statusUrl: string, endpointId: string): Promise<FalLoraImg2ImgResponse> {
  const res = await fetch('/api/fal/lora-img2img', {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'status', endpointId, statusUrl }),
  });
  const rawText = await res.text();
  if (!res.ok) {
    let detail = rawText;
    try {
      const j = JSON.parse(rawText);
      detail = j?.detail || j?.error || j?.message || rawText;
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch { }
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

function extractFalImageUrls(payload: any): string[] {
  const blocks = [
    payload?.images,
    payload?.output?.images,
    payload?.result?.images,
    payload?.response?.images,
    payload?.data?.images,
    payload?.outputs,
    payload?.output?.output, // sometimes nested
  ];
  for (const b of blocks) {
    if (!b) continue;
    if (Array.isArray(b)) {
      const urls = b
        .map((i: any) => (typeof i === 'string' ? i : i?.url))
        .filter((u: any) => typeof u === 'string' && u.length > 0);
      if (urls.length) return urls;
    }
  }

  // Support single-image shapes.
  const singleCandidates = [
    payload?.image,
    payload?.output?.image,
    payload?.result?.image,
    payload?.response?.image,
    payload?.data?.image,
  ];
  for (const c of singleCandidates) {
    if (!c) continue;
    const u = typeof c === 'string' ? c : c?.url;
    if (typeof u === 'string' && u.length > 0) return [u];
  }

  return [];
}

export async function runFalLoraImg2ImgQueued(params: {
  endpointId?: 'fal-ai/lora/image-to-image';
  modelName: string;
  imageUrlOrDataUrl: string;
  prompt: string;
  negativePrompt?: string;
  cfg: number;
  denoise: number;
  steps: number;
  seed?: number;
  numImages: 1 | 2 | 3 | 4 | 5;
  loras?: FalLoraConfig[];
  embeddings?: FalEmbedding[];
  controlnets?: FalControlNet[];
  controlnetGuessMode?: boolean;
  ipAdapter?: FalIPAdapter[];
  imageEncoderPath?: string;
  imageEncoderSubfolder?: string;
  imageEncoderWeightName?: string;
  icLightModelUrl?: string;
  icLightModelBackgroundImageUrl?: string;
  icLightImageUrl?: string;
  onPhase?: (phase: 'queue' | 'running' | 'finalizing') => void;
  maxWaitMs?: number;
}): Promise<{ images: string[]; usedSeed?: number }> {
  const endpointId = params.endpointId || 'fal-ai/lora/image-to-image';
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
  const loras = buildFalLoras(params.loras);
  if (loras) input.loras = loras;
  if (Array.isArray(params.embeddings) && params.embeddings.length > 0) input.embeddings = params.embeddings;
  if (Array.isArray(params.controlnets) && params.controlnets.length > 0) input.controlnets = params.controlnets;
  if (typeof params.controlnetGuessMode === 'boolean') input.controlnet_guess_mode = params.controlnetGuessMode;
  if (Array.isArray(params.ipAdapter) && params.ipAdapter.length > 0) input.ip_adapter = params.ipAdapter;
  if (params.imageEncoderPath?.trim()) input.image_encoder_path = params.imageEncoderPath.trim();
  if (params.imageEncoderSubfolder?.trim()) input.image_encoder_subfolder = params.imageEncoderSubfolder.trim();
  if (params.imageEncoderWeightName?.trim()) input.image_encoder_weight_name = params.imageEncoderWeightName.trim();
  if (params.icLightModelUrl?.trim()) input.ic_light_model_url = params.icLightModelUrl.trim();
  if (params.icLightModelBackgroundImageUrl?.trim()) input.ic_light_model_background_image_url = params.icLightModelBackgroundImageUrl.trim();
  if (params.icLightImageUrl?.trim()) input.ic_light_image_url = params.icLightImageUrl.trim();

  const falKey = getFalKeyFromStorage();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (falKey) headers['x-fal-key'] = falKey;

  const { statusUrl, resultUrl } = await submitFalJob(headers, input, endpointId);
  let lastPhase: 'queue' | 'running' | 'finalizing' | '' = '';
  const setPhase = (p: 'queue' | 'running' | 'finalizing') => {
    if (lastPhase === p) return;
    lastPhase = p;
    try {
      params.onPhase?.(p);
    } catch {
      // ignore UI callback failures
    }
  };
  setPhase('queue');

  const deadline = Date.now() + Math.max(30_000, Math.min(15 * 60_000, params.maxWaitMs ?? 12 * 60_000));
  let delayMs = 800;
  while (Date.now() < deadline) {
    const payload: any = await pollFalJob(headers, statusUrl, endpointId);

    // fal queue payloads vary; support common shapes.
    const status = String(payload?.status || payload?.state || '').toLowerCase();
    if (status === 'running' || status === 'in_progress' || status === 'processing') setPhase('running');
    else if (status === 'queued' || status === 'pending' || status === 'enqueued') setPhase('queue');

    if (status === 'completed' || status === 'succeeded' || payload?.images || payload?.output?.images) {
      let finalPayload: any = payload;
      let urls = extractFalImageUrls(finalPayload);
      if (urls.length === 0 && resultUrl) {
        // Some queue status endpoints return only status metadata. The result payload may appear shortly after COMPLETED.
        setPhase('finalizing');
        let attempts = 0;
        let wait = 650;
        while (attempts < 10 && Date.now() < deadline) {
          attempts += 1;
          finalPayload = await pollFalJob(headers, resultUrl, endpointId);
          urls = extractFalImageUrls(finalPayload);
          if (urls.length > 0) break;
          await sleep(wait);
          wait = Math.min(2500, Math.floor(wait * 1.25));
        }
      }
      if (urls.length === 0) {
        const info = {
          status: finalPayload?.status || finalPayload?.state || payload?.status || payload?.state,
          request_id: finalPayload?.request_id || finalPayload?.requestId || payload?.request_id || payload?.requestId || payload?.id,
          has_resultUrl: Boolean(resultUrl),
          keys: Object.keys(finalPayload || {}).slice(0, 25),
        };
        throw new Error(`fal.ai: job dokončen, ale nevrátil obrázky. (${JSON.stringify(info).slice(0, 320)})`);
      }
      const out: string[] = [];
      for (const u of urls) out.push(await fetchAsDataUrl(u));
      const usedSeed =
        typeof finalPayload.seed === 'number'
          ? finalPayload.seed
          : typeof finalPayload?.output?.seed === 'number'
            ? finalPayload.output.seed
            : undefined;
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

export async function runFalFluxLoraImg2ImgQueued(params: {
  imageUrlOrDataUrl: string;
  prompt: string;
  cfg: number;
  denoise: number; // mapped to "strength" (0..1)
  steps: number;
  seed?: number;
  numImages: 1 | 2 | 3 | 4 | 5;
  loras?: FalLoraConfig[];
  imageSize?: string;       // e.g. "landscape_4_3" or JSON "{width,height}"
  outputFormat?: 'jpeg' | 'png';
  onPhase?: (phase: 'queue' | 'running' | 'finalizing') => void;
  maxWaitMs?: number;
}): Promise<{ images: string[]; usedSeed?: number }> {
  const endpointId = 'fal-ai/flux-lora/image-to-image';

  // Flux LoRA img2img schema differs from SDXL LoRA endpoint:
  // - prompt (required)
  // - image_url (required)
  // - strength (img2img preserve-vs-remake)
  // - num_inference_steps, guidance_scale, seed, num_images, loras
  const input: Record<string, any> = {
    prompt: params.prompt,
    image_url: params.imageUrlOrDataUrl,
    strength: params.denoise,
    num_inference_steps: params.steps,
    guidance_scale: params.cfg,
    num_images: params.numImages,
  };
  if (typeof params.seed === 'number' && Number.isFinite(params.seed)) input.seed = Math.floor(params.seed);
  const loras = buildFalLoras(params.loras);
  if (loras) input.loras = loras;
  if (params.imageSize) input.image_size = params.imageSize;
  if (params.outputFormat) input.output_format = params.outputFormat;

  const falKey = getFalKeyFromStorage();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (falKey) headers['x-fal-key'] = falKey;

  const { statusUrl, resultUrl } = await submitFalJob(headers, input, endpointId);
  let lastPhase: 'queue' | 'running' | 'finalizing' | '' = '';
  const setPhase = (p: 'queue' | 'running' | 'finalizing') => {
    if (lastPhase === p) return;
    lastPhase = p;
    try {
      params.onPhase?.(p);
    } catch { }
  };
  setPhase('queue');

  const deadline = Date.now() + Math.max(30_000, Math.min(15 * 60_000, params.maxWaitMs ?? 12 * 60_000));
  let delayMs = 800;
  while (Date.now() < deadline) {
    const payload: any = await pollFalJob(headers, statusUrl, endpointId);
    const status = String(payload?.status || payload?.state || '').toLowerCase();
    if (status === 'running' || status === 'in_progress' || status === 'processing') setPhase('running');
    else if (status === 'queued' || status === 'pending' || status === 'enqueued') setPhase('queue');

    if (status === 'completed' || status === 'succeeded' || payload?.images || payload?.output?.images) {
      let finalPayload: any = payload;
      let urls = extractFalImageUrls(finalPayload);
      if (urls.length === 0 && resultUrl) {
        setPhase('finalizing');
        let attempts = 0;
        let wait = 650;
        while (attempts < 10 && Date.now() < deadline) {
          attempts += 1;
          finalPayload = await pollFalJob(headers, resultUrl, endpointId);
          urls = extractFalImageUrls(finalPayload);
          if (urls.length > 0) break;
          await sleep(wait);
          wait = Math.min(2500, Math.floor(wait * 1.25));
        }
      }
      if (urls.length === 0) {
        const info = {
          status: finalPayload?.status || finalPayload?.state || payload?.status || payload?.state,
          request_id: finalPayload?.request_id || finalPayload?.requestId || payload?.request_id || payload?.requestId || payload?.id,
          has_resultUrl: Boolean(resultUrl),
          keys: Object.keys(finalPayload || {}).slice(0, 25),
        };
        throw new Error(`fal.ai: job dokončen, ale nevrátil obrázky. (${JSON.stringify(info).slice(0, 320)})`);
      }
      const out: string[] = [];
      for (const u of urls) out.push(await fetchAsDataUrl(u));
      const usedSeed =
        typeof finalPayload.seed === 'number'
          ? finalPayload.seed
          : typeof finalPayload?.output?.seed === 'number'
            ? finalPayload.output.seed
            : undefined;
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
