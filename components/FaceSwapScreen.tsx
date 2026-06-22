import React from 'react';
import { Download, Sparkles, Upload } from 'lucide-react';
import type { HeadSwapGender, ProviderSettings } from '../services/aiProvider';
import type { HeadSwapMode, HeadSwapModelChoice, HeadSwapProgress } from '../services/headSwapService';
import { runHeadSwap } from '../services/headSwapService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { ImageDatabase } from '../utils/imageDatabase';
import { downloadDataUrl, fileToDataUrl, resolveDropToFile } from './styleTransfer/utils';
import { AtelierEmptyState, AtelierInfoRows, AtelierRightPanel, AtelierSection } from './atelier/AtelierLayout';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type ImageSlot = {
  file: File;
  dataUrl: string;
};

type FaceSwapOutputCard = {
  id: string;
  provider: string;
  label: string;
  dataUrl?: string;
  status: 'pending' | 'done' | 'error';
  createdAt: number;
  error?: string;
};

function plannedProviders(choice: HeadSwapModelChoice): Array<{ provider: string; label: string }> {
  if (choice === 'gemini') return [{ provider: 'gemini', label: 'Gemini' }];
  if (choice === 'openai') return [{ provider: 'openai', label: 'GPT Img 2' }];
  return [
    { provider: 'gemini', label: 'Gemini' },
    { provider: 'openai', label: 'GPT Img 2' },
  ];
}

