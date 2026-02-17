import React from 'react';
import { Plus, RefreshCw, X, Wand2, KeyRound } from 'lucide-react';
import { ProviderSettings } from '../services/aiProvider';
import {
  EverArtModel,
  createEverArtModel,
  fetchImageAsDataUrl,
  listEverArtModels,
  startEverArtGeneration,
  waitEverArtGeneration,
} from '../services/everartService';
import { createThumbnail, saveToGallery, deleteImage as deleteGeneratedImage } from '../utils/galleryDB';
import { ImageComparisonModal } from './ImageComparisonModal';

type ToastType = 'success' | 'error' | 'info';

type ScreenTab = 'apply' | 'create' | 'models';

type ImageSlot = {
  file: File;
  dataUrl: string;
};

type OutputItem = {
  id: string;
  status: 'pending' | 'done' | 'error';
  dataUrl?: string;
  originalDataUrl?: string;
  detailsText?: string;
  error?: string;
};

type TrainFile = {
  id: string;
  file: File;
  dataUrl: string;
};

function statusLabel(status: string): string {
  const s = String(status || '').toUpperCase();
  if (s === 'READY' || s === 'COMPLETED' || s === 'SUCCEEDED') return 'READY';
  if (s === 'TRAINING' || s === 'PROCESSING') return 'TRAINING';
  if (s === 'FAILED' || s === 'ERROR') return 'FAILED';
  return s || 'UNKNOWN';
}

function statusBadgeClass(status: string): string {
  const s = statusLabel(status);
  if (s === 'READY') return 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25';
  if (s === 'TRAINING') return 'bg-amber-500/12 text-amber-300 border-amber-500/25';
  if (s === 'FAILED') return 'bg-rose-500/12 text-rose-300 border-rose-500/25';
  return 'bg-white/10 text-white/60 border-white/15';
}

function isModelReady(model: EverArtModel): boolean {
  const s = statusLabel(model.status);
  return s === 'READY' || s === 'COMPLETED' || s === 'SUCCEEDED';
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Nepodařilo se načíst soubor.'));
    r.readAsDataURL(file);
  });
}

