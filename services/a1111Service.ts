type A1111Options = Record<string, any>;

function assertOk(res: Response, message: string) {
  if (!res.ok) throw new Error(`${message} (HTTP ${res.status})`);
}

function getA1111SettingsFromStorage(): { baseUrl: string; sdxlVae?: string } {
  try {
    const raw = localStorage.getItem('providerSettings');
    if (!raw) return { baseUrl: '' };
    const parsed = JSON.parse(raw);
    const baseUrl = String(parsed?.a1111?.baseUrl || '').trim();
    const sdxlVae = String(parsed?.a1111?.sdxlVae || '').trim();
    return { baseUrl, sdxlVae: sdxlVae || undefined };
  } catch {
    return { baseUrl: '' };
  }
}

function stripDataUrlPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function toDataUrlPng(base64: string): string {
  const clean = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  return clean;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  assertOk(res, `Request failed: ${url}`);
  return (await res.json()) as T;
}

async function pickSdxlVaeName(baseUrl: string): Promise<string | ''> {
  // Cache in localStorage to avoid extra roundtrips every generation.
  const cacheKey = 'a1111.cachedSdxlVae';
  try {
    const cached = JSON.parse(String(localStorage.getItem(cacheKey) || 'null'));
    const val = String(cached?.value || '').trim();
    const ts = Number(cached?.ts || 0);
    if (val && Number.isFinite(ts) && Date.now() - ts < 6 * 60_000) return val;
  } catch {
    // ignore cache parse
  }

  try {
    const list = await fetchJson<any[]>(`${baseUrl}/sdapi/v1/sd-vae`);
    const names: string[] = (list || [])
      .map((x: any) => String(x?.model_name || x?.name || '').trim())
      .filter(Boolean);
    const preferred =
      names.find((n) => /sdxl/i.test(n) && /vae/i.test(n)) ||
      names.find((n) => /sdxl/i.test(n)) ||
      names.find((n) => /xl/i.test(n) && /vae/i.test(n)) ||
      '';
    if (preferred) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ value: preferred, ts: Date.now() }));
      } catch { }
      return preferred;
    }
  } catch {
    // ignore
  }
  return '';
}

export async function runA1111Img2Img(params: {
  imageDataUrl: string;
  prompt: string;
  negativePrompt?: string;
  denoise: number;
  cfg: number;
  steps: number;
  seed?: number; // -1/random if omitted
  batchSize: 1 | 2 | 3 | 4 | 5;
  checkpointName: string; // local checkpoint filename or title known to A1111
  onProgress?: (p: { progress: number; eta?: number; state?: string }) => void;
}): Promise<{ images: string[]; info?: any; parameters?: any }> {
  const s = getA1111SettingsFromStorage();
  const baseUrl = String(s.baseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl || !baseUrl.startsWith('http')) {
    throw new Error('A1111 není nastavené. Otevři Nastavení a doplň Base URL.');
  }

  const idTask = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const initBase64 = stripDataUrlPrefix(params.imageDataUrl);
  const seed = typeof params.seed === 'number' && Number.isFinite(params.seed) ? Math.floor(params.seed) : -1;

  const userVae = String(s.sdxlVae || '').trim();
  const autoVae = userVae ? userVae : await pickSdxlVaeName(baseUrl);
  const vaeToUse = autoVae || 'Automatic';

  const payload: Record<string, any> = {
    id_task: idTask,
    prompt: params.prompt,
    negative_prompt: (params.negativePrompt || '').trim(),
    init_images: [initBase64],
    denoising_strength: params.denoise,
    cfg_scale: params.cfg,
    steps: params.steps,
    seed,
    batch_size: params.batchSize,
    n_iter: 1,
    sampler_index: 'Euler a', // stable default
    override_settings: {
      sd_model_checkpoint: params.checkpointName,
      sd_vae: vaeToUse,
    },
    override_settings_restore_afterwards: true,
  };

  // Fire the generation request and poll progress in parallel.
  let done = false;
  const genPromise = fetchJson<any>(`${baseUrl}/sdapi/v1/img2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).finally(() => {
    done = true;
  });

  const progressLoop = async () => {
    if (!params.onProgress) return;
    while (!done) {
      try {
        const p = await fetchJson<any>(`${baseUrl}/sdapi/v1/progress?id_task=${encodeURIComponent(idTask)}`);
        const progress = typeof p?.progress === 'number' ? Math.max(0, Math.min(1, p.progress)) : 0;
        const eta = typeof p?.eta_relative === 'number' ? p.eta_relative : undefined;
        const state = String(p?.state?.job || p?.state || '').trim() || undefined;
        params.onProgress({ progress, eta, state });
      } catch {
        // ignore progress errors (CORS or disabled endpoint)
      }
      await new Promise((r) => setTimeout(r, 650));
    }
  };
  void progressLoop();

  const result = await genPromise;
  const imagesRaw: string[] = Array.isArray(result?.images) ? result.images : [];
  const images = imagesRaw.map(toDataUrlPng);
  if (!images.length) throw new Error('A1111 nevrátil žádné obrázky.');
  return { images, info: result?.info, parameters: result?.parameters };
}

export async function probeA1111Options(): Promise<A1111Options> {
  const s = getA1111SettingsFromStorage();
  const baseUrl = String(s.baseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl || !baseUrl.startsWith('http')) throw new Error('A1111 není nastavené.');
  return await fetchJson<A1111Options>(`${baseUrl}/sdapi/v1/options`);
}

