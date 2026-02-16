import React from 'react';
import { Plus, X } from 'lucide-react';
import { runFalLoraImg2ImgQueued } from '../../services/falService';
import { runA1111Img2Img } from '../../services/a1111Service';
import { createThumbnail, saveToGallery, deleteImage as deleteGeneratedImage } from '../../utils/galleryDB';
import { isR2Ref, parseR2Ref, presignR2 } from '../../services/r2Service';
import { fetchPublicConfig } from '../../services/publicConfig';

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

type FalLogLine = { message: string; level?: string; timestamp?: string };

function pickDownloadProgressLine(lines: FalLogLine[]): string {
  // Keep this minimal and human, not a wall of logs.
  // Examples seen in fal logs:
  // "6.25GB [03:11, 31.1MB/s]" / "6.34GB [03:13, 42.1MB/s]"
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const m = String(lines[i]?.message || '').trim();
    if (!m) continue;
    if (/\b\d+(?:\.\d+)?\s*GB\s*\[\d{2}:\d{2},\s*\d+(?:\.\d+)?\s*MB\/s\]/i.test(m)) return m;
    if (/\b\d+(?:\.\d+)?\s*MB\s*\[\d{2}:\d{2},\s*\d+(?:\.\d+)?\s*MB\/s\]/i.test(m)) return m;
  }
  return '';
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Nepodařilo se načíst soubor.'));
    r.readAsDataURL(file);
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

function parseJsonObject(raw: string): Record<string, any> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Advanced JSON musí být objekt.');
  }
  return parsed as Record<string, any>;
}

function buildPromptlessAutoPrompt(): string {
  // "No prompt in UI" means we keep it automatic and non-invasive.
  return 'image-to-image transformation, preserve subject identity and composition, high quality, detailed';
}

type ModelPreset = { id: string; label: string; value: string; hint?: string };

const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'tuymans-r2',
    label: 'Tuymans SDXL (R2 checkpoint)',
    value: 'r2://models/checkpoints/Tuymans_SDXL.safetensors',
    hint: 'Použije tvůj checkpoint uložený v Cloudflare R2.',
  },
  {
    id: 'sdxl-base',
    label: 'SDXL base (HF)',
    value: 'stabilityai/stable-diffusion-xl-base-1.0',
  },
];

