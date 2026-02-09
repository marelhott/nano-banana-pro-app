import React from 'react';
import { runFalLoraImg2Img } from '../services/falService';
import { runHfGpuImg2Img } from '../services/hfGpuService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { getPublicUrl, uploadImage, dataUrlToBlob } from '../utils/supabaseStorage';

type ToastType = 'success' | 'error' | 'info';

type ImageSlot = {
  file: File;
  dataUrl: string;
};

type OutputItem = {
  id: string;
  dataUrl: string;
};

type HfPreset = {
  id: string;
  label: string;
  url: string;
};

const FAL_LIBRARY_CACHE_KEY = 'falModelLibrary_v1';
type BackendMode = 'fal' | 'hf';

type FalLibrary = {
  models: string[];
  loras: string[];
};

// Your HF library (uploaded weights).
// We use direct file URLs so both backends (fal + HF GPU) can download the exact weights.
const MULENMARA_CHECKPOINTS: HfPreset[] = [
  {
    id: 'tuymans_sd',
    label: 'Tuymans SD model (checkpoint)',
    url: 'https://huggingface.co/mulenmara/tuymans_SD_model/resolve/main/tuymans_style.safetensors',
  },
  {
    id: 'tuymans_style_max',
    label: 'Tuymans style max (checkpoint)',
    url: 'https://huggingface.co/mulenmara/tuymans_style_max/resolve/main/tuymans_style_max.safetensors',
  },
  {
    id: 'tuymans_style_3',
    label: 'Tuymans style 3 (checkpoint)',
    url: 'https://huggingface.co/mulenmara/tuymans_comfy/resolve/main/tuymans_style_3.safetensors',
  },
  {
    id: 'adrian_ghenie',
    label: 'Adrian Ghenie (checkpoint)',
    url: 'https://huggingface.co/mulenmara/Adrian_Ghenie_style/resolve/main/adrian_ghenie_style.safetensors',
  },
  {
    id: 'julius_hofmann',
    label: 'Julius Hofmann (checkpoint)',
    url: 'https://huggingface.co/mulenmara/Julius_Hofmann_style/resolve/main/julius_hofmann_style.safetensors',
  },
  {
    id: 'peter_doig',
    label: 'Peter Doig (checkpoint)',
    url: 'https://huggingface.co/mulenmara/peter_doig_style/resolve/main/peter_doig_style.safetensors',
  },
  {
    id: 'marlene_dumas',
    label: 'Marlene Dumas (checkpoint)',
    url: 'https://huggingface.co/mulenmara/marlene_dumas_style/resolve/main/marlene-dumas-style.safetensors',
  },
  {
    id: 'tuymans_library_max',
    label: 'Style library: Tuymans MAX (checkpoint)',
    url: 'https://huggingface.co/mulenmara/style-library/resolve/main/checkpoints/tuymans-style-MAX.safetensors',
  },
];

const MULENMARA_LORAS: HfPreset[] = [
  {
    id: 'lora_tuymans_1',
    label: 'LoRA: Tuymans (1)',
    url: 'https://huggingface.co/datasets/mulenmara/loras/resolve/main/lora_tuymans_style.safetensors',
  },
  {
    id: 'lora_tuymans_2',
    label: 'LoRA: Tuymans (2)',
    url: 'https://huggingface.co/datasets/mulenmara/loras/resolve/main/lora_tuymans_style_2.safetensors',
  },
  {
    id: 'lora_adrian_ghenie',
    label: 'LoRA: Adrian Ghenie',
    url: 'https://huggingface.co/datasets/mulenmara/loras/resolve/main/lora_adrian_ghenie_style.safetensors',
  },
  {
    id: 'lora_julius_hofmann',
    label: 'LoRA: Julius Hofmann',
    url: 'https://huggingface.co/datasets/mulenmara/loras/resolve/main/lora_julius_hofmann_style.safetensors',
  },
  {
    id: 'lora_peter_doig',
    label: 'LoRA: Peter Doig',
    url: 'https://huggingface.co/datasets/mulenmara/loras/resolve/main/lora_peter_doig_style.safetensors',
  },
  {
    id: 'lora_marlene_dumas',
    label: 'LoRA: Marlene Dumas',
    url: 'https://huggingface.co/datasets/mulenmara/loras/resolve/main/lora_marlene-dumas-style.safetensors',
  },
];

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

  // Prefer jpeg for upload payload size; ComfyUI img2img will encode into latent anyway.
  const qualities = [0.9, 0.82, 0.75, 0.68, 0.6, 0.5];
  for (const q of qualities) {
    const out = canvas.toDataURL('image/jpeg', q);
    if (estimateBytes(out) <= maxBytes) return out;
  }
  return canvas.toDataURL('image/jpeg', 0.45);
}

