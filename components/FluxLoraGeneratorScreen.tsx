import React from 'react';
import { Plus, X, Save, Trash2 } from 'lucide-react';
import { runFalFluxLoraImg2ImgQueued, runFalLoraImg2ImgQueued } from '../services/falService';
import { presignR2, isR2Ref, r2KeyFromRef } from '../services/r2Service';
import { createThumbnail, saveToGallery, deleteImage as deleteGeneratedImage } from '../utils/galleryDB';
import { listFluxPresets, saveFluxPreset, deleteFluxPreset, type FluxPreset } from '../utils/fluxPresetsDB';

type ToastType = 'success' | 'error' | 'info';

type ImageSlot = {
  file: File;
  dataUrl: string;
};

type OutputItem = {
  id: string;
  dataUrl?: string;
  status: 'pending' | 'done';
};

type LoraItem = {
  id: string;
  path: string;
  scale: number;
};

type HfPreset = {
  id: string;
  label: string;
  url: string;
  configUrl?: string;
  trigger?: string;
  trainedOn?: string;
};

type ModelFamily = 'flux' | 'sdxl';
type FluxEndpoint = 'flux1' | 'flux2';
type Flux2Acceleration = 'none' | 'regular' | 'high';

const SDXL_BASE_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0';

// User-provided Flux LoRA export (fal media URLs).
const FLUX_LORA_PRESETS: HfPreset[] = [
  {
    id: 'flux_1',
    label: 'flux 1',
    url: 'https://v3b.fal.media/files/b/0a8dd547/4Z_ldmLbgx3Tb3XiOsA12_pytorch_lora_weights.safetensors',
    configUrl: 'https://v3b.fal.media/files/b/0a8dd547/WvQthl3WR-s79eb5K7-qw_config.json',
    trainedOn: 'flux',
  },
  {
    id: 'flux_1a',
    label: 'Flux 1a',
    url: 'https://v3b.fal.media/files/b/0a8e0a45/bhN3qNj08efi3T3pZvfT8_pytorch_lora_weights.safetensors',
    configUrl: 'https://v3b.fal.media/files/b/0a8e0a46/AR1PpFip04qZ-dAqRo_Fe_config.json',
    trainedOn: 'flux',
  },
  {
    id: 'flux_1_prestige',
    label: 'flux 1 prestige',
    url: 'r2://loras/flux_tuymans_000001400.safetensors',
    trainedOn: 'flux',
  },
  {
    id: 'flux_2',
    label: 'flux 2',
    url: 'https://v3b.fal.media/files/b/0a8dfeed/Rd3SIBmJ-NlEwGv5q1E1L_pytorch_lora_weights.safetensors',
    configUrl: 'https://v3b.fal.media/files/b/0a8dfeed/jfYQpmI8ZTgojETD3UmQi_config_b0e9412a-a0c7-4475-9b56-f8e9de54567e.json',
    trigger: 'mvhpaint style',
    trainedOn: 'flux.2',
  },
  {
    id: 'flux_krea',
    label: 'flux krea',
    url: 'https://v3b.fal.media/files/b/0a8df48d/49cyD9v_shitOjkkdmfdr_pytorch_lora_weights.safetensors',
    configUrl: 'https://v3b.fal.media/files/b/0a8df48d/F9EdkyTd15HyuMuEeHxWg_config.json',
    trainedOn: 'flux',
  },
  {
    id: 'flux_qwen',
    label: 'qwen',
    url: 'https://v3b.fal.media/files/b/0a8e0914/cDNMZMLEivWB_D9sjmFTL_pytorch_lora_weights.safetensors',
    configUrl: 'https://v3b.fal.media/files/b/0a8e0914/tZ6ZLijNAKBc4oX2bJpm5_config_074e689b-7703-4ddb-b763-e458a3dd3c7f.json',
    trainedOn: 'flux',
  },
];

const SDXL_LORA_PRESETS: HfPreset[] = [
  {
    id: 'sdxl_tuymans',
    label: 'sdxl tuymans',
    url: 'r2://loras/lora_tuymans_style.safetensors',
  },
];