export function ModelInfluenceScreen(props: {
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { onToast } = props;

  const [input, setInput] = React.useState<ImageSlot | null>(null);
  const [backend, setBackend] = React.useState<'fal' | 'a1111'>(() => {
    try {
      const raw = localStorage.getItem('modelInfluence.backend');
      const v = String(raw || '').trim();
      return v === 'a1111' ? 'a1111' : 'fal';
    } catch {
      return 'fal';
    }
  });
  const [cfg, setCfg] = React.useState(7);
  const [denoise, setDenoise] = React.useState(0.45);
  const [steps, setSteps] = React.useState(30);
  const [variants, setVariants] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [modelName, setModelName] = React.useState(() => {
    try {
      const raw = localStorage.getItem('modelInfluence.modelName');
      let v = String(raw || '').trim();
      // Back-compat: we deleted the old checkpoint key; if user has it cached, auto-migrate.
      if (v.includes('tuymans_style.safetensors')) {
        v = MODEL_PRESETS[0]?.value || '';
      }
      // Back-compat: if user pasted a presigned R2 URL, normalize back to our r2:// ref.
      if (v.includes('.r2.cloudflarestorage.com/models/checkpoints/') && v.includes('.safetensors')) {
        v = MODEL_PRESETS[0]?.value || v;
      }
      return v || MODEL_PRESETS[0]?.value || 'stabilityai/stable-diffusion-xl-base-1.0';
    } catch {
      return MODEL_PRESETS[0]?.value || 'stabilityai/stable-diffusion-xl-base-1.0';
    }
  });
  const [advancedRaw, setAdvancedRaw] = React.useState('');

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [genError, setGenError] = React.useState('');
  const [falPhase, setFalPhase] = React.useState<'' | 'queue' | 'running' | 'finalizing'>('');
  const [genPhase, setGenPhase] = React.useState<string>('');
  const [generated, setGenerated] = React.useState<OutputItem[]>([]);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const [falLogs, setFalLogs] = React.useState<FalLogLine[]>([]);
  const [debugResolvedUrl, setDebugResolvedUrl] = React.useState('');
  const [debugWarnings, setDebugWarnings] = React.useState<string[]>([]);
  const inputFileId = React.useMemo(() => `model-influence-input-${Math.random().toString(36).slice(2)}`, []);

  const falPhaseLabel =
    falPhase === 'queue' ? 'Ve frontě' : falPhase === 'running' ? 'Generuji' : falPhase === 'finalizing' ? 'Dokončuji' : '';

  React.useEffect(() => {
    try {
      localStorage.setItem('modelInfluence.modelName', String(modelName || ''));
    } catch {
      // ignore
    }
  }, [modelName]);

  React.useEffect(() => {
    try {
      localStorage.setItem('modelInfluence.backend', backend);
    } catch {
      // ignore
    }
  }, [backend]);

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

  const resolveModelName = React.useCallback(
    async (rawModel: string): Promise<{ resolved: string; display: string }> => {
      const clean = String(rawModel || '').trim();
      if (!clean) throw new Error('Zadej SDXL model (model_name).');
      if (!isR2Ref(clean)) return { resolved: clean, display: clean };

      const { bucket, key } = parseR2Ref(clean);
      const b = bucket || 'models';
      if (!key) throw new Error('R2 ref je prázdný.');

      // fal.ai often validates URLs via HEAD before downloading. Presigned URLs are method-specific
      // (GET-signed URL fails HEAD), so we strongly prefer a public, stable URL without query params.
      const cfg = await fetchPublicConfig();
      const base =
        b === 'models'
          ? String(cfg.r2PublicModelsBaseUrl || '').trim()
          : b === 'loras'
            ? String(cfg.r2PublicLorasBaseUrl || '').trim()
            : '';
      if (base) {
        const resolved = `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
        return { resolved, display: clean };
      }

      // Fallback: presign (may fail on some fal endpoints due to HEAD validation).
      const { signedUrl } = await presignR2({ op: 'get', bucket: b, key, expires: 24 * 3600 });
      return { resolved: signedUrl, display: clean };
    },
    []
  );

  const handleGenerate = React.useCallback(async () => {
    if (!input?.dataUrl) {
      onToast({ type: 'error', message: 'Nahraj vstupní obrázek.' });
      return;
    }
    let cleanModel = '';
    let modelDisplay = '';
    let a1111CheckpointName = '';
    if (backend === 'fal') {
      try {
        const resolved = await resolveModelName(modelName);
        modelDisplay = resolved.display;
        // fal: use full checkpoint as model_name
        cleanModel = resolved.resolved;
        setDebugResolvedUrl(resolved.resolved);
      } catch (e: any) {
        onToast({ type: 'error', message: e?.message || 'Neplatný model.' });
        return;
      }
    } else {
      // A1111: expects a local checkpoint filename/title, not a remote URL.
      const raw = String(modelName || '').trim();
      const fromUrl = (() => {
        try {
          if (raw.startsWith('http')) {
            const u = new URL(raw);
            const parts = u.pathname.split('/').filter(Boolean);
            return parts[parts.length - 1] || '';
          }
        } catch { }
        return '';
      })();
      const fromR2 = (() => {
        try {
          if (isR2Ref(raw)) {
            const { key } = parseR2Ref(raw);
            const parts = String(key || '').split('/').filter(Boolean);
            return parts[parts.length - 1] || '';
          }
        } catch { }
        return '';
      })();
      a1111CheckpointName = fromUrl || fromR2 || raw;
      if (!a1111CheckpointName) {
        onToast({ type: 'error', message: 'Zadej název checkpointu pro A1111.' });
        return;
      }
      modelDisplay = a1111CheckpointName;
      setDebugResolvedUrl(''); // not relevant for A1111
    }

    setLightbox(null);
    setFalLogs([]);
    setDebugWarnings([]);
    setIsGenerating(true);
    setGenError('');
    setFalPhase('queue');
    setGenPhase('Ve frontě…');

    const pendingItems: OutputItem[] = Array.from({ length: variants }).map((_, idx) => ({
      id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${idx}`,
      status: 'pending',
    }));
    const pendingIdSet = new Set(pendingItems.map((p) => p.id));
    setGenerated((prev) => [...pendingItems, ...prev]);

    try {
      const inputDataUrl = await shrinkDataUrl(input.dataUrl, 2_300_000);
      // For Dreamlook-style checkpoints, the trigger phrase is often required to “activate” the fine-tune.
      // Keep it implicit (no prompt UI), but include it for our built-in Tuymans preset.
      const needsTuymansTrigger =
        String(modelName || '').includes('Tuymans_SDXL.safetensors') || String(cleanModel || '').includes('Tuymans_SDXL.safetensors');
      const prompt = `${needsTuymansTrigger ? 'tuypaint, ' : ''}${buildPromptlessAutoPrompt()}`.trim();
      const advancedInput = (() => {
        // Explicit defaults (match fal schema + Dreamlook SDXL metadata).
        const base: Record<string, any> = { prediction_type: 'epsilon', image_format: 'png' };
        const extra = parseJsonObject(advancedRaw);

        // Guardrails: fal `unet_name` expects a Diffusers-formatted UNet state dict (keys like conv_in.*).
        // Passing a full .safetensors checkpoint here will hard-fail with "Missing key(s) in state_dict...".
        // If user is already passing a full checkpoint as model_name, drop unet_name to prevent silent failures.
        const warnings: string[] = [];
        const extraOut: Record<string, any> = { ...extra };
        if (typeof extraOut.unet_name === 'string' && extraOut.unet_name.trim()) {
          const unet = extraOut.unet_name.trim();
          const mdl = String(cleanModel || '').trim();
          const looksLikeFullCkpt = (s: string) => s.endsWith('.safetensors') || s.endsWith('.ckpt');
          if (mdl && looksLikeFullCkpt(mdl) && looksLikeFullCkpt(unet)) {
            delete extraOut.unet_name;
            warnings.push('Ignoruji `unet_name` (plný checkpoint patří do `model_name`, ne do `unet_name`).');
          }
          if (unet === mdl) {
            delete extraOut.unet_name;
            warnings.push('Ignoruji `unet_name` (stejná hodnota jako `model_name`).');
          }
        }
        if (warnings.length) setDebugWarnings(warnings);

        return { ...base, ...extraOut };
      })();

      const phaseHandler = (p: 'queue' | 'running' | 'finalizing') => {
        setFalPhase(p);
        setGenPhase(p === 'queue' ? 'Ve frontě…' : p === 'running' ? 'Generuji…' : 'Dokončuji…');
      };

      const negativePrompt = 'blurry, low quality, watermark, text, logo';

      const { images } =
        backend === 'fal'
          ? await runFalLoraImg2ImgQueued({
              modelName: cleanModel,
              imageUrlOrDataUrl: inputDataUrl,
              prompt,
              negativePrompt,
              cfg,
              denoise,
              steps,
              numImages: variants,
              advancedInput,
              onPhase: phaseHandler,
              onLogs: (lines) => {
                setFalLogs((prev) => {
                  const next = [...prev, ...lines].slice(-200);
                  return next;
                });
              },
              maxWaitMs: 12 * 60_000,
            })
          : await (async () => {
              setFalPhase('running');
              setGenPhase('Generuji…');
              const out = await runA1111Img2Img({
                imageDataUrl: inputDataUrl,
                prompt,
                negativePrompt,
                cfg,
                denoise,
                steps,
                batchSize: variants,
                checkpointName: a1111CheckpointName,
                onProgress: (p) => {
                  const pct = Math.round((p.progress || 0) * 100);
                  setGenPhase(p.eta ? `${pct}% • ETA ${Math.max(0, Math.round(p.eta))}s` : `${pct}%`);
                },
              });
              return { images: out.images };
            })();

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

      for (const item of resolved) {
        try {
          const thumb = await createThumbnail(item.dataUrl || '', 420);
          await saveToGallery({
            id: item.id,
            url: item.dataUrl || '',
            thumbnail: thumb,
            prompt: 'img2img',
            params: {
              engine: backend === 'fal' ? 'fal_sdxl_img2img' : 'a1111_sdxl_img2img',
              modelName: modelDisplay || String(modelName || '').trim(),
              cfg,
              strength: denoise,
              steps,
              variants,
              promptMode: 'auto_hidden',
              advancedInput: advancedRaw || null,
            },
          });
        } catch {
          // best effort only
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
  }, [advancedRaw, cfg, denoise, input?.dataUrl, modelName, onToast, steps, variants]);

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[340px] shrink-0 h-full overflow-y-auto custom-scrollbar border-r border-white/5 bg-[var(--bg-card)] text-[11px]">
        <div className="p-6 flex flex-col gap-6 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Model Influence</h2>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!input || isGenerating}
            className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none"
          >
            {isGenerating ? 'Generuji…' : 'Generovat'}
          </button>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">BACKEND</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBackend('a1111')}
                className={`flex-1 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  backend === 'a1111'
                    ? 'bg-[#0f1512] border-[#7ed957]/40 text-[#7ed957]'
                    : 'bg-[var(--bg-input)] border-[var(--border-color)] text-white/55 hover:text-white/80'
                }`}
                title="A1111 (doporučeno pro vlastní checkpoint + SDXL VAE)"
              >
                A1111
              </button>
              <button
                type="button"
                onClick={() => setBackend('fal')}
                className={`flex-1 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  backend === 'fal'
                    ? 'bg-[#0f1512] border-[#7ed957]/40 text-[#7ed957]'
                    : 'bg-[var(--bg-input)] border-[var(--border-color)] text-white/55 hover:text-white/80'
                }`}
                title="fal.ai (rychlé, ale u custom checkpointů může být VAE omezení)"
              >
                FAL
              </button>
            </div>
          </div>

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

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">
              {backend === 'a1111' ? 'SDXL checkpoint (A1111 name)' : 'SDXL checkpoint (model_name)'}
            </div>
            <input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)]"
              placeholder={backend === 'a1111' ? 'Tuymans_SDXL.safetensors' : 'stabilityai/stable-diffusion-xl-base-1.0'}
            />
            <div className="text-[9px] text-white/35">
              Bez promptu v UI: posíláme automatický prompt. {backend === 'fal' ? 'Pokročilé věci (scheduler/controlnet/ip-adapter) dej do Advanced JSON.' : 'A1111 backend používá SDXL VAE (auto/podle Nastavení).'}
            </div>
          </div>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Advanced JSON (scheduler/controlnets/ip_adapter…)</div>
            <textarea
              value={advancedRaw}
              onChange={(e) => setAdvancedRaw(e.target.value)}
              placeholder={'{\n  "scheduler": "karras",\n  "controlnets": [],\n  "ip_adapter": []\n}'}
              rows={7}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] leading-5 text-[var(--text-primary)] placeholder-white/20 font-mono resize-y"
            />
          </div>

          {(debugResolvedUrl || falLogs.length > 0) && (
            <div className="card-surface p-3 space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Debug</div>
              {debugResolvedUrl && (
                <div className="text-[10px] text-white/45 break-words font-mono">
                  <div className="text-white/35">resolved URL</div>
                  <div className="mt-1">{debugResolvedUrl}</div>
                </div>
              )}
              {debugWarnings.length > 0 && (
                <div className="text-[10px] text-amber-200/70 leading-5">
                  {debugWarnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}
              {falLogs.length > 0 && (
                <div className="text-[10px] text-white/55 leading-5 max-h-[160px] overflow-auto custom-scrollbar font-mono">
                  {falLogs.slice(-18).map((l, i) => (
                    <div key={i} className="whitespace-pre-wrap break-words">
                      {l.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">CFG</div>
              <input
                type="range"
                min={0}
                max={35}
                step={0.1}
                value={cfg}
                onChange={(e) => setCfg(Number(e.target.value))}
                className="w-[180px] h-[2px] accent-[#7ed957] opacity-80"
              />
              <div className="text-[10px] text-white/55 w-10 text-right">{cfg.toFixed(1)}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Steps</div>
              <input
                type="range"
                min={1}
                max={60}
                step={1}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                className="w-[180px] h-[2px] accent-[#7ed957] opacity-80"
              />
              <div className="text-[10px] text-white/55 w-10 text-right">{steps}</div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {genError && (
            <div className="mb-4 card-surface p-4 border border-rose-400/25">
              <div className="text-[10px] uppercase tracking-widest text-rose-200/80 font-bold">Chyba</div>
              <div className="mt-1 text-[11px] text-white/70 whitespace-pre-wrap break-words">{genError}</div>
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
                          {falLogs.length > 0 && (
                            <div className="mt-3 text-[10px] text-white/55 max-w-[360px] text-center leading-5 font-mono">
                              {pickDownloadProgressLine(falLogs) || falLogs[falLogs.length - 1]?.message || ''}
                            </div>
                          )}
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
        <div
          className="fixed inset-0 z-50 bg-black/88 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}
          title="Klikni mimo obrázek pro zavření"
        >
          <div
            className="w-full h-full rounded-xl border border-white/10 bg-black/50 overflow-auto custom-scrollbar flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox}
              alt="Preview"
              onDoubleClick={() => setLightbox(null)}
              title="Dvojklik pro zavření"
              className="block w-auto h-auto max-w-[96vw] max-h-[96vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
