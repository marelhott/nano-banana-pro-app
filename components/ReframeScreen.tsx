import React from 'react';
import { Download, ImagePlus, Sparkles, X } from 'lucide-react';
import { GeminiProvider } from '../services/geminiService';
import type { ProviderSettings } from '../services/aiProvider';
import { AIProviderType, type ImageInput } from '../services/aiProvider';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { ImageDatabase } from '../utils/imageDatabase';
import { fileToDataUrl } from './styleTransfer/utils';
import { ImageComparisonModal } from './ImageComparisonModal';
import type { ToastType } from './Toast';

const GEMINI_PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview';

type PerspectiveId =
  | 'ext-long-shot'
  | 'long-shot'
  | 'closeup'
  | 'medium-long'
  | 'extreme-closeup'
  | 'low-angle'
  | 'back-view'
  | 'medium-closeup'
  | 'high-angle'
  | 'ots'
  | 'wide'
  | 'aerial'
  | 'profile'
  | 'pov'
  | 'eye-level'
  | 'three-quarter';

type Perspective = {
  id: PerspectiveId;
  label: string;
  defaultSelected: boolean;
  prompt: string;
};

type InputImage = {
  id: string;
  file: File;
  dataUrl: string;
  width: number;
  height: number;
};

type ReframeOutput = {
  id: string;
  perspectiveId: PerspectiveId;
  perspectiveLabel: string;
  status: 'pending' | 'running' | 'done' | 'error';
  dataUrl?: string;
  error?: string;
  createdAt: number;
  modelId?: string;
};

const PERSPECTIVES: Perspective[] = [
  {
    id: 'ext-long-shot',
    label: 'Ext. long shot',
    defaultSelected: true,
    prompt: 'Reframe as an extreme long shot. Pull the camera far back and reveal more environment around the same subject while preserving identity, architecture, lighting, materials, palette, and scene logic.',
  },
  {
    id: 'long-shot',
    label: 'Long shot',
    defaultSelected: true,
    prompt: 'Reframe as a long shot. Show the full subject and surrounding scene with a natural wider camera position, while keeping the original place, objects, subject identity, lighting, and style intact.',
  },
  {
    id: 'closeup',
    label: 'Closeup',
    defaultSelected: true,
    prompt: 'Reframe as a closeup. Move the camera closer to the main subject and crop tighter, preserving the original identity, materials, colors, lighting direction, and photographic realism.',
  },
  {
    id: 'medium-long',
    label: 'Medium long',
    defaultSelected: true,
    prompt: 'Reframe as a medium long shot. Keep the subject readable in context, between a full-body/scene view and a medium framing, preserving all core visual details from the input image.',
  },
  {
    id: 'extreme-closeup',
    label: 'Extreme closeup',
    defaultSelected: true,
    prompt: 'Reframe as an extreme closeup of the most important subject detail. Preserve texture, identity, material fidelity, lighting, color, and scene consistency without inventing a different object or person.',
  },
  {
    id: 'low-angle',
    label: 'Low angle',
    defaultSelected: true,
    prompt: 'Reframe from a low camera angle looking upward. Keep the same subject, location, clothing or object design, lighting, color temperature, and realistic perspective.',
  },
  {
    id: 'back-view',
    label: 'Back view',
    defaultSelected: true,
    prompt: 'Reframe as a believable back view of the same scene and subject. Preserve clothing, body proportions, hairstyle or object structure, materials, environment, lighting, and spatial layout.',
  },
  {
    id: 'medium-closeup',
    label: 'Med. closeup',
    defaultSelected: true,
    prompt: 'Reframe as a medium closeup. Keep the main subject dominant but include enough surrounding context to match the original scene, lighting, color, and perspective.',
  },
  {
    id: 'high-angle',
    label: 'High angle',
    defaultSelected: true,
    prompt: 'Reframe from a high camera angle looking down. Preserve the original subject, scene geometry, materials, identity, lighting direction, and photographic style.',
  },
  {
    id: 'ots',
    label: 'OTS',
    defaultSelected: false,
    prompt: 'Reframe as an over-the-shoulder shot where the viewer sees past the nearest subject or foreground element toward the main subject, preserving the original scene and identity.',
  },
  {
    id: 'wide',
    label: 'Wide',
    defaultSelected: false,
    prompt: 'Reframe as a wide cinematic shot with more horizontal environment visible. Preserve the main subject, location, lighting, lens feel, and photographic realism.',
  },
  {
    id: 'aerial',
    label: 'Aerial',
    defaultSelected: false,
    prompt: 'Reframe as an aerial or top-down camera view where plausible. Preserve scene layout, object identity, architecture, lighting, colors, and materials.',
  },
  {
    id: 'profile',
    label: 'Profile',
    defaultSelected: false,
    prompt: 'Reframe as a profile or side view of the same subject. Preserve identity, proportions, clothing or product details, lighting, background logic, and realistic perspective.',
  },
  {
    id: 'pov',
    label: 'POV',
    defaultSelected: false,
    prompt: 'Reframe as a point-of-view shot from a natural viewer position inside the same scene. Preserve the subject, environment, lighting, color, and physical plausibility.',
  },
  {
    id: 'eye-level',
    label: 'Eye level',
    defaultSelected: false,
    prompt: 'Reframe from a neutral eye-level camera angle. Preserve the subject, scene composition, lighting, materials, and realistic photographic appearance.',
  },
  {
    id: 'three-quarter',
    label: '3/4 view',
    defaultSelected: false,
    prompt: 'Reframe as a three-quarter view of the main subject. Preserve identity, structure, materials, lighting, and the original scene style while changing only the camera viewpoint.',
  },
];

