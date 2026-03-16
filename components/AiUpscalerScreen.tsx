import React from 'react';
import { Download, Maximize2, Sparkles, Upload } from 'lucide-react';
import { runFalUpscaleQueued } from '../services/falService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { ImageDatabase } from '../utils/imageDatabase';
import { fileToDataUrl, resolveDropToFile } from './styleTransfer/utils';

type ToastType = 'success' | 'error' | 'info';

type ImageSlot = {
  file: File;
  dataUrl: string;
};

type OutputItem = {
  id: string;
  dataUrl?: string;
  status: 'pending' | 'done';
  createdAt: number;
  detailsText?: string;
};

function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function AiUpscalerScreen(props: {
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { onOpenSettings, onToast } = props;

  const [input, setInput] = React.useState<ImageSlot | null>(null);
  const [scale, setScale] = React.useState<2 | 4>(4);
  const [detailBoostEnabled, setDetailBoostEnabled] = React.useState(true);
  const [detailBoost, setDetailBoost] = React.useState(38);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [phase, setPhase] = React.useState<'' | 'queue' | 'running' | 'finalizing'>('');
  const [output, setOutput] = React.useState<OutputItem | null>(null);
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const inputFileId = React.useMemo(() => `ai-upscaler-input-${Math.random().toString(36).slice(2)}`, []);

  const phaseLabel =
    phase === 'queue' ? 'Ve frontě' : phase === 'running' ? 'Zpracovávám' : phase === 'finalizing' ? 'Dokončuji' : '';
  const phaseProgress = phase === 'queue' ? 18 : phase === 'running' ? 72 : phase === 'finalizing' ? 94 : 0;

  const creativity = detailBoostEnabled ? 0.18 + (detailBoost / 100) * 0.62 : 0.12;
  const resemblance = detailBoostEnabled ? 0.93 - (detailBoost / 100) * 0.38 : 0.92;

  const pickInputFile = React.useCallback(
    async (file: File) => {
      try {
        const dataUrl = await fileToDataUrl(file);
        setInput({ file, dataUrl });
        try {
          await ImageDatabase.add(file, dataUrl, 'reference');
        } catch {
          // Keep the screen functional even if library mirror fails.
        }
      } catch (error: any) {
        onToast({ type: 'error', message: error?.message || 'Nepodařilo se načíst obrázek.' });
      }
    },
    [onToast]
  );

  const onInputDrop = React.useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      try {
        const file = await resolveDropToFile(e);
        if (!file) return;
        await pickInputFile(file);
      } catch (error: any) {
        onToast({ type: 'error', message: error?.message || 'Nepodařilo se načíst obrázek z dropu.' });
      }
    },
    [onToast, pickInputFile]
  );

  const handleGenerate = React.useCallback(async () => {
    if (!input?.dataUrl) {
      onToast({ type: 'error', message: 'Nahraj nebo přetáhni obrázek.' });
      return;
    }

    setIsGenerating(true);
    setPhase('queue');
    const pendingId = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setOutput({
      id: pendingId,
      status: 'pending',
      createdAt: Date.now(),
      detailsText: `fal-ai/clarity-upscaler • ${scale}×`,
    });

    try {
      const result = await runFalUpscaleQueued({
        imageUrlOrDataUrl: input.dataUrl,
        upscaleFactor: scale,
        creativity,
        resemblance,
        onPhase: setPhase,
        maxWaitMs: 8 * 60_000,
      });

      const completed: OutputItem = {
        id: pendingId,
        dataUrl: result.image,
        status: 'done',
        createdAt: Date.now(),
        detailsText: `fal-ai/clarity-upscaler • ${scale}× • creativity ${creativity.toFixed(2)} • resemblance ${resemblance.toFixed(2)}`,
      };
      setOutput(completed);

      try {
        const thumbnail = await createThumbnail(result.image, 420);
        await saveToGallery({
          id: pendingId,
          url: result.image,
          thumbnail,
          prompt: detailBoostEnabled ? `AI Upscaler ${scale}× + detail boost` : `AI Upscaler ${scale}×`,
          resolution: `${scale}×`,
          params: {
            engine: 'fal_clarity_upscaler',
            scale,
            creativity,
            resemblance,
            operation: 'upscale',
          },
        });
      } catch (error) {
        console.error('[AI Upscaler] Failed to save output to gallery:', error);
      }

      onToast({
        type: 'success',
        message: detailBoostEnabled ? `Upscale ${scale}× hotový i s dopočtem detailu.` : `Upscale ${scale}× hotový.`,
      });
    } catch (error: any) {
      setOutput(null);
      onToast({ type: 'error', message: error?.message || 'Upscale selhal.' });
    } finally {
      setIsGenerating(false);
      setPhase('');
    }
  }, [creativity, detailBoostEnabled, input, onToast, resemblance, scale]);

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[340px] shrink-0 h-full overflow-y-auto custom-scrollbar border-r border-white/5 bg-[var(--bg-card)] text-[11px]">
        <div className="p-6 flex flex-col gap-6 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">AI Upscaler</h2>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!input || isGenerating}
            className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none"
          >
            {isGenerating ? (phaseLabel ? `Upscaling • ${phaseLabel}` : 'Upscaling…') : `Upscale ${scale}×`}
          </button>

          {isGenerating ? (
            <div className="card-surface p-3 space-y-2">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold">
                <span className="text-white/55">Progress</span>
                <span className="text-[#7ed957]">{phaseLabel || 'Startuji'}</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out shadow-[0_0_14px_rgba(126,217,87,0.35)]"
                  style={{ width: `${phaseProgress}%` }}
                />
              </div>
              <div className="text-[9px] text-white/35">
                {phase === 'queue'
                  ? 'Job je ve frontě fal.ai.'
                  : phase === 'running'
                    ? 'Upscaler právě generuje detail a větší rozlišení.'
                    : phase === 'finalizing'
                      ? 'Stahuji a ukládám finální výstup.'
                      : 'Připravuji požadavek…'}
              </div>
            </div>
          ) : null}

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
          </div>

          <div className="card-surface p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">VSTUPNÍ OBRÁZEK</div>
              <div className="text-[12px] leading-none font-semibold text-[#9aa5ba]">{input ? 1 : 0}</div>
            </div>
            <label
              htmlFor={inputFileId}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onInputDrop}
              className="block w-full h-[170px] rounded-[16px] bg-[#060d17] border border-dashed border-[#16263a] hover:border-[#223a57] transition-colors cursor-pointer overflow-hidden"
            >
              {input?.dataUrl ? (
                <img src={input.dataUrl} alt={input.file.name} className="w-full h-full object-cover opacity-92 hover:opacity-100 transition-opacity" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[#8f9aae]">
                  <Upload className="w-5 h-5" strokeWidth={1.8} />
                  <span className="text-[10px] uppercase tracking-widest">Upload</span>
                </div>
              )}
            </label>
            <input
              id={inputFileId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void pickInputFile(file);
              }}
            />
            <div className="text-[9px] text-white/35">
              Přetáhni obrázek sem nebo z pravé knihovny. Výsledek se uloží i do galerie.
            </div>
          </div>

          <div className="card-surface p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">DOPOČET DETAILU</div>
                <div className="text-[9px] text-white/35 mt-1">Jemně domyslí texturu a ostrost místo čistého resize.</div>
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

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">FAL ENDPOINT</div>
            <div className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] px-3 py-2 text-[10px] text-white/75">
              fal-ai/clarity-upscaler
            </div>
            <div className="text-[9px] text-white/35">
              Potřebuješ vložený fal.ai API key. Když chybí, otevři Settings.
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors"
            >
              Settings
            </button>
          </div>
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 z-10 border-b border-white/5 bg-[var(--bg-main)]/70 backdrop-blur">
          <div className="px-6 py-4 flex flex-wrap items-center gap-4 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Scale</div>
              <div className="text-[10px] text-white/75">{scale}×</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Detail Boost</div>
              <div className="text-[10px] text-white/75">{detailBoostEnabled ? `${detailBoost}%` : 'Off'}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Creativity</div>
              <div className="text-[10px] text-white/75">{creativity.toFixed(2)}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Resemblance</div>
              <div className="text-[10px] text-white/75">{resemblance.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 auto-rows-min">
            <article className="card-surface p-4">
              <div className="flex items-center gap-2 mb-3">
                <Maximize2 className="w-4 h-4 text-[#7ed957]" />
                <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Zdroj</div>
              </div>
              {input?.dataUrl ? (
                <img src={input.dataUrl} alt={input.file.name} className="w-full aspect-square object-cover rounded-2xl border border-white/10 bg-black/20" />
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
                  <div className="mt-1 text-[11px] text-white/45">{output?.detailsText || 'Zatím žádný výstup'}</div>
                </div>
                {output?.status === 'done' && output.dataUrl ? (
                  <button
                    type="button"
                    onClick={() => downloadDataUrl(output.dataUrl!, `ai-upscaler-${scale}x.png`)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[10px] font-bold uppercase tracking-widest text-white/75 hover:text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Stáhnout
                  </button>
                ) : null}
              </div>

              {output?.dataUrl ? (
                <button
                  type="button"
                  onClick={() => setLightboxUrl(output.dataUrl || null)}
                  className="block w-full cursor-zoom-in"
                  title="Otevřít na celou obrazovku"
                >
                  <img
                    src={output.dataUrl}
                    alt="Upscaled output"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 object-contain max-h-[70vh]"
                  />
                </button>
              ) : (
                <div className="aspect-[4/3] rounded-2xl border border-dashed border-white/10 bg-black/20 flex flex-col items-center justify-center text-white/45 px-6 text-center">
                  <Sparkles className="w-6 h-6 mb-3" />
                  <div className="text-[11px] uppercase tracking-widest font-bold">{phaseLabel || 'Připraveno na upscale'}</div>
                  <div className="text-[10px] text-white/35 mt-2">
                    Nahraj obrázek vlevo a spusť upscale. Vizuál i akce teď drží stejný panelový styl jako Mulen Nano.
                  </div>
                  {isGenerating ? (
                    <div className="w-full max-w-[320px] mt-5 space-y-2">
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out shadow-[0_0_14px_rgba(126,217,87,0.35)]"
                          style={{ width: `${phaseProgress}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-[#7ed957]">{phaseLabel || 'Pracuji…'}</div>
                    </div>
                  ) : null}
                </div>
              )}
            </article>
          </div>
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
