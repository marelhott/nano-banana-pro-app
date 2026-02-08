import React from 'react';
import { comfyGetObjectInfo, extractComfyModelLists, runComfyImg2Img } from '../services/comfyService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';

type ToastType = 'success' | 'error' | 'info';

type ImageSlot = {
  file: File;
  dataUrl: string;
};

const COMFY_MODEL_CACHE_KEY = 'comfyModelCache_v1';

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

  const [input, setInput] = React.useState<ImageSlot | null>(null);
  const [prompt, setPrompt] = React.useState('');
  const [negativePrompt, setNegativePrompt] = React.useState('');
  const [cfg, setCfg] = React.useState(7);
  const [denoise, setDenoise] = React.useState(0.55);
  const [steps, setSteps] = React.useState(30);
  const [seed, setSeed] = React.useState<string>('');
  const [variants, setVariants] = React.useState<1 | 2 | 3>(1);

  const [checkpoints, setCheckpoints] = React.useState<string[]>([]);
  const [loras, setLoras] = React.useState<string[]>([]);
  const [checkpointName, setCheckpointName] = React.useState<string>('');
  const [loraName, setLoraName] = React.useState<string>('');
  const [loraStrengthModel, setLoraStrengthModel] = React.useState(0.85);
  const [loraStrengthClip, setLoraStrengthClip] = React.useState(0.85);

  const [isRefreshingModels, setIsRefreshingModels] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [outputs, setOutputs] = React.useState<string[]>([]);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [lastSeed, setLastSeed] = React.useState<number | null>(null);

  React.useEffect(() => {
    try {
      const cached = localStorage.getItem(COMFY_MODEL_CACHE_KEY);
      if (!cached) return;
      const parsed = JSON.parse(cached) as { checkpoints?: string[]; loras?: string[] };
      if (Array.isArray(parsed.checkpoints)) setCheckpoints(parsed.checkpoints);
      if (Array.isArray(parsed.loras)) setLoras(parsed.loras);
      if (!checkpointName && Array.isArray(parsed.checkpoints) && parsed.checkpoints[0]) {
        setCheckpointName(parsed.checkpoints[0]);
      }
    } catch {
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshModels = React.useCallback(async () => {
    setIsRefreshingModels(true);
    try {
      const info = await comfyGetObjectInfo();
      const { checkpoints: ckpts, loras: lrs } = extractComfyModelLists(info);
      setCheckpoints(ckpts);
      setLoras(lrs);
      if (!checkpointName && ckpts[0]) setCheckpointName(ckpts[0]);
      try {
        localStorage.setItem(COMFY_MODEL_CACHE_KEY, JSON.stringify({ checkpoints: ckpts, loras: lrs, storedAt: Date.now() }));
      } catch {
      }
      onToast({ message: `Načteno: ${ckpts.length} checkpointů, ${lrs.length} LoRA.`, type: 'success' });
    } catch (err: any) {
      onToast({
        message:
          err?.message ||
          'Nepodařilo se načíst modely z ComfyUI. Zkontroluj COMFY_BASE_URL v Netlify env (nebo backend není dostupný).',
        type: 'error',
      });
    } finally {
      setIsRefreshingModels(false);
    }
  }, [checkpointName, onToast]);

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
    if (!checkpointName) {
      onToast({ message: 'Vyber SD checkpoint.', type: 'error' });
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

      const res = await runComfyImg2Img({
        inputImageDataUrl: inputDataUrl,
        checkpointName,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        cfg,
        denoise,
        steps,
        seed: Number.isFinite(seedNum as number) ? (seedNum as number) : undefined,
        variants,
        loraName: loraName.trim() ? loraName.trim() : null,
        loraStrengthModel,
        loraStrengthClip,
      });

      setLastSeed(res.usedSeed);
      setOutputs(res.images);
      onToast({ message: `Hotovo (${res.images.length}x). Ukládám do galerie…`, type: 'success' });

      for (const out of res.images) {
        try {
          const thumb = await createThumbnail(out, 420);
          await saveToGallery({
            url: out,
            thumbnail: thumb,
            prompt: prompt.trim(),
            resolution: undefined,
            aspectRatio: undefined,
            params: {
              engine: 'comfy_img2img',
              checkpoint: checkpointName,
              lora: loraName.trim() ? loraName.trim() : null,
              cfg,
              denoise,
              steps,
              seed: res.usedSeed,
              variants,
              negativePrompt: negativePrompt.trim() || null,
              loraStrengthModel: loraName.trim() ? loraStrengthModel : null,
              loraStrengthClip: loraName.trim() ? loraStrengthClip : null,
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
    checkpointName,
    denoise,
    input,
    loraName,
    loraStrengthClip,
    loraStrengthModel,
    negativePrompt,
    onToast,
    prompt,
    seed,
    steps,
    variants,
  ]);

  return (
    <div className="flex-1 relative flex flex-col min-w-0 canvas-surface h-full overflow-y-auto custom-scrollbar">
      <div className="p-6 lg:p-10 pb-24 w-full">
        <div className="space-y-8 w-full max-w-6xl mx-auto">
          <header className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
              <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">LoRA / SD Generátor</h2>
            </div>
            <p className="text-sm text-white/70">
              Img2Img generování přes vzdálený ComfyUI backend. Vybereš checkpoint/LoRA, nastavíš váhy a vygeneruješ varianty.
            </p>
          </header>

          <div className="card-surface p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-widest text-white/80 font-bold">Modely z backendu</div>
              <div className="text-xs text-white/55">
                {checkpoints.length ? `${checkpoints.length} checkpointů` : 'Checkpointy nenačtené'} ·{' '}
                {loras.length ? `${loras.length} LoRA` : 'LoRA nenačtené'}
              </div>
            </div>
            <button
              type="button"
              onClick={refreshModels}
              disabled={isRefreshingModels}
              className="px-4 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-800/80 text-zinc-100 text-xs font-bold uppercase tracking-wider border border-zinc-700/70 disabled:opacity-60"
            >
              {isRefreshingModels ? 'Načítám…' : 'Refresh'}
            </button>
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
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">Checkpoint</label>
                  <select
                    value={checkpointName}
                    onChange={(e) => setCheckpointName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                  >
                    <option value="">(vyber)</option>
                    {checkpoints.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {!checkpoints.length && (
                    <div className="text-xs text-white/40">Klikni Refresh (musí být nastavený ComfyUI backend).</div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider">LoRA (volitelné)</label>
                  <select
                    value={loraName}
                    onChange={(e) => setLoraName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                  >
                    <option value="">(bez LoRA)</option>
                    {loras.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {loraName.trim() && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-white/50 uppercase tracking-wider">LoRA model</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="2"
                        value={loraStrengthModel}
                        onChange={(e) => setLoraStrengthModel(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-white/50 uppercase tracking-wider">LoRA clip</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="2"
                        value={loraStrengthClip}
                        onChange={(e) => setLoraStrengthClip(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                      />
                    </div>
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
                Pozn.: Backend musí mít nainstalované modely (checkpoints/loras) podle názvů v dropdownu.
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
