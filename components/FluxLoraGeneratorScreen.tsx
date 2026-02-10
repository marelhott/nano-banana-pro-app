import React from 'react';
import { Plus } from 'lucide-react';
import { runFalFluxLoraImg2ImgQueued } from '../services/falService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { dataUrlToBlob } from '../utils/supabaseStorage';

type ToastType = 'success' | 'error' | 'info';

type ImageSlot = {
  file: File;
  dataUrl: string;
};

type OutputItem = {
  id: string;
  dataUrl: string;
};

type LoraItem = {
  id: string;
  path: string;
  scale: number;
};

type OutputBatch = {
  id: string;
  createdAtMs: number;
  images: OutputItem[];
  usedSeed: number | null;
};

type HfPreset = {
  id: string;
  label: string;
  url: string;
};

// User-provided Flux LoRA export (fal media URLs).
const MULENMARA_FLUX_LORAS: HfPreset[] = [
  {
    id: 'flux_lora_latest',
    label: 'Flux LoRA: latest (weights)',
    url: 'https://v3b.fal.media/files/b/0a8dd547/4Z_ldmLbgx3Tb3XiOsA12_pytorch_lora_weights.safetensors',
  },
];

function buildAutoPrompt(loraLabels: string[]): string {
  const baseHints = loraLabels
    .map((l) => String(l || '').replace(/^flux lora:\s*/i, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  // Flux endpoint requires a prompt; keep it minimal and "promptless" in UX (user doesn't type).
  const style = baseHints.length ? `in the style of ${baseHints.join(', ')}` : 'fine art painting';
  return `high quality, painterly, ${style}`;
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
  const { onOpenSettings, onToast } = props;

  const [input, setInput] = React.useState<ImageSlot | null>(null);
  const [cfg, setCfg] = React.useState(3.5);
  const [denoise, setDenoise] = React.useState(0.35);
  const [steps, setSteps] = React.useState(28);
  const [variants, setVariants] = React.useState<1 | 2 | 3>(1);

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [genError, setGenError] = React.useState('');
  const [falPhase, setFalPhase] = React.useState<'' | 'queue' | 'running' | 'finalizing'>('');

  const [loras, setLoras] = React.useState<LoraItem[]>([
    { id: 'flux_lora_default', path: MULENMARA_FLUX_LORAS[0].url, scale: 1.0 },
  ]);
  const [newLoraPresetId, setNewLoraPresetId] = React.useState<string>(MULENMARA_FLUX_LORAS[0].id);
  const [newLoraUrl, setNewLoraUrl] = React.useState('');

  const [batches, setBatches] = React.useState<OutputBatch[]>([]);
  const [previewImages, setPreviewImages] = React.useState<OutputItem[]>([]);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const inputFileId = React.useMemo(() => `flux-input-${Math.random().toString(36).slice(2)}`, []);

  const addLora = React.useCallback((path: string) => {
    const p = path.trim();
    if (!p) return;
    setLoras((prev) => {
      if (prev.length >= 6) return prev;
      const id = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      return [...prev, { id, path: p, scale: 1.0 }];
    });
  }, []);

  const removeLora = React.useCallback((id: string) => {
    setLoras((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const updateLoraScale = React.useCallback((id: string, scale: number) => {
    setLoras((prev) => prev.map((l) => (l.id === id ? { ...l, scale } : l)));
  }, []);

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

  const phaseLabel = React.useMemo(() => {
    if (!isGenerating) return '';
    if (falPhase === 'queue') return 'In queue';
    if (falPhase === 'running') return 'In progress';
    if (falPhase === 'finalizing') return 'Finalizing';
    return 'Generating';
  }, [falPhase, isGenerating]);

  const canGenerate = Boolean(input?.dataUrl) && !isGenerating;

  const handleGenerate = React.useCallback(async () => {
    if (!input?.dataUrl) {
      onToast({ type: 'error', message: 'Nahraj vstupní obrázek.' });
      return;
    }

    setIsGenerating(true);
    setGenError('');
    setFalPhase('queue');

    try {
      const loraLabels = loras.map((l) => l.path);
      const prompt = buildAutoPrompt(loraLabels);
      const { images, usedSeed } = await runFalFluxLoraImg2ImgQueued({
        imageUrlOrDataUrl: input.dataUrl,
        prompt,
        cfg,
        denoise,
        steps,
        numImages: variants,
        loras: loras.map((l) => ({ path: l.path, scale: l.scale })),
        onPhase: (p) => setFalPhase(p),
        maxWaitMs: 12 * 60_000,
      });

      const outputItems: OutputItem[] = images.map((d) => ({
        id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        dataUrl: d,
      }));

      setPreviewImages(outputItems);
      setBatches((prev) => [
        {
          id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          createdAtMs: Date.now(),
          images: outputItems,
          usedSeed: typeof usedSeed === 'number' ? usedSeed : null,
        },
        ...prev,
      ]);

      // Persist into gallery (same behavior as Mulen Nano).
      for (const item of outputItems) {
        try {
          const blob = dataUrlToBlob(item.dataUrl);
          const thumb = await createThumbnail(item.dataUrl);
          await saveToGallery({
            id: item.id,
            prompt: '',
            url: item.dataUrl,
            thumbnailUrl: thumb,
            createdAt: new Date().toISOString(),
            meta: { source: 'flux-lora', cfg, denoise, steps, seed: usedSeed ?? null, loras: loras.map((l) => ({ path: l.path, scale: l.scale })) },
            blob,
          } as any);
        } catch {
          // Best-effort only.
        }
      }

      onToast({ type: 'success', message: `Hotovo (${outputItems.length}x).` });
    } catch (e: any) {
      const msg = String(e?.message || e || 'Chyba při generování.');
      setGenError(msg);
      onToast({ type: 'error', message: msg });
    } finally {
      setIsGenerating(false);
      setFalPhase('');
    }
  }, [cfg, denoise, input?.dataUrl, loras, onToast, steps, variants]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="hidden lg:flex w-[340px] shrink-0 border-r border-white/5 bg-[var(--bg-card)] flex-col h-full overflow-y-auto custom-scrollbar z-20">
        <div className="p-6 flex flex-col gap-6 min-h-full">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
              <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Flux LoRA</h2>
            </div>
            <p className="text-[12px] text-zinc-400 leading-relaxed">
              Prompt se generuje automaticky. Ty jen nahráváš vstup + LoRA a ladíš váhy.
            </p>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] font-[900] uppercase tracking-[0.3em] text-zinc-300">Počet obrázků</div>
            <div className="flex items-center justify-between gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVariants(n as 1 | 2 | 3)}
                  className={`flex-1 h-10 rounded-lg border text-[14px] font-semibold transition-colors ${
                    variants === n
                      ? 'bg-[#7ed957]/20 border-[#7ed957]/50 text-[#a7f07e]'
                      : 'bg-white/0 border-white/10 text-zinc-300 hover:border-white/20'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] font-[900] uppercase tracking-[0.3em] text-zinc-300">Referenční obrázek</div>
            <label
              htmlFor={inputFileId}
              className="block rounded-2xl border border-dashed border-white/10 bg-black/20 hover:bg-black/30 transition-colors p-4 cursor-pointer"
            >
              {input?.dataUrl ? (
                <img src={input.dataUrl} className="w-full aspect-square object-cover rounded-xl" />
              ) : (
                <div className="w-full aspect-square flex items-center justify-center text-zinc-400">
                  <Plus className="w-6 h-6" />
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

          <div className="space-y-3">
            <div className="text-[11px] font-[900] uppercase tracking-[0.3em] text-zinc-300">LoRA</div>

            <div className="flex gap-2">
              <select
                value={newLoraPresetId}
                onChange={(e) => setNewLoraPresetId(e.target.value)}
                className="flex-1 h-10 rounded-lg border border-white/10 bg-black/30 text-zinc-200 text-[12px] px-3"
              >
                {MULENMARA_FLUX_LORAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const preset = MULENMARA_FLUX_LORAS.find((p) => p.id === newLoraPresetId);
                  if (preset) addLora(preset.url);
                }}
                className="h-10 px-3 rounded-lg border border-white/10 bg-white/0 text-zinc-200 hover:border-white/20 text-[12px] font-semibold"
              >
                Přidat
              </button>
            </div>

            <div className="flex gap-2">
              <input
                value={newLoraUrl}
                onChange={(e) => setNewLoraUrl(e.target.value)}
                placeholder="URL na LoRA weights (.safetensors)"
                className="flex-1 h-10 rounded-lg border border-white/10 bg-black/30 text-zinc-200 text-[12px] px-3"
              />
              <button
                type="button"
                onClick={() => {
                  addLora(newLoraUrl);
                  setNewLoraUrl('');
                }}
                className="h-10 px-3 rounded-lg border border-white/10 bg-white/0 text-zinc-200 hover:border-white/20 text-[12px] font-semibold"
              >
                +
              </button>
            </div>

            <div className="space-y-2">
              {loras.map((l) => (
                <div key={l.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] text-zinc-200 truncate">{l.path}</div>
                    <button
                      type="button"
                      onClick={() => removeLora(l.id)}
                      className="text-[12px] text-zinc-400 hover:text-zinc-200"
                    >
                      Odebrat
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="text-[11px] tracking-wide text-zinc-400 w-12">váha</div>
                    <input
                      type="range"
                      min={0}
                      max={4}
                      step={0.05}
                      value={l.scale}
                      onChange={(e) => updateLoraScale(l.id, Number(e.target.value))}
                      className="flex-1 accent-[#7ed957]"
                    />
                    <div className="text-[11px] text-zinc-300 w-10 text-right">{l.scale.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto space-y-3">
            <button
              type="button"
              onClick={() => onOpenSettings()}
              className="w-full h-11 rounded-xl border border-white/10 bg-white/0 text-zinc-200 hover:border-white/20 text-[12px] font-semibold"
            >
              Nastavení (fal.ai klíč)
            </button>
            <button
              type="button"
              disabled={!canGenerate}
              onClick={() => void handleGenerate()}
              className={`w-full h-12 rounded-xl font-[900] tracking-[0.25em] uppercase text-[12px] transition-colors ${
                canGenerate
                  ? 'bg-[#7ed957] text-black hover:bg-[#93f070]'
                  : 'bg-white/10 text-zinc-500 cursor-not-allowed'
              }`}
            >
              {isGenerating ? 'Generuji' : 'Generovat'}
            </button>
            {genError ? <div className="text-[12px] text-red-300/90">{genError}</div> : null}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 border-b border-white/5 bg-[var(--bg-main)]/80 backdrop-blur px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="text-[11px] font-[900] uppercase tracking-[0.3em] text-zinc-300">Denoise</div>
              <input
                type="range"
                min={0.01}
                max={1}
                step={0.01}
                value={denoise}
                onChange={(e) => setDenoise(Number(e.target.value))}
                className="w-48 accent-[#7ed957]"
              />
              <div className="text-[11px] text-zinc-300 w-10 text-right">{denoise.toFixed(2)}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[11px] font-[900] uppercase tracking-[0.3em] text-zinc-300">CFG</div>
              <input
                type="range"
                min={0}
                max={20}
                step={0.1}
                value={cfg}
                onChange={(e) => setCfg(Number(e.target.value))}
                className="w-40 accent-[#7ed957]"
              />
              <div className="text-[11px] text-zinc-300 w-10 text-right">{cfg.toFixed(1)}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[11px] font-[900] uppercase tracking-[0.3em] text-zinc-300">Steps</div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                className="w-40 accent-[#7ed957]"
              />
              <div className="text-[11px] text-zinc-300 w-10 text-right">{steps}</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(previewImages.length ? previewImages : new Array(variants).fill(null).map(() => null)).map((it: any, idx: number) => {
              const url = it?.dataUrl as string | undefined;
              return (
                <div key={it?.id || idx} className="relative rounded-2xl border border-white/5 bg-black/20 overflow-hidden">
                  {url ? (
                    <button type="button" className="block w-full" onClick={() => setLightbox(url)}>
                      <img src={url} className="w-full aspect-square object-cover" />
                    </button>
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center text-zinc-500">
                      {isGenerating ? <Spinner label={phaseLabel} /> : <span className="text-[12px]">Výstup {idx + 1}</span>}
                    </div>
                  )}

                  {isGenerating && !url ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Spinner label={phaseLabel} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {batches.length > 0 ? (
            <div className="mt-8">
              <div className="text-[11px] font-[900] uppercase tracking-[0.3em] text-zinc-300 mb-3">Historie</div>
              <div className="space-y-3">
                {batches.slice(0, 8).map((b) => (
                  <div key={b.id} className="rounded-2xl border border-white/5 bg-black/20 p-3">
                    <div className="text-[11px] text-zinc-400">
                      {new Date(b.createdAtMs).toLocaleString()} {typeof b.usedSeed === 'number' ? `• seed ${b.usedSeed}` : ''}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {b.images.slice(0, 3).map((img) => (
                        <button key={img.id} type="button" onClick={() => setLightbox(img.dataUrl)}>
                          <img src={img.dataUrl} className="w-full aspect-square object-cover rounded-xl" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {lightbox ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-w-[92vw] max-h-[92vh] object-contain rounded-2xl border border-white/10" />
        </div>
      ) : null}
    </div>
  );
}

