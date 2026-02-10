import React from 'react';
import { Plus, X } from 'lucide-react';
import { runFalLoraImg2ImgQueued } from '../services/falService';
import { presignR2, isR2Ref, r2KeyFromRef } from '../services/r2Service';
import { createThumbnail, saveToGallery, deleteImage as deleteGeneratedImage } from '../utils/galleryDB';
import { dataUrlToBlob } from '../utils/supabaseStorage';

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

type EmbeddingItem = {
  id: string;
  path: string;
  token: string;
};

type ControlNetItem = {
  id: string;
  path: string;
  imageUrl: string;
  conditioningScale: number;
  startStep: number;
  endStep: number;
};

type IPAdapterItem = {
  id: string;
  path: string;
  imageUrl: string;
  maskUrl: string;
  scale: number;
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
    // Prefer Cloudflare R2 (fast, avoids HF CDN flakiness / timeouts for large LoRA files).
    // This resolves into a short-lived signed GET URL via /api/r2-presign before calling fal.ai.
    url: 'r2://loras/lora_tuymans_style.safetensors',
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

  // Prefer jpeg for upload payload size.
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
  const [falPhase, setFalPhase] = React.useState<'' | 'queue' | 'running' | 'finalizing'>('');
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

  const [embeddings, setEmbeddings] = React.useState<EmbeddingItem[]>([]);
  const [controlnets, setControlnets] = React.useState<ControlNetItem[]>([]);
  const [controlnetGuessMode, setControlnetGuessMode] = React.useState(false);
  const [ipAdapters, setIpAdapters] = React.useState<IPAdapterItem[]>([]);

  const [imageEncoderPath, setImageEncoderPath] = React.useState('');
  const [imageEncoderSubfolder, setImageEncoderSubfolder] = React.useState('');
  const [imageEncoderWeightName, setImageEncoderWeightName] = React.useState('pytorch_model.bin');

  const [icLightModelUrl, setIcLightModelUrl] = React.useState('');
  const [icLightModelBackgroundImageUrl, setIcLightModelBackgroundImageUrl] = React.useState('');
  const [icLightImageUrl, setIcLightImageUrl] = React.useState('');

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generated, setGenerated] = React.useState<OutputItem[]>([]);
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

  const addEmbedding = React.useCallback((path?: string) => {
    const p = String(path || '').trim();
    setEmbeddings((prev) => {
      if (prev.length >= 6) return prev;
      const id = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      return [...prev, { id, path: p, token: '' }];
    });
  }, []);

  const addControlNet = React.useCallback((path?: string) => {
    const p = String(path || '').trim();
    setControlnets((prev) => {
      if (prev.length >= 3) return prev;
      const id = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      return [
        ...prev,
        {
          id,
          path: p,
          imageUrl: '',
          conditioningScale: 0.8,
          startStep: 0,
          endStep: 1,
        },
      ];
    });
  }, []);

  const addIpAdapter = React.useCallback((path?: string) => {
    const p = String(path || '').trim();
    setIpAdapters((prev) => {
      if (prev.length >= 2) return prev;
      const id = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      return [...prev, { id, path: p, imageUrl: '', maskUrl: '', scale: 0.6 }];
    });
  }, []);

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
    setGenPhase('Připravuji…');
    setGenProgress(0.04);
    setGenError('');

    const pendingItems: OutputItem[] = Array.from({ length: variants }).map((_, idx) => ({
      id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${idx}`,
      status: 'pending',
    }));
    const pendingIdSet = new Set(pendingItems.map((p) => p.id));
    // Match Mulen Nano behavior: newest run appears first in the grid.
    setGenerated((prev) => [...pendingItems, ...prev]);

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
      setGenPhase('Ve frontě…');
      setFalPhase('queue');
      setGenProgress((p) => Math.max(p, 0.34));
      setGenPhase('Generuji…');
      res = await runFalLoraImg2ImgQueued({
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
        embeddings: embeddings
          .map((e) => ({ path: e.path.trim(), token: e.token.trim() || undefined }))
          .filter((e) => !!e.path),
        controlnets: controlnets
          .map((c) => ({
            path: c.path.trim(),
            image_url: (c.imageUrl.trim() || inputDataUrl).trim(),
            conditioning_scale: c.conditioningScale,
            start_step: c.startStep,
            end_step: c.endStep,
          }))
          .filter((c) => !!c.path),
        controlnetGuessMode,
        ipAdapter: ipAdapters
          .map((a) => ({
            path: a.path.trim(),
            ip_adapter_image_url: (a.imageUrl.trim() || inputDataUrl).trim(),
            ip_adapter_mask_url: a.maskUrl.trim() || undefined,
            scale: a.scale,
          }))
          .filter((a) => !!a.path),
        imageEncoderPath: imageEncoderPath.trim() || undefined,
        imageEncoderSubfolder: imageEncoderSubfolder.trim() || undefined,
        imageEncoderWeightName: imageEncoderWeightName.trim() || undefined,
        icLightModelUrl: icLightModelUrl.trim() || undefined,
        icLightModelBackgroundImageUrl: icLightModelBackgroundImageUrl.trim() || undefined,
        icLightImageUrl: icLightImageUrl.trim() || undefined,
        onPhase: (p) => {
          setFalPhase(p);
          setGenPhase(p === 'queue' ? 'Ve frontě…' : p === 'running' ? 'Generuji…' : 'Dokončuji…');
        },
        maxWaitMs: 12 * 60_000,
      });

      setLastSeed(typeof res.usedSeed === 'number' ? res.usedSeed : null);

      const resolved = pendingItems.map((p, i) => ({
        id: p.id,
        dataUrl: res.images[i],
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

      onToast({ message: `Hotovo (${res.images.length}x). Ukládám do galerie…`, type: 'success' });

      for (const outItem of resolved) {
        try {
          const usedModelName = SDXL_BASE_MODEL;
          const usedLoras = lorasPayload.length ? lorasPayload : null;

          const thumb = await createThumbnail(outItem.dataUrl || '', 420);
          await saveToGallery({
            id: outItem.id,
            url: outItem.dataUrl || '',
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
              controlnets: controlnets.length ? controlnets.map((c) => ({ path: c.path, conditioningScale: c.conditioningScale })) : null,
              ipAdapter: ipAdapters.length ? ipAdapters.map((a) => ({ path: a.path, scale: a.scale })) : null,
            },
          });
        } catch {
          // Gallery save failures shouldn't break the result display.
        }
      }
    } catch (err: any) {
      const msg = String(err?.message || 'Generování selhalo.');
      setGenError(msg);
      setGenerated((prev) => prev.filter((it) => !pendingIdSet.has(it.id)));
      onToast({ message: msg, type: 'error' });
    } finally {
      setIsGenerating(false);
      setFalPhase('');
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
    embeddings,
    controlnets,
    controlnetGuessMode,
    ipAdapters,
    imageEncoderPath,
    imageEncoderSubfolder,
    imageEncoderWeightName,
    icLightModelUrl,
    icLightModelBackgroundImageUrl,
    icLightImageUrl,
    setGenerated,
  ]);

  const falPhaseLabel =
    falPhase === 'queue' ? 'Ve frontě' : falPhase === 'running' ? 'Generuji' : falPhase === 'finalizing' ? 'Dokončuji' : '';

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
                      className={`relative flex-1 py-2 text-center text-[11px] font-black transition-colors ${active ? 'text-[#7ed957]' : 'text-white/45 hover:text-white/75'
                        }`}
                      aria-label={`Počet obrázků: ${n}`}
                    >
                      {n}
                      <span
                        className={`absolute left-2 right-2 bottom-[-1px] h-[2px] rounded-full transition-colors ${active ? 'bg-[#7ed957]' : 'bg-transparent'
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
                      className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border ${uploadingLora
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
                  </select>
                  <button
                    type="button"
                    disabled={!newLoraPresetId || loras.length >= 4}
                    onClick={() => {
                      const p = MULENMARA_LORAS.find((x) => x.id === newLoraPresetId);
                      if (p) addLora(p.url);
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
            <div className="text-[11px] font-[900] uppercase tracking-[0.25em] text-white/70 mr-2">fal.ai ovladače</div>

            <div className="flex items-center gap-2">
              <div className="text-[11px] text-white/45">Denoise</div>
              <input
                type="range"
                min="0.01"
                max="1"
                step="0.01"
                value={denoise}
                onChange={(e) => setDenoise(Number(e.target.value))}
                className="w-[160px] range-green"
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

            {/* LoRA quick list */}
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-white/45">LoRA</div>
              <button
                type="button"
                onClick={() => addLora(MULENMARA_LORAS[0]?.url || '')}
                className="px-2 py-1 rounded-lg bg-zinc-900/30 text-zinc-200 border border-zinc-700/70 hover:border-zinc-500/60 text-[10px] font-bold uppercase tracking-wider"
                title="Přidat Tuymans LoRA"
              >
                + Tuymans
              </button>
              <div className="text-[10px] text-white/35 tabular-nums">{loras.length}×</div>
            </div>

            {/* Embeddings */}
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-white/45">Embeddings</div>
              <button
                type="button"
                onClick={() => addEmbedding()}
                className="px-2 py-1 rounded-lg bg-zinc-900/30 text-zinc-200 border border-zinc-700/70 hover:border-zinc-500/60 text-[10px] font-bold uppercase tracking-wider"
                title="Přidat embedding"
              >
                + Add
              </button>
              <div className="text-[10px] text-white/35 tabular-nums">{embeddings.length}×</div>
            </div>

            {/* ControlNets */}
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-white/45">ControlNets</div>
              <button
                type="button"
                onClick={() => addControlNet()}
                className="px-2 py-1 rounded-lg bg-zinc-900/30 text-zinc-200 border border-zinc-700/70 hover:border-zinc-500/60 text-[10px] font-bold uppercase tracking-wider"
              >
                + Add
              </button>
              <label className="flex items-center gap-2 text-[10px] text-white/45 select-none">
                <input
                  type="checkbox"
                  checked={controlnetGuessMode}
                  onChange={(e) => setControlnetGuessMode(e.target.checked)}
                />
                guess
              </label>
              <div className="text-[10px] text-white/35 tabular-nums">{controlnets.length}×</div>
            </div>

            {/* IP-Adapter */}
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-white/45">IP-Adapter</div>
              <button
                type="button"
                onClick={() => addIpAdapter()}
                className="px-2 py-1 rounded-lg bg-zinc-900/30 text-zinc-200 border border-zinc-700/70 hover:border-zinc-500/60 text-[10px] font-bold uppercase tracking-wider"
              >
                + Add
              </button>
              <div className="text-[10px] text-white/35 tabular-nums">{ipAdapters.length}×</div>
            </div>

            {/* IC-Light */}
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-white/45">IC-Light</div>
              <div className="text-[10px] text-white/35">{icLightModelUrl.trim() ? 'ON' : 'OFF'}</div>
            </div>

            <button
              type="button"
              onClick={() => setLorasEnabled((v) => !v)}
              className={`ml-auto px-3 py-2 rounded-lg text-[11px] font-bold border ${lorasEnabled
                  ? 'bg-[#7ed957] text-[#0a0f0d] border-[#7ed957]/50'
                  : 'bg-zinc-900/30 text-zinc-200 border-zinc-700/70 hover:border-zinc-500/60'
                }`}
              title="Rychle zapnout/vypnout LoRA bez mazání"
            >
              LoRA {lorasEnabled ? 'ON' : 'OFF'}
            </button>

          </div>

          {/* Inline editors (kept compact; still always visible) */}
          {(embeddings.length > 0 || controlnets.length > 0 || ipAdapters.length > 0 || icLightModelUrl || imageEncoderPath) && (
            <div className="px-4 pb-4 grid grid-cols-1 gap-3">
              {embeddings.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {embeddings.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 border border-zinc-800/60 rounded-xl px-3 py-2 bg-zinc-950/20">
                      <input
                        value={e.path}
                        onChange={(ev) => setEmbeddings((prev) => prev.map((x) => (x.id === e.id ? { ...x, path: ev.target.value } : x)))}
                        placeholder="embedding path/url"
                        className="w-[260px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                      />
                      <input
                        value={e.token}
                        onChange={(ev) => setEmbeddings((prev) => prev.map((x) => (x.id === e.id ? { ...x, token: ev.target.value } : x)))}
                        placeholder="token (volit.)"
                        className="w-[140px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => setEmbeddings((prev) => prev.filter((x) => x.id !== e.id))}
                        className="px-2 py-1 rounded-lg bg-zinc-900/30 text-white/60 border border-zinc-700/60 hover:text-white/80 hover:border-zinc-500/60 text-[10px] font-bold uppercase tracking-wider"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {controlnets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {controlnets.map((c) => (
                    <div key={c.id} className="border border-zinc-800/60 rounded-xl p-3 bg-zinc-950/20 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={c.path}
                          onChange={(ev) => setControlnets((prev) => prev.map((x) => (x.id === c.id ? { ...x, path: ev.target.value } : x)))}
                          placeholder="controlnet path/url"
                          className="w-[320px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                        />
                        <input
                          value={c.imageUrl}
                          onChange={(ev) => setControlnets((prev) => prev.map((x) => (x.id === c.id ? { ...x, imageUrl: ev.target.value } : x)))}
                          placeholder="image_url (prázdné = vstup)"
                          className="w-[320px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                        />
                        <button
                          type="button"
                          onClick={() => setControlnets((prev) => prev.filter((x) => x.id !== c.id))}
                          className="px-2 py-1 rounded-lg bg-zinc-900/30 text-white/60 border border-zinc-700/60 hover:text-white/80 hover:border-zinc-500/60 text-[10px] font-bold uppercase tracking-wider"
                        >
                          X
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-[10px] text-white/45 w-20">scale</div>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.05"
                          value={c.conditioningScale}
                          onChange={(ev) => setControlnets((prev) => prev.map((x) => (x.id === c.id ? { ...x, conditioningScale: Number(ev.target.value) } : x)))}
                          className="w-[180px] range-green"
                        />
                        <div className="text-[10px] text-white/55 w-12 tabular-nums">{c.conditioningScale.toFixed(2)}</div>
                        <div className="text-[10px] text-white/45">start</div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={c.startStep}
                          onChange={(ev) => setControlnets((prev) => prev.map((x) => (x.id === c.id ? { ...x, startStep: Number(ev.target.value) } : x)))}
                          className="w-20 px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)]"
                        />
                        <div className="text-[10px] text-white/45">end</div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={c.endStep}
                          onChange={(ev) => setControlnets((prev) => prev.map((x) => (x.id === c.id ? { ...x, endStep: Number(ev.target.value) } : x)))}
                          className="w-20 px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {ipAdapters.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {ipAdapters.map((a) => (
                    <div key={a.id} className="border border-zinc-800/60 rounded-xl p-3 bg-zinc-950/20 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={a.path}
                          onChange={(ev) => setIpAdapters((prev) => prev.map((x) => (x.id === a.id ? { ...x, path: ev.target.value } : x)))}
                          placeholder="ip-adapter path/url"
                          className="w-[320px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                        />
                        <input
                          value={a.imageUrl}
                          onChange={(ev) => setIpAdapters((prev) => prev.map((x) => (x.id === a.id ? { ...x, imageUrl: ev.target.value } : x)))}
                          placeholder="image_url (prázdné = vstup)"
                          className="w-[260px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                        />
                        <input
                          value={a.maskUrl}
                          onChange={(ev) => setIpAdapters((prev) => prev.map((x) => (x.id === a.id ? { ...x, maskUrl: ev.target.value } : x)))}
                          placeholder="mask_url (volit.)"
                          className="w-[220px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                        />
                        <button
                          type="button"
                          onClick={() => setIpAdapters((prev) => prev.filter((x) => x.id !== a.id))}
                          className="px-2 py-1 rounded-lg bg-zinc-900/30 text-white/60 border border-zinc-700/60 hover:text-white/80 hover:border-zinc-500/60 text-[10px] font-bold uppercase tracking-wider"
                        >
                          X
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-[10px] text-white/45 w-20">scale</div>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.05"
                          value={a.scale}
                          onChange={(ev) => setIpAdapters((prev) => prev.map((x) => (x.id === a.id ? { ...x, scale: Number(ev.target.value) } : x)))}
                          className="w-[180px] range-green"
                        />
                        <div className="text-[10px] text-white/55 w-12 tabular-nums">{a.scale.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <div className="border border-zinc-800/60 rounded-xl p-3 bg-zinc-950/20 flex flex-wrap items-center gap-2">
                  <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Image Encoder</div>
                  <input
                    value={imageEncoderPath}
                    onChange={(e) => setImageEncoderPath(e.target.value)}
                    placeholder="image_encoder_path"
                    className="w-[260px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                  />
                  <input
                    value={imageEncoderSubfolder}
                    onChange={(e) => setImageEncoderSubfolder(e.target.value)}
                    placeholder="subfolder"
                    className="w-[140px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                  />
                  <input
                    value={imageEncoderWeightName}
                    onChange={(e) => setImageEncoderWeightName(e.target.value)}
                    placeholder="weight_name"
                    className="w-[160px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                  />
                </div>

                <div className="border border-zinc-800/60 rounded-xl p-3 bg-zinc-950/20 flex flex-wrap items-center gap-2">
                  <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">IC-Light</div>
                  <input
                    value={icLightModelUrl}
                    onChange={(e) => setIcLightModelUrl(e.target.value)}
                    placeholder="ic_light_model_url"
                    className="w-[260px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                  />
                  <input
                    value={icLightModelBackgroundImageUrl}
                    onChange={(e) => setIcLightModelBackgroundImageUrl(e.target.value)}
                    placeholder="background image url"
                    className="w-[220px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                  />
                  <input
                    value={icLightImageUrl}
                    onChange={(e) => setIcLightImageUrl(e.target.value)}
                    placeholder="ic_light_image_url"
                    className="w-[220px] px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6">
          {/* Progress is rendered only in the output slots (single indicator). */}

          {genError && !isGenerating && (
            <div className="mb-5 card-surface p-4 border border-rose-400/20">
              <div className="text-[10px] uppercase tracking-widest text-rose-200/80 font-bold">Chyba</div>
              <div className="mt-1 text-[11px] text-white/65">{genError}</div>
            </div>
          )}

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
                    <div
                      className="relative bg-black/50 aspect-square overflow-hidden"
                      title={canOpen ? 'Klikni pro plné zobrazení' : 'Generuji…'}
                    >
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
                            } catch {
                              // ignore
                            }
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
