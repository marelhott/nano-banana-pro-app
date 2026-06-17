import React from 'react';
import { Download, Images, X } from 'lucide-react';
import { ProviderSelector } from './ProviderSelector';
import { ImageComparisonModal } from './ImageComparisonModal';
import { AtelierEmptyState, AtelierInfoRows, AtelierRightPanel, AtelierSection } from './atelier/AtelierLayout';
import { AIProviderType, type ProviderSettings } from '../services/aiProvider';
import { ProviderFactory } from '../services/providerFactory';
import { fileToDataUrl, resolveDropToFile } from './styleTransfer/utils';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { ImageDatabase } from '../utils/imageDatabase';
import { buildBatchRecipe } from '../utils/generationRecipe';
import { toUserFacingAiError } from '../utils/aiErrorMessage';
import type { ToastType } from './Toast';

type NanoBananaImageModel = 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview';

type BatchPresetId = 'general' | 'portrait' | 'interior';

type InputSlot = {
  id: string;
  file: File;
  dataUrl: string;
};

type OutputStatus = 'pending' | 'running' | 'done' | 'error';

type BatchOutput = {
  id: string;
  inputId: string;
  inputName: string;
  inputDataUrl: string;
  variantIndex: number;
  prompt: string;
  status: OutputStatus;
  dataUrl?: string;
  error?: string;
  createdAt: number;
  modelLabel: string;
};

const BATCH_PRESETS: Array<{ id: BatchPresetId; label: string; title: string; prompt: string }> = [
  {
    id: 'general',
    label: 'Obecný',
    title: 'Obecné vylepšení',
    prompt:
      'Vylepši tuto fotografii obecně. Srovnej její osvětlení, jemně oprav barvy a kontrast, proveď kvalitní upscaling, odstraň rušivé prvky a drobné nedostatky, ale plně zachovej původní scénu, kompozici, materiály i atmosféru. Výsledek musí působit přirozeně, věrohodně a profesionálně, bez AI artefaktů, bez přehnané stylizace a bez umělého přepracování.',
  },
  {
    id: 'portrait',
    label: 'Portrét',
    title: 'Portrétní vylepšení',
    prompt:
      'Vylepši tento portrét velmi přirozeně a citlivě. Zachovej identitu člověka, proporce obličeje, texturu pleti, vlasy i výraz. Jemně srovnej světlo, tón pleti, kontrast a ostrost, proveď kvalitní upscaling a odstraň rušivé drobnosti. Výsledek musí působit jako špičkově nafocený portrét, ne jako přemalovaný nebo plastický AI obraz.',
  },
  {
    id: 'interior',
    label: 'Interiér',
    title: 'Interiérové zasazení',
    prompt:
      'Vylepši tento vstup pro interiérovou prezentaci. Barevně i světelně jej zharmonizuj, proveď čistý upscaling a zachovej materiály, strukturu a charakter předlohy. Pokud je vstup detail dekorativní stěny, povrchu nebo prvku, velmi logicky a přirozeně jej rozviň do uvěřitelného interiéru, kde tento prvek dává smysl. Výsledek musí být elegantní, realistický, prostorově přesvědčivý a bez AI slopu nebo laciné stylizace.',
  },
];

const IMAGE_MODEL_PRESETS: Array<{
  id: string;
  title: string;
  subtitle: string;
  provider: AIProviderType;
  model?: NanoBananaImageModel;
}> = [
  {
    id: 'gemini-flash',
    title: 'Nano 2',
    subtitle: 'Gemini 3.1 Flash',
    provider: AIProviderType.GEMINI,
    model: 'gemini-3.1-flash-image-preview',
  },
  {
    id: 'gemini-pro',
    title: 'Nano Pro',
    subtitle: 'Gemini 3 Pro',
    provider: AIProviderType.GEMINI,
    model: 'gemini-3-pro-image-preview',
  },
  {
    id: 'openai-image',
    title: 'GPT Img 2',
    subtitle: 'OpenAI',
    provider: AIProviderType.CHATGPT,
  },
  {
    id: 'flux-pro',
    title: 'Flux Pro',
    subtitle: 'fal.ai',
    provider: AIProviderType.FLUX_PRO,
  },
];

