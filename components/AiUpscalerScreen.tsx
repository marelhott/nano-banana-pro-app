import React from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import { GeminiProvider } from '../services/geminiService';
import { AIProviderType, ImageInput } from '../services/aiProvider';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { ImageDatabase } from '../utils/imageDatabase';
import { fileToDataUrl } from './styleTransfer/utils';
import { ImageComparisonModal } from './ImageComparisonModal';
import type { ToastType } from './Toast';
import { AtelierEmptyState, AtelierInfoRows, AtelierRightPanel, AtelierSection } from './atelier/AtelierLayout';

type UpscaleMode = 'restore' | 'enhance';

const FLASH_MODEL = 'gemini-3.1-flash-image-preview';
const PRO_MODEL = 'gemini-3-pro-image-preview';
const UPSCALE_PROMPT = "Upscale this image faithfully without any creative intent. Preserve the original photo as much as possible, only compute necessary artifacts.";

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
  inputDataUrl: string;
  dataUrl?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  createdAt: number;
  detailsText?: string;
  error?: string;
  resultWidth?: number;
  resultHeight?: number;
};

function readGeminiKey(): string {
  try {
    const raw = localStorage.getItem('providerSettings');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed?.gemini?.apiKey || '';
  } catch {
    return '';
  }
}

type ServerProviders = { gemini: boolean };

let cachedServerProviders: ServerProviders | null = null;

