import React from 'react';
import { ArrowRightLeft, Download, Sparkles, Upload, User } from 'lucide-react';
import type { ProviderSettings } from '../services/aiProvider';
import type { HeadSwapMode } from '../services/headSwapService';
import { runHeadSwap } from '../services/headSwapService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { ImageDatabase } from '../utils/imageDatabase';
import { downloadDataUrl, fileToDataUrl, resolveDropToFile } from './styleTransfer/utils';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type ImageSlot = {
  file: File;
  dataUrl: string;
};

type FaceSwapOutput = {
  id: string;
  dataUrl?: string;
  status: 'pending' | 'done';
  createdAt: number;
  detailsText?: string;
};

export function FaceSwapScreen(props: {
  providerSettings: ProviderSettings;
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { providerSettings, onOpenSettings, onToast } = props;

  const [source, setSource] = React.useState<ImageSlot | null>(null);
  const [target, setTarget] = React.useState<ImageSlot | null>(null);
  const [mode, setMode] = React.useState<HeadSwapMode>('head');
  const [preserveHair, setPreserveHair] = React.useState<'target' | 'user'>(
    providerSettings.headSwap?.hairSource || 'target'
  );
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [output, setOutput] = React.useState<FaceSwapOutput | null>(null);
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);

  const sourceInputId = React.useMemo(() => `face-swap-source-${Math.random().toString(36).slice(2)}`, []);
  const targetInputId = React.useMemo(() => `face-swap-target-${Math.random().toString(36).slice(2)}`, []);

  const headSwapSettings = React.useMemo(() => ({
    preferredPrimary: 'replicate-easel' as const,
    hairSource: 'target' as const,
    sourceGender: 'default' as const,
    secondarySourceGender: 'default' as const,
    useUpscale: true,
    useDetailer: false,
    facefusionEndpoint: '',
    refaceEndpoint: '',
    ...(providerSettings.headSwap || {}),
  }), [providerSettings.headSwap]);

  const configuredProviders = React.useMemo(() => {
    const providers: string[] = [];
    if (String(providerSettings.replicate?.apiKey || '').trim()) {
      providers.push('Replicate Easel');
    }
    if (String(headSwapSettings.facefusionEndpoint || '').trim()) {
      providers.push('FaceFusion fallback');
    }
    if (String(headSwapSettings.refaceEndpoint || '').trim()) {
      providers.push('REFace fallback');
    }
    return providers;
  }, [headSwapSettings.facefusionEndpoint, headSwapSettings.refaceEndpoint, providerSettings.replicate?.apiKey]);

  const pickSlotFile = React.useCallback(
    async (kind: 'source' | 'target', file: File) => {
      try {
        const dataUrl = await fileToDataUrl(file);
        const next = { file, dataUrl };
        if (kind === 'source') {
          setSource(next);
          try {
            await ImageDatabase.add(file, dataUrl, 'reference');
          } catch {
            // Keep screen functional even if library mirroring fails.
          }
        } else {
          setTarget(next);
          try {
            await ImageDatabase.add(file, dataUrl, 'asset');
          } catch {
            // Keep screen functional even if library mirroring fails.
          }
        }
      } catch (error: any) {
        onToast({ type: 'error', message: error?.message || 'Nepodařilo se načíst obrázek.' });
      }
    },
    [onToast]
  );

  const onDropToSlot = React.useCallback(
    async (kind: 'source' | 'target', e: React.DragEvent) => {
      e.preventDefault();
      try {
        const file = await resolveDropToFile(e);
        if (!file) return;
        await pickSlotFile(kind, file);
      } catch (error: any) {
        onToast({ type: 'error', message: error?.message || 'Nepodařilo se načíst obrázek z dropu.' });
      }
    },
    [onToast, pickSlotFile]
  );

  const handleGenerate = React.useCallback(async () => {
    if (!source?.dataUrl || !target?.dataUrl) {
      onToast({ type: 'error', message: 'Nahraj zdrojový obličej i cílový obrázek.' });
      return;
    }

    setIsGenerating(true);
    const pendingId = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setOutput({
      id: pendingId,
      status: 'pending',
      createdAt: Date.now(),
      detailsText: `Head swap • ${configuredProviders.join(' → ') || 'není nakonfigurováno'}`,
    });

    try {
      const result = await runHeadSwap({
        request: {
          sourceImage: source.dataUrl,
          targetImage: target.dataUrl,
          mode,
          hairSource: preserveHair,
        },
        settings: providerSettings,
      });

      const completed: FaceSwapOutput = {
        id: pendingId,
        dataUrl: result.imageBase64,
        status: 'done',
        createdAt: Date.now(),
        detailsText: `${result.provider} • ${result.attemptedProviders.join(' → ')}`,
      };
      setOutput(completed);

      try {
        const thumbnail = await createThumbnail(result.imageBase64, 420);
        await saveToGallery({
          id: pendingId,
          url: result.imageBase64,
          thumbnail,
          prompt: mode === 'head' ? 'Head Swap' : 'Face Swap',
          resolution: 'match',
          aspectRatio: 'Original',
          params: {
            operation: 'head-swap',
            mode,
            hairSource: preserveHair,
            provider: result.provider,
            attemptedProviders: result.attemptedProviders,
          },
        });
      } catch (error) {
        console.error('[FaceSwap] Failed to save output to gallery:', error);
      }

      onToast({
        type: 'success',
        message: result.provider === 'replicate-easel'
          ? 'Swap hotový přes Replicate Easel.'
          : `Swap hotový přes fallback ${result.provider}.`,
      });
    } catch (error: any) {
      setOutput(null);
      onToast({ type: 'error', message: error?.message || 'Face swap selhal.' });
    } finally {
      setIsGenerating(false);
    }
  }, [configuredProviders, mode, onToast, preserveHair, providerSettings, source, target]);

  const renderDropSlot = (
    kind: 'source' | 'target',
    label: string,
    hint: string,
    slot: ImageSlot | null,
    inputId: string,
  ) => (
    <div className="card-surface p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">{label}</div>
        <div className="text-[12px] leading-none font-semibold text-[#9aa5ba]">{slot ? 1 : 0}</div>
      </div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => void onDropToSlot(kind, e)}
        className="block w-full h-[170px] rounded-[16px] bg-[#060d17] border border-dashed border-[#16263a] hover:border-[#223a57] transition-colors cursor-pointer overflow-hidden"
      >
        {slot?.dataUrl ? (
          <img src={slot.dataUrl} alt={slot.file.name} className="w-full h-full object-cover opacity-92 hover:opacity-100 transition-opacity" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[#8f9aae]">
            <Upload className="w-5 h-5" strokeWidth={1.8} />
            <span className="text-[10px] uppercase tracking-widest">Upload</span>
          </div>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickSlotFile(kind, file);
        }}
      />
      <div className="text-[9px] text-white/35">{hint}</div>
    </div>
  );

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[340px] shrink-0 h-full overflow-y-auto custom-scrollbar border-r border-white/5 bg-[var(--bg-card)] text-[11px]">
        <div className="p-6 flex flex-col gap-6 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Face Swap</h2>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!source || !target || isGenerating}
            className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none"
          >
            {isGenerating ? 'Swapping…' : mode === 'head' ? 'Spustit Head Swap' : 'Spustit Face Swap'}
          </button>

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">REŽIM</div>
            <div className="flex items-center justify-between bg-transparent pt-1">
              {([
                { id: 'head', label: 'Head' },
                { id: 'face', label: 'Face' },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={`w-16 h-6 text-xs font-medium transition-all flex items-center justify-center rounded-sm ${
                    mode === item.id
                      ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card-surface p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">VLASY</div>
                <div className="text-[9px] text-white/35 mt-1">Co má mít prioritu při blendu.</div>
              </div>
              <button
                type="button"
                onClick={() => setPreserveHair((prev) => (prev === 'target' ? 'user' : 'target'))}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${preserveHair === 'user' ? 'bg-[#7ed957]/70' : 'bg-white/10'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${preserveHair === 'user' ? 'translate-x-4' : ''}`}
                />
              </button>
            </div>
            <div className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] px-3 py-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/35">Hair source</div>
              <div className="mt-1 text-[10px] text-white/80">
                {preserveHair === 'user' ? 'Zdrojový člověk' : 'Cílová scéna'}
              </div>
            </div>
          </div>

          {renderDropSlot('target', 'CÍLOVÝ OBRÁZEK', 'Sem dej scénu nebo tělo, ve kterém chceš vyměnit hlavu nebo obličej.', target, targetInputId)}
          {renderDropSlot('source', 'ZDROJOVÁ TVÁŘ / HLAVA', 'Sem dej člověka, od kterého chceš převzít identitu hlavy nebo obličeje.', source, sourceInputId)}

          <div className="card-surface p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">ENGINE STRATEGIE</div>
            <div className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] px-3 py-2 text-[10px] text-white/75">
              {configuredProviders.length > 0 ? configuredProviders.join(' → ') : 'Není nakonfigurováno'}
            </div>
            <div className="text-[9px] text-white/35">
              Primárně běží Replicate Easel. Když selže, použijí se self-hosted fallbacky v pořadí podle nastavení.
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
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Mode</div>
              <div className="text-[10px] text-white/75">{mode}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Hair</div>
              <div className="text-[10px] text-white/75">{preserveHair}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Pipeline</div>
              <div className="text-[10px] text-white/75">{configuredProviders.join(' → ') || 'none'}</div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 gap-6 auto-rows-min">
            <article className="card-surface p-4">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Výstup</div>
                  <div className="mt-1 text-[11px] text-white/45">{output?.detailsText || 'Zatím žádný výstup'}</div>
                </div>
                {output?.status === 'done' && output.dataUrl ? (
                  <button
                    type="button"
                    onClick={() => downloadDataUrl(output.dataUrl!, `mulen-face-swap-${mode}.png`)}
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
                    alt="Face swap output"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 object-contain max-h-[70vh]"
                  />
                </button>
              ) : (
                <div className="aspect-[4/3] rounded-2xl border border-dashed border-white/10 bg-black/20 flex flex-col items-center justify-center text-white/45 px-6 text-center">
                  <Sparkles className="w-6 h-6 mb-3" />
                  <div className="text-[11px] uppercase tracking-widest font-bold">{isGenerating ? 'Provádím swap…' : 'Připraveno na swap'}</div>
                  <div className="text-[10px] text-white/35 mt-2">
                    Nahraj zdroj a cíl vlevo. Výsledný swap se uloží i do galerie a může běžet přes primární engine i fallback pipeline.
                  </div>
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
            alt="Face swap preview fullscreen"
            className="max-w-[96vw] max-h-[94vh] object-contain rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
