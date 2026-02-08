type ComfyQueueResponse = {
  prompt_id: string;
  number?: number;
  node_errors?: any;
};

type ComfyHistoryImage = {
  filename: string;
  subfolder?: string;
  type?: string; // "output" | "temp"
};

type ComfyHistoryOutput = {
  images?: ComfyHistoryImage[];
};

type ComfyHistory = Record<
  string,
  {
    outputs?: Record<string, ComfyHistoryOutput>;
    status?: { status_str?: string };
  }
>;

function assertOk(res: Response, message: string) {
  if (!res.ok) throw new Error(`${message} (HTTP ${res.status})`);
}

async function fetchAsDataUrl(res: Response): Promise<string> {
  assertOk(res, 'Nepodařilo se stáhnout obrázek z backendu');
  const blob = await res.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Nepodařilo se načíst výstupní obrázek.'));
    r.readAsDataURL(blob);
  });
  return base64;
}

export async function comfyGetObjectInfo(): Promise<any> {
  const res = await fetch('/api/comfy/object_info');
  assertOk(res, 'ComfyUI object_info selhal');
  return await res.json();
}

export function extractComfyModelLists(objectInfo: any): { checkpoints: string[]; loras: string[] } {
  const checkpoints =
    objectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ||
    objectInfo?.CheckpointLoaderSimple?.inputs?.required?.ckpt_name?.[0] ||
    [];

  const loras =
    objectInfo?.LoraLoader?.input?.required?.lora_name?.[0] ||
    objectInfo?.LoraLoader?.inputs?.required?.lora_name?.[0] ||
    [];

  const normalize = (arr: any) => (Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  return { checkpoints: normalize(checkpoints), loras: normalize(loras) };
}

export async function comfyUploadDataUrl(params: { dataUrl: string; fileName: string }): Promise<string> {
  const res = await fetch('/api/comfy/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: params.dataUrl, fileName: params.fileName, overwrite: true }),
  });
  assertOk(res, 'ComfyUI upload selhal');
  const payload = await res.json();
  const name = payload?.name || payload?.data?.name || payload?.filename;
  if (!name || typeof name !== 'string') throw new Error('ComfyUI upload nevrátil název souboru.');
  return name;
}

export async function comfyQueuePrompt(prompt: Record<string, any>): Promise<ComfyQueueResponse> {
  const res = await fetch('/api/comfy/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  assertOk(res, 'ComfyUI queue selhal');
  return (await res.json()) as ComfyQueueResponse;
}

export async function comfyGetHistory(promptId: string): Promise<ComfyHistory> {
  const res = await fetch(`/api/comfy/history/${encodeURIComponent(promptId)}`);
  assertOk(res, 'ComfyUI history selhal');
  return (await res.json()) as ComfyHistory;
}

export async function comfyViewImageToDataUrl(image: ComfyHistoryImage): Promise<string> {
  const params = new URLSearchParams();
  params.set('filename', image.filename);
  if (image.subfolder) params.set('subfolder', image.subfolder);
  if (image.type) params.set('type', image.type);
  const res = await fetch(`/api/comfy/view?${params.toString()}`);
  return await fetchAsDataUrl(res);
}

export async function runComfyImg2Img(params: {
  inputImageDataUrl: string;
  checkpointName: string;
  prompt: string;
  negativePrompt?: string;
  cfg: number;
  denoise: number;
  steps: number;
  seed?: number;
  variants: 1 | 2 | 3;
  loraName?: string | null;
  loraStrengthModel?: number;
  loraStrengthClip?: number;
  timeoutMs?: number;
}): Promise<{ images: string[]; usedSeed: number }> {
  const timeoutMs = params.timeoutMs ?? 5 * 60_000;
  const start = Date.now();

  const uploadName = await comfyUploadDataUrl({
    dataUrl: params.inputImageDataUrl,
    fileName: 'input.png',
  });

  const seed = typeof params.seed === 'number' && Number.isFinite(params.seed) ? Math.floor(params.seed) : Math.floor(Math.random() * 2 ** 31);

  // ComfyUI graph (img2img + optional LoRA) using common built-in nodes.
  // Note: ckpt_name/lora_name values must exist on the ComfyUI server.
  const useLora = Boolean(params.loraName);
  const promptGraph: Record<string, any> = {
    '1': { class_type: 'LoadImage', inputs: { image: uploadName } },
    '2': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: params.checkpointName } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: params.prompt, clip: useLora ? ['4', 1] : ['2', 1] } },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: params.negativePrompt || '', clip: useLora ? ['4', 1] : ['2', 1] },
    },
    '5': { class_type: 'VAEEncode', inputs: { pixels: ['1', 0], vae: ['2', 2] } },
    '6': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: Math.max(1, Math.min(200, Math.round(params.steps))),
        cfg: Math.max(0.1, Math.min(30, params.cfg)),
        sampler_name: 'euler',
        scheduler: 'karras',
        denoise: Math.max(0.01, Math.min(1, params.denoise)),
        model: useLora ? ['4', 0] : ['2', 0],
        positive: ['3', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
        batch_size: params.variants,
      },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['2', 2] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0] } },
  };

  if (useLora) {
    promptGraph['4'] = {
      class_type: 'LoraLoader',
      inputs: {
        model: ['2', 0],
        clip: ['2', 1],
        lora_name: params.loraName,
        strength_model: typeof params.loraStrengthModel === 'number' ? params.loraStrengthModel : 0.85,
        strength_clip: typeof params.loraStrengthClip === 'number' ? params.loraStrengthClip : 0.85,
      },
    };
  }

  const queued = await comfyQueuePrompt(promptGraph);
  const promptId = queued.prompt_id;
  if (!promptId) throw new Error('ComfyUI nevrátil prompt_id.');

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1200));
    const history = await comfyGetHistory(promptId);
    const entry = history?.[promptId];
    const images: ComfyHistoryImage[] = [];
    const outputs = entry?.outputs || {};
    for (const out of Object.values(outputs)) {
      for (const img of out?.images || []) images.push(img);
    }
    if (images.length > 0) {
      const dataUrls: string[] = [];
      for (const img of images) {
        dataUrls.push(await comfyViewImageToDataUrl(img));
      }
      return { images: dataUrls, usedSeed: seed };
    }
  }

  throw new Error('ComfyUI generování trvá příliš dlouho.');
}