export function LoraSdGeneratorScreen(props: {
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { onOpenSettings, onToast } = props;

  const [backend, setBackend] = React.useState<BackendMode>('fal');

  const [input, setInput] = React.useState<ImageSlot | null>(null);
  const [cfg, setCfg] = React.useState(7);
  const [denoise, setDenoise] = React.useState(0.55);
  const [steps, setSteps] = React.useState(30);
  const [seed, setSeed] = React.useState<string>('');
  const [variants, setVariants] = React.useState<1 | 2 | 3>(1);

  const [falModels, setFalModels] = React.useState<string[]>([]);
  const [falLoras, setFalLoras] = React.useState<string[]>([]);
  const [falModelName, setFalModelName] = React.useState<string>('stabilityai/stable-diffusion-xl-base-1.0');
  const [falLoraPath, setFalLoraPath] = React.useState<string>('');
  const [falLoraScale, setFalLoraScale] = React.useState<number>(0.85);

  const [hfCheckpointPresetId, setHfCheckpointPresetId] = React.useState<string>('');
  const [hfLoraPresetId, setHfLoraPresetId] = React.useState<string>('');

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [outputs, setOutputs] = React.useState<OutputItem[]>([]);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [lastSeed, setLastSeed] = React.useState<number | null>(null);

  React.useEffect(() => {
    try {
      const cached = localStorage.getItem(FAL_LIBRARY_CACHE_KEY);
      if (!cached) return;
      const parsed = JSON.parse(cached) as FalLibrary;
      if (Array.isArray(parsed.models)) setFalModels(parsed.models);
      if (Array.isArray(parsed.loras)) setFalLoras(parsed.loras);
      if (!falModelName && Array.isArray(parsed.models) && parsed.models[0]) setFalModelName(parsed.models[0]);
    } catch {
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the user selects one of your HF presets, fill the model/LoRA inputs.
  React.useEffect(() => {
    if (hfCheckpointPresetId) {
      const p = MULENMARA_CHECKPOINTS.find((x) => x.id === hfCheckpointPresetId);
      if (p) setFalModelName(p.url);
    }
  }, [hfCheckpointPresetId]);

  React.useEffect(() => {
    if (hfLoraPresetId) {
      const p = MULENMARA_LORAS.find((x) => x.id === hfLoraPresetId);
      if (p) setFalLoraPath(p.url);
    }
  }, [hfLoraPresetId]);

  const persistFalLibrary = React.useCallback((lib: FalLibrary) => {
    try {
      localStorage.setItem(FAL_LIBRARY_CACHE_KEY, JSON.stringify(lib));
    } catch {
    }
  }, []);

  const addFalModel = React.useCallback(() => {
    const m = falModelName.trim();
    if (!m) return;
    const next = Array.from(new Set([m, ...falModels])).slice(0, 30);
    setFalModels(next);
    persistFalLibrary({ models: next, loras: falLoras });
    onToast({ message: 'Uloženo do knihovny modelů (FAL).', type: 'success' });
  }, [falLoras, falModelName, falModels, onToast, persistFalLibrary]);

  const addFalLora = React.useCallback(() => {
    const p = falLoraPath.trim();
    if (!p) return;
    const next = Array.from(new Set([p, ...falLoras])).slice(0, 60);
    setFalLoras(next);
    persistFalLibrary({ models: falModels, loras: next });
    onToast({ message: 'Uloženo do knihovny LoRA (FAL).', type: 'success' });
  }, [falLoraPath, falLoras, falModels, onToast, persistFalLibrary]);

  const removeFromFalLibrary = React.useCallback((kind: 'model' | 'lora', value: string) => {
    if (kind === 'model') {
      const next = falModels.filter((x) => x !== value);
      setFalModels(next);
      persistFalLibrary({ models: next, loras: falLoras });
      return;
    }
    const next = falLoras.filter((x) => x !== value);
    setFalLoras(next);
    persistFalLibrary({ models: falModels, loras: next });
  }, [falLoras, falModels, persistFalLibrary]);

  // NOTE: "local" mode currently only manages selection. To run inference without HF,
  // we will connect this to a local bridge + GPU inference API (phase 2).

  const setInputFromFile = React.useCallback(async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setInput({ file, dataUrl });
  }, []);

  const generate = React.useCallback(async () => {
    if (!input) {
      onToast({ message: 'Nahraj vstupní fotku.', type: 'error' });
      return;
    }

    setIsGenerating(true);
    setLightbox(null);

    try {
      // Keep function payload reasonable (Netlify Functions size limits).
      const maxBytes = 2_300_000;
      const inputDataUrl = await shrinkDataUrl(input.dataUrl, maxBytes);
      const seedNum = seed.trim() ? Number(seed.trim()) : undefined;

      let res: { images: string[]; usedSeed?: number } = { images: [] };
      const modelName = falModelName.trim();

      if (!modelName) {
        onToast({
          message: 'Vyber / zadej model (Hugging Face ID nebo URL).',
          type: 'error',
        });
        setIsGenerating(false);
        return;
      }

      const lorasPayload =
        falLoraPath.trim()
          ? [{ path: falLoraPath.trim(), scale: Math.max(0, Math.min(2, falLoraScale)) }]
          : [];

      // Prefer URL (storage) to keep payload small and robust.
      const blob = await dataUrlToBlob(inputDataUrl);
      const storagePath = await uploadImage(blob, 'generated');
      const publicUrl = getPublicUrl(storagePath);

      if (backend === 'fal') {
        res = await runFalLoraImg2Img({
          modelName,
          imageUrlOrDataUrl: publicUrl,
          // Promptless mode: we keep the UI clean; fal.ai still expects a prompt field.
          prompt: '',
          cfg,
          denoise,
          steps,
          seed: Number.isFinite(seedNum as number) ? (seedNum as number) : undefined,
          numImages: variants,
          loras: lorasPayload,
        });
      } else {
        res = await runHfGpuImg2Img({
          modelName,
          imageUrl: publicUrl,
          cfg,
          denoise,
          steps,
          seed: Number.isFinite(seedNum as number) ? (seedNum as number) : undefined,
          numImages: variants,
          loras: lorasPayload,
        });
      }

      setLastSeed(typeof res.usedSeed === 'number' ? res.usedSeed : null);
      setOutputs((prev) => [
        ...prev,
        ...res.images.map((dataUrl) => ({
          id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          dataUrl,
        })),
      ]);
      onToast({ message: `Hotovo (${res.images.length}x). Ukládám do galerie…`, type: 'success' });

      for (const out of res.images) {
        try {
          const usedModelName = falModelName.trim();
          const usedLoraPath = falLoraPath.trim() ? falLoraPath.trim() : null;
          const usedLoraScale = falLoraPath.trim() ? Math.max(0, Math.min(2, falLoraScale)) : null;

          const thumb = await createThumbnail(out, 420);
          await saveToGallery({
            url: out,
            thumbnail: thumb,
            prompt: 'img2img',
            resolution: undefined,
            aspectRatio: undefined,
            params: {
              engine: backend === 'fal' ? 'fal_lora_img2img' : 'hf_gpu_img2img',
              modelName: usedModelName,
              lora: usedLoraPath,
              loraScale: usedLoraScale,
              cfg,
              denoise,
              steps,
              seed: typeof res.usedSeed === 'number' ? res.usedSeed : null,
              variants,
              promptMode: 'auto',
            },
          });
        } catch {
          // Gallery save failures shouldn't break the result display.
        }
      }
    } catch (err: any) {
      onToast({ message: err?.message || 'Generování selhalo.', type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  }, [
    cfg,
    denoise,
    input,
    onToast,
    seed,
    steps,
    variants,
    backend,
    falModelName,
    falLoraPath,
    falLoraScale,
  ]);

  return (
    <div className="flex-1 relative flex flex-col min-w-0 canvas-surface h-full overflow-y-auto custom-scrollbar">
      <div className="p-6 lg:p-10 pb-24 w-full">
        <div className="space-y-8 w-full max-w-6xl mx-auto">
          <header className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
              <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">LoRA / SD Generátor</h2>
              <button
                type="button"
                onClick={onOpenSettings}
                className="ml-auto px-3 py-2 rounded-lg bg-zinc-900/30 text-zinc-200 border border-zinc-700/70 hover:border-zinc-500/60 text-xs font-bold uppercase tracking-wider"
              >
                Nastavení
              </button>
            </div>
            <p className="text-sm text-white/70">
              Img2Img generování přes vzdálený backend s čistým UI. Vybereš checkpoint/LoRA jako HF ID nebo URL a generuješ přes fal.ai nebo HF GPU endpoint.
            </p>
          </header>

          <div className="card-surface p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-widest text-white/80 font-bold">Backend</div>
              <div className="text-xs text-white/55">
                {backend === 'fal' ? 'fal.ai (serverless)' : 'Hugging Face GPU endpoint'}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBackend('fal')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                  backend === 'fal'
                    ? 'bg-[#7ed957] text-[#0a0f0d] border-[#7ed957]/50'
                    : 'bg-zinc-900/30 text-zinc-200 border-zinc-700/70 hover:border-zinc-500/60'
                }`}
              >
                fal.ai
              </button>
              <button
                type="button"
                onClick={() => setBackend('hf')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                  backend === 'hf'
                    ? 'bg-[#7ed957] text-[#0a0f0d] border-[#7ed957]/50'
                    : 'bg-zinc-900/30 text-zinc-200 border-zinc-700/70 hover:border-zinc-500/60'
                }`}
              >
                HF GPU
              </button>
            </div>
          </div>

          <div className="card-surface p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-widest text-white/80 font-bold">Knihovna modelů</div>
              <div className="text-xs text-white/55">
                {`${falModels.length ? `${falModels.length} modelů` : 'Modely (knihovna prázdná)'} · ${
                  falLoras.length ? `${falLoras.length} LoRA` : 'LoRA (knihovna prázdná)'
                }`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToast({ message: 'Přidej si modely/LoRA do knihovny pomocí + u polí níže.', type: 'info' })}
              className="px-4 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-800/80 text-zinc-100 text-xs font-bold uppercase tracking-wider border border-zinc-700/70"
            >
              Info
            </button>
          </div>

          <div className="card-surface p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-widest text-white/80 font-bold">Mulenmara HF knihovna</div>
                <div className="text-xs text-white/55">Rychlý výběr checkpointů a LoRA z tvého Hugging Face.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHfCheckpointPresetId('');
                  setHfLoraPresetId('');
                  onToast({ message: 'Výběr presetů resetován.', type: 'info' });
                }}
                className="px-4 py-2 rounded-lg bg-zinc-900/30 text-zinc-200 border border-zinc-700/70 hover:border-zinc-500/60 text-xs font-bold uppercase tracking-wider"
              >
                Reset
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Checkpoint (vybere URL)</label>
                <select
                  value={hfCheckpointPresetId}
                  onChange={(e) => setHfCheckpointPresetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                >
                  <option value="">(nevybráno)</option>
                  {MULENMARA_CHECKPOINTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">LoRA (vybere URL)</label>
                <select
                  value={hfLoraPresetId}
                  onChange={(e) => setHfLoraPresetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                >
                  <option value="">(žádná)</option>
                  {MULENMARA_LORAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs text-white/45">
              Tip: Vyber checkpoint a (volitelně) LoRA. Hodnoty se propsanou do polí níže a použijí se pro fal.ai i HF GPU.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-widest text-white/80 font-bold">Vstup</h3>
                {input && (
                  <button
                    type="button"
                    onClick={() => setInput(null)}
                    className="text-xs text-white/50 hover:text-white/80"
                  >
                    odstranit
                  </button>
                )}
              </div>

              {!input ? (
                <label className="block border border-zinc-700/70 bg-zinc-900/30 rounded-xl p-5 cursor-pointer hover:border-zinc-500/60 transition-colors">
                  <div className="text-sm text-white/70">Klikni a nahraj fotku</div>
                  <div className="text-xs text-white/40 mt-1">PNG/JPG. (Pro upload se může automaticky zmenšit.)</div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      void setInputFromFile(f);
                    }}
                  />
                </label>
              ) : (
                <button
                  type="button"
                  className="w-full border border-zinc-700/70 bg-zinc-900/20 rounded-xl overflow-hidden"
                  onClick={() => setLightbox(input.dataUrl)}
                  title="Otevřít náhled"
                >
                  <img src={input.dataUrl} alt="Input" className="w-full h-[320px] object-contain bg-black/20" />
                </button>
              )}

              <div className="space-y-2">
                <div className="text-xs text-white/45">
                  Prompt je v režimu <span className="text-white/70 font-bold">Auto</span> (nevyplňuje se).
                </div>
              </div>
            </div>

            <div className="card-surface p-5 space-y-4">
              <h3 className="text-xs uppercase tracking-widest text-white/80 font-bold">Nastavení</h3>

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Model (HF ID nebo URL)</label>
                  <div className="flex gap-2">
                    <input
                      value={falModelName}
                      onChange={(e) => setFalModelName(e.target.value)}
                      placeholder="např. stabilityai/stable-diffusion-xl-base-1.0 nebo URL na .safetensors"
                      className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-white/25 focus:outline-none focus:border-[#7ed957]/60"
                    />
                    <button
                      type="button"
                      onClick={addFalModel}
                      className="px-3 py-2 rounded-lg text-xs font-bold border bg-zinc-900/30 text-zinc-200 border-zinc-700/70 hover:border-zinc-500/60"
                      title="Uložit do knihovny"
                    >
                      +
                    </button>
                  </div>
                  {falModels.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {falModels.slice(0, 8).map((m) => (
                        <div key={m} className="flex items-center gap-2 px-2 py-1 rounded-lg border border-zinc-700/70 bg-zinc-900/20">
                          <button
                            type="button"
                            onClick={() => setFalModelName(m)}
                            className="text-xs text-zinc-200 hover:text-white"
                            title={m}
                          >
                            {m.length > 26 ? `${m.slice(0, 26)}…` : m}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromFalLibrary('model', m)}
                            className="text-xs text-white/35 hover:text-white/70"
                            title="Smazat z knihovny"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-white/40">
                    {backend === 'fal'
                      ? 'fal.ai umí použít model jako HuggingFace ID nebo URL na .safetensors.'
                      : 'HF GPU endpoint musí umět stáhnout model podle zadaného HF ID/URL (implementace endpointu).'}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">LoRA (HF ID nebo URL)</label>
                  <div className="flex gap-2">
                    <input
                      value={falLoraPath}
                      onChange={(e) => setFalLoraPath(e.target.value)}
                      placeholder="např. mulenmara/style-library/resolve/main/loras/xxx.safetensors"
                      className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-white/25 focus:outline-none focus:border-[#7ed957]/60"
                    />
                    <button
                      type="button"
                      onClick={addFalLora}
                      className="px-3 py-2 rounded-lg text-xs font-bold border bg-zinc-900/30 text-zinc-200 border-zinc-700/70 hover:border-zinc-500/60"
                      title="Uložit do knihovny"
                    >
                      +
                    </button>
                  </div>
                  {falLoras.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {falLoras.slice(0, 8).map((m) => (
                        <div key={m} className="flex items-center gap-2 px-2 py-1 rounded-lg border border-zinc-700/70 bg-zinc-900/20">
                          <button
                            type="button"
                            onClick={() => setFalLoraPath(m)}
                            className="text-xs text-zinc-200 hover:text-white"
                            title={m}
                          >
                            {m.length > 26 ? `${m.slice(0, 26)}…` : m}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromFalLibrary('lora', m)}
                            className="text-xs text-white/35 hover:text-white/70"
                            title="Smazat z knihovny"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {falLoraPath.trim() && (
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-wider">LoRA scale</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="2"
                      value={falLoraScale}
                      onChange={(e) => setFalLoraScale(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">CFG</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="30"
                    value={cfg}
                    onChange={(e) => setCfg(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Steps</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="200"
                    value={steps}
                    onChange={(e) => setSteps(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Denoise</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1"
                    value={denoise}
                    onChange={(e) => setDenoise(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Seed</label>
                  <input
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder={lastSeed != null ? String(lastSeed) : 'random'}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-white/25 focus:outline-none focus:border-[#7ed957]/60"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Varianty</label>
                  <div className="flex gap-2">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setVariants(n as 1 | 2 | 3)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                          variants === n
                            ? 'bg-[#7ed957] text-[#0a0f0d] border-[#7ed957]/50'
                            : 'bg-zinc-900/30 text-zinc-200 border-zinc-700/70 hover:border-zinc-500/60'
                        }`}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={generate}
                  disabled={isGenerating}
                  className="px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                >
                  {isGenerating ? 'Generuju…' : 'Generate'}
                </button>
              </div>

              <div className="text-xs text-white/45">
                Pozn.: fal.ai vyžaduje `FAL_KEY` v Netlify env. HF režim vyžaduje `HF_IMG2IMG_URL` (a případně `HF_TOKEN`).
              </div>
            </div>
          </div>

          {outputs.length > 0 && (
            <div className="card-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-widest text-white/80 font-bold">Výstupy</h3>
                <div className="text-xs text-white/45">Klikni pro fullsize</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {outputs.map((o, idx) => (
                  <button
                    key={o.id}
                    type="button"
                    className="border border-zinc-700/70 bg-black/20 rounded-xl overflow-hidden hover:border-zinc-500/60 transition-colors"
                    onClick={() => setLightbox(o.dataUrl)}
                    title="Otevřít"
                  >
                    <img src={o.dataUrl} alt={`Output ${idx + 1}`} className="w-full h-[260px] object-contain" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Preview" className="max-w-[92vw] max-h-[92vh] object-contain" />
        </div>
      )}
    </div>
  );
}