async function shrinkDataUrl(dataUrl: string, maxBytes: number): Promise<string> {
  const estimateBytes = (url: string) => {
    const idx = url.indexOf(',');
    const b64 = idx >= 0 ? url.slice(idx + 1) : url;
    return Math.floor((b64.length * 3) / 4);
  };
  if (estimateBytes(dataUrl) <= maxBytes) return dataUrl;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Nepodařilo se zmenšit obrázek.'));
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

function buildEverArtDetailsText(opts: {
  modelName: string;
  modelId: string;
  generationId: string;
  styleStrength: number;
  numImages: number;
  width: number;
  height: number;
}) {
  return [
    'Backend: EverArt',
    `Model: ${opts.modelName || opts.modelId}`,
    `Model ID: ${opts.modelId}`,
    `Generation ID: ${opts.generationId}`,
    `Síla stylu: ${opts.styleStrength.toFixed(2)} • Počet: ${opts.numImages}`,
    `Velikost: ${opts.width}×${opts.height}`,
  ].join('\n');
}

export function EverArtScreen(props: {
  providerSettings: ProviderSettings;
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { providerSettings, onOpenSettings, onToast } = props;

  const [tab, setTab] = React.useState<ScreenTab>('apply');
  const [models, setModels] = React.useState<EverArtModel[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState('');

  const [input, setInput] = React.useState<ImageSlot | null>(null);
  const [styleStrength, setStyleStrength] = React.useState(0.8);
  const [numImages, setNumImages] = React.useState<1 | 2 | 3 | 4>(1);
  const [outputWidth, setOutputWidth] = React.useState(1024);
  const [outputHeight, setOutputHeight] = React.useState(1024);

  const [selectedModelIds, setSelectedModelIds] = React.useState<string[]>([]);

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [genPhase, setGenPhase] = React.useState('');
  const [genError, setGenError] = React.useState('');
  const [generated, setGenerated] = React.useState<OutputItem[]>([]);
  const [selectedOutputId, setSelectedOutputId] = React.useState<string | null>(null);

  const [createName, setCreateName] = React.useState('');
  const [createSubject, setCreateSubject] = React.useState<'STYLE' | 'PERSON' | 'OBJECT'>('STYLE');
  const [trainFiles, setTrainFiles] = React.useState<TrainFile[]>([]);
  const [isCreatingModel, setIsCreatingModel] = React.useState(false);

  const inputFileId = React.useMemo(() => `everart-input-${Math.random().toString(36).slice(2)}`, []);
  const trainFileId = React.useMemo(() => `everart-train-${Math.random().toString(36).slice(2)}`, []);

  const everartKey = String(providerSettings?.everart?.apiKey || '').trim();

  const selectedOutput = React.useMemo(
    () => generated.find((g) => g.id === selectedOutputId && g.status === 'done' && !!g.dataUrl) || null,
    [generated, selectedOutputId]
  );

  const doneOutputs = React.useMemo(
    () => generated.filter((g) => g.status === 'done' && !!g.dataUrl),
    [generated]
  );

  const selectedOutputIndex = React.useMemo(
    () => (selectedOutput ? doneOutputs.findIndex((o) => o.id === selectedOutput.id) : -1),
    [doneOutputs, selectedOutput]
  );

  React.useEffect(() => {
    if (!selectedOutputId) return;
    if (!generated.some((g) => g.id === selectedOutputId)) setSelectedOutputId(null);
  }, [generated, selectedOutputId]);

  const loadModels = React.useCallback(async () => {
    if (!everartKey) {
      setModels([]);
      setModelsError('Doplň EverArt API klíč v Nastavení.');
      return;
    }
    setModelsLoading(true);
    setModelsError('');
    try {
      const list = await listEverArtModels(everartKey);
      setModels(list);
      setSelectedModelIds((prev) => {
        const valid = new Set(list.map((m) => m.everartId));
        return prev.filter((id) => valid.has(id));
      });
    } catch (e: any) {
      setModelsError(String(e?.message || 'Nepodařilo se načíst modely EverArt.'));
    } finally {
      setModelsLoading(false);
    }
  }, [everartKey]);

  React.useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const onPickInputFile = React.useCallback(
    async (file: File) => {
      try {
        const raw = await fileToDataUrl(file);
        const shrunk = await shrinkDataUrl(raw, 5_800_000);
        setInput({ file, dataUrl: shrunk });
      } catch (e: any) {
        onToast({ type: 'error', message: String(e?.message || 'Nepodařilo se načíst vstupní obrázek.') });
      }
    },
    [onToast]
  );

  const toggleModel = React.useCallback((id: string) => {
    setSelectedModelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleGenerate = React.useCallback(async () => {
    if (isGenerating) return;

    if (!everartKey) {
      onToast({ type: 'error', message: 'Chybí EverArt API key. Otevři Nastavení.' });
      onOpenSettings();
      return;
    }
    if (!input?.dataUrl) {
      onToast({ type: 'error', message: 'Nahraj vstupní obrázek.' });
      return;
    }

    const usableModels = models.filter((m) => selectedModelIds.includes(m.everartId) && isModelReady(m));
    if (usableModels.length === 0) {
      onToast({ type: 'error', message: 'Vyber aspoň 1 READY model.' });
      return;
    }

    setIsGenerating(true);
    setGenError('');
    setGenPhase('Spouštím generování…');

    try {
      const jobs = await startEverArtGeneration({
        key: everartKey,
        inputDataUrl: input.dataUrl,
        modelIds: usableModels.map((m) => m.everartId),
        styleStrength,
        numImages,
        width: outputWidth,
        height: outputHeight,
      });

      if (!jobs.length) {
        throw new Error('EverArt nevrátil žádné joby.');
      }

      const placeholders: OutputItem[] = jobs.map((j) => ({
        id: `everart-${j.generationId}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'pending',
        originalDataUrl: input.dataUrl,
        detailsText: buildEverArtDetailsText({
          modelName: usableModels.find((m) => m.everartId === j.modelId)?.name || j.modelName || j.modelId,
          modelId: j.modelId,
          generationId: j.generationId,
          styleStrength,
          numImages,
          width: outputWidth,
          height: outputHeight,
        }),
      }));

      setGenerated((prev) => [...placeholders, ...prev]);

      for (let i = 0; i < jobs.length; i += 1) {
        const job = jobs[i];
        const placeholder = placeholders[i];
        const modelName = usableModels.find((m) => m.everartId === job.modelId)?.name || job.modelName || job.modelId;

        setGenPhase(`Model ${modelName} • ${i + 1}/${jobs.length}`);

        const status = await waitEverArtGeneration(job.generationId, {
          key: everartKey,
          maxAttempts: 180,
          intervalMs: 2000,
          onTick: (tick, attempt) => {
            const st = statusLabel(tick.status);
            setGenPhase(`Model ${modelName} • ${st} • pokus ${attempt}`);
          },
        });

        const state = statusLabel(status.status);
        if ((state === 'READY' || state === 'COMPLETED' || state === 'SUCCEEDED') && status.imageUrl) {
          const dataUrl = await fetchImageAsDataUrl(status.imageUrl);
          setGenerated((prev) =>
            prev.map((g) =>
              g.id === placeholder.id
                ? {
                    ...g,
                    status: 'done',
                    dataUrl,
                    detailsText: buildEverArtDetailsText({
                      modelName,
                      modelId: job.modelId,
                      generationId: job.generationId,
                      styleStrength,
                      numImages,
                      width: outputWidth,
                      height: outputHeight,
                    }),
                  }
                : g
            )
          );

          try {
            const thumbnail = await createThumbnail(dataUrl);
            await saveToGallery({
              id: placeholder.id,
              url: dataUrl,
              prompt: `EverArt • ${modelName} • style ${styleStrength.toFixed(2)}`,
              thumbnail,
              resolution: `${outputWidth}x${outputHeight}`,
              aspectRatio: outputWidth && outputHeight ? `${outputWidth}:${outputHeight}` : undefined,
              params: {
                provider: 'everart',
                modelName,
                modelId: job.modelId,
                generationId: job.generationId,
                styleStrength,
                numImages,
                width: outputWidth,
                height: outputHeight,
              },
            });
          } catch {
            // ignore gallery save errors
          }
        } else {
          setGenerated((prev) =>
            prev.map((g) =>
              g.id === placeholder.id
                ? {
                    ...g,
                    status: 'error',
                    error: status.error || status.failureReason || 'Generování selhalo.',
                  }
                : g
            )
          );
        }
      }

      onToast({ type: 'success', message: 'EverArt generování dokončeno.' });
      setGenPhase('');
    } catch (e: any) {
      const msg = String(e?.message || 'EverArt generování selhalo.');
      setGenError(msg);
      onToast({ type: 'error', message: msg });
      setGenPhase('');
    } finally {
      setIsGenerating(false);
    }
  }, [
    everartKey,
    input,
    isGenerating,
    models,
    numImages,
    onOpenSettings,
    onToast,
    outputHeight,
    outputWidth,
    selectedModelIds,
    styleStrength,
  ]);

  const onAddTrainFiles = React.useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const entries: TrainFile[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await fileToDataUrl(file);
      entries.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        dataUrl,
      });
    }
    setTrainFiles((prev) => [...prev, ...entries].slice(0, 40));
  }, []);

  const removeTrainFile = React.useCallback((id: string) => {
    setTrainFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleCreateModel = React.useCallback(async () => {
    if (!everartKey) {
      onToast({ type: 'error', message: 'Chybí EverArt API key. Otevři Nastavení.' });
      onOpenSettings();
      return;
    }
    if (!createName.trim()) {
      onToast({ type: 'error', message: 'Zadej název modelu.' });
      return;
    }
    if (trainFiles.length < 1) {
      onToast({ type: 'error', message: 'Nahraj aspoň 1 trénovací obrázek.' });
      return;
    }

    setIsCreatingModel(true);
    try {
      await createEverArtModel({
        key: everartKey,
        name: createName.trim(),
        subject: createSubject,
        files: trainFiles.map((f) => f.file),
      });
      onToast({ type: 'success', message: 'Model vytvořen. Trénink běží v EverArt.' });
      setCreateName('');
      setTrainFiles([]);
      setTab('models');
      await loadModels();
    } catch (e: any) {
      onToast({ type: 'error', message: String(e?.message || 'Vytvoření modelu selhalo.') });
    } finally {
      setIsCreatingModel(false);
    }
  }, [createName, createSubject, everartKey, loadModels, onOpenSettings, onToast, trainFiles]);

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[340px] shrink-0 h-full overflow-y-auto custom-scrollbar border-r border-white/5 bg-[var(--bg-card)] text-[11px]">
        <div className="p-6 flex flex-col gap-6 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">EverArt</h2>
          </div>

          {tab === 'apply' && (
            <>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!input || isGenerating || selectedModelIds.length === 0}
                className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none"
              >
                {isGenerating ? 'Generuji…' : 'Generovat'}
              </button>

              <div className="card-surface p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Vstupní obrázek</div>
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
            </>
          )}

          {(tab === 'apply' || tab === 'models') && (
            <div className="card-surface p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Všechny modely</div>
                <button
                  type="button"
                  onClick={() => void loadModels()}
                  className="p-1.5 rounded-md border border-white/10 bg-black/10 text-white/60 hover:text-white hover:border-white/20"
                  title="Obnovit modely"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${modelsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {modelsError && (
                <div className="text-[10px] text-rose-300/90 bg-rose-500/10 border border-rose-400/20 rounded-md px-2 py-2">
                  {modelsError}
                </div>
              )}

              <div className="max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                {models.length === 0 ? (
                  <div className="text-[10px] text-white/40">Žádné modely.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {models.map((m) => {
                      const selected = selectedModelIds.includes(m.everartId);
                      return (
                        <button
                          key={m.everartId}
                          type="button"
                          onClick={() => (tab === 'apply' ? toggleModel(m.everartId) : undefined)}
                          className={`text-left rounded-lg transition-all ${
                            tab === 'apply' ? '' : 'cursor-default'
                          }`}
                        >
                          <div
                            className={`relative w-full h-[104px] rounded-lg overflow-hidden border transition-all ${
                              selected
                                ? 'border-[#7ed957]/50 shadow-[0_0_0_1px_rgba(126,217,87,0.2)]'
                                : 'border-white/12 hover:border-white/24'
                            }`}
                          >
                            {m.thumbnailUrl ? (
                              <img src={m.thumbnailUrl} className="w-full h-full object-cover" alt={m.name} />
                            ) : (
                              <div className="w-full h-full bg-black/35 flex items-center justify-center text-white/25">•</div>
                            )}
                          </div>
                          <div className="mt-1.5 text-[10px] font-bold text-white/88 truncate">{m.name}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'create' && (
            <div className="card-surface p-3 space-y-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Vytvořit model</div>

              <div className="space-y-2">
                <label className="text-[9px] uppercase tracking-wider text-white/45 font-bold">Název</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Tuymans STYLE"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)] placeholder-white/20"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] uppercase tracking-wider text-white/45 font-bold">Typ</label>
                <select
                  value={createSubject}
                  onChange={(e) => setCreateSubject(e.target.value as 'STYLE' | 'PERSON' | 'OBJECT')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)]"
                >
                  <option value="STYLE">STYLE</option>
                  <option value="PERSON">PERSON</option>
                  <option value="OBJECT">OBJECT</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] uppercase tracking-wider text-white/45 font-bold">Trénovací obrázky</label>
                <label
                  htmlFor={trainFileId}
                  className="block w-full h-[120px] rounded-[12px] bg-[#060d17] border border-dashed border-[#16263a] hover:border-[#223a57] transition-colors cursor-pointer overflow-hidden"
                >
                  <div className="w-full h-full flex items-center justify-center text-[#8f9aae] text-[10px] uppercase tracking-wider font-bold">
                    <Plus className="w-4 h-4 mr-1" /> Přidat obrázky
                  </div>
                </label>
                <input
                  id={trainFileId}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void onAddTrainFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>

              {trainFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {trainFiles.map((f) => (
                    <div key={f.id} className="relative rounded-md overflow-hidden border border-white/10">
                      <img src={f.dataUrl} className="w-full h-[62px] object-cover" alt={f.file.name} />
                      <button
                        type="button"
                        onClick={() => removeTrainFile(f.id)}
                        className="absolute top-1 right-1 p-1 rounded bg-black/50 text-white/70 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleCreateModel}
                disabled={isCreatingModel || !createName.trim() || trainFiles.length < 1}
                className="w-full py-2.5 px-3 font-bold text-[10px] uppercase tracking-widest rounded-lg transition-all bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {isCreatingModel ? 'Vytvářím model…' : 'Vytvořit model'}
              </button>
            </div>
          )}

          {genError && !isGenerating && tab === 'apply' && (
            <div className="card-surface p-3 border border-rose-400/20">
              <div className="text-[10px] uppercase tracking-widest text-rose-200/80 font-bold">Chyba</div>
              <div className="mt-1 text-[10px] text-white/65">{genError}</div>
            </div>
          )}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 z-10 border-b border-white/5 bg-[var(--bg-main)]/70 backdrop-blur">
          <div className="px-6 py-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('apply')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors ${
                tab === 'apply'
                  ? 'border-[#7ed957]/45 bg-[#7ed957]/14 text-[#a9ee8f]'
                  : 'border-white/10 bg-black/20 text-white/60 hover:text-white/85 hover:border-white/20'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 inline-block mr-1" /> Použít model
            </button>
            <button
              type="button"
              onClick={() => setTab('create')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors ${
                tab === 'create'
                  ? 'border-[#7ed957]/45 bg-[#7ed957]/14 text-[#a9ee8f]'
                  : 'border-white/10 bg-black/20 text-white/60 hover:text-white/85 hover:border-white/20'
              }`}
            >
              <Plus className="w-3.5 h-3.5 inline-block mr-1" /> Vytvořit model
            </button>
            <button
              type="button"
              onClick={() => setTab('models')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors ${
                tab === 'models'
                  ? 'border-[#7ed957]/45 bg-[#7ed957]/14 text-[#a9ee8f]'
                  : 'border-white/10 bg-black/20 text-white/60 hover:text-white/85 hover:border-white/20'
              }`}
            >
              Všechny modely
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="ml-auto px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-white/10 bg-black/20 text-white/65 hover:text-white/90 hover:border-white/20 transition-colors"
              title="Nastavení API klíčů"
            >
              <KeyRound className="w-3.5 h-3.5 inline-block mr-1" /> API klíč
            </button>
          </div>

          {tab === 'apply' && (
            <div className="px-6 pb-4 flex flex-wrap items-center gap-6 overflow-x-auto custom-scrollbar">
              <div className="flex items-center gap-3">
                <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Síla</div>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={styleStrength}
                  onChange={(e) => setStyleStrength(Number(e.target.value))}
                  className="w-[220px] h-[2px] accent-[#7ed957] opacity-80"
                />
                <div className="text-[10px] text-white/55 w-8 text-right">{styleStrength.toFixed(2)}</div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Počet</div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNumImages(n as 1 | 2 | 3 | 4)}
                      className={`w-8 h-7 rounded-md text-[10px] font-black border transition-colors ${
                        numImages === n
                          ? 'border-[#7ed957]/45 bg-[#7ed957]/14 text-[#a9ee8f]'
                          : 'border-white/10 bg-black/20 text-white/60 hover:text-white/85 hover:border-white/20'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Šířka</div>
                <input
                  type="number"
                  min={256}
                  max={2048}
                  step={64}
                  value={outputWidth}
                  onChange={(e) => setOutputWidth(Math.max(256, Math.min(2048, Number(e.target.value) || 1024)))}
                  className="w-[86px] px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)]"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Výška</div>
                <input
                  type="number"
                  min={256}
                  max={2048}
                  step={64}
                  value={outputHeight}
                  onChange={(e) => setOutputHeight(Math.max(256, Math.min(2048, Number(e.target.value) || 1024)))}
                  className="w-[86px] px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[10px] text-[var(--text-primary)]"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-6">
          {isGenerating && (
            <div className="mb-5 card-surface p-4 flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-2 border-white/15 border-t-[#7ed957] animate-spin" />
              <div className="text-[10px] uppercase tracking-widest text-white/70 font-bold">{genPhase || 'Generuji…'}</div>
            </div>
          )}

          {tab === 'create' && (
            <div className="mb-6 card-surface p-5 text-[11px] text-white/55">
              Po vytvoření modelu se trénink spouští v EverArt. Počkej na stav <span className="text-emerald-300">READY</span> a pak přepni na <span className="text-white/85">Použít model</span>.
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
                return (
                  <article key={img.id} className="group flex flex-col overflow-hidden card-surface card-surface-hover transition-all animate-fadeIn">
                    <div className="relative bg-black/50 aspect-square overflow-hidden" title={img.status === 'done' ? 'Klikni pro plné zobrazení' : 'Generuji…'}>
                      {img.dataUrl ? (
                        <button type="button" className="block w-full h-full cursor-zoom-in" onClick={() => setSelectedOutputId(img.id)}>
                          <img
                            src={img.dataUrl}
                            alt={`EverArt výstup ${idx + 1}`}
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
                          <div className="mt-4 text-[11px] text-white/70 font-black uppercase tracking-widest">Generuji</div>
                          <div className="mt-1 text-[10px] text-white/40">EverArt běží…</div>
                        </div>
                      )}

                      {img.status === 'error' && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 px-4 text-center">
                          <div className="text-[10px] uppercase tracking-widest text-rose-300 font-bold">Chyba</div>
                          <div className="mt-1 text-[10px] text-white/60">{img.error || 'Generování selhalo.'}</div>
                        </div>
                      )}

                      {img.status === 'done' && (
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

      <ImageComparisonModal
        isOpen={!!selectedOutput?.dataUrl}
        onClose={() => setSelectedOutputId(null)}
        originalImage={selectedOutput?.originalDataUrl || input?.dataUrl || null}
        generatedImage={selectedOutput?.dataUrl || null}
        prompt={selectedOutput?.detailsText || 'Model a parametry nejsou k dispozici.'}
        promptLabel="Model + Nastavení"
        hasNext={selectedOutputIndex >= 0 && selectedOutputIndex < doneOutputs.length - 1}
        hasPrev={selectedOutputIndex > 0}
        onNext={() => {
          if (selectedOutputIndex < 0 || selectedOutputIndex >= doneOutputs.length - 1) return;
          setSelectedOutputId(doneOutputs[selectedOutputIndex + 1].id);
        }}
        onPrev={() => {
          if (selectedOutputIndex <= 0) return;
          setSelectedOutputId(doneOutputs[selectedOutputIndex - 1].id);
        }}
      />
    </div>
  );
}
