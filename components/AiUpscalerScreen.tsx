import React from 'react';
import { Download, Sparkles, Trash2, Upload, WifiOff, X, Expand } from 'lucide-react';
import { upscaleImage } from '../utils/upscaling';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { ImageDatabase } from '../utils/imageDatabase';
import { fileToDataUrl, resolveDropToFile } from './styleTransfer/utils';
import type { ToastType } from './Toast';
type UpscaleMode = 'restore' | 'enhance';

type ImageSlot = {
  id: string;
  file: File;
  dataUrl: string;
  width: number;
  height: number;
};

type OutputItem = {
  id: string;
  inputId: string;
  mode: UpscaleMode;
  inputName: string;
  dataUrl?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  createdAt: number;
  detailsText?: string;
  error?: string;
};

function readReplicateKey(): string {
  try {
    const raw = localStorage.getItem('providerSettings');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed?.replicate?.apiKey || '';
  } catch {
    return '';
  }
}

let cachedServerHasReplicateKey: boolean | null = null;

async function serverHasReplicateKey(): Promise<boolean> {
  if (cachedServerHasReplicateKey !== null) return cachedServerHasReplicateKey;
  try {
    const res = await fetch('/api/public-config');
    const data = await res.json();
    cachedServerHasReplicateKey = Boolean(data?.providers?.replicate);
    return cachedServerHasReplicateKey;
  } catch {
    cachedServerHasReplicateKey = false;
    return false;
  }
}

function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function loadImageMeta(dataUrl: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = () => reject(new Error('Nepodařilo se načíst rozměry obrázku.'));
    image.src = dataUrl;
  });
}

function buildOutputId(inputId: string, mode: UpscaleMode): string {
  return `${inputId}-${mode}`;
}

function modeLabel(mode: UpscaleMode): string {
  return mode === 'restore' ? 'Restore' : 'Enhance';
}

function modeDetails(mode: UpscaleMode, scale: 2 | 4): string {
  if (mode === 'restore') return `Real-ESRGAN • ${scale}×`;
  return `Real-ESRGAN • 4× (max)`;
}

function modeHint(mode: UpscaleMode): string {
  return mode === 'restore'
    ? 'Věrné AI dopočítání detailů'
    : 'Maximální kvalita — vždy 4× s face enhance';
}