async function getServerProviders(): Promise<ServerProviders> {
  if (cachedServerProviders) return cachedServerProviders;
  try {
    const res = await fetch('/api/public-config');
    const data = await res.json();
    cachedServerProviders = { gemini: Boolean(data?.providers?.gemini) };
    return cachedServerProviders;
  } catch {
    return { gemini: false };
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

function modeModel(mode: UpscaleMode): string {
  return mode === 'restore' ? 'Gemini 3.1 Flash' : 'Gemini 3 Pro';
}

function modeModelId(mode: UpscaleMode): string {
  return mode === 'restore' ? FLASH_MODEL : PRO_MODEL;
}

export function AiUpscalerScreen(props: {
  onOpenSettings: () => void;
  onOpenLibrary?: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
  theme?: 'dark' | 'light';
}) {
  const { onOpenSettings, onOpenLibrary, onToast, theme = 'dark' } = props;

  const [inputs, setInputs] = React.useState<ImageSlot[]>([]);
  const [scale, setScale] = React.useState<2 | 4>(2);
  const [mode, setMode] = React.useState<UpscaleMode>('enhance');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [phase, setPhase] = React.useState<'' | 'queue' | 'running' | 'finalizing'>('');
  const [batchProgress, setBatchProgress] = React.useState<{ current: number; total: number; fileName: string } | null>(null);
  const [outputs, setOutputs] = React.useState<OutputItem[]>([]);
  const [serverProviders, setServerProviders] = React.useState<ServerProviders>({ gemini: false });
  const [selectedImage, setSelectedImage] = React.useState<OutputItem | null>(null);
  const inputFileId = React.useMemo(() => `upscaler-${Math.random().toString(36).slice(2)}`, []);

  const geminiKey = React.useMemo(() => readGeminiKey(), []);

  React.useEffect(() => {
    getServerProviders().then(setServerProviders);
  }, []);

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
    const newSlots: ImageSlot[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
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
    if (newSlots.length > 0) setInputs(prev => [...prev, ...newSlots]);
  }, []);

  const removeInput = React.useCallback((id: string) => {
    setInputs(prev => prev.filter(i => i.id !== id));
  }, []);

  const handleGenerate = React.useCallback(async () => {
    if (inputs.length === 0) {
      onToast({ type: 'error', message: 'Nejdřív nahraj obrázek.' });
      return;
    }
    if (!geminiKey && !serverProviders.gemini) {
      onToast({ type: 'error', message: 'Chybí Gemini klíč — nastav ho v Settings.' });
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
      inputDataUrl: input.dataUrl,
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
          const modelName = modeModelId(mode);
          const label = modeLabel(mode);
          setOutputs(prev => prev.map(o => o.id === buildOutputId(input.id, mode) ? { ...o, detailsText: `${label} • ${modelName} • odesílám…` } : o));

          const provider = new GeminiProvider(geminiKey || '', modelName);
          const result = await provider.generateImage(
            [{ data: input.dataUrl, mimeType: input.file.type }],
            UPSCALE_PROMPT,
            scale === 4 ? '2K' : '1K',
            undefined,
            false
          );

          const dims = await loadImageMeta(result.imageBase64);

          setOutputs(prev => prev.map(o =>
            o.id === buildOutputId(input.id, mode)
              ? { ...o, dataUrl: result.imageBase64, status: 'done' as const, detailsText: `${label} • ${modelName} • ${dims.width}×${dims.height}`, resultWidth: dims.width, resultHeight: dims.height }
              : o
          ));

          try {
            const thumb = await createThumbnail(result.imageBase64, 420);
            await saveToGallery({
              id: buildOutputId(input.id, mode),
              url: result.imageBase64,
              thumbnail: thumb,
              prompt: `${label} ${UPSCALE_PROMPT}`,
              params: { engine: modelName, mode, scale, operation: 'upscale' },
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
        onToast({ type: 'success', message: inputsToProcess.length === 1 ? `${modeLabel(mode)} hotový.` : `${modeLabel(mode)} dokončen pro ${completed} soub.` });
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
  }, [inputs, mode, onToast, outputs, scale, geminiKey, serverProviders]);

  const findInputForOutput = (output: OutputItem): ImageSlot | undefined => {
    return inputs.find(i => i.id === output.inputId);
  };

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[360px] shrink-0 h-full overflow-y-auto custom-scrollbar cairn-panel-left text-[11px]" style={theme === 'dark' ? {backdropFilter:"blur(32px) saturate(200%)",background:"linear-gradient(160deg,rgba(32,44,24,0.94) 0%,rgba(20,28,15,0.96) 100%)",boxShadow:"4px 0 48px rgba(0,0,0,0.50), inset 0 0 120px rgba(125,154,100,0.08)"} : {background:"#ffffff",borderRight:"1px solid #cdd8ba"}}>
        <div className="p-6 flex flex-col gap-6 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#a8bf8f] rounded-full shadow-[0_0_10px_rgba(168,191,143,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">AI Upscaler</h2>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={inputs.length === 0 || isGenerating}
            className="mn-action-primary ambient-glow glow-green glow-weak"
          >
            {isGenerating
              ? `${modeLabel(mode)} • ${phaseLabel || '…'}`
              : `${modeLabel(mode)} ${mode === 'restore' ? 'Flash' : 'Pro'} ${scale}× • ${Math.max(1, pendingCount || inputs.length)} zbývá`
            }
          </button>

          <div className="space-y-2">
            <div className="mn-section-label">Režim</div>
            <div className="grid grid-cols-2 gap-2">
              {(['restore', 'enhance'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`mn-option-button ${mode === m ? 'mn-option-button-active' : ''}`}>
                  <div>{modeLabel(m)}</div>
                  <div className="mt-1 text-[9px] text-white/45">{modeModel(m)}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="mn-section-label">Zvětšení</div>
            <div className="flex items-center justify-between bg-transparent pt-1">
              {[2, 4].map(v => (
                <button key={v} type="button" onClick={() => setScale(v as 2 | 4)}
                  className={`mn-option-button flex-1 ${scale === v ? 'mn-option-button-active' : ''}`}>{v}×</button>
              ))}
            </div>
          </div>

          {!geminiKey && !serverProviders.gemini ? (
            <div className="card-surface p-3 border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-start gap-2">
                <span className="text-amber-400 text-sm mt-0.5">⚠</span>
                <div>
                  <div className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">Chybí Gemini klíč</div>
                  <div className="mt-1 text-[9px] text-amber-200/70">Nastav v Settings nebo doplň GEMINI_API_KEY na serveru.</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between">
              <span>Vstupní obrázky</span>
              <span className="text-[9px] text-[var(--text-secondary)]">{inputs.length}</span>
            </h3>
            <div className="mn-upload-zone">
              {inputs.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center cursor-pointer" onClick={() => document.getElementById(inputFileId)?.click()}>
                  <span className="text-[var(--text-secondary)] text-lg transition-colors">+</span>
                  <input id={inputFileId} type="file" multiple accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files; if (f) handleImagesSelected(Array.from(f)); e.currentTarget.value = ''; }} />
                </div>
              ) : (
                <div className="p-1 grid grid-cols-4 gap-1">
                  {inputs.map(img => (
                    <div key={img.id} className="mn-upload-thumb group">
                      <img src={img.dataUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" alt={img.file.name} />
                      <button onClick={(e) => { e.stopPropagation(); removeInput(img.id); }}
                        className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  <label className="mn-upload-tile">
                    <span className="text-[var(--text-secondary)]">+</span>
                    <input type="file" multiple accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files; if (f) handleImagesSelected(Array.from(f)); e.currentTarget.value = ''; }} />
                  </label>
                </div>
              )}
            </div>
          </div>

          <button type="button" onClick={onOpenSettings}
            className="w-full px-3 py-2 rounded-lg border border-[rgba(168,191,143,0.18)] bg-[rgba(24,34,18,0.70)] backdrop-blur-sm text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors">
            Settings
          </button>
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="p-6">
          {visibleOutputs.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {visibleOutputs.map(output => {
                const isDone = output.status === 'done' && !!output.dataUrl;
                const isRunning = output.status === 'running';
                return (
                  <div key={output.id} className="rounded-2xl overflow-hidden border border-[rgba(168,191,143,0.18)]">
                    <button type="button" onClick={() => { if (!isDone || !output.dataUrl) return; setSelectedImage(output); }}
                      className="w-full text-left cursor-zoom-in">
                      <div className="w-full aspect-square bg-black/20">
                        {isDone && output.dataUrl ? (
                          <img src={output.dataUrl} alt={output.inputName} className="w-full h-full object-cover" />
                        ) : output.status === 'error' ? (
                          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-black/80 backdrop-blur-sm">
                            <div className="w-10 h-10 bg-red-500/20 text-red-500 border border-red-500/30 rounded-md flex items-center justify-center mb-4">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </div>
                            <p className="text-[10px] font-bold text-red-400 leading-relaxed max-w-[150px]">{output.error || 'Selhalo'}</p>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-black/60 backdrop-blur-md px-6 transition-all duration-300">
                            <div className="w-full max-w-[200px] space-y-3">
                              <div className="relative h-[2px] bg-gray-800 rounded-full overflow-hidden">
                                <div className="absolute inset-y-0 left-0 bg-[#a8bf8f] rounded-full shadow-[0_0_10px_rgba(168,191,143,0.5)]"
                                  style={{ width: '0%', animation: 'growWidth 10s cubic-bezier(0.4, 0, 0.2, 1) forwards' }} />
                              </div>
                              <div className="text-center">
                                <span className="text-[10px] text-[#a8bf8f] font-bold tracking-widest uppercase animate-pulse">Generuji...</span>
                              </div>
                            </div>
                          </div>
                        )}
                        <style>{`@keyframes growWidth { 0% { width: 0%; } 10% { width: 15%; } 40% { width: 50%; } 70% { width: 80%; } 100% { width: 95%; } }`}</style>
                      </div>
                    </button>
                    <div className="p-3 bg-[rgba(24,34,18,0.70)] backdrop-blur-sm flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-bold text-white truncate">{output.inputName}</div>
                        <div className="text-[8px] text-white/40 uppercase tracking-wider">{modeLabel(output.mode)} • {modeModel(output.mode)}</div>
                        <div className="text-[8px] text-white/30 truncate">{output.detailsText || ''}</div>
                      </div>
                      {isDone && output.dataUrl ? (
                        <button type="button" onClick={e => { e.stopPropagation(); downloadDataUrl(output.dataUrl!, `${output.inputName.replace(/\.[^.]+$/, '')}-${modeLabel(output.mode).toLowerCase()}.png`); }}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-[rgba(45,62,33,0.70)] transition-colors text-white/50 hover:text-white" title="Stáhnout">
                          <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <AtelierEmptyState
              title="Zatím žádné vygenerované obrázky"
              description="Nahraj obrázky vlevo a spusť Restore nebo Enhance."
            />
          )}
        </div>
      </section>

      <AtelierRightPanel onOpenLibrary={onOpenLibrary}>
        <AtelierSection title="Stav úlohy">
          <AtelierInfoRows
            rows={[
              { label: 'Režim', value: modeLabel(mode) },
              { label: 'Model', value: modeModel(mode) },
              { label: 'Zvětšení', value: `${scale}×` },
              { label: 'Vstupů', value: inputs.length },
              { label: 'Čeká', value: pendingCount },
              { label: 'Hotovo', value: outputs.filter(o => o.status === 'done').length },
            ]}
          />
          {batchProgress ? (
            <div className="rounded-md border border-[rgba(168,191,143,0.18)] bg-[rgba(28,40,20,0.70)] px-3 py-2 text-[8px] font-medium leading-relaxed text-[var(--text-secondary)]">
              {batchProgress.current}/{batchProgress.total} • {batchProgress.fileName}
            </div>
          ) : null}
        </AtelierSection>
      </AtelierRightPanel>

      <ImageComparisonModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        generatedImage={selectedImage?.dataUrl || null}
        originalImage={selectedImage ? findInputForOutput(selectedImage)?.dataUrl || null : null}
        prompt={UPSCALE_PROMPT}
        timestamp={selectedImage?.createdAt}
        resolution={selectedImage?.resultWidth && selectedImage?.resultHeight
          ? `${selectedImage.resultWidth}×${selectedImage.resultHeight}`
          : scale === 4 ? '2K' : '1K'}
      />
    </div>
  );
}