const DEFAULT_SELECTED = new Set(PERSPECTIVES.filter((item) => item.defaultSelected).map((item) => item.id));

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

async function getServerGeminiReady(): Promise<boolean> {
  try {
    const res = await fetch('/api/public-config');
    const data = await res.json();
    return Boolean(data?.providers?.gemini);
  } catch {
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
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek.'));
    img.src = dataUrl;
  });
}

async function optimizeImageInput(dataUrl: string, mimeType: string): Promise<ImageInput> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Nepodařilo se připravit vstup.'));
    element.src = dataUrl;
  });

  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { data: dataUrl, mimeType };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return {
    data: canvas.toDataURL('image/jpeg', 0.84),
    mimeType: 'image/jpeg',
  };
}

function buildReframePrompt(perspective: Perspective, aspectRatio: string): string {
  return [
    'You are performing a precise AI reframe / camera-angle variation from a single input image.',
    '',
    'Goal:',
    perspective.prompt,
    '',
    'Preservation rules:',
    'Keep the same primary subject, identity, objects, wardrobe/product design, architecture, environment, lighting direction, color temperature, lens realism, texture, and visual style.',
    'Change only the camera viewpoint, distance, crop, and visible composition required by the requested perspective.',
    'Do not restyle, beautify, replace the subject, change ethnicity, change product design, change room design, add text, add UI, add watermarks, or turn the image into a collage.',
    'If parts of the scene become visible because of the new angle, complete them plausibly from the original image context.',
    '',
    `Output aspect ratio: ${aspectRatio}.`,
    'Return exactly one realistic full-frame image, with no labels, no grid, and no before/after layout.',
  ].join('\n');
}

