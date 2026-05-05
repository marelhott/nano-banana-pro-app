import React from 'react';
import { Download, Maximize2, Sparkles, Trash2, Upload } from 'lucide-react';
import { runFalFaithfulUpscaleQueued, runFalUpscaleQueued } from '../services/falService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { ImageDatabase } from '../utils/imageDatabase';
import { fileToDataUrl, resolveDropToFile } from './styleTransfer/utils';
import type { ToastType } from './Toast';
type UpscaleMode = 'faithful' | 'enhanced';

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
    detailsText: mode === 'faithful' ? `AuraSR • ${scale}×` : `Clarity • ${scale}×`,
  };
}

export function AiUpscalerScreen(props: {
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { onOpenSettings, onToast } = props;

  const [inputs, setInputs] = React.useState<ImageSlot[]>([]);
  const [selectedInputId, setSelectedInputId] = React.useState<string | null>(null);
  const [scale, setScale] = React.useState<2 | 4>(4);
  const [mode, setMode] = React.useState<UpscaleMode>('faithful');
  const [detailBoostEnabled, setDetailBoostEnabled] = React.useState(true);
  const [detailBoost, setDetailBoost] = React.useState(38);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [phase, setPhase] = React.useState<'' | 'queue' | 'running' | 'finalizing'>('');
  const [batchProgress, setBatchProgress] = React.useState<{ current: number; total: number; fileName: string } | null>(null);
  const [outputs, setOutputs] = React.useState<OutputItem[]>([]);
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const inputFileId = React.useMemo(() => `ai-upscaler-input-${Math.random().toString(36).slice(2)}`, []);

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

  const creativity = detailBoostEnabled ? 0.18 + (detailBoost / 100) * 0.62 : 0.12;
  const resemblance = detailBoostEnabled ? 0.93 - (detailBoost / 100) * 0.38 : 0.92;

  const selectedInput = React.useMemo(
    () => inputs.find((item) => item.id === selectedInputId) || inputs[0] || null,
    [inputs, selectedInputId]
  );

  const selectedOutput = React.useMemo(() => {
    if (!selectedInput) return outputs.find((item) => item.status === 'done') || null;
    return outputs.find((item) => item.inputId === selectedInput.id) || null;
  }, [outputs, selectedInput]);

  const pendingCount = React.useMemo(() => {
    return inputs.filter((input) => outputs.find((item) => item.inputId === input.id)?.status !== 'done').length;
  }, [inputs, outputs]);

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

      setInputs((prev) => {
        const merged = [...prev, ...nextSlots];
        if (!selectedInputId && merged[0]) {
          setSelectedInputId(merged[0].id);
        } else if (nextSlots[0]) {
          setSelectedInputId(nextSlots[0].id);
        }
        return merged;
      });
    },
    [onToast, selectedInputId]
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
    setInputs((prev) => {
      const next = prev.filter((item) => item.id !== inputId);
      if (selectedInputId === inputId) {
        setSelectedInputId(next[0]?.id || null);
      }
      return next;
    });
    setOutputs((prev) => prev.filter((item) => item.inputId !== inputId));
  }, [selectedInputId]);

  const clearAll = React.useCallback(() => {
    setInputs([]);
    setOutputs([]);
    setSelectedInputId(null);
    setBatchProgress(null);
    setPhase('');
  }, []);

  const handleGenerate = React.useCallback(async () => {
    if (inputs.length === 0) {
      onToast({ type: 'error', message: 'Nahraj nebo přetáhni alespoň jeden obrázek.' });
      return;
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

    try {
      for (let index = 0; index < inputsToProcess.length; index += 1) {
        const input = inputsToProcess[index];
        setBatchProgress({ current: index + 1, total: inputsToProcess.length, fileName: input.file.name });
        setSelectedInputId(input.id);
        setOutputs((prev) => prev.map((item) => (
          item.inputId === input.id
            ? { ...item, status: 'running', error: undefined }
            : item
        )));

        try {
          const rawResult = mode === 'faithful'
            ? await runFalFaithfulUpscaleQueued({
                imageUrlOrDataUrl: input.dataUrl,
                onPhase: setPhase,
                maxWaitMs: 10 * 60_000,
              })
            : await runFalUpscaleQueued({
                imageUrlOrDataUrl: input.dataUrl,
                upscaleFactor: scale,
                creativity,
                resemblance,
                onPhase: setPhase,
                maxWaitMs: 8 * 60_000,
              });

          let finalImage = rawResult.image;
          if (mode === 'faithful' && scale === 2) {
            finalImage = await resizeDataUrl(finalImage, input.width * 2, input.height * 2);
          }

          const detailsText =
            mode === 'faithful'
              ? `fal-ai/aura-sr • ${scale}× • faithful`
              : `fal-ai/clarity-upscaler • ${scale}× • creativity ${creativity.toFixed(2)} • resemblance ${resemblance.toFixed(2)}`;

          setOutputs((prev) => prev.map((item) => (
            item.inputId === input.id
              ? {
                  ...item,
                  dataUrl: finalImage,
                  status: 'done',
                  detailsText,
                }
              : item
          )));

          try {
            const thumbnail = await createThumbnail(finalImage, 420);
            await saveToGallery({
              id: buildOutputId(input.id),
              url: finalImage,
              thumbnail,
              prompt: mode === 'faithful' ? `Faithful Upscale ${scale}×` : `Enhanced Upscale ${scale}×`,
              resolution: `${scale}×`,
              params: {
                engine: mode === 'faithful' ? 'fal_aura_sr' : 'fal_clarity_upscaler',
                mode,
                scale,
                creativity: mode === 'enhanced' ? creativity : undefined,
                resemblance: mode === 'enhanced' ? resemblance : undefined,
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
              ? {
                  ...item,
                  status: 'error',
                  error: error?.message || 'Upscale selhal.',
                  detailsText: input.file.name,
                }
              : item
          )));
        }
      }

      if (completed > 0 && failed === 0) {
        onToast({
          type: 'success',
          message: inputsToProcess.length === 1
            ? mode === 'faithful'
              ? `Faithful upscale ${scale}× hotový.`
              : `Enhanced upscale ${scale}× hotový.`
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
  }, [creativity, inputs, mode, onToast, outputs, resemblance, scale]);

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
              : `${mode === 'faithful' ? 'Faithful' : 'Enhanced'} ${scale}× • ${Math.max(1, pendingCount || inputs.length)} soub.`
            }
          </button>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">REŽIM</div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'faithful', label: 'Faithful', hint: 'bez kreativity' },
                { value: 'enhanced', label: 'Enhanced', hint: 'detail boost' },
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
                  <div className="text-[10px] font-bold uppercase tracking-widest">{option.label}</div>
                  <div className="mt-1 text-[9px] text-white/45">{option.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">POČET PIXELŮ</div>
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
            {mode === 'faithful' ? (
              <div className="text-[9px] text-white/35">
                Faithful mód běží přes `fal-ai/aura-sr` ve 4× kvalitě a při volbě 2× výstup jemně zmenší zpět bez kreativního přemalování.
              </div>
            ) : null}
          </div>

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
              {selectedInput?.dataUrl ? (
                <img src={selectedInput.dataUrl} alt={selectedInput.file.name} className="w-full h-[180px] object-cover opacity-92 hover:opacity-100 transition-opacity" />
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
              Přetáhni více obrázků najednou nebo přidej obrázky z pravé knihovny po jednom. Batch běží sekvenčně, aby nezatížil storage ani API, a při dalším spuštění přeskočí už hotové výstupy.
            </div>
          </div>

          {mode === 'enhanced' ? (
            <div className="card-surface p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">DOPOČET DETAILU</div>
                  <div className="text-[9px] text-white/35 mt-1">Generativní enhance přes clarity-upscaler.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailBoostEnabled((prev) => !prev)}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${detailBoostEnabled ? 'bg-[#7ed957]/70' : 'bg-white/10'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${detailBoostEnabled ? 'translate-x-4' : ''}`}
                  />
                </button>
              </div>

              <div className={`${detailBoostEnabled ? 'opacity-100' : 'opacity-45'} transition-opacity`}>
                <div className="flex items-center justify-between text-[10px] text-white/45 mb-2">
                  <span>Síla detailu</span>
                  <span>{detailBoost}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={detailBoost}
                  disabled={!detailBoostEnabled}
                  onChange={(e) => setDetailBoost(Number(e.target.value))}
                  className="w-full h-[2px] accent-[#7ed957] opacity-80"
                />
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] px-3 py-2">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-white/35">Creativity</div>
                    <div className="mt-1 text-[10px] text-white/80">{creativity.toFixed(2)}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] px-3 py-2">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-white/35">Resemblance</div>
                    <div className="mt-1 text-[10px] text-white/80">{resemblance.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card-surface p-3 space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">ENDPOINT</div>
              <div className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] px-3 py-2 text-[10px] text-white/75">
                fal-ai/aura-sr • checkpoint v2 • overlapping tiles
              </div>
              <div className="text-[9px] text-white/35">
                Faithful mód je zaměřený na čisté zvýšení rozlišení bez promptu, bez creativity a bez přemalování scény.
              </div>
            </div>
          )}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 z-10 border-b border-white/5 bg-[var(--bg-main)]/70 backdrop-blur">
          <div className="px-6 py-4 flex flex-wrap items-center gap-4 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Mode</div>
              <div className="text-[10px] text-white/75">{mode === 'faithful' ? 'Faithful' : 'Enhanced'}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Scale</div>
              <div className="text-[10px] text-white/75">{scale}×</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Inputs</div>
              <div className="text-[10px] text-white/75">{inputs.length}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Pending</div>
              <div className="text-[10px] text-white/75">{pendingCount}</div>
            </div>
            {batchProgress ? (
              <div className="flex items-center gap-3">
                <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Batch</div>
                <div className="text-[10px] text-white/75">{batchProgress.current}/{batchProgress.total} • {batchProgress.fileName}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 auto-rows-min">
            <article className="card-surface p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-[#7ed957]" />
                  <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Zdroj</div>
                </div>
                {selectedInput ? (
                  <button
                    type="button"
                    onClick={() => removeInput(selectedInput.id)}
                    className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[9px] font-bold uppercase tracking-widest text-white/65 hover:text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Odebrat
                  </button>
                ) : null}
              </div>
              {selectedInput?.dataUrl ? (
                <img src={selectedInput.dataUrl} alt={selectedInput.file.name} className="w-full aspect-square object-cover rounded-2xl border border-white/10 bg-black/20" />
              ) : (
                <div className="aspect-square rounded-2xl border border-dashed border-white/10 bg-black/20 flex flex-col items-center justify-center text-white/40">
                  <Upload className="w-6 h-6 mb-3" />
                  <div className="text-[11px] uppercase tracking-widest">Nahraj vstup</div>
                </div>
              )}
            </article>

            <article className="card-surface p-4">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Výstup</div>
                  <div className="mt-1 text-[11px] text-white/45">
                    {selectedOutput?.status === 'done'
                      ? selectedOutput.detailsText
                      : selectedOutput?.status === 'error'
                        ? selectedOutput.error || 'Upscale selhal'
                        : selectedOutput?.detailsText || 'Zatím žádný výstup'}
                  </div>
                </div>
                {selectedOutput?.status === 'done' && selectedOutput.dataUrl ? (
                  <button
                    type="button"
                    onClick={() => downloadDataUrl(selectedOutput.dataUrl!, `${selectedOutput.inputName.replace(/\.[^.]+$/, '')}-${scale}x.png`)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[10px] font-bold uppercase tracking-widest text-white/75 hover:text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Stáhnout
                  </button>
                ) : null}
              </div>

              {selectedOutput?.dataUrl ? (
                <button
                  type="button"
                  onClick={() => setLightboxUrl(selectedOutput.dataUrl || null)}
                  className="block w-full cursor-zoom-in"
                  title="Otevřít na celou obrazovku"
                >
                  <img
                    src={selectedOutput.dataUrl}
                    alt="Upscaled output"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 object-contain max-h-[70vh]"
                  />
                </button>
              ) : (
                <div className="aspect-[4/3] rounded-2xl border border-dashed border-white/10 bg-black/20 flex flex-col items-center justify-center text-white/45 px-6 text-center">
                  <Sparkles className="w-6 h-6 mb-3" />
                  <div className="text-[11px] uppercase tracking-widest font-bold">{phaseLabel || 'Připraveno na upscale'}</div>
                  <div className="text-[10px] text-white/35 mt-2">
                    Faithful mód je určený pro čisté zvýšení rozlišení. Enhanced mód ponechává generativní clarity workflow jako volitelný detail boost.
                  </div>
                  {(isGenerating || batchProgress) ? (
                    <div className="w-full max-w-[320px] mt-5 space-y-2">
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out shadow-[0_0_14px_rgba(126,217,87,0.35)]"
                          style={{ width: `${Math.min(100, Math.max(8, phaseProgress))}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-[#7ed957]">
                        {batchProgress ? `${batchProgress.current}/${batchProgress.total} • ${phaseLabel || 'Pracuji…'}` : (phaseLabel || 'Pracuji…')}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </article>
          </div>

          {inputs.length > 0 ? (
            <article className="card-surface p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Batch Queue</div>
                  <div className="mt-1 text-[11px] text-white/40">Vyberte náhled, sledujte stav a stahujte hotové výstupy po jednom.</div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {inputs.map((input) => {
                  const output = outputs.find((item) => item.inputId === input.id);
                  const isSelected = selectedInputId === input.id;
                  return (
                    <button
                      key={input.id}
                      type="button"
                      onClick={() => setSelectedInputId(input.id)}
                      className={`text-left rounded-2xl overflow-hidden border transition-all ${
                        isSelected ? 'border-[#7ed957]/60 shadow-[0_0_0_1px_rgba(126,217,87,0.25)]' : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      <img src={input.dataUrl} alt={input.file.name} className="w-full aspect-square object-cover bg-black/20" />
                      <div className="p-3 bg-[var(--bg-input)]">
                        <div className="text-[10px] font-bold text-white truncate">{input.file.name}</div>
                        <div className="mt-1 text-[9px] text-white/45">
                          {output?.status === 'done'
                            ? 'Hotovo'
                            : output?.status === 'error'
                              ? 'Chyba'
                              : output?.status === 'running'
                                ? phaseLabel || 'Běží'
                                : output?.status === 'pending'
                                  ? 'Čeká'
                                  : 'Připraveno'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>
          ) : null}
        </div>
      </section>

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[120] bg-black/92 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-5 right-5 px-3 py-2 rounded-lg border border-white/10 bg-black/30 text-[10px] font-bold uppercase tracking-widest text-white/75 hover:text-white"
          >
            Zavřít
          </button>
          <img
            src={lightboxUrl}
            alt="Upscaled preview fullscreen"
            className="max-w-[96vw] max-h-[94vh] object-contain rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
