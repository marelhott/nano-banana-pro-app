import React from 'react';
import { Download, Sparkles, Upload } from 'lucide-react';
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
  const inputFileId = React.useMemo(() => `ai-upscaler-input-${Math.random().toString(36).slice(2)}`, []);

  const phaseLabel =
    phase === 'queue' ? 'Ve frontě' : phase === 'running' ? 'Zpracovávám' : phase === 'finalizing' ? 'Dokončuji' : '';

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
    <div className="flex-1 min-w-0 flex overflow-hidden">
      <div className="w-[360px] shrink-0 border-r border-white/5 bg-[var(--bg-card)] overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">AI Upscaler</div>
            <h2 className="text-2xl font-semibold text-white">Clarity Upscaler</h2>
            <p className="text-sm text-white/55 leading-relaxed">
              Zvětší obrázek přes <span className="text-white/80">fal-ai/clarity-upscaler</span> a podle potřeby dopočítá jemné detaily.
            </p>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onInputDrop}
            className="relative rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4"
          >
            {input ? (
              <div className="space-y-3">
                <img src={input.dataUrl} alt={input.file.name} className="w-full aspect-[4/3] object-cover rounded-xl border border-white/10" />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{input.file.name}</div>
                    <div className="text-xs text-white/45">Přetáhni jiný obrázek nebo nahraj nový.</div>
                  </div>
                  <label
                    htmlFor={inputFileId}
                    className="shrink-0 px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-xs text-white/80 cursor-pointer transition-colors"
                  >
                    Změnit
                  </label>
                </div>
              </div>
            ) : (
              <label htmlFor={inputFileId} className="block cursor-pointer">
                <div className="aspect-[4/3] rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.05] to-white/[0.02] flex flex-col items-center justify-center gap-3 text-center px-6">
                  <div className="w-12 h-12 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-white/70" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Nahraj obrázek pro upscale</div>
                    <div className="text-xs text-white/45 mt-1">Můžeš sem přetáhnout i obrázek z pravé knihovny.</div>
                  </div>
                </div>
              </label>
            )}
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
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/45 mb-2">Měřítko</div>
              <div className="grid grid-cols-2 gap-2">
                {[2, 4].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScale(value as 2 | 4)}
                    className={`px-4 py-3 rounded-xl border text-sm transition-colors ${
                      scale === value
                        ? 'border-[#7ed957]/45 bg-[#7ed957]/12 text-[#d9ffbf]'
                        : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'
                    }`}
                  >
                    {value}× upscale
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
              <label className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-white">Dopočítat detail</div>
                  <div className="text-xs text-white/45">Model může jemně domyslet textury a ostrost místo čistého zvětšení.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailBoostEnabled((prev) => !prev)}
                  className={`relative inline-flex h-7 w-12 rounded-full transition-colors ${detailBoostEnabled ? 'bg-[#7ed957]/70' : 'bg-white/10'}`}
                >
                  <span
                    className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform ${detailBoostEnabled ? 'translate-x-5' : ''}`}
                  />
                </button>
              </label>

              <div className={`${detailBoostEnabled ? 'opacity-100' : 'opacity-50'} transition-opacity`}>
                <div className="flex items-center justify-between text-xs text-white/45 mb-2">
                  <span>Síla dopočtu</span>
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
                  className="w-full accent-[#7ed957]"
                />
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-white/55">
                  <div className="rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                    <div className="text-white/35 uppercase tracking-[0.16em] mb-1">Creativity</div>
                    <div className="text-white">{creativity.toFixed(2)}</div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                    <div className="text-white/35 uppercase tracking-[0.16em] mb-1">Resemblance</div>
                    <div className="text-white">{resemblance.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.03] px-4 py-3 text-xs text-amber-100/80">
              Potřebuješ vložený <span className="text-white">fal.ai API key</span>. Když chybí, otevři nastavení a doplň ho.
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!input || isGenerating}
                className="flex-1 px-4 py-3 rounded-2xl bg-[#7ed957] text-[#0b120d] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (phaseLabel ? `AI Upscaler • ${phaseLabel}` : 'Zpracovávám…') : `Spustit ${scale}× upscale`}
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-4 py-3 rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-white/75 hover:bg-white/[0.06]"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 bg-[var(--bg-main)] overflow-y-auto custom-scrollbar">
        <div className="p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">Output</div>
                <h3 className="text-xl font-semibold text-white mt-2">Upscaled výsledky</h3>
              </div>
              {output?.status === 'done' && output.dataUrl ? (
                <button
                  type="button"
                  onClick={() => downloadDataUrl(output.dataUrl!, `ai-upscaler-${scale}x.png`)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white/80 hover:bg-white/[0.06]"
                >
                  <Download className="w-4 h-4" />
                  Stáhnout
                </button>
              ) : null}
            </div>

            {!output ? (
              <div className="rounded-[28px] border border-white/8 bg-gradient-to-br from-white/[0.04] to-transparent p-10 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white/60" />
                </div>
                <div className="mt-4 text-lg font-medium text-white">Připraveno na upscale</div>
                <div className="mt-2 text-sm text-white/45">
                  Nahraj obrázek vlevo, vyber si 2× nebo 4× a případně zapni dopočet detailu.
                </div>
              </div>
            ) : (
              <div className="grid xl:grid-cols-[minmax(280px,360px)_1fr] gap-6">
                <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/40 mb-3">Zdroj</div>
                  {input ? (
                    <img src={input.dataUrl} alt={input.file.name} className="w-full rounded-2xl border border-white/10 object-cover" />
                  ) : null}
                </div>

                <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-white/40">Výstup</div>
                      <div className="text-sm text-white/55 mt-1">{output.detailsText}</div>
                    </div>
                    {output.status === 'pending' ? (
                      <div className="text-xs px-3 py-1.5 rounded-full border border-[#7ed957]/25 bg-[#7ed957]/10 text-[#d9ffbf]">
                        {phaseLabel || 'Čekám…'}
                      </div>
                    ) : null}
                  </div>

                  {output.dataUrl ? (
                    <img src={output.dataUrl} alt="Upscaled output" className="w-full rounded-2xl border border-white/10 object-cover" />
                  ) : (
                    <div className="aspect-[4/3] rounded-2xl border border-dashed border-white/10 bg-black/10 flex items-center justify-center text-white/45">
                      {phaseLabel || 'Čekám na výsledek…'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