function makeId(prefix: string): string {
  return globalThis.crypto?.randomUUID ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildVariantPrompt(basePrompt: string, variantIndex: number, totalVariants: number): string {
  if (totalVariants <= 1) return basePrompt;
  return `${basePrompt}\n\nVytvoř variantu ${variantIndex + 1} z ${totalVariants}. Zachovej hlavní zadání, ale nabídni jemně odlišné řešení v detailu, světle, materiálovém čtení nebo kompozici. Výsledek musí zůstat přirozený a uvěřitelný.`;
}

function buildBatchPrompt(presetId: BatchPresetId, customPrompt: string): string {
  const preset = BATCH_PRESETS.find((item) => item.id === presetId) ?? BATCH_PRESETS[0];
  const extra = customPrompt.trim();
  return extra ? `${preset.prompt}\n\nDodatečné instrukce: ${extra}` : preset.prompt;
}

function modelPresetId(selectedProvider: AIProviderType, nanoBananaImageModel: NanoBananaImageModel): string | null {
  if (selectedProvider === AIProviderType.GEMINI) {
    return nanoBananaImageModel === 'gemini-3-pro-image-preview' ? 'gemini-pro' : 'gemini-flash';
  }
  if (selectedProvider === AIProviderType.CHATGPT) return 'openai-image';
  if (selectedProvider === AIProviderType.FLUX_PRO) return 'flux-pro';
  return null;
}

function modelLabel(selectedProvider: AIProviderType, nanoBananaImageModel: NanoBananaImageModel): string {
  const preset = IMAGE_MODEL_PRESETS.find((item) => item.id === modelPresetId(selectedProvider, nanoBananaImageModel));
  return preset ? `${preset.title} / ${preset.subtitle}` : 'Vlastní';
}

export function BatchScreen(props: {
  providerSettings: ProviderSettings;
  selectedProvider: AIProviderType;
  nanoBananaImageModel: NanoBananaImageModel;
  onProviderChange: (provider: AIProviderType) => void;
  onNanoBananaModelChange: (model: NanoBananaImageModel) => void;
  onOpenSettings: () => void;
  onOpenLibrary?: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
  theme?: 'dark' | 'light';
}) {
  const {
    providerSettings,
    selectedProvider,
    nanoBananaImageModel,
    onProviderChange,
    onNanoBananaModelChange,
    onOpenSettings,
    onOpenLibrary,
    onToast,
    theme = 'dark',
  } = props;

  const [presetId, setPresetId] = React.useState<BatchPresetId>('interior');
  const [customPrompt, setCustomPrompt] = React.useState('');
  const [numberOfImages, setNumberOfImages] = React.useState(1);
  const [inputs, setInputs] = React.useState<InputSlot[]>([]);
  const [outputs, setOutputs] = React.useState<BatchOutput[]>([]);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [progress, setProgress] = React.useState<{ current: number; total: number; fileName: string; variant: number } | null>(null);
  const [selectedOutputId, setSelectedOutputId] = React.useState<string | null>(null);
  const fileInputId = React.useMemo(() => makeId('batch-upload'), []);

  const activePrompt = React.useMemo(() => buildBatchPrompt(presetId, customPrompt), [presetId, customPrompt]);
  const activeModelLabel = React.useMemo(() => modelLabel(selectedProvider, nanoBananaImageModel), [selectedProvider, nanoBananaImageModel]);
  const completedCount = React.useMemo(() => outputs.filter((item) => item.status === 'done').length, [outputs]);
  const errorCount = React.useMemo(() => outputs.filter((item) => item.status === 'error').length, [outputs]);
  const selectedOutput = React.useMemo(
    () => outputs.find((item) => item.id === selectedOutputId && item.dataUrl),
    [outputs, selectedOutputId],
  );

  const orderedOutputs = React.useMemo(() => {
    return [...outputs].sort((a, b) => {
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      return a.variantIndex - b.variantIndex;
    });
  }, [outputs]);

  const handleModelPresetSelect = React.useCallback(
    (presetIdToApply: string) => {
      const preset = IMAGE_MODEL_PRESETS.find((item) => item.id === presetIdToApply);
      if (!preset) return;
      onProviderChange(preset.provider);
      if (preset.provider === AIProviderType.GEMINI && preset.model) {
        onNanoBananaModelChange(preset.model);
      }
    },
    [onNanoBananaModelChange, onProviderChange],
  );

  const handleFilesSelected = React.useCallback(async (files: File[]) => {
    const validFiles = files.filter((file) => file.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    const newInputs: InputSlot[] = [];
    for (const file of validFiles) {
      const dataUrl = await fileToDataUrl(file);
      newInputs.push({
        id: makeId('batch-input'),
        file,
        dataUrl,
      });
      try {
        await ImageDatabase.add(file, dataUrl, 'reference');
      } catch {
        // lokální knihovna může selhat bez blokace batch workflow
      }
    }

    setInputs((prev) => [...prev, ...newInputs]);
  }, []);

  const handleDrop = React.useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      try {
        const file = await resolveDropToFile(e);
        if (!file) return;
        await handleFilesSelected([file]);
      } catch (error: any) {
        onToast({ message: error?.message || 'Nepodařilo se vložit obrázek.', type: 'error' });
      }
    },
    [handleFilesSelected, onToast],
  );

  const removeInput = React.useCallback((inputId: string) => {
    setInputs((prev) => prev.filter((item) => item.id !== inputId));
    setOutputs((prev) => prev.filter((item) => item.inputId !== inputId));
  }, []);

  const handleGenerate = React.useCallback(async () => {
    if (inputs.length === 0) {
      onToast({ message: 'Nejdřív přidej aspoň jeden vstupní obrázek.', type: 'error' });
      return;
    }

    setIsGenerating(true);

    const runCreatedAt = Date.now();
    const pendingOutputs: BatchOutput[] = inputs.flatMap((input) =>
      Array.from({ length: numberOfImages }, (_, variantIndex) => ({
        id: makeId('batch-output'),
        inputId: input.id,
        inputName: input.file.name,
        inputDataUrl: input.dataUrl,
        variantIndex,
        prompt: buildVariantPrompt(activePrompt, variantIndex, numberOfImages),
        status: 'pending' as const,
        createdAt: runCreatedAt + variantIndex,
        modelLabel: activeModelLabel,
      })),
    );

    setOutputs((prev) => [...pendingOutputs, ...prev]);
    const provider = ProviderFactory.getProvider(selectedProvider, providerSettings);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const total = pendingOutputs.length;

    try {
      for (const output of pendingOutputs) {
        setProgress({
          current: processed + 1,
          total,
          fileName: output.inputName,
          variant: output.variantIndex + 1,
        });

        setOutputs((prev) =>
          prev.map((item) => (item.id === output.id ? { ...item, status: 'running' as const, error: undefined } : item)),
        );

        try {
          const result = await provider.generateImage(
            [{ data: output.inputDataUrl, mimeType: inputs.find((item) => item.id === output.inputId)?.file.type || 'image/jpeg' }],
            output.prompt,
            '1K',
            'Original',
            false,
          );

          const recipe = buildBatchRecipe({
            provider: selectedProvider,
            prompt: activePrompt,
            effectivePrompt: output.prompt,
            promptMode: 'simple',
            resolution: '1K',
            aspectRatio: 'Original',
            sourceImageCount: 1,
            styleImageCount: 0,
            createdAt: Date.now(),
          });
          const recipeWithModel = result.modelId ? { ...recipe, modelId: result.modelId } : recipe;

          setOutputs((prev) =>
            prev.map((item) =>
              item.id === output.id
                ? {
                    ...item,
                    status: 'done' as const,
                    dataUrl: result.imageBase64,
                  }
                : item,
            ),
          );

          try {
            const thumbnail = await createThumbnail(result.imageBase64);
            await saveToGallery({
              id: output.id,
              url: result.imageBase64,
              thumbnail,
              prompt: output.prompt,
              resolution: '1K',
              aspectRatio: 'Original',
              params: recipeWithModel,
            });
          } catch {
            // galerie nesmí shodit batch běh
          }

          succeeded++;
        } catch (error: any) {
          failed++;
          setOutputs((prev) =>
            prev.map((item) =>
              item.id === output.id
                ? {
                    ...item,
                    status: 'error' as const,
                    error: toUserFacingAiError(error, 'Batch úprava selhala.'),
                  }
                : item,
            ),
          );
        } finally {
          processed++;
        }
      }

      if (succeeded > 0 && failed === 0) {
        onToast({ message: `Batch hotový. Vzniklo ${succeeded} výstupů.`, type: 'success' });
      } else if (succeeded > 0) {
        onToast({ message: `Batch dokončen částečně: ${succeeded} hotovo, ${failed} selhalo.`, type: 'warning' });
      } else {
        onToast({ message: 'Batch selhal na všech výstupech.', type: 'error' });
      }
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }, [activeModelLabel, activePrompt, inputs, numberOfImages, onToast, providerSettings, selectedProvider]);

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside
        className="w-[360px] shrink-0 h-full overflow-y-auto custom-scrollbar cairn-panel-left text-[11px]"
        style={
          theme === 'dark'
            ? {
                backdropFilter: 'blur(32px) saturate(200%)',
                background: 'linear-gradient(160deg,rgba(32,44,24,0.94) 0%,rgba(20,28,15,0.96) 100%)',
                boxShadow: '4px 0 48px rgba(0,0,0,0.50), inset 0 0 120px rgba(125,154,100,0.08)',
              }
            : {
                background: '#ffffff',
                borderRight: '1px solid #cdd8ba',
              }
        }
      >
        <div className="p-6 flex flex-col gap-6 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#a8bf8f] rounded-full shadow-[0_0_10px_rgba(168,191,143,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Batch</h2>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={inputs.length === 0 || isGenerating}
            className="mn-action-primary"
          >
            {isGenerating ? 'Běží…' : 'Generovat'}
          </button>

          <div className="space-y-1">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Počet obrázků</h3>
            <div className="mn-count-selector">
              {[1, 2, 3, 4, 5].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setNumberOfImages(count)}
                  className={`mn-count-option ${numberOfImages === count ? 'mn-count-option-active' : ''}`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between">
              <span>Vstupní obrázky</span>
              <span className="text-[9px] text-[var(--text-secondary)]">{inputs.length}</span>
            </h3>
            <div
              className={`mn-upload-zone ${dragActive ? 'border-[var(--accent)] bg-[var(--accent)]/5' : ''}`}
              style={{ minHeight: 220 }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              {inputs.length === 0 ? (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center text-center cursor-pointer gap-2"
                  onClick={() => document.getElementById(fileInputId)?.click()}
                >
                  <Images className="w-5 h-5 text-[var(--text-secondary)]" strokeWidth={1.6} />
                  <span className="text-[9px] font-semibold text-[var(--text-secondary)]">Přidej více obrázků najednou</span>
                  <input
                    id={fileInputId}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      void handleFilesSelected(files);
                      e.currentTarget.value = '';
                    }}
                  />
                </div>
              ) : (
                <div className="p-2 grid grid-cols-3 gap-2">
                  {inputs.map((input) => (
                    <div key={input.id} className="mn-upload-thumb group aspect-square">
                      <img src={input.dataUrl} alt={input.file.name} className="w-full h-full object-cover opacity-85 group-hover:opacity-100" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeInput(input.id);
                        }}
                        className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  <label className="mn-upload-tile aspect-square">
                    <span className="text-[var(--text-secondary)]">+</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files ? Array.from(e.target.files) : [];
                        void handleFilesSelected(files);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Základní prompt</h3>
            <div className="grid grid-cols-1 gap-1.5">
              {BATCH_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPresetId(preset.id)}
                  className={`mn-option-button ${presetId === preset.id ? 'mn-option-button-active' : ''}`}
                  title={preset.title}
                >
                  <div className="text-[8px] font-black uppercase tracking-[0.18em] leading-tight">{preset.label}</div>
                  <div className={`mt-0.5 text-[6px] font-semibold leading-tight ${presetId === preset.id ? 'text-[var(--accent-contrast)]/80' : 'text-[var(--text-3)]'}`}>
                    {preset.title}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg border border-[rgba(168,191,143,0.18)] bg-[linear-gradient(135deg,rgba(35,48,26,0.70)_0%,rgba(20,28,15,0.80)_100%)] px-2 py-1">
              <span className="pl-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Dodatečný prompt</span>
            </div>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Volitelné doplnění: konkrétní materiály, nálada, styl světla, použití v prostoru…"
              className="w-full min-h-[120px] max-h-[240px] resize-none rounded-none border-0 border-b border-[var(--border-color)] bg-transparent p-1.5 text-[11px] font-medium text-[var(--text-primary)] placeholder-gray-500 outline-none transition-all focus:border-[var(--accent)] focus:ring-0 custom-scrollbar"
            />
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full px-3 py-2 rounded-lg border border-[rgba(168,191,143,0.18)] bg-[rgba(24,34,18,0.70)] backdrop-blur-sm text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors"
          >
            Settings
          </button>
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-6">
          {orderedOutputs.length > 0 ? (
            <div className="grid grid-cols-4 gap-3">
              {orderedOutputs.map((output) => {
                const isDone = output.status === 'done' && !!output.dataUrl;
                return (
                  <article key={output.id} className="group flex flex-col overflow-hidden card-surface card-surface-hover transition-all">
                    <button
                      type="button"
                      className="relative bg-[var(--bg-panel)] cursor-zoom-in aspect-square overflow-hidden text-left"
                      onClick={() => {
                        if (!isDone) return;
                        setSelectedOutputId(output.id);
                      }}
                    >
                      {isDone ? (
                        <img src={output.dataUrl} alt={`${output.inputName} ${output.variantIndex + 1}`} className="w-full h-full object-cover" />
                      ) : output.status === 'error' ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/80 backdrop-blur-sm">
                          <div className="w-10 h-10 bg-red-500/20 text-red-500 border border-red-500/30 rounded-md flex items-center justify-center mb-4">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                          </div>
                          <p className="text-[10px] font-bold text-red-400 leading-relaxed max-w-[150px]">{output.error}</p>
                        </div>
                      ) : (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md px-6 transition-all duration-300">
                          <div className="w-full max-w-[200px] space-y-3">
                            <div className="relative h-[2px] bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className="absolute inset-y-0 left-0 bg-[#a8bf8f] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]"
                                style={{
                                  width: '0%',
                                  animation: 'growWidth 10s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                                }}
                              />
                            </div>
                            <div className="text-center">
                              <span className="text-[10px] text-[#a8bf8f] font-bold tracking-widest uppercase animate-pulse">
                                {output.status === 'running' ? 'Generuji...' : 'Čeká...'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </button>

                    <div className="px-4 py-3 flex items-center justify-between gap-2 border-t border-[rgba(168,191,143,0.12)] bg-[linear-gradient(135deg,rgba(28,38,22,0.85)_0%,rgba(16,22,12,0.90)_100%)]">
                      <div className="min-w-0">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">Varianta {output.variantIndex + 1}</div>
                        <div className="text-[8px] text-[var(--text-soft)] truncate">{output.modelLabel}</div>
                      </div>
                      {isDone && output.dataUrl ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const link = document.createElement('a');
                            link.href = output.dataUrl!;
                            link.download = `${output.inputName.replace(/\.[^.]+$/, '')}-batch-${output.variantIndex + 1}.png`;
                            link.click();
                          }}
                          className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[color:var(--selection-surface)] rounded transition-colors"
                          title="Stáhnout"
                        >
                          <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <AtelierEmptyState
              title="Zatím žádné batch výstupy"
              description="Nahraj více obrázků vlevo, vyber preset a spusť hromadné úpravy."
            />
          )}
        </div>
      </section>

      <AtelierRightPanel onOpenLibrary={onOpenLibrary}>
        <AtelierSection title="Výběr modelů">
          <div className="grid grid-cols-2 gap-1">
            {IMAGE_MODEL_PRESETS.map((preset) => {
              const isActive = modelPresetId(selectedProvider, nanoBananaImageModel) === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleModelPresetSelect(preset.id)}
                  className={`mn-option-button ${isActive ? 'mn-option-button-active' : ''}`}
                >
                  <div className="text-[8px] font-black uppercase tracking-[0.18em] leading-tight">{preset.title}</div>
                  <div className={`mt-0.5 text-[6px] font-semibold leading-tight ${isActive ? 'text-[var(--accent-contrast)]/80' : 'text-[var(--text-3)]'}`}>
                    {preset.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        </AtelierSection>

        <AtelierSection title="Stav úlohy">
          <AtelierInfoRows
            rows={[
              { label: 'Preset', value: BATCH_PRESETS.find((item) => item.id === presetId)?.label ?? 'Obecný' },
              { label: 'Model', value: activeModelLabel },
              { label: 'Vstupů', value: inputs.length },
              { label: 'Na vstup', value: numberOfImages },
              { label: 'Hotovo', value: completedCount },
              { label: 'Chyby', value: errorCount },
            ]}
          />
          {progress ? (
            <div className="rounded-md border border-[rgba(168,191,143,0.18)] bg-[rgba(28,40,20,0.70)] px-3 py-2 text-[8px] font-medium leading-relaxed text-[var(--text-secondary)]">
              {progress.current}/{progress.total} • {progress.fileName} • varianta {progress.variant}
            </div>
          ) : null}
        </AtelierSection>

        <AtelierSection title="Aktivní Prompt">
          <div className="rounded-md border border-[rgba(168,191,143,0.18)] bg-[rgba(28,40,20,0.70)] px-3 py-3">
            <div className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
              {BATCH_PRESETS.find((item) => item.id === presetId)?.title ?? 'Obecné vylepšení'}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[8px] leading-relaxed text-[var(--text-secondary)]">
              {BATCH_PRESETS.find((item) => item.id === presetId)?.prompt ?? ''}
            </p>
            {customPrompt.trim() ? (
              <div className="mt-3 border-t border-[rgba(168,191,143,0.14)] pt-3">
                <div className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--text-3)]">
                  Doplnění
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[8px] leading-relaxed text-[var(--text-secondary)]">
                  {customPrompt.trim()}
                </p>
              </div>
            ) : null}
          </div>
        </AtelierSection>

        <AtelierSection title="AI Poskytovatel">
          <ProviderSelector selectedProvider={selectedProvider} onChange={onProviderChange} settings={providerSettings} />
        </AtelierSection>
      </AtelierRightPanel>

      <ImageComparisonModal
        isOpen={!!selectedOutput}
        onClose={() => setSelectedOutputId(null)}
        generatedImage={selectedOutput?.dataUrl || null}
        originalImage={selectedOutput?.inputDataUrl || null}
        prompt={selectedOutput?.prompt || activePrompt}
        timestamp={selectedOutput?.createdAt}
        resolution="1K"
        aspectRatio="Original"
      />
    </div>
  );
}
