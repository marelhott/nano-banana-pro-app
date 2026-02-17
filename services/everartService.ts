export type EverArtModel = {
  id: string;
  everartId: string;
  name: string;
  status: string;
  subject?: string;
  thumbnailUrl?: string;
  createdAt?: string;
};

export type EverArtGenerationJob = {
  modelId: string;
  modelName?: string;
  generationId: string;
};

export type EverArtGenerationStatus = {
  id: string;
  status: string;
  imageUrl?: string;
  error?: string;
  failureReason?: string;
  progress?: number;
  createdAt?: string;
};

function assertOk(res: Response, msg: string) {
  if (!res.ok) throw new Error(`${msg} (HTTP ${res.status})`);
}

function getStoredEverArtKey(): string {
  try {
    const raw = localStorage.getItem('providerSettings');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return String(parsed?.everart?.apiKey || '').trim();
  } catch {
    return '';
  }
}

async function readJsonSafe(res: Response): Promise<any> {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

async function postEverArt(action: string, payload: Record<string, any>, key?: string): Promise<any> {
  const apiKey = String(key || getStoredEverArtKey()).trim();
  const res = await fetch('/api/everart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, apiKey, ...payload }),
  });

  const data = await readJsonSafe(res);
  if (!res.ok || data?.success === false) {
    const detail = data?.error || data?.message || data?.raw || `HTTP ${res.status}`;
    throw new Error(`EverArt ${action} selhal: ${String(detail)}`);
  }
  return data;
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Nepodařilo se načíst soubor.'));
    r.readAsDataURL(file);
  });
}

export async function listEverArtModels(key?: string): Promise<EverArtModel[]> {
  const data = await postEverArt('models', {}, key);
  return Array.isArray(data?.models) ? data.models : [];
}

export async function createEverArtModel(params: {
  name: string;
  subject: 'STYLE' | 'PERSON' | 'OBJECT';
  files: File[];
  key?: string;
}): Promise<EverArtModel> {
  const images = await Promise.all(params.files.map(fileToDataUrl));
  const data = await postEverArt(
    'createModel',
    {
      name: params.name,
      subject: params.subject,
      images,
    },
    params.key
  );
  return data?.model as EverArtModel;
}

export async function startEverArtGeneration(params: {
  inputDataUrl: string;
  modelIds: string[];
  styleStrength: number;
  numImages: number;
  width?: number;
  height?: number;
  key?: string;
}): Promise<EverArtGenerationJob[]> {
  const data = await postEverArt(
    'generateStart',
    {
      imageDataUrl: params.inputDataUrl,
      modelIds: params.modelIds,
      styleStrength: params.styleStrength,
      numImages: params.numImages,
      width: params.width || 1024,
      height: params.height || 1024,
    },
    params.key
  );

  const jobs: EverArtGenerationJob[] = [];
  const results = Array.isArray(data?.results) ? data.results : [];
  for (const result of results) {
    const generationIds = Array.isArray(result?.generationIds) ? result.generationIds : [];
    for (const generationId of generationIds) {
      if (!generationId) continue;
      jobs.push({
        modelId: String(result?.modelId || ''),
        modelName: result?.modelName ? String(result.modelName) : undefined,
        generationId: String(generationId),
      });
    }
  }

  return jobs;
}

export async function getEverArtGenerationStatus(generationId: string, key?: string): Promise<EverArtGenerationStatus> {
  const data = await postEverArt(
    'generationStatus',
    { generationId },
    key
  );
  return {
    id: String(data?.id || generationId),
    status: String(data?.status || 'UNKNOWN'),
    imageUrl: data?.imageUrl ? String(data.imageUrl) : undefined,
    error: data?.error ? String(data.error) : undefined,
    failureReason: data?.failureReason ? String(data.failureReason) : undefined,
    progress: typeof data?.progress === 'number' ? data.progress : undefined,
    createdAt: data?.createdAt ? String(data.createdAt) : undefined,
  };
}

export async function waitEverArtGeneration(generationId: string, opts?: {
  key?: string;
  maxAttempts?: number;
  intervalMs?: number;
  onTick?: (s: EverArtGenerationStatus, attempt: number) => void;
}): Promise<EverArtGenerationStatus> {
  const maxAttempts = Math.max(10, Number(opts?.maxAttempts || 150));
  const intervalMs = Math.max(700, Number(opts?.intervalMs || 2000));

  for (let i = 1; i <= maxAttempts; i += 1) {
    const status = await getEverArtGenerationStatus(generationId, opts?.key);
    opts?.onTick?.(status, i);

    const state = status.status.toUpperCase();
    if (state === 'SUCCEEDED' || state === 'READY' || state === 'COMPLETED') return status;
    if (state === 'FAILED' || state === 'ERROR' || state === 'CANCELED' || state === 'CANCELLED') return status;

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return {
    id: generationId,
    status: 'TIMEOUT',
    error: 'Generování trvá příliš dlouho.',
  };
}

export async function fetchImageAsDataUrl(url: string): Promise<string> {
  const safeUrl = url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
  const res = await fetch(safeUrl);
  assertOk(res, 'Nepodařilo se stáhnout výstupní obrázek z EverArt');
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Nepodařilo se převést výstup na data URL.'));
    r.readAsDataURL(blob);
  });
}