export function FaceSwapScreen(props: {
  providerSettings: ProviderSettings;
  onOpenSettings: () => void;
  onOpenLibrary?: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
  theme?: 'dark' | 'light';
}) {
  const { providerSettings, onOpenSettings, onOpenLibrary, onToast, theme = 'dark' } = props;

  const [source, setSource] = React.useState<ImageSlot | null>(null);
  const [target, setTarget] = React.useState<ImageSlot | null>(null);
  const [mode, setMode] = React.useState<HeadSwapMode>('head');
  const [hairSource, setHairSource] = React.useState<'user' | 'target'>(providerSettings.headSwap?.hairSource || 'target');
  const [genderOverride, setGenderOverride] = React.useState<HeadSwapGender>('default');
  const [selectedModels, setSelectedModels] = React.useState<HeadSwapModelChoice>('both');
  const [outputCount, setOutputCount] = React.useState<1 | 2 | 3>(2);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [outputs, setOutputs] = React.useState<FaceSwapOutputCard[]>([]);
  const [runMeta, setRunMeta] = React.useState<string>('Zatím žádný výstup');
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<HeadSwapProgress | null>(null);

  const sourceInputId = React.useMemo(() => `face-swap-source-${Math.random().toString(36).slice(2)}`, []);
  const targetInputId = React.useMemo(() => `face-swap-target-${Math.random().toString(36).slice(2)}`, []);

  const modelSummary = React.useMemo(() => {
    if (selectedModels === 'both') return 'Gemini + GPT Image 2';
    if (selectedModels === 'openai') return 'GPT Image 2';
    return 'Gemini Nano Banana';
  }, [selectedModels]);

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
      onToast({ type: 'error', message: 'Nahraj zdrojovou identitu i cílový obrázek.' });
      return;
    }

    setIsGenerating(true);
    const providers = plannedProviders(selectedModels);
    const placeholders: FaceSwapOutputCard[] = providers.flatMap((provider) =>
      Array.from({ length: outputCount }, (_, index) => ({
        id: `${provider.provider}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        provider: provider.provider,
        label: `${provider.label} • ${index + 1}/${outputCount}`,
        status: 'pending' as const,
        createdAt: Date.now() + index,
      }))
    );
    setOutputs(placeholders);
    setRunMeta(`${mode} swap • ${modelSummary} • ${outputCount}× na model`);
    setProgress({
      stage: 'composing',
      totalJobs: placeholders.length,
      completedJobs: 0,
      failedJobs: 0,
      activeLabel: 'Připravuji vstup',
    });

    try {
      const result = await runHeadSwap({
        request: {
          sourceImage: source.dataUrl,
          targetImage: target.dataUrl,
          mode,
          hairSource: hairSource,
          selectedModels,
          outputCount,
          sourceGender: genderOverride,
        },
        settings: providerSettings,
        onOutput: (output) => {
          setOutputs((prev) => {
            const idx = prev.findIndex((item) => item.provider === (output.provider === 'gemini-identity-edit' ? 'gemini' : 'openai') && item.status === 'pending');
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              label: output.label,
              dataUrl: output.imageBase64,
              status: 'done',
            };
            return next;
          });
        },
        onProgress: (nextProgress) => {
          setProgress(nextProgress);
        },
      });

      const completedOutputs = result.outputs.map((item, index) => ({
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        provider: item.provider,
        label: item.label,
        dataUrl: item.imageBase64,
        status: 'done' as const,
        createdAt: Date.now() + index,
      }));

      setOutputs(completedOutputs);
      setRunMeta(`${mode} swap • ${result.attemptedProviders.join(' + ')} • ${completedOutputs.length} výsledků`);

      try {
        for (const item of completedOutputs) {
          const thumbnail = await createThumbnail(item.dataUrl, 420);
          await saveToGallery({
            id: item.id,
            url: item.dataUrl,
            thumbnail,
            prompt: `${mode === 'head' ? 'Head Swap' : 'Face Swap'} • ${item.label}`,
            resolution: 'match',
            aspectRatio: 'Original',
            params: {
              operation: 'head-swap',
              mode,
              hairSource: hairSource,
              provider: item.provider,
              selectedModels,
              outputCount,
            },
          });
        }
      } catch (error) {
        console.error('[FaceSwap] Failed to save output to gallery:', error);
      }

      onToast({
        type: 'success',
        message: `Swap hotový. Vygenerováno ${completedOutputs.length} výsledků přes ${modelSummary}.`,
      });
    } catch (error: any) {
      setOutputs((prev) => prev.map((item) => ({
        ...item,
        status: 'error',
        error: error?.message || 'Face swap selhal.',
      })));
      setRunMeta('Swap selhal');
      onToast({ type: 'error', message: error?.message || 'Face swap selhal.' });
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }, [mode, modelSummary, onToast, outputCount, hairSource, providerSettings, selectedModels, source, target]);

  const renderDropSlot = (
    kind: 'source' | 'target',
    label: string,
    hint: string,
    slot: ImageSlot | null,
    inputId: string,
  ) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="mn-section-label">{label}</div>
        <div className="text-[9px] text-[var(--text-secondary)]">{slot ? 1 : 0}</div>
      </div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => void onDropToSlot(kind, e)}
        className="mn-upload-zone block"
      >
        {slot?.dataUrl ? (
          <img src={slot.dataUrl} alt={slot.file.name} className="w-full h-full object-cover opacity-92 hover:opacity-100 transition-opacity" />
        ) : (
          <div className="mn-upload-placeholder flex-col gap-1.5">
            <Upload className="w-4 h-4" strokeWidth={1.8} />
            <span className="text-[9px] uppercase tracking-[0.2em]">Upload</span>
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
      <div className="text-[8px] leading-4 text-white/35">{hint}</div>
    </div>
  );

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[320px] shrink-0 h-full overflow-y-auto custom-scrollbar cairn-panel-left text-[11px]"
        style={theme === 'dark' ? {backdropFilter:'blur(32px) saturate(200%)', background:'linear-gradient(160deg,rgba(32,44,24,0.94) 0%,rgba(20,28,15,0.96) 100%)', boxShadow:'4px 0 48px rgba(0,0,0,0.50), inset 0 0 120px rgba(125,154,100,0.08)'} : {background:'#ffffff', borderRight:'1px solid #cdd8ba'}}>
        <div className="p-5 flex flex-col gap-3.5 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#a8bf8f] rounded-full shadow-[0_0_10px_rgba(168,191,143,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Face Swap</h2>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!source || !target || isGenerating}
            className="mn-action-primary ambient-glow glow-green glow-weak"
          >
            {isGenerating ? 'Swapping…' : mode === 'head' ? 'Spustit Head Swap' : 'Spustit Face Swap'}
          </button>

          <div className="space-y-1.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">VARIANTA</div>
            <div className="flex items-center gap-2">
              {(['head', 'face'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={`mn-option-button flex-1 whitespace-nowrap ${mode === item ? 'mn-option-button-active' : ''}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">MODEL</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'gemini', label: 'Gemini' },
                { id: 'openai', label: 'GPT Img 2' },
                { id: 'both', label: 'Oba' },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedModels(item.id)}
                  className={`mn-option-button whitespace-nowrap ${selectedModels === item.id ? 'mn-option-button-active' : ''}`}
                >
                  <span className="block truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Počet výstupů</div>
            <div className="mn-count-selector">
              {([1, 2, 3] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setOutputCount(count)}
                  className={`mn-count-option ${outputCount === count ? 'mn-count-option-active' : ''}`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="mn-section-label">Vstupní obrázky</div>
            <div className="grid grid-cols-2 gap-2">
              {renderDropSlot('target', 'CÍL', 'Obrázek, do kterého se vloží nová hlava nebo obličej.', target, targetInputId)}
              {renderDropSlot('source', 'ZDROJ', 'Člověk, od kterého se převezme hlava nebo obličej.', source, sourceInputId)}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">WORKFLOW</div>
            <div className="rounded-lg bg-[rgba(24,34,18,0.70)] backdrop-blur-sm border border-[rgba(168,191,143,0.18)] px-3 py-2 text-[9px] text-white/75 leading-4">
              Skrytý prompt + zvolený model + až 3 výstupy na model.
            </div>
            <div className="text-[8px] leading-4 text-white/35">
              `Cíl` je fotka, kterou chceš upravit. `Zdroj` je člověk, jehož hlava nebo obličej se přenese do cíle.
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="mn-subaction w-full"
            >
              Settings
            </button>
          </div>
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-4">
          {outputs.length > 0 ? (
            <div className="flex flex-wrap gap-4 items-start">
              {outputs.map((item) => {
                const isDone = item.status === 'done' && !!item.dataUrl;
                const progressPercent = progress
                  ? Math.max(6, Math.min(100, Math.round((progress.completedJobs / Math.max(1, progress.totalJobs)) * 100)))
                  : 0;
                return (
                  <article key={item.id} className="space-y-2 w-full max-w-[340px]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold truncate">{item.label}</div>
                      {isDone && item.dataUrl ? (
                        <button
                          type="button"
                          onClick={() => downloadDataUrl(item.dataUrl!, `mulen-face-swap-${item.provider}-${mode}.png`)}
                          className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-[rgba(168,191,143,0.18)] bg-[rgba(24,34,18,0.70)] backdrop-blur-sm text-[9px] font-bold uppercase tracking-[0.18em] text-white/75 hover:text-white transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Stáhnout
                        </button>
                      ) : null}
                    </div>

                    {isDone ? (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(item.dataUrl!)}
                        className="block w-full cursor-zoom-in"
                        title="Otevřít na celou obrazovku"
                      >
                        <img
                          src={item.dataUrl}
                          alt={item.label}
                          className="w-full aspect-square object-cover bg-[rgba(28,40,20,0.70)]"
                        />
                      </button>
                    ) : (
                      <div className="aspect-square bg-[rgba(28,40,20,0.70)] flex flex-col items-center justify-center px-5 text-center">
                        <Sparkles className={`w-4 h-4 mb-3 ${item.status === 'error' ? 'text-red-400' : 'text-[#a8bf8f]'}`} />
                        <div className="w-full max-w-[200px] space-y-2">
                          <div className="relative h-[2px] bg-white/8 rounded-full overflow-hidden">
                            <div
                              className={`${item.status === 'error' ? 'bg-red-400/80' : 'bg-[var(--accent)]'} h-full rounded-full transition-all duration-500`}
                              style={{ width: item.status === 'error' ? '100%' : `${progressPercent}%` }}
                            />
                          </div>
                          <div className="text-[8px] uppercase tracking-[0.24em] text-white/45">
                            {item.status === 'error' ? 'Chyba' : (progress?.activeLabel || 'Provádím swap')}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="text-[9px] text-white/35">
                      {item.status === 'error'
                        ? (item.error || 'Swap selhal.')
                        : isDone
                          ? 'Klik pro zvětšení'
                          : 'Placeholder běhu se po dokončení nahradí výstupem'}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <AtelierEmptyState
              title="Připraveno na swap"
              description="Nahraj cíl a zdroj vlevo, potom spusť výměnu."
            />
          )}
        </div>
      </section>

      <AtelierRightPanel onOpenLibrary={onOpenLibrary}>
        <AtelierSection title="Stav úlohy">
          <AtelierInfoRows
            rows={[
              { label: 'Mode', value: mode },
              { label: 'Model', value: modelSummary },
              { label: 'Počet', value: `${outputCount}×` },
              { label: 'Výstupů', value: outputs.filter(o => o.status === 'done').length },
            ]}
          />
          <div className="rounded-md border border-[rgba(168,191,143,0.18)] bg-[rgba(28,40,20,0.70)] px-3 py-2 text-[8px] font-medium leading-relaxed text-[var(--text-secondary)]">
            {runMeta}
          </div>
          {progress ? (
            <div className="rounded-md border border-[rgba(168,191,143,0.18)] bg-[rgba(28,40,20,0.70)] px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              {progress.completedJobs}/{progress.totalJobs} • {progress.activeLabel}
            </div>
          ) : null}
        </AtelierSection>

        <AtelierSection title="Pokročilé">
          <div className="space-y-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)] mb-1.5">Pohlaví (gender override)</div>
              <div className="grid grid-cols-2 gap-1">
                {(['default', 'a man', 'a woman', 'nonbinary person'] as const).map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGenderOverride(g)}
                    className={`px-2 py-1.5 rounded text-[8px] font-bold uppercase tracking-wider border transition-all ${genderOverride === g ? 'border-[var(--accent)] text-[var(--accent)] bg-[rgba(168,191,143,0.10)]' : 'border-[rgba(168,191,143,0.15)] text-[var(--text-secondary)] hover:border-[rgba(168,191,143,0.35)]'}`}
                  >
                    {g === 'default' ? 'Automaticky' : g === 'a man' ? 'Muž' : g === 'a woman' ? 'Žena' : 'Nebinární'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)] mb-1.5">Vlasy</div>
              <div className="grid grid-cols-2 gap-1">
                {(['target', 'user'] as const).map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHairSource(h)}
                    className={`px-2 py-1.5 rounded text-[8px] font-bold uppercase tracking-wider border transition-all ${hairSource === h ? 'border-[var(--accent)] text-[var(--accent)] bg-[rgba(168,191,143,0.10)]' : 'border-[rgba(168,191,143,0.15)] text-[var(--text-secondary)] hover:border-[rgba(168,191,143,0.35)]'}`}
                  >
                    {h === 'target' ? 'Z cíle' : 'Ze zdroje'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </AtelierSection>
      </AtelierRightPanel>

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[120] bg-black/92 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-5 right-5 px-3 py-2 rounded-lg border border-[rgba(168,191,143,0.18)] bg-black/30 text-[10px] font-bold uppercase tracking-widest text-white/75 hover:text-white"
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