export function ReframeScreen(props: {
  providerSettings: ProviderSettings;
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { providerSettings, onOpenSettings, onToast } = props;
  const [input, setInput] = React.useState<InputImage | null>(null);
  const [selected, setSelected] = React.useState<Set<PerspectiveId>>(() => new Set(DEFAULT_SELECTED));
  const [aspectRatio, setAspectRatio] = React.useState('4:5');
  const [gridMode, setGridMode] = React.useState<'3x3' | 'free'>('3x3');
  const [resolution, setResolution] = React.useState<'1K' | '2K'>('2K');
  const [outputs, setOutputs] = React.useState<ReframeOutput[]>([]);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [progress, setProgress] = React.useState<{ completed: number; total: number } | null>(null);
  const [serverGeminiReady, setServerGeminiReady] = React.useState(false);
  const [selectedOutput, setSelectedOutput] = React.useState<ReframeOutput | null>(null);
  const inputId = React.useMemo(() => `reframe-input-${Math.random().toString(36).slice(2)}`, []);
  const geminiKey = React.useMemo(() => providerSettings[AIProviderType.GEMINI]?.apiKey || readGeminiKey(), [providerSettings]);

  React.useEffect(() => {
    getServerGeminiReady().then(setServerGeminiReady);
  }, []);

  const selectedPerspectives = React.useMemo(
    () => PERSPECTIVES.filter((item) => selected.has(item.id)),
    [selected]
  );

  const handleFile = React.useCallback(async (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const dataUrl = await fileToDataUrl(file);
    const meta = await loadImageMeta(dataUrl);
    const next = {
      id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      file,
      dataUrl,
      width: meta.width,
      height: meta.height,
    };
    setInput(next);
    setOutputs([]);
    try { await ImageDatabase.add(file, dataUrl, 'reference'); } catch { /* ok */ }
  }, []);

  const togglePerspective = React.useCallback((id: PerspectiveId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleGenerate = React.useCallback(async () => {
    if (!input) {
      onToast({ type: 'error', message: 'Nejdřív nahraj vstupní obrázek.' });
      return;
    }
    if (selectedPerspectives.length === 0) {
      onToast({ type: 'error', message: 'Vyber aspoň jednu perspektivu.' });
      return;
    }
    if (!geminiKey && !serverGeminiReady) {
      onToast({ type: 'error', message: 'Chybí Gemini klíč v Settings nebo na Vercelu.' });
      return;
    }

    const runId = Date.now();
    const placeholders: ReframeOutput[] = selectedPerspectives.map((perspective, index) => ({
      id: `${runId}-${perspective.id}-${index}`,
      perspectiveId: perspective.id,
      perspectiveLabel: perspective.label,
      status: 'pending',
      createdAt: runId + index,
    }));

    setOutputs((prev) => [...placeholders, ...prev]);
    setIsGenerating(true);
    setProgress({ completed: 0, total: placeholders.length });

    let completed = 0;
    let failed = 0;

    try {
      const providerInput = await optimizeImageInput(input.dataUrl, input.file.type);
      const provider = new GeminiProvider(geminiKey || '', GEMINI_PRO_IMAGE_MODEL);

      for (let index = 0; index < selectedPerspectives.length; index++) {
        const perspective = selectedPerspectives[index];
        const outputId = placeholders[index].id;
        setOutputs((prev) => prev.map((item) => item.id === outputId ? { ...item, status: 'running' } : item));

        try {
          const result = await provider.generateImage(
            [providerInput],
            buildReframePrompt(perspective, aspectRatio),
            resolution,
            aspectRatio,
            false
          );

          setOutputs((prev) => prev.map((item) => item.id === outputId
            ? { ...item, status: 'done', dataUrl: result.imageBase64, modelId: result.modelId }
            : item
          ));

          try {
            const thumbnail = await createThumbnail(result.imageBase64, 420);
            await saveToGallery({
              id: outputId,
              url: result.imageBase64,
              thumbnail,
              prompt: `Reframe ${perspective.label}: ${buildReframePrompt(perspective, aspectRatio)}`,
              resolution,
              aspectRatio,
              params: {
                operation: 'reframe',
                perspective: perspective.id,
                modelId: result.modelId || GEMINI_PRO_IMAGE_MODEL,
              },
            });
          } catch { /* gallery is non-blocking */ }

          completed += 1;
        } catch (error: any) {
          failed += 1;
          setOutputs((prev) => prev.map((item) => item.id === outputId
            ? { ...item, status: 'error', error: error?.message || 'Reframe selhal.' }
            : item
          ));
        } finally {
          setProgress({ completed: completed + failed, total: placeholders.length });
        }
      }

      if (completed > 0 && failed === 0) {
        onToast({ type: 'success', message: `Reframe hotový: ${completed}/${placeholders.length}.` });
      } else if (completed > 0) {
        onToast({ type: 'warning', message: `Reframe částečně hotový: ${completed}/${placeholders.length}.` });
      } else {
        onToast({ type: 'error', message: 'Reframe selhal u všech perspektiv.' });
      }
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }, [aspectRatio, geminiKey, input, onToast, resolution, selectedPerspectives, serverGeminiReady]);

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[360px] shrink-0 h-full overflow-y-auto custom-scrollbar border-r border-white/5 bg-[var(--bg-card)] text-[11px]">
        <div className="p-6 flex flex-col gap-5 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Reframe</h2>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!input || selectedPerspectives.length === 0 || isGenerating}
            className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none"
          >
            {isGenerating ? `Reframe ${progress ? `${progress.completed}/${progress.total}` : '...'}` : `Generate ${selectedPerspectives.length}`}
          </button>

          <div className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between">
              <span>Vstup</span>
              <span>{input ? '1' : '0'}</span>
            </h3>
            <label className="block cursor-pointer">
              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
              <div className="relative aspect-[4/3] rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--bg-panel)] overflow-hidden">
                {input ? (
                  <>
                    <img src={input.dataUrl} alt={input.file.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        setInput(null);
                        setOutputs([]);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
                    <ImagePlus className="w-5 h-5" strokeWidth={1.5} />
                    <span className="text-[10px] uppercase tracking-widest font-bold">Select image</span>
                  </div>
                )}
              </div>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {['4:5', '1:1', '16:9'].map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`h-10 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-colors ${aspectRatio === ratio ? 'border-[#7ed957]/60 bg-[#7ed957]/10 text-white' : 'border-[var(--border-color)] bg-[var(--bg-input)] text-white/55 hover:text-white'}`}
              >
                {ratio}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setGridMode((prev) => prev === '3x3' ? 'free' : '3x3')}
              className="h-10 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[10px] font-black uppercase tracking-widest text-white/65 hover:text-white"
            >
              {gridMode}
            </button>
            {(['1K', '2K'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setResolution(value)}
                className={`h-10 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-colors ${resolution === value ? 'border-[#7ed957]/60 bg-[#7ed957]/10 text-white' : 'border-[var(--border-color)] bg-[var(--bg-input)] text-white/55 hover:text-white'}`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Perspektivy</h3>
              <span className="text-[10px] font-bold text-[var(--text-secondary)]">{selectedPerspectives.length}/{PERSPECTIVES.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {PERSPECTIVES.map((perspective) => {
                const isSelected = selected.has(perspective.id);
                return (
                  <button
                    key={perspective.id}
                    type="button"
                    onClick={() => togglePerspective(perspective.id)}
                    className={`h-8 px-2 rounded-md border flex items-center gap-2 text-left transition-colors ${isSelected ? 'border-[#7ed957]/50 bg-[#7ed957]/10 text-white' : 'border-[var(--border-color)] bg-[var(--bg-input)] text-white/45 hover:text-white/70'}`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[9px] ${isSelected ? 'bg-[#7ed957] border-[#7ed957] text-[#0a0f0d]' : 'border-white/20'}`}>
                      {isSelected ? '✓' : ''}
                    </span>
                    <span className="text-[10px] font-bold truncate">{perspective.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {!geminiKey && !serverGeminiReady ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-[10px] font-bold uppercase tracking-widest text-amber-300"
            >
              Nastavit Gemini
            </button>
          ) : null}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 z-10 border-b border-white/5 bg-[var(--bg-main)]/70 backdrop-blur">
          <div className="px-6 py-4 flex flex-wrap items-center gap-4 overflow-x-auto custom-scrollbar">
            <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Model</div>
            <div className="text-[10px] text-white/75">Gemini 3 Pro preview</div>
            <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Perspektivy</div>
            <div className="text-[10px] text-white/75">{selectedPerspectives.length}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Aspect</div>
            <div className="text-[10px] text-white/75">{aspectRatio}</div>
            {progress ? (
              <>
                <div className="text-[10px] uppercase tracking-widest text-white/55 font-bold">Progress</div>
                <div className="text-[10px] text-white/75">{progress.completed}/{progress.total}</div>
              </>
            ) : null}
          </div>
        </div>

        <div className="p-6">
          {outputs.length > 0 ? (
            <div className={gridMode === '3x3' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3' : 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3'}>
              {outputs.map((output) => {
                const isDone = output.status === 'done' && !!output.dataUrl;
                return (
                  <article key={output.id} className="overflow-hidden rounded-lg border border-white/10 bg-[var(--bg-card)]">
                    <button
                      type="button"
                      onClick={() => { if (isDone) setSelectedOutput(output); }}
                      className="block w-full cursor-zoom-in"
                    >
                      <div className="aspect-[4/5] bg-[var(--bg-panel)]">
                        {isDone && output.dataUrl ? (
                          <img src={output.dataUrl} alt={output.perspectiveLabel} className="w-full h-full object-cover" />
                        ) : output.status === 'error' ? (
                          <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center">
                            <X className="w-5 h-5 text-red-400 mb-3" />
                            <div className="text-[10px] text-red-300 font-bold leading-relaxed">{output.error || 'Selhalo'}</div>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center px-6">
                            <Sparkles className="w-5 h-5 text-[#7ed957] mb-4" strokeWidth={1.5} />
                            <div className="w-full max-w-[220px] h-[2px] rounded-full bg-white/10 overflow-hidden">
                              <div className={`h-full rounded-full bg-[#7ed957] ${output.status === 'running' ? 'animate-pulse' : ''}`} style={{ width: output.status === 'running' ? '55%' : '14%' }} />
                            </div>
                            <div className="mt-3 text-[9px] uppercase tracking-[0.24em] text-white/45 font-bold">
                              {output.status === 'running' ? 'Generuji' : 'Ve frontě'}
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="h-12 px-3 flex items-center justify-between gap-2 bg-[var(--bg-input)]">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black text-white truncate">{output.perspectiveLabel}</div>
                        <div className="text-[8px] uppercase tracking-widest text-white/35 truncate">{output.modelId || GEMINI_PRO_IMAGE_MODEL}</div>
                      </div>
                      {isDone && output.dataUrl ? (
                        <button
                          type="button"
                          onClick={() => downloadDataUrl(output.dataUrl!, `reframe-${output.perspectiveId}.png`)}
                          className="shrink-0 p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="min-h-[420px] flex flex-col items-center justify-center text-white/35">
              <Sparkles className="w-8 h-8 mb-4" strokeWidth={1.2} />
              <div className="text-[11px] uppercase tracking-widest font-bold">Připraveno na reframe</div>
            </div>
          )}
        </div>
      </section>

      <ImageComparisonModal
        isOpen={!!selectedOutput}
        onClose={() => setSelectedOutput(null)}
        generatedImage={selectedOutput?.dataUrl || null}
        originalImage={input?.dataUrl || null}
        prompt={selectedOutput ? `Reframe ${selectedOutput.perspectiveLabel}` : ''}
        timestamp={selectedOutput?.createdAt}
        resolution={resolution}
        aspectRatio={aspectRatio}
      />
    </div>
  );
}
