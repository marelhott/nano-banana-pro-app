import React from 'react';
import { Plus } from 'lucide-react';
import { runFalLoraImg2Img } from '../services/falService';
import { presignR2, isR2Ref, r2KeyFromRef } from '../services/r2Service';
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

const SDXL_BASE_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0';

function artistHintFromModelLabel(label: string): string {
  // "Tuymans SD model (checkpoint)" -> "Tuymans"
  const base = String(label || '').split('(')[0].trim();
  const cleaned = base
    .replace(/\b(sd|model|checkpoint|style|library|max)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || base || 'fine art';
}

function buildAutoPrompt(loraLabels: string[]): { prompt: string; negative: string } {
  const hints = loraLabels.map(artistHintFromModelLabel)
    .map((s) => s.trim())
    .filter(Boolean);
  const uniq = Array.from(new Set(hints)).slice(0, 3);
  const style = uniq.length ? `in the style of ${uniq.join(', ')}` : 'fine art painting';
  return {
    prompt: `high quality, painterly, ${style}`,
    negative: 'blurry, low quality, watermark, text, logo',
  };
}

const MULENMARA_LORAS: HfPreset[] = [
  {
    id: 'lora_tuymans_1',
    label: 'LoRA: Tuymans (1)',
    // fal.ai expects LoRA as a URL it can fetch server-side.
    url: 'https://huggingface.co/datasets/mulenmara/loras/resolve/main/lora_tuymans_style.safetensors',
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

  const [input, setInput] = React.useState<ImageSlot | null>(null);
  const [cfg, setCfg] = React.useState(7);
  const [denoise, setDenoise] = React.useState(0.55);
  const [steps, setSteps] = React.useState(30);
  const [variants, setVariants] = React.useState<1 | 2 | 3>(1);

  // UI-only progress (backend doesn't stream step progress).
  const [genPhase, setGenPhase] = React.useState<string>('');
  const [genProgress, setGenProgress] = React.useState<number>(0);
  const [genError, setGenError] = React.useState<string>('');
  const [genCompletedAtMs, setGenCompletedAtMs] = React.useState<number>(0);
  const [lastSubmitInfo, setLastSubmitInfo] = React.useState<{ modelName: string; loras: Array<{ path: string; scale: number }> } | null>(
    null
  );

  const [lorasEnabled, setLorasEnabled] = React.useState(true);
  const [loras, setLoras] = React.useState<LoraItem[]>([]);
  const [newLoraPresetId, setNewLoraPresetId] = React.useState<string>('');
  const [newLoraUrl, setNewLoraUrl] = React.useState<string>('');
  const [uploadingLora, setUploadingLora] = React.useState(false);
  const [uploadLoraProgress, setUploadLoraProgress] = React.useState<number>(0);
  const loraUploadInputId = React.useMemo(() => `r2-lora-upload-${Math.random().toString(36).slice(2)}`, []);

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [batches, setBatches] = React.useState<OutputBatch[]>([]);
  const [previewImages, setPreviewImages] = React.useState<OutputItem[]>([]);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [lastSeed, setLastSeed] = React.useState<number | null>(null);
  const inputFileId = React.useMemo(() => `hf-sd-input-${Math.random().toString(36).slice(2)}`, []);

  const addLora = React.useCallback(
    (path: string) => {
      const p = path.trim();
      if (!p) return;
      setLoras((prev) => {
        if (prev.length >= 4) return prev; // keep UI tight; backend supports up to 6
        const id = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        return [...prev, { id, path: p, scale: 0.85 }];
      });
    },
    [setLoras]
  );

  const setInputFromFile = React.useCallback(async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setInput({ file, dataUrl });
  }, []);

  const setInputFromUrlOrData = React.useCallback(
    async (urlOrDataUrl: string) => {
      const v = String(urlOrDataUrl || '').trim();
      if (!v) return;
      try {
        const blob = await dataUrlToBlob(v);
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
        const file = new File([blob], `input.${ext}`, { type: blob.type || 'image/jpeg' });
        await setInputFromFile(file);
      } catch {
        const res = await fetch(v);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) throw new Error('URL není obrázek');
        const blob = await res.blob();
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
        const file = new File([blob], `input.${ext}`, { type: blob.type || 'image/jpeg' });
        await setInputFromFile(file);
      }
    },
    [setInputFromFile]
  );

  React.useEffect(() => {
    if (!isGenerating) return;
    // Smooth-ish fake progress up to ~92% while we wait for the backend.
    const timer = setInterval(() => {
      setGenProgress((p) => {
        const cap = 0.92;
        if (p >= cap) return p;
        const phase = genPhase.toLowerCase();
        // Faster early, slower later (feels more "real").
        const base =
          phase.includes('nahráv') ? 0.02 : phase.includes('spoušt') ? 0.012 : phase.includes('gener') ? 0.009 : 0.01;
        const damp = 1 - p / cap;
        return Math.min(cap, p + base * Math.max(0.25, damp));
      });
    }, 120);
    return () => clearInterval(timer);
  }, [isGenerating, genPhase]);

  const generate = React.useCallback(async () => {
    if (!input) {
      onToast({ message: 'Nahraj vstupní fotku.', type: 'error' });
      return;
    }

    setIsGenerating(true);
    setLightbox(null);
    setPreviewImages([]); // avoid showing stale results as if they were newly generated
    setGenPhase('Připravuji…');
    setGenProgress(0.04);
    setGenError('');

    try {
      // Keep function payload reasonable (Netlify Functions size limits).
      const maxBytes = 2_300_000;
      const inputDataUrl = await shrinkDataUrl(input.dataUrl, maxBytes);
      setGenProgress((p) => Math.max(p, 0.12));
      setGenPhase('Nahrávám vstup…');

      let res: { images: string[]; usedSeed?: number } = { images: [] };
      const modelName = SDXL_BASE_MODEL;

      const lorasPayload =
        lorasEnabled
          ? loras
              .map((l) => ({ path: l.path.trim(), scale: Math.max(0, Math.min(2, l.scale)) }))
              .filter((l) => !!l.path)
          : [];
      setLastSubmitInfo({ modelName, loras: lorasPayload });

      // Resolve any r2:// refs into short-lived signed GET URLs so fal.ai can fetch them.
      const resolvedLorasPayload =
        lorasPayload.length > 0
          ? await Promise.all(
              lorasPayload.map(async (l) => {
                if (!isR2Ref(l.path)) return l;
                const key = r2KeyFromRef(l.path);
                const signed = await presignR2({ op: 'get', key, expires: 3600 });
                return { ...l, path: signed.signedUrl };
              })
            )
          : [];

      const loraLabels = lorasPayload
        .map((l) => MULENMARA_LORAS.find((p) => p.url === l.path)?.label || l.path)
        .filter(Boolean);
      const auto = buildAutoPrompt(loraLabels);

      // Send the image as data URL to avoid upstream fetch issues (private buckets, CORS, etc).
      // We already shrink it above to fit Netlify payload limits.
      setGenProgress((p) => Math.max(p, 0.28));
      setGenPhase('Spouštím fal.ai…');
      setGenProgress((p) => Math.max(p, 0.34));
      setGenPhase('Generuji…');
      res = await runFalLoraImg2Img({
        modelName,
        imageUrlOrDataUrl: inputDataUrl,
        // Promptless UI: prompt is generated automatically in the background.
        prompt: auto.prompt,
        negativePrompt: auto.negative,
        cfg,
        denoise,
        steps,
        numImages: variants,
        loras: resolvedLorasPayload,
      });

      setLastSeed(typeof res.usedSeed === 'number' ? res.usedSeed : null);
      const batchId = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const batchImages: OutputItem[] = res.images.map((dataUrl) => ({
        id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        dataUrl,
      }));
      setPreviewImages(batchImages);
      setBatches((prev) => [
        ...prev,
        {
          id: batchId,
          createdAtMs: Date.now(),
          images: batchImages,
          usedSeed: typeof res.usedSeed === 'number' ? res.usedSeed : null,
        },
      ]);
      onToast({ message: `Hotovo (${res.images.length}x). Ukládám do galerie…`, type: 'success' });

      for (const out of res.images) {
        try {
          const usedModelName = SDXL_BASE_MODEL;
          const usedLoras = lorasPayload.length ? lorasPayload : null;

          const thumb = await createThumbnail(out, 420);
          await saveToGallery({
            url: out,
            thumbnail: thumb,
            prompt: 'img2img',
            resolution: undefined,
            aspectRatio: undefined,
            params: {
              engine: 'fal_lora_img2img',
              modelName: usedModelName,
              loras: usedLoras,
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
      const msg = String(err?.message || 'Generování selhalo.');
      setGenError(msg);
      onToast({ message: msg, type: 'error' });
    } finally {
      setIsGenerating(false);
      setGenProgress(1);
      setGenPhase('');
      setGenCompletedAtMs(Date.now());
      // Let the UI settle for a moment before resetting.
      setTimeout(() => {
        setGenProgress(0);
      }, 350);
    }
  }, [
    cfg,
    denoise,
    input,
    onToast,
    steps,
    variants,
    loras,
    lorasEnabled,
    setPreviewImages,
  ]);

  const latestBatch = batches.length ? batches[batches.length - 1] : null;
  const progressPct = Math.max(0, Math.min(100, Math.round(genProgress * 100)));

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[340px] shrink-0 h-full overflow-y-auto custom-scrollbar border-r border-white/5 bg-[var(--bg-card)] text-[11px]">
        <div className="p-6 flex flex-col gap-6 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">LoRA / SD Generátor</h2>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={!input || isGenerating}
            className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none"
          >
            {isGenerating ? 'Generuji…' : 'Generovat'}
          </button>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Počet obrázků</div>
            <div className="border-b border-white/10">
              <div className="flex">
                {[1, 2, 3].map((n) => {
                  const active = variants === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setVariants(n as 1 | 2 | 3)}
                      className={`relative flex-1 py-2 text-center text-[11px] font-black transition-colors ${
                        active ? 'text-[#7ed957]' : 'text-white/45 hover:text-white/75'
                      }`}
                      aria-label={`Počet obrázků: ${n}`}
                    >
                      {n}
                      <span
                        className={`absolute left-2 right-2 bottom-[-1px] h-[2px] rounded-full transition-colors ${
                          active ? 'bg-[#7ed957]' : 'bg-transparent'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card-surface p-3 space-y-2">
            <div className="space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Referenční obrázek</div>
              <div
                className="relative aspect-[16/9] rounded-lg border border-dashed border-[var(--border-color)] hover:border-[var(--text-secondary)] bg-[var(--bg-panel)]/50 transition-all overflow-hidden cursor-pointer"
                onClick={() => document.getElementById(inputFileId)?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  try {
                    const f = e.dataTransfer?.files?.[0];
                    if (f) {
                      await setInputFromFile(f);
                      return;
                    }
                    const mulen = e.dataTransfer?.getData('application/x-mulen-image') || '';
                    if (mulen) {
                      try {
                        const parsed = JSON.parse(mulen);
                        const u = String(parsed?.url || '').trim();
                        if (u) {
                          await setInputFromUrlOrData(u);
                          return;
                        }
                      } catch {
                        // ignore
                      }
                    }
                    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
                    if (url.trim()) await setInputFromUrlOrData(url.trim());
                  } catch (err: any) {
                    onToast({ message: String(err?.message || 'Nepodařilo se načíst dropnutý obrázek.'), type: 'error' });
                  }
                }}
              >
                {input ? (
                  <img src={input.dataUrl} alt="Vstup" className="w-full h-full object-cover opacity-90" draggable={false} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-gray-600" />
                  </div>
                )}

                {input && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInput(null);
                    }}
                    className="absolute top-1.5 right-1.5 px-2 py-1 bg-black/60 hover:bg-black/75 text-white/80 rounded-md text-[9px] font-bold uppercase tracking-wider"
                  >
                    Odebrat
                  </button>
                )}

                <input
                  id={inputFileId}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const inputEl = e.currentTarget;
                    const f = e.target.files?.[0];
                    if (!f) return;
                    await setInputFromFile(f);
                    inputEl.value = '';
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Backend</div>
            <div className="rounded-xl p-2 text-left border border-[#7ed957]/25 bg-[#7ed957]/8">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#7ed957]">fal.ai</div>
              <div className="text-[9px] text-white/40 mt-1">
                SDXL base + LoRA (rychlý workflow). Checkpointy teď nepoužíváme.
              </div>
            </div>
            <div className="text-[9px] text-white/35">
              Model: <span className="text-white/55">{SDXL_BASE_MODEL}</span>
            </div>
          </div>

          <div className="card-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-white/80 font-bold">LoRA</div>
              <div className="text-[11px] text-white/45">{loras.length}/4</div>
            </div>

            <div className="text-[11px] text-white/45">
              LoRA je volitelné. Multi‑LoRA je schované v <span className="text-white/70 font-bold">Advanced</span>.
            </div>

            <div className="space-y-2">
              <label className="block text-[9px] font-bold text-white/60 uppercase tracking-wider">LoRA (moje HF)</label>
              <select
                value={(() => {
                  const cur = loras[0]?.path?.trim();
                  if (!cur) return '';
                  const hit = MULENMARA_LORAS.find((p) => p.url === cur);
                  return hit?.id || '';
                })()}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    setLoras([]);
                    return;
                  }
                  const p = MULENMARA_LORAS.find((x) => x.id === id);
                  if (!p) return;
                  const newId = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
                  setLoras([{ id: newId, path: p.url, scale: 0.85 }]);
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[9px] text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
              >
                <option value="">(žádná)</option>
                {MULENMARA_LORAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              {loras[0] && (
                <div className="border border-zinc-800/60 rounded-xl p-3 bg-zinc-950/20">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-white/45">Váha</div>
                    <button
                      type="button"
                      onClick={() => setLoras([])}
                      className="text-[11px] text-white/45 hover:text-white/70"
                      title="Odebrat LoRA"
                    >
                      odebrat
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.05"
                      value={loras[0].scale}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setLoras((prev) => (prev[0] ? [{ ...prev[0], scale: v }, ...prev.slice(1)] : prev));
                      }}
                      className="flex-1 range-green"
                    />
                    <div className="text-[11px] text-white/60 w-10 text-right">{loras[0].scale.toFixed(2)}</div>
                  </div>
                </div>
              )}
            </div>

            <details className="pt-1">
              <summary className="cursor-pointer select-none text-xs text-white/55 hover:text-white/75">
                Advanced (multi‑LoRA)
              </summary>
              <div className="mt-3 space-y-3">
                <div className="border border-zinc-800/60 rounded-xl p-3 bg-zinc-950/20">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-white/70 font-bold">R2 upload (rychlé)</div>
                      <div className="mt-1 text-[10px] text-white/40">
                        Nahraj LoRA do Cloudflare R2 a použij ji jako <span className="text-white/60 font-mono">r2://soubor.safetensors</span>.
                      </div>
                    </div>
                    <label
                      htmlFor={loraUploadInputId}
                      className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                        uploadingLora
                          ? 'bg-zinc-900/30 text-zinc-400 border-zinc-700/70 cursor-not-allowed opacity-60'
                          : 'bg-zinc-900/30 text-zinc-200 border-zinc-700/70 hover:border-zinc-500/60 cursor-pointer'
                      }`}
                      title="Nahrát .safetensors do R2"
                    >
                      {uploadingLora ? 'Nahrávám…' : 'Nahrát LoRA'}
                    </label>
                    <input
                      id={loraUploadInputId}
                      type="file"
                      accept=".safetensors"
                      className="hidden"
                      disabled={uploadingLora}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.currentTarget.value = '';
                        if (!file) return;
                        try {
                          setUploadingLora(true);
                          setUploadLoraProgress(0);
                          const key = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
                          const { signedUrl } = await presignR2({ op: 'put', key, expires: 3600 });

                          await new Promise<void>((resolve, reject) => {
                            const xhr = new XMLHttpRequest();
                            xhr.open('PUT', signedUrl, true);
                            xhr.upload.onprogress = (evt) => {
                              if (!evt.lengthComputable) return;
                              setUploadLoraProgress(Math.max(0, Math.min(1, evt.loaded / evt.total)));
                            };
                            xhr.onload = () => {
                              if (xhr.status >= 200 && xhr.status < 300) resolve();
                              else if (xhr.status === 0) {
                                reject(
                                  new Error(
                                    'Upload selhal (network/CORS). V Cloudflare R2 bucketu nastav CORS: Allowed Origins = https://mulennano.netlify.app (pripadne i unikatni deploy URL), Allowed Methods = PUT,GET,HEAD, Allowed Headers = *, Expose Headers = ETag.'
                                  )
                                );
                              } else reject(new Error(`Upload selhal (HTTP ${xhr.status})`));
                            };
                            xhr.onerror = () =>
                              reject(
                                new Error(
                                  'Upload selhal (network/CORS). V Cloudflare R2 bucketu nastav CORS: Allowed Origins = https://mulennano.netlify.app (pripadne i unikatni deploy URL), Allowed Methods = PUT,GET,HEAD, Allowed Headers = *, Expose Headers = ETag.'
                                )
                              );
                            xhr.send(file);
                          });

                          addLora(`r2://${key}`);
                          onToast({ message: `LoRA nahraná do R2: ${key}`, type: 'success' });
                        } catch (err: any) {
                          onToast({ message: String(err?.message || 'Upload selhal.'), type: 'error' });
                        } finally {
                          setUploadingLora(false);
                          setUploadLoraProgress(0);
                        }
                      }}
                    />
                  </div>
                  {uploadingLora && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] text-white/60">
                        <span>Nahrávání</span>
                        <span className="tabular-nums">{Math.round(uploadLoraProgress * 100)}%</span>
                      </div>
                      <div className="mt-2 h-[8px] rounded-full bg-white/10 overflow-hidden border border-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#7ed957]/35 via-[#7ed957] to-[#7ed957]/35 transition-[width] duration-150 ease-out"
                          style={{ width: `${Math.round(uploadLoraProgress * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {loras.length > 0 && (
                  <div className="space-y-3">
                    {loras.map((l) => (
                      <div key={l.id} className="border border-zinc-800/60 rounded-xl p-3 bg-zinc-950/20">
                        <div className="flex items-start gap-2">
                          <input
                            value={l.path}
                            onChange={(e) =>
                              setLoras((prev) => prev.map((x) => (x.id === l.id ? { ...x, path: e.target.value } : x)))
                            }
                            placeholder="URL na .safetensors"
                            className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[9px] text-[var(--text-primary)] placeholder-white/25 focus:outline-none focus:border-[#7ed957]/60"
                          />
                          <button
                            type="button"
                            onClick={() => setLoras((prev) => prev.filter((x) => x.id !== l.id))}
                            className="px-3 py-2 rounded-lg bg-zinc-900/30 text-white/60 border border-zinc-700/60 hover:text-white/80 hover:border-zinc-500/60 text-xs font-bold uppercase tracking-wider"
                            title="Odebrat LoRA"
                          >
                            X
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="text-[11px] text-white/45 w-14">váha</div>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.05"
                            value={l.scale}
                            onChange={(e) =>
                              setLoras((prev) =>
                                prev.map((x) => (x.id === l.id ? { ...x, scale: Number(e.target.value) } : x))
                              )
                            }
                            className="flex-1 range-green"
                          />
                          <div className="text-[11px] text-white/60 w-10 text-right">{l.scale.toFixed(2)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2">
                  <select
                    value={newLoraPresetId}
                    onChange={(e) => setNewLoraPresetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[9px] text-[var(--text-primary)] focus:outline-none focus:border-[#7ed957]/60"
                  >
                    <option value="">Přidat z mých LoRA…</option>
                    {MULENMARA_LORAS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                    <option value="__r2_tuymans">LoRA: Tuymans (R2, po uploadu)</option>
                  </select>
                  <button
                    type="button"
                    disabled={!newLoraPresetId || loras.length >= 4}
                    onClick={() => {
                      if (newLoraPresetId === '__r2_tuymans') {
                        addLora('r2://lora_tuymans_style.safetensors');
                      } else {
                        const p = MULENMARA_LORAS.find((x) => x.id === newLoraPresetId);
                        if (p) addLora(p.url);
                      }
                      setNewLoraPresetId('');
                    }}
                    className="px-3 py-2 rounded-lg bg-zinc-900/30 text-zinc-200 border border-zinc-700/70 hover:border-zinc-500/60 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                  >
                    Přidat
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    value={newLoraUrl}
                    onChange={(e) => setNewLoraUrl(e.target.value)}
                    placeholder="nebo vlož URL LoRA…"
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[9px] text-[var(--text-primary)] placeholder-white/25 focus:outline-none focus:border-[#7ed957]/60"
                  />
                  <button
                    type="button"
                    disabled={!newLoraUrl.trim() || loras.length >= 4}
                    onClick={() => {
                      addLora(newLoraUrl);
                      setNewLoraUrl('');
                    }}
                    className="px-3 py-2 rounded-lg bg-zinc-900/30 text-zinc-200 border border-zinc-700/70 hover:border-zinc-500/60 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </aside>

      <section className="flex-1 min-w-0 h-full overflow-y-auto custom-scrollbar text-[11px]">
        <div className="sticky top-0 z-10 backdrop-blur-md bg-black/25 border-b border-zinc-800/60">
          <div className="p-4 flex flex-wrap items-center gap-3">
            <div className="text-[11px] font-[900] uppercase tracking-[0.25em] text-white/70 mr-2">Nastavení vah</div>

            <div className="flex items-center gap-2">
              <div className="text-[11px] text-white/45">Denoise</div>
              <input
                type="range"
                min="0.01"
                max="1"
                step="0.01"
                value={denoise}
                onChange={(e) => setDenoise(Number(e.target.value))}
                className="w-[140px] range-green"
              />
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="1"
                value={denoise}
                onChange={(e) => setDenoise(Number(e.target.value))}
                className="w-20 px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="text-[11px] text-white/45">CFG</div>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="30"
                value={cfg}
                onChange={(e) => setCfg(Number(e.target.value))}
                className="w-20 px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="text-[11px] text-white/45">Steps</div>
              <input
                type="number"
                step="1"
                min="1"
                max="200"
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                className="w-20 px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <button
              type="button"
              onClick={() => setLorasEnabled((v) => !v)}
              className={`ml-auto px-3 py-2 rounded-lg text-[11px] font-bold border ${
                lorasEnabled
                  ? 'bg-[#7ed957] text-[#0a0f0d] border-[#7ed957]/50'
                  : 'bg-zinc-900/30 text-zinc-200 border-zinc-700/70 hover:border-zinc-500/60'
              }`}
              title="Rychle zapnout/vypnout LoRA bez mazání"
            >
              LoRA {lorasEnabled ? 'ON' : 'OFF'}
            </button>

            {/* ControlNet will be reintroduced later as part of the "robust" generator. */}
          </div>
        </div>

        <div className="p-6">
          {(isGenerating || genProgress > 0) && (
            <div className="mb-5 card-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-widest text-white/70 font-bold">
                  {genPhase || (isGenerating ? 'Generuji…' : 'Dokončeno')}
                </div>
                <div className="text-[10px] text-white/45 tabular-nums">{progressPct}%</div>
              </div>
              <div className="mt-2 h-[10px] rounded-full bg-white/5 overflow-hidden border border-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#7ed957]/35 via-[#7ed957] to-[#7ed957]/35 transition-[width] duration-200 ease-out shadow-[0_0_18px_rgba(126,217,87,0.25)]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-2 text-[10px] text-white/40">
                {isGenerating
                  ? 'Pozn.: progress je odhad (backend neposílá průběh kroků).'
                  : genCompletedAtMs
                    ? `Hotovo před ${Math.max(0, Math.round((Date.now() - genCompletedAtMs) / 1000))}s.`
                    : null}
              </div>
              {lastSubmitInfo && (
                <div className="mt-2 text-[10px] text-white/30">
                  Model: <span className="text-white/50 break-all">{lastSubmitInfo.modelName}</span>
                  {lastSubmitInfo.loras.length ? <span className="text-white/25"> · </span> : null}
                  {lastSubmitInfo.loras.length ? (
                    <span className="text-white/45">
                      LoRA: {lastSubmitInfo.loras.map((l) => `${l.scale.toFixed(2)}×`).join(' ')}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {genError && !isGenerating && (
            <div className="mb-5 card-surface p-4 border border-rose-400/20">
              <div className="text-[10px] uppercase tracking-widest text-rose-200/80 font-bold">Chyba</div>
              <div className="mt-1 text-[11px] text-white/65">{genError}</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[0, 1, 2].map((idx) => {
              const img = previewImages[idx];
              const showProgress = isGenerating && !img && idx < variants;
              const slotEnabled = idx < variants;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!img || !slotEnabled}
                  className={`card-surface p-2 border border-zinc-800/60 rounded-2xl overflow-hidden ${
                    img ? 'hover:border-zinc-500/60' : 'opacity-60 cursor-default'
                  }`}
                  onClick={() => {
                    if (!img) return;
                    setLightbox(img.dataUrl);
                  }}
                  title={img ? 'Zvětšit' : slotEnabled ? 'Zatím prázdné' : 'Vypnuto'}
                >
                  <div className="relative">
                    {img ? (
                      <img
                        src={img.dataUrl}
                        alt={`Výstup ${idx + 1}`}
                        className="w-full aspect-square object-cover bg-black/20 rounded-xl"
                      />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center text-[11px] text-white/35 bg-black/20 rounded-xl">
                        {slotEnabled ? `Varianta ${idx + 1}` : 'Vypnuto'}
                      </div>
                    )}

                    {showProgress && (
                      <div className="absolute inset-0 rounded-xl overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/55" />
                        <div className="absolute left-3 right-3 bottom-3">
                          <div className="flex items-center justify-between text-[10px] text-white/60">
                            <span>{genPhase || 'Generuji…'}</span>
                            <span className="tabular-nums">{progressPct}%</span>
                          </div>
                          <div className="mt-2 h-[8px] rounded-full bg-white/10 overflow-hidden border border-white/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#7ed957]/35 via-[#7ed957] to-[#7ed957]/35 transition-[width] duration-200 ease-out"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {batches.length > 0 && (
            <details className="mt-6 card-surface p-4">
              <summary className="cursor-pointer select-none text-xs uppercase tracking-widest text-white/70 font-bold">
                Historie ({batches.reduce((a, b) => a + b.images.length, 0)})
              </summary>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {batches
                  .slice()
                  .reverse()
                  .flatMap((b) => b.images)
                  .map((o, i) => (
                    <button
                      key={o.id}
                      type="button"
                      className="border border-zinc-700/70 bg-black/20 rounded-xl overflow-hidden hover:border-zinc-500/60 transition-colors"
                      onClick={() => setLightbox(o.dataUrl)}
                      title="Otevřít"
                    >
                      <img src={o.dataUrl} alt={`History ${i + 1}`} className="w-full h-[180px] object-cover" />
                    </button>
                  ))}
              </div>
            </details>
          )}
        </div>
      </section>

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