export function AiUpscalerScreen(props: {
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { onOpenSettings, onToast } = props;

  const [inputs, setInputs] = React.useState<ImageSlot[]>([]);
  const [scale, setScale] = React.useState<2 | 4>(2);
  const [mode, setMode] = React.useState<UpscaleMode>('restore');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [phase, setPhase] = React.useState<'' | 'queue' | 'running' | 'finalizing'>('');
  const [batchProgress, setBatchProgress] = React.useState<{ current: number; total: number; fileName: string } | null>(null);
  const [outputs, setOutputs] = React.useState<OutputItem[]>([]);
  const [serverHasKey, setServerHasKey] = React.useState(false);
  const [expandedImage, setExpandedImage] = React.useState<{ dataUrl: string; name: string } | null>(null);
  const inputFileId = React.useMemo(() => `ai-upscaler-input-${Math.random().toString(36).slice(2)}`, []);

  const replicateKey = React.useMemo(() => readReplicateKey(), []);

  React.useEffect(() => {
    if (!replicateKey) {
      serverHasReplicateKey().then(setServerHasKey);
    }
  }, [replicateKey]);

  const phaseLabel =
    phase === 'queue' ? 'Ve frontě' : phase === 'running' ? 'Zpracovávám' : phase === 'finalizing' ? 'Dokončuji' : '';
  const phaseProgress = batchProgress
    ? Math.round(((batchProgress.current - (phase === 'finalizing' ? 0 : 1)) / Math.max(1, batchProgress.total)) * 100)
    : phase === 'queue'
      ? 16
      : phase === 'running'
        ? 68
        : phase === 'finalizing'
          ? 94
          : 0;

  const visibleOutputs = React.useMemo(() => {
    return outputs.sort((a, b) => b.createdAt - a.createdAt);
  }, [outputs]);

  const pendingCount = React.useMemo(() => {
    return inputs.filter((input) => {
      const expectedId = buildOutputId(input.id, mode);
      return !outputs.some(o => o.id === expectedId && o.status === 'done');
    }).length;
  }, [inputs, outputs, mode]);

  React.useEffect(() => {
    setOutputs((prev) => prev.map((item) => {
      if (item.status === 'done' || item.status === 'error') return item;
      return { ...item, detailsText: modeDetails(item.mode, scale) };
    }));
  }, [scale]);

  const pickInputFiles = React.useCallback(
    async (fileList: File[]) => {
      const imageFiles = fileList.filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        onToast({ type: 'error', message: 'Vyberte alespoň jeden obrázek.' });
        return;
      }

      const nextSlots: ImageSlot[] = [];
      for (const file of imageFiles) {
        const dataUrl = await fileToDataUrl(file);
        const meta = await loadImageMeta(dataUrl);
        nextSlots.push({
          id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          file,
          dataUrl,
          width: meta.width,
          height: meta.height,
        });
        try {
          await ImageDatabase.add(file, dataUrl, 'reference');
        } catch {
          // Keep screen functional even if library mirror fails.
        }
      }

      setInputs((prev) => [...prev, ...nextSlots]);
    },
    [onToast]
  );

  const onInputDrop = React.useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      try {
        const droppedFiles = Array.from(e.dataTransfer.files as FileList).filter((file) => file.type.startsWith('image/'));
        if (droppedFiles.length > 0) {
          await pickInputFiles(droppedFiles);
          return;
        }
        const file = await resolveDropToFile(e);
        if (file) await pickInputFiles([file]);
      } catch (error: any) {
        onToast({ type: 'error', message: error?.message || 'Nepodařilo se načíst obrázek z dropu.' });
      }
    },
    [onToast, pickInputFiles]
  );

  const removeInput = React.useCallback((inputId: string) => {
    setInputs((prev) => prev.filter((item) => item.id !== inputId));
    // Výstupy zůstávají — nemažou se
  }, []);

  const handleGenerate = React.useCallback(async () => {
    if (inputs.length === 0) {
      onToast({ type: 'error', message: 'Nahraj nebo přetáhni alespoň jeden obrázek.' });
      return;
    }

    const key = readReplicateKey();
    if (!key && !serverHasKey) {
      onToast({
        type: 'error',
        message: 'Pro generování potřebuješ Replicate API klíč — nastav ho v Settings nebo doplň REPLICATE_API_KEY na serveru.',
      });
      return;
    }

    const inputsToProcess = inputs.filter((input) => {
      const expectedId = buildOutputId(input.id, mode);
      return !outputs.some(o => o.id === expectedId && o.status === 'done');
    });

    if (inputsToProcess.length === 0) {
      onToast({ type: 'info', message: `Všechny vstupy už mají hotový ${modeLabel(mode)} výstup.` });
      return;
    }

    setIsGenerating(true);
    setPhase('queue');

    const newOutputs: OutputItem[] = inputsToProcess.map((input) => ({
      id: buildOutputId(input.id, mode),
      inputId: input.id,
      mode,
      inputName: input.file.name,
      status: 'pending' as const,
      createdAt: Date.now(),
      detailsText: modeDetails(mode, scale),
    }));

    setOutputs((prev) => {
      const preserved = prev.filter(
        (item) => !inputsToProcess.some((input) => item.id === buildOutputId(input.id, mode))
      );
      return [...preserved, ...newOutputs];
    });

    let completed = 0;
    let failed = 0;

    try {
      for (let index = 0; index < inputsToProcess.length; index += 1) {
        const input = inputsToProcess[index];
        setBatchProgress({ current: index + 1, total: inputsToProcess.length, fileName: input.file.name });
        setOutputs((prev) => prev.map((item) => (
          item.id === buildOutputId(input.id, mode)
            ? { ...item, status: 'running' as const, error: undefined }
            : item
        )));

        try {
          setPhase('running');
          const effectiveScale = mode === 'enhance' ? 4 : scale;
          setOutputs((prev) => prev.map((item) => (
            item.id === buildOutputId(input.id, mode)
              ? { ...item, detailsText: `Real-ESRGAN • ${effectiveScale}× • odesílám…` }
              : item
          )));

          const result = await upscaleImage({
            token: key || '',
            imageDataUrl: input.dataUrl,
            factor: effectiveScale as 2 | 4,
          });

          const finalImage = result.imageDataUrl;
          const engineLabel = modeLabel(mode);

          setOutputs((prev) => prev.map((item) => (
            item.id === buildOutputId(input.id, mode)
              ? {
                  ...item,
                  dataUrl: finalImage,
                  status: 'done' as const,
                  detailsText: `${engineLabel} • ${effectiveScale}× • ${result.originalWidth}×${result.originalHeight} → ${result.newWidth}×${result.newHeight}`,
                }
              : item
          )));

          try {
            const thumbnail = await createThumbnail(finalImage, 420);
            await saveToGallery({
              id: buildOutputId(input.id, mode),
              url: finalImage,
              thumbnail,
              prompt: `${engineLabel} Upscale ${effectiveScale}×`,
              resolution: `${effectiveScale}×`,
              params: { engine: `replicate_real_esrgan_${mode}`, mode, scale: effectiveScale, operation: 'upscale' },
            });
          } catch (error) {
            console.error('[AI Upscaler] Chyba při ukládání do galerie:', error);
          }

          completed += 1;
        } catch (error: any) {
          failed += 1;
          setOutputs((prev) => prev.map((item) => (
            item.id === buildOutputId(input.id, mode)
              ? { ...item, status: 'error' as const, error: error?.message || 'Upscale selhal.', detailsText: input.file.name }
              : item
          )));
        }
      }

      if (completed > 0 && failed === 0) {
        onToast({
          type: 'success',
          message: inputsToProcess.length === 1
            ? `${modeLabel(mode)} ${mode === 'enhance' ? '4' : scale}× hotový.`
            : `${modeLabel(mode)} dokončen pro ${completed} souborů.`,
        });
      } else if (completed > 0) {
        onToast({ type: 'warning', message: `Hotovo ${completed}/${inputsToProcess.length}. ${failed} selhalo.` });
      } else {
        onToast({ type: 'error', message: 'Generování selhalo pro všechny soubory.' });
      }
    } finally {
      setIsGenerating(false);
      setPhase('');
      setBatchProgress(null);
    }
  }, [inputs, mode, onToast, outputs, scale]);

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[360px] shrink-0 h-full overflow-y-auto custom-scrollbar border-r border-white/5 bg-[var(--bg-card)] text-[11px]">
        <div className="p-6 flex flex-col gap-6 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">AI Upscaler</h2>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={inputs.length === 0 || isGenerating}
            className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none"
          >
            {isGenerating
              ? (phaseLabel ? `${modeLabel(mode)} • ${phaseLabel}` : `${modeLabel(mode)}…`)
              : `${modeLabel(mode)} ${mode === 'enhance' ? '4' : scale}× • ${Math.max(1, pendingCount || inputs.length)} soub.`
            }
          </button>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">REŽIM</div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'restore', label: 'Restore', icon: Sparkles },
                { value: 'enhance', label: 'Enhance', icon: Sparkles },
              ] as const).map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMode(option.value)}
                    className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                      mode === option.value
                        ? 'border-[#7ed957]/60 bg-[#7ed957]/10 text-white'
                        : 'border-[var(--border-color)] bg-[var(--bg-input)] text-white/70 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.6} />
                      <div className="text-[10px] font-bold uppercase tracking-widest">{option.label}</div>
                    </div>
                    <div className="mt-1 text-[9px] text-white/45">{modeHint(option.value)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">ZVĚTŠENÍ</div>
            <div className="flex items-center justify-between bg-transparent pt-1">
              {[2, 4].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScale(value as 2 | 4)}
                  className={`w-12 h-6 text-xs font-medium transition-all flex items-center justify-center rounded-sm ${
                    scale === value && mode === 'restore'
                      ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                      : mode === 'enhance' && value !== 4
                        ? 'text-white/20 cursor-not-allowed'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {value}×
                </button>
              ))}
            </div>
            <div className="text-[9px] text-white/35">
              {mode === 'restore'
                ? 'Restore používá Real-ESRGAN — věrné dopočítání detailů. Cca $0.004/obr.'
                : 'Enhance vždy běží ve 4× s maximální kvalitou a face enhance. Cca $0.008/obr.'}
            </div>
          </div>

          {!replicateKey && !serverHasKey ? (
            <div className="card-surface p-3 border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-start gap-2">
                <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" strokeWidth={1.6} />
                <div>
                  <div className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">Chybí Replicate klíč</div>
                  <div className="mt-1 text-[9px] text-amber-200/70">
                    Nastav ho v Settings nebo doplň REPLICATE_API_KEY na serveru.
                  </div>
                </div>
              </div>
            </div>
          ) : !replicateKey && serverHasKey ? (
            <div className="card-surface p-3 border border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" strokeWidth={1.6} />
                <div>
                  <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">Serverový klíč připraven</div>
                  <div className="mt-1 text-[9px] text-emerald-200/70">
                    Generování pojede bez nutnosti zadávat klíč lokálně.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="card-surface p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">VSTUPNÍ SOUBORY</div>
              <div className="text-[12px] leading-none font-semibold text-[#9aa5ba]">{inputs.length}</div>
            </div>

            <label
              htmlFor={inputFileId}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onInputDrop}
              className="block w-full min-h-[120px] rounded-[16px] bg-[#060d17] border border-dashed border-[#16263a] hover:border-[#223a57] transition-colors cursor-pointer overflow-hidden"
            >
              <div className="w-full h-[120px] flex flex-col items-center justify-center gap-1 text-[#8f9aae]">
                <Upload className="w-5 h-5" strokeWidth={1.8} />
                <span className="text-[10px] uppercase tracking-widest">Klikni nebo přetáhni</span>
              </div>
            </label>
            <input
              id={inputFileId}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'));
                if (files.length > 0) void pickInputFiles(files);
                e.currentTarget.value = '';
              }}
            />

            {inputs.length > 0 ? (
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto custom-scrollbar">
                {inputs.map((input) => (
                  <div key={input.id} className="flex items-center gap-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] p-1.5 group">
                    <img
                      src={input.dataUrl}
                      alt={input.file.name}
                      className="w-8 h-8 rounded-md object-cover shrink-0 bg-black/20"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-bold text-white truncate">{input.file.name}</div>
                      <div className="text-[8px] text-white/40">{input.width}×{input.height}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeInput(input.id)}
                      className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors text-white/30 hover:text-red-400 opacity-0 group-hover:opacity-100"
                      title="Odebrat vstup"
                    >
                      <X className="w-3 h-3" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors"
            >
              Settings
            </button>

            <div className="text-[9px] text-white/35">
              Křížkem u vstupu ho odebereš, ale hotové výstupy zůstanou na ploše. Restore a Enhance můžeš na stejný vstup spustit nezávisle.
            </div>
          </div>
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 z-10 border-b border-white/5 bg-[var(--bg-main)]/70 backdrop-blur">
          <div className="px-6 py-4 flex flex-wrap items-center gap-4 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Režim</div>
              <div className="text-[10px] text-white/75">{modeLabel(mode)}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Zvětšení</div>
              <div className="text-[10px] text-white/75">{mode === 'enhance' ? '4' : scale}×</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Vstupů</div>
              <div className="text-[10px] text-white/75">{inputs.length}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Čeká</div>
              <div className="text-[10px] text-white/75">{pendingCount}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Výstupů</div>
              <div className="text-[10px] text-white/75">{outputs.filter(o => o.status === 'done').length}</div>
            </div>
            {batchProgress ? (
              <div className="flex items-center gap-3">
                <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Dávka</div>
                <div className="text-[10px] text-white/75">{batchProgress.current}/{batchProgress.total} • {batchProgress.fileName}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="p-6">
          {visibleOutputs.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {visibleOutputs.map((output) => {
                const isDone = output.status === 'done' && !!output.dataUrl;
                const isRunning = output.status === 'running';
                const isExpanded = expandedImage?.dataUrl === output.dataUrl;
                const progressValue =
                  output.status === 'done' ? 100
                    : output.status === 'error' ? 100
                      : isRunning ? Math.max(20, phaseProgress) : 8;

                return (
                  <div key={output.id} className="rounded-2xl overflow-hidden border border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isDone || !output.dataUrl) return;
                        setExpandedImage(isExpanded ? null : { dataUrl: output.dataUrl, name: `${output.inputName} • ${modeLabel(output.mode)}` });
                      }}
                      className="w-full text-left relative group"
                    >
                      {isDone && output.dataUrl ? (
                        <>
                          <img src={output.dataUrl} alt={output.inputName} className="w-full aspect-square object-cover bg-black/20" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <Expand className="w-6 h-6 text-white/0 group-hover:text-white/80 transition-all" strokeWidth={1.5} />
                          </div>
                        </>
                      ) : (
                        <div className="w-full aspect-square bg-black/20 flex flex-col items-center justify-center px-4 text-center">
                          <Sparkles className={`w-5 h-5 mb-3 ${isRunning ? 'text-[#7ed957]' : output.status === 'error' ? 'text-red-400' : 'text-white/35'}`} />
                          <div className="w-full max-w-[180px] space-y-2">
                            <div className="h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ease-out ${output.status === 'error' ? 'bg-red-400/80' : 'bg-[var(--accent)] shadow-[0_0_14px_rgba(126,217,87,0.35)]'}`}
                                style={{ width: `${progressValue}%` }}
                              />
                            </div>
                            <div className="text-[9px] uppercase tracking-widest text-white/45">
                              {output.status === 'error' ? 'Chyba'
                                : output.status === 'running' ? (phaseLabel || 'Zpracovávám')
                                  : 'Čeká'}
                            </div>
                          </div>
                        </div>
                      )}
                    </button>
                    <div className="p-3 bg-[var(--bg-input)] flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-bold text-white truncate">
                          {output.inputName}
                        </div>
                        <div className="text-[8px] text-white/40 uppercase tracking-wider">{modeLabel(output.mode)}</div>
                        <div className="mt-0.5 text-[9px] text-white/45">
                          {output.status === 'done'
                            ? (isExpanded ? 'Klikni pro zavření' : 'Klikni pro zvětšení')
                            : output.status === 'error'
                              ? (output.error || 'Chyba')
                              : output.status === 'running'
                                ? phaseLabel || 'Běží'
                                : 'Čeká'}
                        </div>
                        <div className="mt-0.5 text-[8px] text-white/30 truncate">
                          {output.detailsText || `${modeLabel(output.mode)}`}
                        </div>
                      </div>
                      {isDone && output.dataUrl ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadDataUrl(output.dataUrl!, `${output.inputName.replace(/\.[^.]+$/, '')}-${modeLabel(output.mode).toLowerCase()}-${scale}x.png`);
                          }}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                          title="Stáhnout"
                        >
                          <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-white/35">
              <Sparkles className="w-8 h-8 mb-4" strokeWidth={1.2} />
              <div className="text-[11px] uppercase tracking-widest font-bold">Zatím žádné výstupy</div>
              <div className="text-[10px] text-white/25 mt-2 max-w-[400px] text-center">
                Nahraj obrázky vlevo a spusť Restore nebo Enhance. Každý režim můžeš na stejný vstup spustit nezávisle.
              </div>
            </div>
          )}
        </div>
      </section>

      {expandedImage ? (
        <div
          className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center p-4 md:p-8 cursor-zoom-out"
          onClick={() => setExpandedImage(null)}
        >
          <button
            type="button"
            onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 border border-white/10 text-white/70 hover:text-white transition-colors z-10"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
          <div className="absolute top-4 left-4 text-[10px] text-white/40 z-10 uppercase tracking-widest">
            {expandedImage.name}
          </div>
          <img
            src={expandedImage.dataUrl}
            alt={expandedImage.name}
            className="max-w-full max-h-full object-contain rounded-lg cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