function buildAutoPrompt(loraLabels: string[], triggers: string[] = []): string {
  const baseHints = loraLabels
    .map((l) =>
      String(l || '')
        .replace(/^flux lora:\s*/i, '')
        .replace(/\b(flux|sdxl|lora|model|weights?)\b/gi, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .slice(0, 3);
  // Flux endpoint requires a prompt; keep it minimal and "promptless" in UX (user doesn't type).
  const style = baseHints.length ? `in the style of ${baseHints.join(', ')}` : 'fine art painting style';
  const triggerPart = triggers.length ? `, ${Array.from(new Set(triggers)).join(', ')}` : '';
  return `high quality image-to-image transformation, preserve subject identity and composition, painterly rendering, ${style}${triggerPart}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  const blob = file;
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Nepodařilo se načíst soubor.'));
    r.readAsDataURL(blob);
  });
}

async function shrinkDataUrl(dataUrl: string, maxBytes: number): Promise<string> {
  const estimateBytes = (url: string) => {
    const commaIdx = url.indexOf(',');
    const b64 = commaIdx >= 0 ? url.slice(commaIdx + 1) : url;
    return Math.floor((b64.length * 3) / 4);
  };

  if (estimateBytes(dataUrl) <= maxBytes) return dataUrl;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Nepodařilo se načíst obrázek pro zmenšení.'));
    i.src = dataUrl;
  });

  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.floor(img.width * scale));
  const h = Math.max(1, Math.floor(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const qualities = [0.9, 0.82, 0.75, 0.68, 0.6, 0.5];
  for (const q of qualities) {
    const out = canvas.toDataURL('image/jpeg', q);
    if (estimateBytes(out) <= maxBytes) return out;
  }
  return canvas.toDataURL('image/jpeg', 0.45);
}

function loraHintFromPath(path: string, presets: HfPreset[]): string {
  const cleanPath = String(path || '').trim();
  if (!cleanPath) return '';
  const preset = presets.find((p) => p.url === cleanPath);
  if (preset?.label) return preset.label;
  const tail = cleanPath.split('/').pop() || cleanPath;
  return tail.replace(/\?.*$/, '').replace(/\.safetensors$/i, '');
}

function loraTriggerFromPath(path: string, presets: HfPreset[]): string {
  const cleanPath = String(path || '').trim();
  if (!cleanPath) return '';
  const preset = presets.find((p) => p.url === cleanPath);
  return String(preset?.trigger || '').trim();
}

function derivePresetPrefix(modelFamily: ModelFamily, endpoint: FluxEndpoint, selectedLoraLabel?: string): string {
  const lora = String(selectedLoraLabel || '').trim().toLowerCase();
  if (lora) return lora;
  if (modelFamily === 'sdxl') return 'sdxl';
  return endpoint === 'flux2' ? 'flux 2' : 'flux 1';
}

function parseJsonObject(raw: string): Record<string, any> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Advanced JSON musí být objekt.');
  }
  return parsed as Record<string, any>;
}

type LoraTestCase = {
  label: string;
  cfg: number;
  steps: number;
  denoise: number;
  loraScale: number;
  acceleration?: Flux2Acceleration;
};

function clampNum(v: number, min: number, max: number, precision = 2): number {
  return Number(Math.max(min, Math.min(max, v)).toFixed(precision));
}

function buildLoraTestCases(modelFamily: ModelFamily, fluxEndpoint: FluxEndpoint, baseScale: number): LoraTestCase[] {
  const w = (m: number) => clampNum(baseScale * m, 0.15, 4);
  if (modelFamily === 'sdxl') {
    return [
      { label: 'A1', denoise: 0.28, cfg: 4.2, steps: 20, loraScale: w(0.7) },
      { label: 'A2', denoise: 0.35, cfg: 4.8, steps: 24, loraScale: w(0.85) },
      { label: 'A3', denoise: 0.42, cfg: 5.2, steps: 28, loraScale: w(1.0) },
      { label: 'A4', denoise: 0.50, cfg: 5.6, steps: 32, loraScale: w(1.15) },
      { label: 'A5', denoise: 0.58, cfg: 6.0, steps: 36, loraScale: w(1.3) },
      { label: 'B1', denoise: 0.30, cfg: 6.4, steps: 24, loraScale: w(0.9) },
      { label: 'B2', denoise: 0.38, cfg: 6.8, steps: 28, loraScale: w(1.05) },
      { label: 'B3', denoise: 0.46, cfg: 7.2, steps: 32, loraScale: w(1.2) },
      { label: 'B4', denoise: 0.54, cfg: 7.6, steps: 36, loraScale: w(1.35) },
      { label: 'B5', denoise: 0.62, cfg: 8.0, steps: 40, loraScale: w(1.5) },
    ];
  }

  if (fluxEndpoint === 'flux2') {
    return [
      { label: 'A1', denoise: 0.35, cfg: 2.0, steps: 18, loraScale: w(0.7), acceleration: 'high' },
      { label: 'A2', denoise: 0.35, cfg: 2.4, steps: 22, loraScale: w(0.85), acceleration: 'high' },
      { label: 'A3', denoise: 0.35, cfg: 2.8, steps: 26, loraScale: w(1.0), acceleration: 'regular' },
      { label: 'A4', denoise: 0.35, cfg: 3.2, steps: 30, loraScale: w(1.15), acceleration: 'regular' },
      { label: 'A5', denoise: 0.35, cfg: 3.6, steps: 34, loraScale: w(1.3), acceleration: 'none' },
      { label: 'B1', denoise: 0.35, cfg: 4.0, steps: 22, loraScale: w(0.9), acceleration: 'high' },
      { label: 'B2', denoise: 0.35, cfg: 4.4, steps: 26, loraScale: w(1.05), acceleration: 'regular' },
      { label: 'B3', denoise: 0.35, cfg: 4.8, steps: 30, loraScale: w(1.2), acceleration: 'regular' },
      { label: 'B4', denoise: 0.35, cfg: 5.2, steps: 34, loraScale: w(1.35), acceleration: 'none' },
      { label: 'B5', denoise: 0.35, cfg: 5.6, steps: 38, loraScale: w(1.5), acceleration: 'none' },
    ];
  }

  return [
    { label: 'A1', denoise: 0.22, cfg: 2.2, steps: 16, loraScale: w(0.7) },
    { label: 'A2', denoise: 0.28, cfg: 2.6, steps: 20, loraScale: w(0.85) },
    { label: 'A3', denoise: 0.34, cfg: 3.0, steps: 24, loraScale: w(1.0) },
    { label: 'A4', denoise: 0.40, cfg: 3.4, steps: 28, loraScale: w(1.15) },
    { label: 'A5', denoise: 0.46, cfg: 3.8, steps: 32, loraScale: w(1.3) },
    { label: 'B1', denoise: 0.24, cfg: 4.0, steps: 18, loraScale: w(0.9) },
    { label: 'B2', denoise: 0.30, cfg: 4.4, steps: 22, loraScale: w(1.05) },
    { label: 'B3', denoise: 0.36, cfg: 4.8, steps: 26, loraScale: w(1.2) },
    { label: 'B4', denoise: 0.42, cfg: 5.2, steps: 30, loraScale: w(1.35) },
    { label: 'B5', denoise: 0.48, cfg: 5.6, steps: 34, loraScale: w(1.5) },
  ];
}

async function loadImageForCanvas(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Nepodařilo se načíst náhled.'));
    img.src = dataUrl;
  });
}

async function composeLoraTestGrid(params: {
  title: string;
  subtitle: string;
  modelFamily: ModelFamily;
  fluxEndpoint: FluxEndpoint;
  entries: Array<{ imageDataUrl: string; testCase: LoraTestCase }>;
}): Promise<string> {
  const cols = 5;
  const rows = Math.ceil(params.entries.length / cols);
  const cardW = 350;
  const imageH = 240;
  const footerH = 82;
  const cardH = imageH + footerH;
  const gap = 18;
  const pad = 28;
  const headerH = 78;
  const canvas = document.createElement('canvas');
  canvas.width = pad * 2 + cols * cardW + (cols - 1) * gap;
  canvas.height = pad * 2 + headerH + rows * cardH + (rows - 1) * gap;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Nepodařilo se vytvořit test grid.');

  ctx.fillStyle = '#070a12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#d9e0ee';
  ctx.font = '700 24px monospace';
  ctx.fillText(params.title, pad, pad + 24);
  ctx.fillStyle = 'rgba(217,224,238,0.6)';
  ctx.font = '500 14px monospace';
  ctx.fillText(params.subtitle, pad, pad + 52);

  const images = await Promise.all(params.entries.map((e) => loadImageForCanvas(e.imageDataUrl)));
  for (let i = 0; i < params.entries.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cardW + gap);
    const y = pad + headerH + row * (cardH + gap);
    const test = params.entries[i].testCase;
    const img = images[i];

    ctx.fillStyle = '#0d1421';
    ctx.fillRect(x, y, cardW, cardH);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 1, y + 1, cardW - 2, cardH - 2);

    const areaX = x + 10;
    const areaY = y + 10;
    const areaW = cardW - 20;
    const areaH = imageH - 16;
    const scale = Math.min(areaW / Math.max(1, img.width), areaH / Math.max(1, img.height));
    const drawW = Math.max(1, Math.round(img.width * scale));
    const drawH = Math.max(1, Math.round(img.height * scale));
    const dx = areaX + Math.round((areaW - drawW) / 2);
    const dy = areaY + Math.round((areaH - drawH) / 2);
    ctx.fillStyle = '#05080f';
    ctx.fillRect(areaX, areaY, areaW, areaH);
    ctx.drawImage(img, dx, dy, drawW, drawH);

    ctx.fillStyle = '#7ed957';
    ctx.font = '700 14px monospace';
    ctx.fillText(test.label, x + 12, y + imageH + 16);

    const line1 =
      params.modelFamily === 'flux' && params.fluxEndpoint === 'flux2'
        ? `cfg ${test.cfg.toFixed(1)}  steps ${test.steps}  acc ${test.acceleration || 'regular'}`
        : `denoise ${test.denoise.toFixed(2)}  cfg ${test.cfg.toFixed(1)}  steps ${test.steps}`;
    const line2 = `lora ${test.loraScale.toFixed(2)}`;

    ctx.fillStyle = 'rgba(222,230,242,0.78)';
    ctx.font = '500 12px monospace';
    ctx.fillText(line1, x + 12, y + imageH + 38);
    ctx.fillText(line2, x + 12, y + imageH + 58);
  }

  return canvas.toDataURL('image/png');
}

function Spinner(props: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-zinc-200/90">
      <div className="w-4 h-4 rounded-full border border-white/25 border-t-white/70 animate-spin" />
      {props.label ? <span className="text-[12px] tracking-wide">{props.label}</span> : null}
    </div>
  );
}

export function FluxLoraGeneratorScreen(props: {
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { onToast } = props;

  const [input, setInput] = React.useState<ImageSlot | null>(null);
  const [cfg, setCfg] = React.useState(2.5);
  const [denoise, setDenoise] = React.useState(0.35);
  const [steps, setSteps] = React.useState(28);
  const [variants, setVariants] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [modelFamily, setModelFamily] = React.useState<ModelFamily>('flux');
  const [fluxEndpoint, setFluxEndpoint] = React.useState<FluxEndpoint>('flux2');
  const [flux2Acceleration, setFlux2Acceleration] = React.useState<Flux2Acceleration>('regular');

  // New parameters (stored in presets)
  const [seed, setSeed] = React.useState<number | null>(null);
  const [imageSize, setImageSize] = React.useState('landscape_4_3');
  const [outputFormat, setOutputFormat] = React.useState<'jpeg' | 'png'>('jpeg');
  const [customPrompt, setCustomPrompt] = React.useState('');
  const [sdxlAdvancedRaw, setSdxlAdvancedRaw] = React.useState('');

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isTestingGrid, setIsTestingGrid] = React.useState(false);
  const [genError, setGenError] = React.useState('');
  const [falPhase, setFalPhase] = React.useState<'' | 'queue' | 'running' | 'finalizing'>('');
  const [genPhase, setGenPhase] = React.useState<string>('');

  const activeLoraPresets = React.useMemo(() => {
    if (modelFamily === 'sdxl') return SDXL_LORA_PRESETS;
    return FLUX_LORA_PRESETS.filter((p) => {
      const trainedOn = String(p.trainedOn || '').toLowerCase();
      if (fluxEndpoint === 'flux2') return trainedOn.includes('flux.2');
      return !trainedOn.includes('flux.2');
    });
  }, [modelFamily, fluxEndpoint]);
  const [loras, setLoras] = React.useState<LoraItem[]>([
    { id: 'lora_default', path: FLUX_LORA_PRESETS[2].url, scale: 1.0 },
  ]);

  // Presets
  const [presets, setPresets] = React.useState<FluxPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>('');
  const [presetName, setPresetName] = React.useState('');
  const [isSavingPreset, setIsSavingPreset] = React.useState(false);
  const [presetsLoaded, setPresetsLoaded] = React.useState(false);

  const [generated, setGenerated] = React.useState<OutputItem[]>([]);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const inputFileId = React.useMemo(() => `flux-input-${Math.random().toString(36).slice(2)}`, []);

  React.useEffect(() => {
    const nextDefaultPreset = activeLoraPresets[0];
    setLoras((prev) => {
      if (!nextDefaultPreset) return [];
      const currentPath = prev[0]?.path?.trim();
      if (currentPath && activeLoraPresets.some((p) => p.url === currentPath)) {
        return prev;
      }
      return [{ id: 'lora_default', path: nextDefaultPreset.url, scale: prev[0]?.scale ?? 1.0 }];
    });
  }, [activeLoraPresets]);

  // Load presets from Supabase on mount
  React.useEffect(() => {
    let cancelled = false;
    listFluxPresets()
      .then((list) => {
        if (cancelled) return;
        setPresets(list);
        setPresetsLoaded(true);
      })
      .catch((err) => {
        console.warn('[FluxPresets] Failed to load:', err);
        setPresetsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const applyPreset = React.useCallback((preset: FluxPreset) => {
    setCfg(preset.cfg);
    setDenoise(preset.strength);
    setSteps(preset.steps);
    setVariants(preset.numImages);
    setSeed(preset.seed);
    setImageSize(preset.imageSize);
    setOutputFormat(preset.outputFormat);
    setCustomPrompt(preset.prompt);
    const newLoras: LoraItem[] = preset.loras.map((l) => ({
      id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      path: l.path,
      scale: l.scale,
    }));
    setLoras(newLoras.length > 0 ? newLoras : []);
    if (newLoras[0]?.path) {
      const matchFlux = FLUX_LORA_PRESETS.find((p) => p.url === newLoras[0].path);
      const matchSdxl = SDXL_LORA_PRESETS.find((p) => p.url === newLoras[0].path);
      if (matchSdxl) {
        setModelFamily('sdxl');
        setFluxEndpoint('flux1');
      } else if (matchFlux) {
        setModelFamily('flux');
        const trainedOn = String(matchFlux.trainedOn || '').toLowerCase();
        setFluxEndpoint(trainedOn.includes('flux.2') ? 'flux2' : 'flux1');
      }
    }
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
  }, []);

  const handleSavePreset = React.useCallback(async () => {
    const name = presetName.trim();
    if (!name) {
      onToast({ type: 'error', message: 'Zadej název presetu.' });
      return;
    }
    setIsSavingPreset(true);
    try {
      const selectedLoraLabel = loras.length > 0 ? activeLoraPresets.find((p) => p.url === loras[0].path)?.label : '';
      const prefix = derivePresetPrefix(modelFamily, fluxEndpoint, selectedLoraLabel);
      const normalizedName = name.toLowerCase().startsWith(`${prefix.toLowerCase()} - `) ? name : `${prefix} - ${name}`;
      const saved = await saveFluxPreset({
        name: normalizedName,
        cfg,
        strength: denoise,
        steps,
        numImages: variants,
        seed,
        imageSize,
        outputFormat,
        loras: loras.map((l) => ({ path: l.path, scale: l.scale })),
        prompt: customPrompt,
      });
      // Refresh list
      const list = await listFluxPresets();
      setPresets(list);
      setSelectedPresetId(saved.id);
      onToast({ type: 'success', message: `Preset "${normalizedName}" uložen.` });
    } catch (err: any) {
      onToast({ type: 'error', message: String(err?.message || 'Nepodařilo se uložit preset.') });
    } finally {
      setIsSavingPreset(false);
    }
  }, [activeLoraPresets, cfg, customPrompt, denoise, fluxEndpoint, imageSize, loras, modelFamily, onToast, outputFormat, presetName, seed, steps, variants]);

  const handleDeletePreset = React.useCallback(async (id: string) => {
    try {
      await deleteFluxPreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (selectedPresetId === id) {
        setSelectedPresetId('');
        setPresetName('');
      }
      onToast({ type: 'info', message: 'Preset smazán.' });
    } catch (err: any) {
      onToast({ type: 'error', message: String(err?.message || 'Nepodařilo se smazat preset.') });
    }
  }, [onToast, selectedPresetId]);

  const selectedTopbarLoraId = React.useMemo(() => {
    if (!loras.length) return '';
    const hit = activeLoraPresets.find((p) => p.url === loras[0].path);
    return hit ? hit.id : '__custom__';
  }, [activeLoraPresets, loras]);

  const onPickInputFile = React.useCallback(
    async (file: File) => {
      try {
        const dataUrl = await fileToDataUrl(file);
        const shrunk = await shrinkDataUrl(dataUrl, 5_800_000);
        setInput({ file, dataUrl: shrunk });
      } catch (e: any) {
        onToast({ type: 'error', message: e?.message || 'Nepodařilo se nahrát vstup.' });
      }
    },
    [onToast]
  );

  const canGenerate = Boolean(input?.dataUrl) && !isGenerating && !isTestingGrid;
  const fluxEndpointId =
    fluxEndpoint === 'flux2' ? 'fal-ai/flux-2/lora/edit' : 'fal-ai/flux-lora/image-to-image';
  const showDenoise = !(modelFamily === 'flux' && fluxEndpoint === 'flux2');

  const handleGenerate = React.useCallback(async () => {
    if (!input?.dataUrl) {
      onToast({ type: 'error', message: 'Nahraj vstupní obrázek.' });
      return;
    }

    setLightbox(null);
    setIsGenerating(true);
    setGenError('');
    setFalPhase('queue');
    setGenPhase('Ve frontě…');

    const effectiveVariants = modelFamily === 'flux' && fluxEndpoint === 'flux2' ? Math.min(4, variants) : variants;

    const pendingItems: OutputItem[] = Array.from({ length: effectiveVariants }).map((_, idx) => ({
      id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${idx}`,
      status: 'pending',
    }));
    const pendingIdSet = new Set(pendingItems.map((p) => p.id));
    setGenerated((prev) => [...pendingItems, ...prev]);

    try {
      const maxBytes = 2_300_000;
      const inputDataUrl = await shrinkDataUrl(input.dataUrl, maxBytes);

      const loraLabels = loras.map((l) => loraHintFromPath(l.path, activeLoraPresets));
      const loraTriggers = loras
        .map((l) => loraTriggerFromPath(l.path, activeLoraPresets))
        .filter(Boolean);
      const prompt = customPrompt.trim() || buildAutoPrompt(loraLabels, loraTriggers);
      const resolvedLoras =
        loras.length > 0
          ? await Promise.all(
            loras.map(async (l) => {
              const path = String(l.path || '').trim();
              if (!path) return l;
              if (!isR2Ref(path)) return l;
              const key = r2KeyFromRef(path);
              const signed = await presignR2({ op: 'get', key, expires: 3600 });
              return { ...l, path: signed.signedUrl };
            })
          )
          : [];

      const normalizedLoras = resolvedLoras.map((l) => ({ path: l.path, scale: l.scale }));
      const requestedVariants = effectiveVariants;
      const normalizedLorasForRun =
        modelFamily === 'flux' && fluxEndpoint === 'flux2' ? normalizedLoras.slice(0, 3) : normalizedLoras;
      const sdxlAdvancedInput =
        modelFamily === 'sdxl'
          ? (() => {
            const base: Record<string, any> = { image_format: outputFormat };
            const extra = parseJsonObject(sdxlAdvancedRaw);
            return { ...base, ...extra };
          })()
          : undefined;
      if (requestedVariants !== variants) {
        onToast({ type: 'info', message: 'FLUX 2 endpoint umožňuje max 4 výstupy. Použito 4.' });
      }
      if (normalizedLorasForRun.length !== normalizedLoras.length) {
        onToast({ type: 'info', message: 'FLUX 2 endpoint podporuje max 3 LoRA. Použity první 3.' });
      }
      const phaseHandler = (p: 'queue' | 'running' | 'finalizing') => {
        setFalPhase(p);
        setGenPhase(p === 'queue' ? 'Ve frontě…' : p === 'running' ? 'Generuji…' : 'Dokončuji…');
      };

      const { images, usedSeed } =
        modelFamily === 'sdxl'
          ? await runFalLoraImg2ImgQueued({
            modelName: SDXL_BASE_MODEL,
            imageUrlOrDataUrl: inputDataUrl,
            prompt,
            negativePrompt: 'blurry, low quality, watermark, text, logo',
            cfg,
            denoise,
            steps,
            seed: seed ?? undefined,
            numImages: requestedVariants,
            loras: normalizedLorasForRun,
            advancedInput: sdxlAdvancedInput,
            onPhase: phaseHandler,
            maxWaitMs: 12 * 60_000,
          })
          : await runFalFluxLoraImg2ImgQueued({
            endpointId: fluxEndpointId,
            imageUrlOrDataUrl: inputDataUrl,
            prompt,
            cfg,
            denoise,
            acceleration: flux2Acceleration,
            steps,
            seed: seed ?? undefined,
            numImages: requestedVariants,
            loras: normalizedLorasForRun,
            imageSize,
            outputFormat,
            onPhase: phaseHandler,
            maxWaitMs: 12 * 60_000,
          });

      const resolved = pendingItems.map((p, i) => ({
        id: p.id,
        dataUrl: images[i],
        status: 'done' as const,
      }));
      setGenerated((prev) => {
        let outIdx = 0;
        return prev.map((it) => {
          if (!pendingIdSet.has(it.id)) return it;
          const next = resolved[outIdx];
          outIdx += 1;
          return next || it;
        });
      });

      // Persist into gallery (same behavior as Mulen Nano).
      for (const item of resolved) {
        try {
          const thumb = await createThumbnail(item.dataUrl || '', 420);
          await saveToGallery({
            id: item.id,
            url: item.dataUrl || '',
            thumbnail: thumb,
            prompt: 'img2img',
            resolution: undefined,
            aspectRatio: undefined,
            params: {
              engine: modelFamily === 'sdxl' ? 'fal_lora_img2img' : 'fal_flux_lora_img2img',
              modelFamily,
              modelName: modelFamily === 'sdxl' ? SDXL_BASE_MODEL : fluxEndpointId,
              fluxEndpoint: modelFamily === 'flux' ? fluxEndpoint : null,
              cfg,
              strength: denoise,
              steps,
              seed: typeof usedSeed === 'number' ? usedSeed : null,
              variants: requestedVariants,
              loras: loras.map((l) => ({ path: l.path, scale: l.scale })),
              promptMode: 'auto',
              advancedInput: modelFamily === 'sdxl' ? sdxlAdvancedRaw || null : null,
            },
          });
        } catch {
          // Best-effort only.
        }
      }

      onToast({ type: 'success', message: `Hotovo (${resolved.length}x).` });
    } catch (e: any) {
      const msg = String(e?.message || e || 'Chyba při generování.');
      setGenError(msg);
      setGenerated((prev) => prev.filter((it) => !pendingIdSet.has(it.id)));
      onToast({ type: 'error', message: msg });
    } finally {
      setIsGenerating(false);
      setFalPhase('');
      setGenPhase('');
    }
  }, [activeLoraPresets, cfg, customPrompt, denoise, flux2Acceleration, fluxEndpoint, fluxEndpointId, imageSize, input?.dataUrl, loras, modelFamily, onToast, outputFormat, sdxlAdvancedRaw, seed, steps, variants]);

  const handleRunLoraTest = React.useCallback(async () => {
    if (!input?.dataUrl) {
      onToast({ type: 'error', message: 'Nahraj vstupní obrázek.' });
      return;
    }
    if (!loras.length) {
      onToast({ type: 'error', message: 'Vyber LoRA pro test.' });
      return;
    }

    setLightbox(null);
    setIsTestingGrid(true);
    setGenError('');
    setFalPhase('queue');
    setGenPhase('Připravuji test 10 variant…');

    const pendingId = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-test-grid`;
    const pendingItem: OutputItem = { id: pendingId, status: 'pending' };
    setGenerated((prev) => [pendingItem, ...prev]);

    try {
      if (loras.length > 1) {
        onToast({ type: 'info', message: 'Test běží na první vybrané LoRA (pro čisté porovnání).' });
      }

      const inputDataUrl = await shrinkDataUrl(input.dataUrl, 2_300_000);
      const loraLabels = loras.map((l) => loraHintFromPath(l.path, activeLoraPresets));
      const loraTriggers = loras.map((l) => loraTriggerFromPath(l.path, activeLoraPresets)).filter(Boolean);
      const prompt = customPrompt.trim() || buildAutoPrompt(loraLabels, loraTriggers);
      const resolvedLoras = await Promise.all(
        loras.map(async (l) => {
          const path = String(l.path || '').trim();
          if (!path) return l;
          if (!isR2Ref(path)) return l;
          const key = r2KeyFromRef(path);
          const signed = await presignR2({ op: 'get', key, expires: 3600 });
          return { ...l, path: signed.signedUrl };
        })
      );
      const baseLora = resolvedLoras[0];
      if (!baseLora?.path) throw new Error('Vybraná LoRA nemá platnou URL.');

      const sdxlAdvancedInput =
        modelFamily === 'sdxl'
          ? (() => {
            const base: Record<string, any> = { image_format: outputFormat };
            const extra = parseJsonObject(sdxlAdvancedRaw);
            return { ...base, ...extra };
          })()
          : undefined;

      const tests = buildLoraTestCases(modelFamily, fluxEndpoint, baseLora.scale || 1);
      const phaseHandler = (p: 'queue' | 'running' | 'finalizing') => {
        setFalPhase(p);
      };
      const entries: Array<{ imageDataUrl: string; testCase: LoraTestCase }> = [];

      for (let i = 0; i < tests.length; i++) {
        const t = tests[i];
        setGenPhase(`Test ${i + 1}/10 • cfg ${t.cfg.toFixed(1)} • steps ${t.steps}`);
        const perTestLora = [{ path: baseLora.path, scale: t.loraScale }];
        const { images } =
          modelFamily === 'sdxl'
            ? await runFalLoraImg2ImgQueued({
              modelName: SDXL_BASE_MODEL,
              imageUrlOrDataUrl: inputDataUrl,
              prompt,
              negativePrompt: 'blurry, low quality, watermark, text, logo',
              cfg: t.cfg,
              denoise: t.denoise,
              steps: t.steps,
              numImages: 1,
              loras: perTestLora,
              advancedInput: sdxlAdvancedInput,
              onPhase: phaseHandler,
              maxWaitMs: 12 * 60_000,
            })
            : await runFalFluxLoraImg2ImgQueued({
              endpointId: fluxEndpointId,
              imageUrlOrDataUrl: inputDataUrl,
              prompt,
              cfg: t.cfg,
              denoise: t.denoise,
              acceleration: fluxEndpoint === 'flux2' ? (t.acceleration || flux2Acceleration) : flux2Acceleration,
              steps: t.steps,
              numImages: 1,
              loras: perTestLora,
              imageSize,
              outputFormat,
              onPhase: phaseHandler,
              maxWaitMs: 12 * 60_000,
            });

        if (!images?.[0]) {
          throw new Error(`Test ${i + 1}/10 nevrátil obrázek.`);
        }
        entries.push({ imageDataUrl: images[0], testCase: t });
      }

      const loraName = loraHintFromPath(baseLora.path, activeLoraPresets) || 'LoRA';
      const subtitle =
        modelFamily === 'sdxl'
          ? 'SDXL • fal-ai/lora/image-to-image'
          : fluxEndpoint === 'flux2'
            ? 'FLUX 2 • fal-ai/flux-2/lora/edit'
            : 'FLUX 1 • fal-ai/flux-lora/image-to-image';

      const gridDataUrl = await composeLoraTestGrid({
        title: `LoRA TEST • ${loraName}`,
        subtitle,
        modelFamily,
        fluxEndpoint,
        entries,
      });

      setGenerated((prev) => prev.map((it) => (it.id === pendingId ? { id: pendingId, status: 'done', dataUrl: gridDataUrl } : it)));
      try {
        const thumb = await createThumbnail(gridDataUrl, 420);
        await saveToGallery({
          id: pendingId,
          url: gridDataUrl,
          thumbnail: thumb,
          prompt: `LoRA test grid • ${loraName}`,
          params: {
            mode: 'lora-test-grid',
            modelFamily,
            fluxEndpoint: modelFamily === 'flux' ? fluxEndpoint : null,
            lora: { path: baseLora.path, scale: baseLora.scale || 1 },
            tests,
          },
        });
      } catch {
        // best effort
      }

      onToast({ type: 'success', message: `Test grid hotový (10 variant): ${loraName}` });
    } catch (e: any) {
      const msg = String(e?.message || e || 'Test grid selhal.');
      setGenError(msg);
      setGenerated((prev) => prev.filter((it) => it.id !== pendingId));
      onToast({ type: 'error', message: msg });
    } finally {
      setIsTestingGrid(false);
      setFalPhase('');
      setGenPhase('');
    }
  }, [activeLoraPresets, customPrompt, flux2Acceleration, fluxEndpoint, fluxEndpointId, imageSize, input?.dataUrl, loras, modelFamily, onToast, outputFormat, sdxlAdvancedRaw]);

  const falPhaseLabel =
    falPhase === 'queue' ? 'Ve frontě' : falPhase === 'running' ? 'Generuji' : falPhase === 'finalizing' ? 'Dokončuji' : '';
  const topbarLoraScale = loras[0]?.scale ?? 1.0;
  const selectedTopbarLoraPreset =
    loras.length > 0 ? activeLoraPresets.find((p) => p.url === loras[0].path) ?? null : null;

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[340px] shrink-0 h-full overflow-y-auto custom-scrollbar border-r border-white/5 bg-[var(--bg-card)] text-[11px]">
        <div className="p-6 flex flex-col gap-6 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Lora Influence</h2>
          </div>

          {/* ── Presets ── */}
          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Presety</div>
            <div className="flex gap-2">
              <select
                value={selectedPresetId}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    setSelectedPresetId('');
                    setPresetName('');
                    return;
                  }
                  const p = presets.find((x) => x.id === id);
                  if (p) applyPreset(p);
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] truncate"
              >
                <option value="">{presetsLoaded ? '(žádný preset)' : 'Načítám…'}</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedPresetId && (
                <button
                  type="button"
                  onClick={() => handleDeletePreset(selectedPresetId)}
                  className="p-2 rounded-lg border border-white/10 bg-black/10 hover:bg-red-500/15 hover:border-red-400/25 text-white/50 hover:text-red-300 transition-colors"
                  title="Smazat preset"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Název presetu… (prefix LoRA se přidá sám)"
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
              />
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={isSavingPreset || !presetName.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#7ed957]/25 bg-[#7ed957]/8 hover:bg-[#7ed957]/15 text-[#7ed957] text-[10px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Uložit aktuální nastavení jako preset"
              >
                <Save className="w-3.5 h-3.5" />
                {isSavingPreset ? '…' : 'Uložit'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!input || isGenerating || isTestingGrid}
            className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none"
          >
            {isTestingGrid ? 'Testuji…' : isGenerating ? 'Generuji…' : 'Generovat'}
          </button>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">POČET OBRÁZKŮ</div>
            <div className="flex items-center justify-between bg-transparent pt-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVariants(n as 1 | 2 | 3 | 4 | 5)}
                  className={`w-10 h-6 text-xs font-medium transition-all flex items-center justify-center rounded-sm ${
                    variants === n
                      ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  aria-label={`Počet obrázků: ${n}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="card-surface p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">REFERENČNÍ OBRÁZKY</div>
              <div className="text-[12px] leading-none font-semibold text-[#9aa5ba]">{input ? 1 : 0}</div>
            </div>
            <label
              htmlFor={inputFileId}
              className="block w-full h-[170px] rounded-[16px] bg-[#060d17] border border-dashed border-[#16263a] hover:border-[#223a57] transition-colors cursor-pointer overflow-hidden"
            >
              {input?.dataUrl ? (
                <img src={input.dataUrl} className="w-full h-full object-cover opacity-92 hover:opacity-100 transition-opacity" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#8f9aae]">
                  <Plus className="w-5 h-5" strokeWidth={1.8} />
                </div>
              )}
            </label>
            <input
              id={inputFileId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickInputFile(f);
                e.target.value = '';
              }}
            />
          </div>

          {/* ── Model / Endpoint / LoRA ── */}
          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Model + endpoint + lora</div>

            <div className="flex items-center gap-2">
              <div className="w-[70px] text-[9px] font-bold uppercase tracking-wider text-white/45 shrink-0">Model</div>
              <select
                value={modelFamily}
                onChange={(e) => {
                  const next = e.target.value as ModelFamily;
                  setModelFamily(next);
                  if (next === 'flux') {
                    setFluxEndpoint('flux2');
                    setFlux2Acceleration('regular');
                    setCfg(2.5);
                    setSteps(28);
                  } else {
                    setFluxEndpoint('flux1');
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)]"
              >
                <option value="flux">flux model</option>
                <option value="sdxl">sdxl model</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-[70px] text-[9px] font-bold uppercase tracking-wider text-white/45 shrink-0">Endpoint</div>
              <select
                value={fluxEndpoint}
                onChange={(e) => {
                  const next = e.target.value as FluxEndpoint;
                  setFluxEndpoint(next);
                  if (next === 'flux2') {
                    setFlux2Acceleration('regular');
                    setCfg(2.5);
                    setSteps(28);
                  }
                }}
                disabled={modelFamily !== 'flux'}
                className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="flux1">flux 1 img2img</option>
                <option value="flux2">flux 2 lora edit</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-[70px] text-[9px] font-bold uppercase tracking-wider text-white/45 shrink-0">LoRA</div>
              <select
                value={selectedTopbarLoraId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setLoras([]);
                    return;
                  }
                  const preset = activeLoraPresets.find((p) => p.id === val);
                  if (!preset) return;
                  const id = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
                  const scale = loras[0]?.scale ?? 1.0;
                  setLoras([{ id, path: preset.url, scale }]);
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)]"
              >
                <option value="">(bez LoRA)</option>
                {activeLoraPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                {selectedTopbarLoraId === '__custom__' && (
                  <option value="__custom__">Vlastní LoRA URL (z presetu)</option>
                )}
              </select>
            </div>

            {selectedTopbarLoraPreset?.trigger && (
              <div className="text-[9px] text-white/50">
                trigger: <span className="text-[#7ed957]">{selectedTopbarLoraPreset.trigger}</span>
              </div>
            )}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleRunLoraTest}
                disabled={!input || !loras.length || isGenerating || isTestingGrid}
                className="px-2.5 py-1 rounded-md border border-white/15 bg-white/5 text-[9px] font-bold uppercase tracking-wider text-white/65 hover:text-white/90 hover:border-white/25 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                title="Vygenerovat testovací grid 10 nastavení pro aktuální LoRA"
              >
                Test 10×
              </button>
            </div>
          </div>

          {/* ── Image Size ── */}
          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Velikost výstupu</div>
            <select
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
              disabled={modelFamily === 'sdxl'}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] disabled:opacity-40"
            >
              <option value="square_hd">Square HD (1024×1024)</option>
              <option value="square">Square (512×512)</option>
              <option value="portrait_4_3">Portrait 4:3</option>
              <option value="portrait_16_9">Portrait 16:9</option>
              <option value="landscape_4_3">Landscape 4:3</option>
              <option value="landscape_16_9">Landscape 16:9</option>
            </select>
            {modelFamily === 'sdxl' && (
              <div className="text-[9px] text-white/35">SDXL režim používá výchozí velikost endpointu.</div>
            )}
          </div>

          {/* ── Output Format ── */}
          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Formát výstupu</div>
            <div className="flex">
              {(['jpeg', 'png'] as const).map((fmt) => {
                const active = outputFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setOutputFormat(fmt)}
                    className={`relative flex-1 py-2 text-center text-[11px] font-black uppercase tracking-widest transition-colors ${active ? 'text-[#7ed957]' : 'text-white/45 hover:text-white/75'
                      }`}
                  >
                    {fmt}
                    <span
                      className={`absolute left-2 right-2 bottom-[-1px] h-[2px] rounded-full transition-colors ${active ? 'bg-[#7ed957]' : 'bg-transparent'
                        }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {modelFamily === 'sdxl' && (
            <div className="card-surface p-3 space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">SDXL endpoint advanced (JSON)</div>
              <textarea
                value={sdxlAdvancedRaw}
                onChange={(e) => setSdxlAdvancedRaw(e.target.value)}
                placeholder={'{\n  "enable_safety_checker": false,\n  "embeddings": [],\n  "controlnets": [],\n  "ip_adapter": [],\n  "scheduler": "karras"\n}'}
                rows={7}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] leading-5 text-[var(--text-primary)] placeholder-white/20 font-mono resize-y"
              />
              <div className="text-[9px] text-white/35">
                Vložené JSON klíče se pošlou přímo do <span className="text-white/55">fal-ai/lora/image-to-image</span> a mohou přepsat defaulty.
              </div>
            </div>
          )}

          {/* ── Custom Prompt ── */}
          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Prompt</div>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Prázdné = automatický prompt podle zvolené LoRA…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20 resize-y"
            />
            <div className="text-[9px] text-white/30">Nech prázdné pro auto-prompt, nebo napiš vlastní.</div>
          </div>

          {genError && !isGenerating && (
            <div className="card-surface p-4 border border-rose-400/20">
              <div className="text-[10px] uppercase tracking-widest text-rose-200/80 font-bold">Chyba</div>
              <div className="mt-1 text-[11px] text-white/65">{genError}</div>
            </div>
          )}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 z-10 border-b border-white/5 bg-[var(--bg-main)]/70 backdrop-blur">
          <div className="px-6 py-4 flex flex-nowrap items-center gap-5 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Váha</div>
              <input
                type="range"
                min={0}
                max={4}
                step={0.05}
                value={topbarLoraScale}
                disabled={loras.length === 0}
                onChange={(e) => {
                  const scale = Number(e.target.value);
                  setLoras((prev) => {
                    if (!prev.length) return prev;
                    const [first, ...rest] = prev;
                    return [{ ...first, scale }, ...rest];
                  });
                }}
                className="w-[150px] h-[2px] accent-[#7ed957] opacity-80 disabled:opacity-30"
              />
              <div className="text-[10px] text-white/55 w-10 text-right">{topbarLoraScale.toFixed(2)}</div>
            </div>
            {showDenoise ? (
              <div className="flex items-center gap-3">
                <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Denoise</div>
                <input
                  type="range"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={denoise}
                  onChange={(e) => setDenoise(Number(e.target.value))}
                  className="w-[220px] h-[2px] accent-[#7ed957] opacity-80"
                />
                <div className="text-[10px] text-white/55 w-10 text-right">{denoise.toFixed(2)}</div>
              </div>
            ) : (
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Acceleration</div>
                <select
                  value={flux2Acceleration}
                  onChange={(e) => setFlux2Acceleration(e.target.value as Flux2Acceleration)}
                  className="w-[150px] px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)]"
                >
                  <option value="none">none</option>
                  <option value="regular">regular</option>
                  <option value="high">high</option>
                </select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">CFG</div>
              <input type="range" min={0} max={35} step={0.1} value={cfg} onChange={(e) => setCfg(Number(e.target.value))} className="w-[180px] h-[2px] accent-[#7ed957] opacity-80" />
              <div className="text-[10px] text-white/55 w-10 text-right">{cfg.toFixed(1)}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Steps</div>
              <input type="range" min={1} max={50} step={1} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="w-[180px] h-[2px] accent-[#7ed957] opacity-80" />
              <div className="text-[10px] text-white/55 w-10 text-right">{steps}</div>
            </div>
            {!showDenoise && <div className="text-[10px] text-white/35 shrink-0">FLUX 2 používá acceleration místo denoise.</div>}
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-min">
            {generated.length === 0 ? (
              <div className="md:col-span-3 card-surface p-8 text-center text-white/45 text-[11px] uppercase tracking-widest">
                Zatím žádné výstupy
              </div>
            ) : (
              generated.map((img, idx) => {
                const isPending = img.status === 'pending';
                const canOpen = !isPending && !!img.dataUrl;
                return (
                  <article key={img.id} className="group flex flex-col overflow-hidden card-surface card-surface-hover transition-all animate-fadeIn">
                    <div className="relative bg-black/50 aspect-square overflow-hidden" title={canOpen ? 'Klikni pro plné zobrazení' : 'Generuji…'}>
                      {img.dataUrl ? (
                        <button type="button" className="block w-full h-full cursor-zoom-in" onClick={() => setLightbox(img.dataUrl || null)}>
                          <img
                            src={img.dataUrl}
                            alt={`Výstup ${idx + 1}`}
                            className="w-full h-full object-contain bg-black/20 transition-all duration-300"
                            decoding="sync"
                            style={{ imageRendering: '-webkit-optimize-contrast' }}
                          />
                        </button>
                      ) : (
                        <div className="w-full h-full bg-black/20" />
                      )}

                      {isPending && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 backdrop-blur-sm px-6 transition-all duration-200">
                          <div className="w-10 h-10 rounded-full border-2 border-white/15 border-t-[#7ed957] animate-spin" />
                          <div className="mt-4 text-[11px] text-white/70 font-black uppercase tracking-widest">
                            {falPhaseLabel || 'Generuji'}
                          </div>
                          <div className="mt-1 text-[10px] text-white/40">{genPhase || '…'}</div>
                        </div>
                      )}

                      {!isPending && (
                        <button
                          type="button"
                          className="absolute top-2 right-2 z-30 p-1.5 rounded-md bg-black/35 border border-white/10 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-200 hover:border-red-400/30 transition-all"
                          title="Smazat"
                          aria-label="Smazat"
                          onClick={async (e) => {
                            e.stopPropagation();
                            setGenerated((prev) => prev.filter((it) => it.id !== img.id));
                            try {
                              await deleteGeneratedImage(img.id);
                            } catch { }
                          }}
                        >
                          <X size={14} strokeWidth={3} />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Preview" className="max-w-[92vw] max-h-[92vh] object-contain rounded-2xl border border-white/10" />
        </div>
      )}
    </div>
  );
}
