import React from 'react';
import { Download, Sparkles, Trash2, Upload, WifiOff, X, Expand } from 'lucide-react';
import { upscaleImage } from '../utils/upscaling';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { ImageDatabase } from '../utils/imageDatabase';
import { fileToDataUrl, resolveDropToFile } from './styleTransfer/utils';
import { ImageUpload } from './ImageUpload';
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

const MAX_INPUTS = 20;

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
    : phase === 'queue' ? 16 : phase === 'running' ? 68 : phase === 'finalizing' ? 94 : 0;

  const visibleOutputs = React.useMemo(() => {
    return [...outputs].sort((a, b) => b.createdAt - a.createdAt);
  }, [outputs]);

  const pendingCount = React.useMemo(() => {
    return inputs.filter((input) => {
      const expectedId = buildOutputId(input.id, mode);
      return !outputs.some(o => o.id === expectedId && o.status === 'done');
    }).length;
  }, [inputs, outputs, mode]);

  const handleImagesSelected = React.useCallback(async (files: File[]) => {
    const available = MAX_INPUTS - inputs.length;
    if (available <= 0) {
      onToast({ type: 'error', message: `Maximálně ${MAX_INPUTS} vstupů.` });
      return;
    }
    const batch = files.slice(0, available);
    const newSlots: ImageSlot[] = [];
    for (const file of batch) {
      const dataUrl = await fileToDataUrl(file);
      const meta = await loadImageMeta(dataUrl);
      newSlots.push({
        id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        file,
        dataUrl,
        width: meta.width,
        height: meta.height,
      });
      try { await ImageDatabase.add(file, dataUrl, 'reference'); } catch { /* ok */ }
    }
    setInputs(prev => [...prev, ...newSlots]);
  }, [inputs.length, onToast]);

  const removeInput = React.useCallback((inputId: string) => {
    setInputs(prev => prev.filter(i => i.id !== inputId));
  }, []);

  const handleGenerate = React.useCallback(async () => {
    if (inputs.length === 0) {
      onToast({ type: 'error', message: 'Nejdřív nahraj obrázek.' });
      return;
    }
    const key = readReplicateKey();
    if (!key && !serverHasKey) {
      onToast({ type: 'error', message: 'Chybí Replicate klíč — nastav ho v Settings.' });
      return;
    }

    const inputsToProcess = inputs.filter(input => {
      const expectedId = buildOutputId(input.id, mode);
      return !outputs.some(o => o.id === expectedId && o.status === 'done');
    });

    if (inputsToProcess.length === 0) {
      onToast({ type: 'info', message: `Všechny vstupy už mají hotový ${modeLabel(mode)} výstup.` });
      return;
    }

    setIsGenerating(true);
    setPhase('queue');

    const newOutputs: OutputItem[] = inputsToProcess.map(input => ({
      id: buildOutputId(input.id, mode),
      inputId: input.id,
      mode,
      inputName: input.file.name,
      status: 'pending' as const,
      createdAt: Date.now(),
      detailsText: modeLabel(mode),
    }));

    setOutputs(prev => {
      const keep = prev.filter(p => !inputsToProcess.some(inp => p.id === buildOutputId(inp.id, mode)));
      return [...keep, ...newOutputs];
    });

    let completed = 0;
    let failed = 0;

    try {
      for (let index = 0; index < inputsToProcess.length; index++) {
        const input = inputsToProcess[index];
        setBatchProgress({ current: index + 1, total: inputsToProcess.length, fileName: input.file.name });
        setOutputs(prev => prev.map(o => o.id === buildOutputId(input.id, mode) ? { ...o, status: 'running' as const, error: undefined } : o));

        try {
          setPhase('running');
          const effectiveScale = mode === 'enhance' ? 4 : scale;

          setOutputs(prev => prev.map(o => o.id === buildOutputId(input.id, mode) ? { ...o, detailsText: `${modeLabel(mode)} ${effectiveScale}× • odesílám…` } : o));

          const result = await upscaleImage({ token: key || '', imageDataUrl: input.dataUrl, factor: effectiveScale as 2 | 4 });

          const label = modeLabel(mode);
          setOutputs(prev => prev.map(o =>
            o.id === buildOutputId(input.id, mode)
              ? { ...o, dataUrl: result.imageDataUrl, status: 'done' as const, detailsText: `${label} ${effectiveScale}× • ${result.originalWidth}×${result.originalHeight} → ${result.newWidth}×${result.newHeight}` }
              : o
          ));

          try {
            const thumb = await createThumbnail(result.imageDataUrl, 420);
            await saveToGallery({
              id: buildOutputId(input.id, mode),
              url: result.imageDataUrl,
              thumbnail: thumb,
              prompt: `${label} Upscale ${effectiveScale}×`,
              resolution: `${effectiveScale}×`,
              params: { engine: `replicate_real_esrgan_${mode}`, mode, scale: effectiveScale, operation: 'upscale' },
            });
          } catch { /* ok */ }

          completed++;
        } catch (error: any) {
          failed++;
          setOutputs(prev => prev.map(o =>
            o.id === buildOutputId(input.id, mode)
              ? { ...o, status: 'error' as const, error: error?.message || 'Selhalo.', detailsText: input.file.name }
              : o
          ));
        }
      }

      if (completed > 0 && failed === 0) {
        onToast({ type: 'success', message: inputsToProcess.length === 1 ? `${modeLabel(mode)} ${mode === 'enhance' ? '4' : scale}× hotový.` : `${modeLabel(mode)} dokončen pro ${completed} soub.` });
      } else if (completed > 0) {
        onToast({ type: 'warning', message: `Hotovo ${completed}/${inputsToProcess.length}. ${failed} selhalo.` });
      } else {
        onToast({ type: 'error', message: 'Všechny selhaly.' });
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
              ? `${modeLabel(mode)} • ${phaseLabel || '…'}`
              : `${modeLabel(mode)} ${mode === 'enhance' ? '4' : scale}× • ${Math.max(1, pendingCount || inputs.length)} zbývá`
            }
          </button>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">REŽIM</div>
            <div className="grid grid-cols-2 gap-2">
              {(['restore', 'enhance'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${mode === m ? 'border-[#7ed957]/60 bg-[#7ed957]/10 text-white' : 'border-[var(--border-color)] bg-[var(--bg-input)] text-white/70 hover:text-white'}`}>
                  <div className="text-[10px] font-bold uppercase tracking-widest">{modeLabel(m)}</div>
                  <div className="mt-1 text-[9px] text-white/45">{m === 'restore' ? 'Věrné dopočítání detailů' : 'Max. kvalita, vždy 4×'}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">ZVĚTŠENÍ</div>
            <div className="flex items-center justify-between bg-transparent pt-1">
              {[2, 4].map(v => (
                <button key={v} type="button" onClick={() => setScale(v as 2 | 4)}
                  className={`w-12 h-6 text-xs font-medium transition-all flex items-center justify-center rounded-sm ${
                    mode === 'enhance' && v !== 4 ? 'text-white/20 cursor-not-allowed'
                      : scale === v ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}>{v}×</button>
              ))}
            </div>
            <div className="text-[9px] text-white/35">
              {mode === 'restore' ? 'Real-ESRGAN. Cca $0.004/obr.' : '4× s face enhance. Cca $0.008/obr.'}
            </div>
          </div>

          {!replicateKey && !serverHasKey ? (
            <div className="card-surface p-3 border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-start gap-2">
                <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" strokeWidth={1.6} />
                <div>
                  <div className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">Chybí Replicate klíč</div>
                  <div className="mt-1 text-[9px] text-amber-200/70">Nastav v Settings.</div>
                </div>
              </div>
            </div>
          ) : !replicateKey && serverHasKey ? (
            <div className="card-surface p-3 border border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" strokeWidth={1.6} />
                <div>
                  <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">Serverový klíč připraven</div>
                  <div className="mt-1 text-[9px] text-emerald-200/70">Lokálně nemusíš nic zadávat.</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">VSTUPY ({inputs.length})</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {inputs.map(input => (
                <div key={input.id} className="relative group w-[72px] h-[72px] shrink-0">
                  <img src={input.dataUrl} alt={input.file.name} className="w-full h-full object-cover rounded-lg border border-white/10" />
                  <button type="button" onClick={() => removeInput(input.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-400">
                    <X className="w-3 h-3 text-white" strokeWidth={3} />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[7px] text-white truncate font-bold">{input.file.name}</p>
                  </div>
                </div>
              ))}
              {inputs.length < MAX_INPUTS && (
                <ImageUpload
                  onImagesSelected={handleImagesSelected}
                  compact
                  remainingSlots={MAX_INPUTS - inputs.length}
                />
              )}
            </div>

            <button type="button" onClick={onOpenSettings}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors">
              Settings
            </button>
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
              {visibleOutputs.map(output => {
                const isDone = output.status === 'done' && !!output.dataUrl;
                const isRunning = output.status === 'running';
                const isExpanded = expandedImage?.dataUrl === output.dataUrl;
                return (
                  <div key={output.id} className={`rounded-2xl overflow-hidden border ${isExpanded ? 'border-[#7ed957]/60 shadow-[0_0_0_1px_rgba(126,217,87,0.25)]' : 'border-white/10'}`}>
                    <button type="button" onClick={() => { if (!isDone || !output.dataUrl) return; setExpandedImage(isExpanded ? null : { dataUrl: output.dataUrl, name: `${output.inputName} • ${modeLabel(output.mode)}` }); }}
                      className="w-full text-left relative group">
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
                              <div className={`h-full rounded-full transition-all duration-500 ease-out ${output.status === 'error' ? 'bg-red-400/80' : 'bg-[var(--accent)] shadow-[0_0_14px_rgba(126,217,87,0.35)]'}`}
                                style={{ width: `${output.status === 'done' ? 100 : output.status === 'error' ? 100 : isRunning ? Math.max(20, phaseProgress) : 8 }%` }} />
                            </div>
                            <div className="text-[9px] uppercase tracking-widest text-white/45">
                              {output.status === 'error' ? 'Chyba' : output.status === 'running' ? phaseLabel || 'Zpracovávám' : 'Čeká'}
                            </div>
                          </div>
                        </div>
                      )}
                    </button>
                    <div className="p-3 bg-[var(--bg-input)] flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-bold text-white truncate">{output.inputName}</div>
                        <div className="text-[8px] text-white/40 uppercase tracking-wider">{modeLabel(output.mode)}</div>
                        <div className="text-[8px] text-white/30 truncate">{output.detailsText || ''}</div>
                      </div>
                      {isDone && output.dataUrl ? (
                        <button type="button" onClick={e => { e.stopPropagation(); downloadDataUrl(output.dataUrl!, `${output.inputName.replace(/\.[^.]+$/, '')}-${modeLabel(output.mode).toLowerCase()}.png`); }}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white" title="Stáhnout">
                          <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-white/35">
              <Sparkles className="w-8 h-8 mb-4" strokeWidth={1.2} />
              <div className="text-[11px] uppercase tracking-widest font-bold">Zatím žádné výstupy</div>
              <div className="text-[10px] text-white/25 mt-2 max-w-[400px] text-center">
                Nahraj obrázky vlevo a spusť Restore nebo Enhance. Oba režimy jdou na stejný vstup spustit nezávisle.
              </div>
            </div>
          )}
        </div>
      </section>

      {expandedImage ? (
        <div className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center p-4 md:p-8 cursor-zoom-out" onClick={() => setExpandedImage(null)}>
          <button type="button" onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 border border-white/10 text-white/70 hover:text-white transition-colors z-10">
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
          <div className="absolute top-4 left-4 text-[10px] text-white/40 z-10 uppercase tracking-widest">{expandedImage.name}</div>
          <img src={expandedImage.dataUrl} alt={expandedImage.name}
            className="max-w-full max-h-full object-contain rounded-lg cursor-default" onClick={e => e.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}
