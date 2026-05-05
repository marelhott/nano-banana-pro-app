import React, { useRef } from 'react';
import { Download, Sparkles, Trash2, Upload, WifiOff, Cpu, X } from 'lucide-react';
import { upscaleImage } from '../utils/upscaling';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { ImageDatabase } from '../utils/imageDatabase';
import { dataUrlToBlob, getPublicUrl, uploadImage } from '../utils/supabaseStorage';
import { fileToDataUrl, resolveDropToFile } from './styleTransfer/utils';
import type { ToastType } from './Toast';
type UpscaleMode = 'restore' | 'turbo';

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

async function resizeDataUrl(dataUrl: string, width: number, height: number): Promise<string> {
  const targetWidth = Math.max(1, Math.round(width));
  const targetHeight = Math.max(1, Math.round(height));

  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas není dostupný pro změnu rozlišení.'));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('Nepodařilo se převzorkovat výstupní obrázek.'));
    image.src = dataUrl;
  });
}

function buildOutputId(inputId: string): string {
  return `${inputId}-upscale`;
}

function createPendingOutput(input: ImageSlot, mode: UpscaleMode, scale: 2 | 4): OutputItem {
  return {
    id: buildOutputId(input.id),
    inputId: input.id,
    inputName: input.file.name,
    status: 'pending',
    createdAt: Date.now(),
    detailsText: mode === 'restore' ? `Real-ESRGAN • ${scale}×` : `Lanczos • ${scale}×`,
  };
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
  const inputFileId = React.useMemo(() => `ai-upscaler-input-${Math.random().toString(36).slice(2)}`, []);
  const popupWindows = useRef<Map<string, Window>>(new Map());

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

  const pendingCount = React.useMemo(() => {
    return inputs.filter((input) => outputs.find((item) => item.inputId === input.id)?.status !== 'done').length;
  }, [inputs, outputs]);

  React.useEffect(() => {
    setOutputs((prev) => prev.map((item) => {
      if (item.status === 'done' || item.status === 'error') return item;
      return {
        ...item,
        detailsText: mode === 'restore' ? `Real-ESRGAN • ${scale}×` : `Lanczos • ${scale}×`,
      };
    }));
  }, [mode, scale]);

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
        const slot: ImageSlot = {
          id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          file,
          dataUrl,
          width: meta.width,
          height: meta.height,
        };
        nextSlots.push(slot);
        try {
          await ImageDatabase.add(file, dataUrl, 'reference');
        } catch {
          // Keep screen functional even if library mirror fails.
        }
      }

      setInputs((prev) => [...prev, ...nextSlots]);
      setOutputs((prev) => {
        const next = [...prev];
        for (const slot of nextSlots) {
          if (!next.some((item) => item.inputId === slot.id)) {
            next.push(createPendingOutput(slot, mode, scale));
          }
        }
        return next.sort((a, b) => b.createdAt - a.createdAt);
      });
    },
    [mode, onToast, scale]
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
        if (file) {
          await pickInputFiles([file]);
        }
      } catch (error: any) {
        onToast({ type: 'error', message: error?.message || 'Nepodařilo se načíst obrázek z dropu.' });
      }
    },
    [onToast, pickInputFiles]
  );

  const removeInput = React.useCallback((inputId: string) => {
    setInputs((prev) => prev.filter((item) => item.id !== inputId));
    setOutputs((prev) => prev.filter((item) => item.inputId !== inputId));
  }, []);

  const clearAll = React.useCallback(() => {
    setInputs([]);
    setOutputs([]);
    setBatchProgress(null);
    setPhase('');
  }, []);

  const handleGenerate = React.useCallback(async () => {
    if (inputs.length === 0) {
      onToast({ type: 'error', message: 'Nahraj nebo přetáhni alespoň jeden obrázek.' });
      return;
    }

    if (mode === 'restore') {
      const key = readReplicateKey();
      if (!key && !serverHasKey) {
        onToast({
          type: 'error',
          message: 'Pro Restore režim potřebuješ Replicate API klíč — nastav ho v Settings nebo doplň REPLICATE_API_KEY na serveru.',
        });
        return;
      }
    }

    const inputsToProcess = inputs.filter((input) => outputs.find((item) => item.inputId === input.id)?.status !== 'done');
    if (inputsToProcess.length === 0) {
      onToast({ type: 'info', message: 'Všechny vybrané soubory už mají hotový upscale.' });
      return;
    }

    setIsGenerating(true);
    setPhase('queue');
    setOutputs((prev) => {
      const preservedDone = prev.filter((item) => item.status === 'done' && inputs.some((input) => input.id === item.inputId));
      const refreshedPending = inputsToProcess.map((input) => createPendingOutput(input, mode, scale));
      return [...preservedDone, ...refreshedPending];
    });

    let completed = 0;
    let failed = 0;
    const key = readReplicateKey();

    try {
      for (let index = 0; index < inputsToProcess.length; index += 1) {
        const input = inputsToProcess[index];
        setBatchProgress({ current: index + 1, total: inputsToProcess.length, fileName: input.file.name });
        setOutputs((prev) => prev.map((item) => (
          item.inputId === input.id
            ? { ...item, status: 'running', error: undefined }
            : item
        )));

        try {
          let finalImage: string;

          if (mode === 'restore') {
            setPhase('running');
            setOutputs((prev) => prev.map((item) => (
              item.inputId === input.id
                ? { ...item, detailsText: `Real-ESRGAN • ${scale}× • odesílám…` }
                : item
            )));

            const result = await upscaleImage({
              token: key || '',
              imageDataUrl: input.dataUrl,
              factor: scale,
            });
            finalImage = result.imageDataUrl;

            setOutputs((prev) => prev.map((item) => (
              item.inputId === input.id
                ? { ...item, detailsText: `Real-ESRGAN • ${scale}× • ${result.originalWidth}×${result.originalHeight} → ${result.newWidth}×${result.newHeight}` }
                : item
            )));
          } else {
            setOutputs((prev) => prev.map((item) => (
              item.inputId === input.id
                ? { ...item, detailsText: `Lanczos • ${scale}× • převzorkovávám…` }
                : item
            )));

            finalImage = await resizeDataUrl(input.dataUrl, input.width * scale, input.height * scale);

            setOutputs((prev) => prev.map((item) => (
              item.inputId === input.id
                ? { ...item, detailsText: `Lanczos • ${scale}× • ${input.width}×${input.height} → ${input.width * scale}×${input.height * scale}` }
                : item
            )));
          }

          setOutputs((prev) => prev.map((item) => (
            item.inputId === input.id
              ? { ...item, dataUrl: finalImage, status: 'done' }
              : item
          )));

          try {
            const thumbnail = await createThumbnail(finalImage, 420);
            await saveToGallery({
              id: buildOutputId(input.id),
              url: finalImage,
              thumbnail,
              prompt: mode === 'restore' ? `Real-ESRGAN Upscale ${scale}×` : `Lanczos Upscale ${scale}×`,
              resolution: `${scale}×`,
              params: {
                engine: mode === 'restore' ? 'replicate_real_esrgan' : 'canvas_lanczos',
                mode,
                scale,
                operation: 'upscale',
              },
            });
          } catch (error) {
            console.error('[AI Upscaler] Failed to save output to gallery:', error);
          }

          completed += 1;
        } catch (error: any) {
          failed += 1;
          setOutputs((prev) => prev.map((item) => (
            item.inputId === input.id
              ? { ...item, status: 'error', error: error?.message || 'Upscale selhal.', detailsText: input.file.name }
              : item
          )));
        }
      }

      if (completed > 0 && failed === 0) {
        onToast({
          type: 'success',
          message: inputsToProcess.length === 1
            ? `Upscale ${scale}× hotový.`
            : `Upscale dokončen pro ${completed} souborů.`,
        });
      } else if (completed > 0) {
        onToast({ type: 'warning', message: `Hotovo ${completed}/${inputsToProcess.length}. ${failed} souborů selhalo.` });
      } else {
        onToast({ type: 'error', message: 'Upscale selhal pro všechny vybrané soubory.' });
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
              ? (phaseLabel ? `Upscaling • ${phaseLabel}` : 'Upscaling…')
              : `${mode === 'restore' ? 'Restore' : 'Turbo'} ${scale}× • ${Math.max(1, pendingCount || inputs.length)} soub.`
            }
          </button>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">REŽIM</div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'restore', label: 'Restore', hint: 'AI dopočítání detailů', icon: Sparkles },
                { value: 'turbo', label: 'Turbo', hint: 'okamžité zvětšení', icon: Cpu },
              ] as const).map((option) => (
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
                    <option.icon className="w-3.5 h-3.5" strokeWidth={1.6} />
                    <div className="text-[10px] font-bold uppercase tracking-widest">{option.label}</div>
                  </div>
                  <div className="mt-1 text-[9px] text-white/45">{option.hint}</div>
                </button>
              ))}
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
                    scale === value
                      ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {value}×
                </button>
              ))}
            </div>
            {mode === 'turbo' ? (
              <div className="text-[9px] text-white/35">
                Turbo mód běží zcela lokálně přes Canvas Lanczos — žádná API, žádné čekání. Výsledek není AI dopočítaný, jen plynule zvětšený.
              </div>
            ) : (
              <div className="text-[9px] text-white/35">
                Restore mód používá Real-ESRGAN přes Replicate — věrné dopočítání detailů bez kreativního přemalování. Cca $0.004/obr.
              </div>
            )}
          </div>

          {mode === 'restore' && !replicateKey && !serverHasKey ? (
            <div className="card-surface p-3 border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-start gap-2">
                <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" strokeWidth={1.6} />
                <div>
                  <div className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">Chybí Replicate klíč</div>
                  <div className="mt-1 text-[9px] text-amber-200/70">
                    Restore režim potřebuje Replicate API klíč. Nastav ho v Settings nebo doplň REPLICATE_API_KEY na serveru.
                  </div>
                </div>
              </div>
            </div>
          ) : mode === 'restore' && !replicateKey && serverHasKey ? (
            <div className="card-surface p-3 border border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" strokeWidth={1.6} />
                <div>
                  <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest">Serverový klíč je připraven</div>
                  <div className="mt-1 text-[9px] text-emerald-200/70">
                    Replicate klíč je nastavený na serveru. Restore režim pojede bez nutnosti zadávat klíč lokálně.
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
              className="block w-full min-h-[180px] rounded-[16px] bg-[#060d17] border border-dashed border-[#16263a] hover:border-[#223a57] transition-colors cursor-pointer overflow-hidden"
            >
              {inputs[0]?.dataUrl ? (
                <img src={inputs[0].dataUrl} alt={inputs[0].file.name} className="w-full h-[180px] object-cover opacity-92 hover:opacity-100 transition-opacity" />
              ) : (
                <div className="w-full h-[180px] flex flex-col items-center justify-center gap-2 text-[#8f9aae]">
                  <Upload className="w-5 h-5" strokeWidth={1.8} />
                  <span className="text-[10px] uppercase tracking-widest">Upload více fotek</span>
                </div>
              )}
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearAll}
                disabled={inputs.length === 0}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors disabled:opacity-40"
              >
                Vyčistit
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors"
              >
                Settings
              </button>
            </div>
            <div className="text-[9px] text-white/35">
              Přetáhni více obrázků najednou nebo přidej obrázky z pravé knihovny po jednom. Batch běží sekvenčně.
            </div>
          </div>
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 z-10 border-b border-white/5 bg-[var(--bg-main)]/70 backdrop-blur">
          <div className="px-6 py-4 flex flex-wrap items-center gap-4 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Režim</div>
              <div className="text-[10px] text-white/75">{mode === 'restore' ? 'Restore' : 'Turbo'}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Zvětšení</div>
              <div className="text-[10px] text-white/75">{scale}×</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Vstupů</div>
              <div className="text-[10px] text-white/75">{inputs.length}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Čeká</div>
              <div className="text-[10px] text-white/75">{pendingCount}</div>
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
          {outputs.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {outputs.map((output) => {
                const input = inputs.find((item) => item.id === output.inputId);
                if (!input) return null;
                const isDone = output.status === 'done' && !!output.dataUrl;
                const isRunning = output.status === 'running';
                const isOpen = popupWindows.current.has(output.id) && !popupWindows.current.get(output.id)?.closed;
                const progressValue =
                  output.status === 'done'
                    ? 100
                    : output.status === 'error'
                      ? 100
                      : isRunning
                        ? Math.max(20, phaseProgress)
                        : 8;

                const togglePopup = () => {
                  const existing = popupWindows.current.get(output.id);
                  if (existing && !existing.closed) {
                    existing.close();
                    popupWindows.current.delete(output.id);
                    return;
                  }
                  if (!output.dataUrl) return;
                  const popup = window.open('', '_blank', 'noopener,noreferrer');
                  if (!popup) return;
                  popupWindows.current.set(output.id, popup);
                  popup.document.write(`
                    <!doctype html>
                    <html lang="cs">
                      <head>
                        <meta charset="utf-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1" />
                        <title>${input.file.name} • ${scale}×</title>
                        <style>
                          html, body { margin: 0; background: #0b1118; height: 100%; }
                          body { display: flex; align-items: center; justify-content: center; }
                          img { max-width: 100vw; max-height: 100vh; object-fit: contain; }
                        </style>
                      </head>
                      <body>
                        <img src="${output.dataUrl}" alt="${input.file.name}" />
                      </body>
                    </html>
                  `);
                  popup.document.close();
                  const checkClosed = setInterval(() => {
                    if (popup.closed) {
                      popupWindows.current.delete(output.id);
                      clearInterval(checkClosed);
                    }
                  }, 500);
                };

                return (
                  <div
                    key={output.id}
                    className={`rounded-2xl overflow-hidden border transition-all ${
                      isOpen ? 'border-[#7ed957]/60 shadow-[0_0_0_1px_rgba(126,217,87,0.25)]' : 'border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isDone && output.dataUrl) {
                          togglePopup();
                        }
                      }}
                      className="w-full text-left"
                    >
                      {isDone && output.dataUrl ? (
                        <img src={output.dataUrl} alt={input.file.name} className="w-full aspect-square object-cover bg-black/20" />
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
                              {output.status === 'error'
                                ? 'Chyba'
                                : output.status === 'running'
                                  ? (phaseLabel || 'Zpracovávám')
                                  : output.status === 'pending'
                                    ? 'Připraveno'
                                    : 'Čeká'}
                            </div>
                          </div>
                        </div>
                      )}
                    </button>
                    <div className="p-3 bg-[var(--bg-input)] flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold text-white truncate">{input.file.name}</div>
                        <div className="mt-1 text-[9px] text-white/45">
                          {output.status === 'done'
                            ? (isOpen ? 'Okno otevřeno • klikni pro zavření' : 'Klikni pro zobrazení')
                            : output.status === 'error'
                              ? (output.error || 'Chyba')
                              : output.status === 'running'
                                ? phaseLabel || 'Běží'
                                : 'Čeká'}
                        </div>
                        <div className="mt-1 text-[9px] text-white/30 truncate">
                          {output.detailsText || `${mode} • ${scale}×`}
                        </div>
                      </div>
                      {isDone && output.dataUrl ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadDataUrl(output.dataUrl!, `${output.inputName.replace(/\.[^.]+$/, '')}-${scale}x.png`);
                          }}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                          title="Stáhnout"
                        >
                          <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
                        </button>
                      ) : null}
                      {output.status === 'done' && isOpen ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePopup();
                          }}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                          title="Zavřít okno"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={1.6} />
                        </button>
                      ) : null}
                      {!isDone ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeInput(input.id);
                          }}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                          title="Odebrat"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
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
                Nahraj obrázky v levém panelu a spusť upscale. Každý výstup se zobrazí jako čtvercová karta — kliknutím otevřeš plnou velikost v samostatném okně.
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
