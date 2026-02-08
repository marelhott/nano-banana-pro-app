import React from 'react';
import { runFalLoraImg2Img } from '../services/falService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { getPublicUrl, uploadImage, dataUrlToBlob } from '../utils/supabaseStorage';
import { hfResolveUrl } from '../services/localModelLibraryService';

type ToastType = 'success' | 'error' | 'info';

type ImageSlot = {
  file: File;
  dataUrl: string;
};

const FAL_LIBRARY_CACHE_KEY = 'falModelLibrary_v1';

type BackendMode = 'fal' | 'local';

type FalLibrary = {
  models: string[];
  loras: string[];
};

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

  const [backend, setBackend] = React.useState<BackendMode>('local');

  const [input, setInput] = React.useState<ImageSlot | null>(null);
  const [prompt, setPrompt] = React.useState('');
  const [negativePrompt, setNegativePrompt] = React.useState('');
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

  const [localCheckpoints, setLocalCheckpoints] = React.useState<Array<{ name: string; path: string; bytes?: number }>>([]);
  const [localLoras, setLocalLoras] = React.useState<Array<{ name: string; path: string; bytes?: number }>>([]);
  const [selectedLocalCheckpoint, setSelectedLocalCheckpoint] = React.useState<string>('');
  const [selectedLocalLora, setSelectedLocalLora] = React.useState<string>('');
  const [localLoraScale, setLocalLoraScale] = React.useState<number>(0.85);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [outputs, setOutputs] = React.useState<string[]>([]);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [lastSeed, setLastSeed] = React.useState<number | null>(null);

  const localCheckpointFileInputId = React.useMemo(() => `local-ckpt-${Math.random().toString(36).slice(2)}`, []);
  const localLoraFileInputId = React.useMemo(() => `local-lora-${Math.random().toString(36).slice(2)}`, []);
  const localFolderInputId = React.useMemo(() => `local-folder-${Math.random().toString(36).slice(2)}`, []);

  const ingestLocalSafetensors = React.useCallback(
    (kind: 'checkpoint' | 'lora' | 'auto', fileList: FileList | null) => {
      const files = Array.from(fileList || []).filter((f) => (f.name || '').toLowerCase().endsWith('.safetensors'));
      if (!files.length) {
        onToast({ message: 'Nevybral jsi žádný .safetensors soubor.', type: 'info' });
        return;
      }

      const toEntries = (fs: File[]) =>
        fs
          .map((f) => ({ name: f.name, path: (f as any).webkitRelativePath || f.name, bytes: (f as any).size as number | undefined }))
          .sort((a, b) => a.name.localeCompare(b.name));

      if (kind === 'checkpoint') {
        const next = toEntries(files);
        setLocalCheckpoints(next);
        if (next[0]?.name) setSelectedLocalCheckpoint(next[0].name);
        onToast({ message: `Přidáno: ${next.length} checkpointů z Finderu.`, type: 'success' });
        return;
      }

      if (kind === 'lora') {
        const next = toEntries(files);
        setLocalLoras(next);
        onToast({ message: `Přidáno: ${next.length} LoRA z Finderu.`, type: 'success' });
        return;
      }

      // auto: split by folder name if possible (very rough heuristic)
      const lower = (s: string) => (s || '').toLowerCase();
      const ckpt = files.filter((f) => lower((f as any).webkitRelativePath || '').includes('model') || lower((f as any).webkitRelativePath || '').includes('checkpoint'));
      const lora = files.filter((f) => lower((f as any).webkitRelativePath || '').includes('lora'));
      const unknown = files.filter((f) => !ckpt.includes(f) && !lora.includes(f));

      const ckptEntries = toEntries(ckpt.length ? ckpt : unknown);
      const loraEntries = toEntries(lora.length ? lora : []);

      if (ckptEntries.length) {
        setLocalCheckpoints(ckptEntries);
        if (!selectedLocalCheckpoint && ckptEntries[0]?.name) setSelectedLocalCheckpoint(ckptEntries[0].name);
      }
      if (loraEntries.length) setLocalLoras(loraEntries);

      onToast({
        message: `Načteno ze složky: ${ckptEntries.length} checkpointů, ${loraEntries.length} LoRA.`,
        type: 'success',
      });
    },
    [onToast, selectedLocalCheckpoint],
  );

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
    setOutputs([]);
  }, []);

  const generate = React.useCallback(async () => {
    if (!input) {
      onToast({ message: 'Nahraj vstupní fotku.', type: 'error' });
      return;
    }
    if (!prompt.trim()) {
      onToast({ message: 'Napiš prompt (co má být výsledkem).', type: 'error' });
      return;
    }

    setIsGenerating(true);
    setOutputs([]);
    setLightbox(null);

    try {
      // Keep function payload reasonable (Netlify Functions size limits).
      const maxBytes = 2_300_000;
      const inputDataUrl = await shrinkDataUrl(input.dataUrl, maxBytes);
      const seedNum = seed.trim() ? Number(seed.trim()) : undefined;

      let res: { images: string[]; usedSeed?: number } = { images: [] };

      const repo = 'mulenmara/style-library';
      const modelName =
        backend === 'local'
          ? (selectedLocalCheckpoint.trim() ? hfResolveUrl(repo, `checkpoints/${selectedLocalCheckpoint.trim()}`) : '')
          : falModelName.trim();

      if (!modelName) {
        onToast({
          message: backend === 'local' ? 'Vyber checkpoint (přidej přes Finder).' : 'Vyber / zadej model (fal.ai).',
          type: 'error',
        });
        setIsGenerating(false);
        return;
      }

      const lorasPayload =
        backend === 'local'
          ? (selectedLocalLora.trim()
              ? [{ path: hfResolveUrl(repo, `loras/${selectedLocalLora.trim()}`), scale: Math.max(0, Math.min(2, localLoraScale)) }]
              : [])
          : (falLoraPath.trim()
              ? [{ path: falLoraPath.trim(), scale: Math.max(0, Math.min(2, falLoraScale)) }]
              : []);

      // Prefer URL (storage) to keep payload small and robust.
      const blob = await dataUrlToBlob(inputDataUrl);
      const storagePath = await uploadImage(blob, 'generated');
      const publicUrl = getPublicUrl(storagePath);

      res = await runFalLoraImg2Img({
        modelName,
        imageUrlOrDataUrl: publicUrl,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        cfg,
        denoise,
        steps,
        seed: Number.isFinite(seedNum as number) ? (seedNum as number) : undefined,
        numImages: variants,
        loras: lorasPayload,
      });

      setLastSeed(typeof res.usedSeed === 'number' ? res.usedSeed : null);
      setOutputs(res.images);
      onToast({ message: `Hotovo (${res.images.length}x). Ukládám do galerie…`, type: 'success' });

      for (const out of res.images) {
        try {
          const repo = 'mulenmara/style-library';
          const usedModelName =
            backend === 'local'
              ? hfResolveUrl(repo, `checkpoints/${selectedLocalCheckpoint.trim()}`)
              : falModelName.trim();
          const usedLoraPath =
            backend === 'local'
              ? (selectedLocalLora.trim() ? hfResolveUrl(repo, `loras/${selectedLocalLora.trim()}`) : null)
              : (falLoraPath.trim() ? falLoraPath.trim() : null);
          const usedLoraScale =
            backend === 'local'
              ? (selectedLocalLora.trim() ? Math.max(0, Math.min(2, localLoraScale)) : null)
              : (falLoraPath.trim() ? Math.max(0, Math.min(2, falLoraScale)) : null);

          const thumb = await createThumbnail(out, 420);
          await saveToGallery({
            url: out,
            thumbnail: thumb,
            prompt: prompt.trim(),
            resolution: undefined,
            aspectRatio: undefined,
            params: {
              engine: 'fal_lora_img2img',
              library: backend,
              modelName: usedModelName,
              lora: usedLoraPath,
              loraScale: usedLoraScale,
              cfg,
              denoise,
              steps,
              seed: typeof res.usedSeed === 'number' ? res.usedSeed : null,
              variants,
              negativePrompt: negativePrompt.trim() || null,
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
    negativePrompt,
    onToast,
    prompt,
    seed,
    steps,
    variants,
    backend,
    falModelName,
    falLoraPath,
    falLoraScale,
    selectedLocalCheckpoint,
    selectedLocalLora,
    localLoraScale,
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
              Img2Img generování přes vzdálený backend s čistým UI. Umíme přidat checkpoint/LoRA přes Finder a generovat přes fal.ai.
            </p>
          </header>

          <div className="card-surface p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-widest text-white/80 font-bold">Backend</div>
              <div className="text-xs text-white/55">
                {backend === 'local'
                  ? 'Lokální knihovna (disk) -> fal.ai'
                  : 'fal.ai (serverless)'}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBackend('local')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                  backend === 'local'
                    ? 'bg-[#7ed957] text-[#0a0f0d] border-[#7ed957]/50'
                    : 'bg-zinc-900/30 text-zinc-200 border-zinc-700/70 hover:border-zinc-500/60'
                }`}
              >
                Lokální
              </button>
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
            </div>
          </div>

          <div className="card-surface p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-widest text-white/80 font-bold">Knihovna modelů</div>
              <div className="text-xs text-white/55">
                {backend === 'local'
                  ? `${localCheckpoints.length} checkpointů · ${localLoras.length} LoRA (z Finderu)`
                  : `${falModels.length ? `${falModels.length} modelů` : 'Modely (knihovna prázdná)'} · ${
                      falLoras.length ? `${falLoras.length} LoRA` : 'LoRA (knihovna prázdná)'
                    } (fal)`}
              </div>
            </div>
            {backend === 'local' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById(localCheckpointFileInputId)?.click()}
                  className="px-4 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-800/80 text-zinc-100 text-xs font-bold uppercase tracking-wider border border-zinc-700/70"
                >
                  Přidat checkpoint
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById(localLoraFileInputId)?.click()}
                  className="px-4 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-800/80 text-zinc-100 text-xs font-bold uppercase tracking-wider border border-zinc-700/70"
                >
                  Přidat LoRA
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById(localFolderInputId)?.click()}
                  className="px-4 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-800/80 text-zinc-100 text-xs font-bold uppercase tracking-wider border border-zinc-700/70"
                  title="Vyber složku ve Finderu (načteme názvy .safetensors)"
                >
                  Přidat složku
                </button>

                <input
                  id={localCheckpointFileInputId}
                  type="file"
                  accept=".safetensors"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    ingestLocalSafetensors('checkpoint', e.currentTarget.files);
                    e.currentTarget.value = '';
                  }}
                />
                <input
                  id={localLoraFileInputId}
                  type="file"
                  accept=".safetensors"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    ingestLocalSafetensors('lora', e.currentTarget.files);
                    e.currentTarget.value = '';
                  }}
                />
                <input
                  id={localFolderInputId}
                  type="file"
                  multiple
                  // @ts-expect-error - webkitdirectory is supported in Chromium browsers (Finder folder pick).
                  webkitdirectory="true"
                  // @ts-expect-error - directory is legacy but harmless where supported.
                  directory="true"
                  className="hidden"
                  onChange={(e) => {
                    ingestLocalSafetensors('auto', e.currentTarget.files);
                    e.currentTarget.value = '';
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onToast({ message: 'U fal.ai se modely nečtou automaticky: přidej si je do knihovny.', type: 'info' })}
                className="px-4 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-800/80 text-zinc-100 text-xs font-bold uppercase tracking-wider border border-zinc-700/70"
              >
                Info
              </button>
            )}
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
                <label className="block text-xs font-bold text-white/70 uppercase tracking-wider">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="Co má vzniknout? (např. převést fotku do malby, zachovat kompozici...)"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-white/25 focus:outline-none focus:border-[#7ed957]/60"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Negative prompt</label>
                <input
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="volitelné (např. text, watermark...)"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-white/25 focus:outline-none focus:border-[#7ed957]/60"
                />
              </div>
            </div>

            <div className="card-surface p-5 space-y-4">
              <h3 className="text-xs uppercase tracking-widest text-white/80 font-bold">Nastavení</h3>

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  {backend === 'local' ? (
                    <>
                      <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Lokální checkpoint</label>
                      <select
                        value={selectedLocalCheckpoint}
                        onChange={(e) => setSelectedLocalCheckpoint(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                      >
                        <option value="">(vyber)</option>
                        {localCheckpoints.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {!localCheckpoints.length && (
                        <div className="text-xs text-white/40">Zatím nic. Přidej checkpointy přes Finder tlačítky nahoře.</div>
                      )}

                      <div className="pt-3 space-y-2">
                        <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Lokální LoRA (volitelné)</label>
                        <select
                          value={selectedLocalLora}
                          onChange={(e) => setSelectedLocalLora(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                        >
                          <option value="">(bez LoRA)</option>
                          {localLoras.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        {selectedLocalLora.trim() && (
                          <div className="space-y-1">
                            <div className="text-xs text-white/45">LoRA váha</div>
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max="2"
                              value={localLoraScale}
                              onChange={(e) => setLocalLoraScale(Number(e.target.value))}
                              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                            />
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Model (HF ID nebo URL)</label>
                      <div className="flex gap-2">
                        <input
                          value={falModelName}
                          onChange={(e) => setFalModelName(e.target.value)}
                          placeholder="např. mulenmara/models nebo URL na .safetensors"
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
                        fal.ai umí použít `model_name` jako HuggingFace ID nebo URL na `.safetensors`.
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-1">
                  {backend === 'local' ? (
                    <div className="text-xs text-white/45">
                      Lokální výběr najdeš nahoře. Pro generování se teď používá fal.ai, takže z lokální volby vytváříme cloudové odkazy a propsujeme je do fal.ai polí (soubor musí být nahraný v cloudu pod stejným názvem).
                    </div>
                  ) : (
                    <>
                      <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">LoRA (HF ID nebo URL)</label>
                      <div className="flex gap-2">
                        <input
                          value={falLoraPath}
                          onChange={(e) => setFalLoraPath(e.target.value)}
                          placeholder="např. mulenmara/datasets (lora) nebo URL na .safetensors"
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
                    </>
                  )}
                </div>

                {backend === 'fal' && falLoraPath.trim() && (
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
                Pozn.: fal.ai běží přes API. Aby to fungovalo, musí být nastavený `FAL_KEY` v Netlify env.
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
                    key={`${idx}-${o.length}`}
                    type="button"
                    className="border border-zinc-700/70 bg-black/20 rounded-xl overflow-hidden hover:border-zinc-500/60 transition-colors"
                    onClick={() => setLightbox(o)}
                    title="Otevřít"
                  >
                    <img src={o} alt={`Output ${idx + 1}`} className="w-full h-[260px] object-contain" />
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
