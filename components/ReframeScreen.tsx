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
import { AtelierEmptyState, AtelierInfoRows, AtelierRightPanel, AtelierSection } from './atelier/AtelierLayout';

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
  editPrompt?: string;
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
    defaultSelected: true,
    prompt: 'Reframe as an over-the-shoulder shot where the viewer sees past the nearest subject or foreground element toward the main subject, preserving the original scene and identity.',
  },
  {
    id: 'wide',
    label: 'Wide',
    defaultSelected: true,
    prompt: 'Reframe as a wide cinematic shot with more horizontal environment visible. Preserve the main subject, location, lighting, lens feel, and photographic realism.',
  },
  {
    id: 'aerial',
    label: 'Aerial',
    defaultSelected: true,
    prompt: 'Reframe as an aerial or top-down camera view where plausible. Preserve scene layout, object identity, architecture, lighting, colors, and materials.',
  },
  {
    id: 'profile',
    label: 'Profile',
    defaultSelected: true,
    prompt: 'Reframe as a strict side profile view of the same subject, with the camera rotated about 90 degrees from the original front/three-quarter view. The face, body, or main object must be seen from the side silhouette. Do not return a front-facing or near-front crop.',
  },
  {
    id: 'pov',
    label: 'POV',
    defaultSelected: true,
    prompt: 'Reframe as a first-person point-of-view shot from inside the same scene. The camera must feel like the viewer is physically present, with plausible foreground hints such as hands, knees, table edge, cup, phone, doorway, or body-level framing when appropriate. Do not return a normal portrait crop.',
  },
  {
    id: 'eye-level',
    label: 'Eye level',
    defaultSelected: true,
    prompt: 'Reframe from a neutral eye-level camera angle at the subject eye height, with the horizon and verticals corrected to feel level and direct. The result must look like a deliberately re-shot eye-level composition, not a repeated crop of the original image.',
  },
  {
    id: 'three-quarter',
    label: '3/4 view',
    defaultSelected: true,
    prompt: 'Reframe as a clear three-quarter view from a noticeably different side of the subject, about 30 to 45 degrees off-axis. Show both front and side planes of the face, body, or object. Do not return the same camera angle as the input.',
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
    'The selected perspective must be visibly different from the input camera angle. If the requested perspective is profile, POV, eye-level, or 3/4 view, make the camera change unmistakable.',
    'Do not restyle, beautify, replace the subject, change ethnicity, change product design, change room design, add text, add UI, add watermarks, or turn the image into a collage.',
    'If parts of the scene become visible because of the new angle, complete them plausibly from the original image context.',
    '',
    `Output aspect ratio: preserve the original input ratio (${aspectRatio}).`,
    'Return exactly one realistic full-frame image, with no labels, no grid, and no before/after layout.',
  ].join('\n');
}

function buildEditPrompt(userPrompt: string, perspectiveLabel: string, aspectRatio: string): string {
  return [
    'Edit this generated reframe image according to the user instruction.',
    '',
    `Current reframe perspective: ${perspectiveLabel}.`,
    `Preserve the original aspect ratio (${aspectRatio}).`,
    '',
    'User instruction:',
    userPrompt.trim(),
    '',
    'Keep the same scene, subject identity, lighting, camera realism, materials, and composition unless the instruction explicitly changes them.',
    'Return exactly one realistic full-frame image, with no labels, no grid, no before/after layout, and no visible UI.',
  ].join('\n');
}

export function ReframeScreen(props: {
  providerSettings: ProviderSettings;
  onOpenSettings: () => void;
  onOpenLibrary?: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { providerSettings, onOpenSettings, onOpenLibrary, onToast } = props;
  const [input, setInput] = React.useState<InputImage | null>(null);
  const [selected, setSelected] = React.useState<Set<PerspectiveId>>(() => new Set(DEFAULT_SELECTED));
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
  const originalAspectRatio = input ? `${input.width}:${input.height}` : 'Original';

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

      const jobs = selectedPerspectives.map(async (perspective, index) => {
        const outputId = placeholders[index].id;
        setOutputs((prev) => prev.map((item) => item.id === outputId ? { ...item, status: 'running' } : item));

        try {
          const result = await provider.generateImage(
            [providerInput],
            buildReframePrompt(perspective, originalAspectRatio),
            resolution,
            'Original',
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
              prompt: `Reframe ${perspective.label}: ${buildReframePrompt(perspective, originalAspectRatio)}`,
              resolution,
              aspectRatio: originalAspectRatio,
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
      });

      await Promise.allSettled(jobs);

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
  }, [geminiKey, input, onToast, originalAspectRatio, resolution, selectedPerspectives, serverGeminiReady]);

  const handleEditOutput = React.useCallback(async (output: ReframeOutput) => {
    const prompt = output.editPrompt?.trim();
    if (!prompt || !output.dataUrl) return;
    if (!geminiKey && !serverGeminiReady) {
      onToast({ type: 'error', message: 'Chybí Gemini klíč v Settings nebo na Vercelu.' });
      return;
    }

    setOutputs((prev) => prev.map((item) => item.id === output.id ? { ...item, status: 'running', error: undefined } : item));
    try {
      const providerInput = await optimizeImageInput(output.dataUrl, 'image/png');
      const provider = new GeminiProvider(geminiKey || '', GEMINI_PRO_IMAGE_MODEL);
      const result = await provider.generateImage(
        [providerInput],
        buildEditPrompt(prompt, output.perspectiveLabel, originalAspectRatio),
        resolution,
        'Original',
        false
      );

      setOutputs((prev) => prev.map((item) => item.id === output.id
        ? { ...item, status: 'done', dataUrl: result.imageBase64, modelId: result.modelId, editPrompt: '' }
        : item
      ));

      try {
        const thumbnail = await createThumbnail(result.imageBase64, 420);
        await saveToGallery({
          id: `${output.id}-edit-${Date.now()}`,
          url: result.imageBase64,
          thumbnail,
          prompt: `Reframe edit ${output.perspectiveLabel}: ${prompt}`,
          resolution,
          aspectRatio: originalAspectRatio,
          params: {
            operation: 'reframe-edit',
            perspective: output.perspectiveId,
            modelId: result.modelId || GEMINI_PRO_IMAGE_MODEL,
          },
        });
      } catch { /* gallery is non-blocking */ }

      onToast({ type: 'success', message: `Upraveno: ${output.perspectiveLabel}.` });
    } catch (error: any) {
      setOutputs((prev) => prev.map((item) => item.id === output.id
        ? { ...item, status: 'error', error: error?.message || 'Úprava selhala.' }
        : item
      ));
      onToast({ type: 'error', message: error?.message || 'Úprava selhala.' });
    }
  }, [geminiKey, onToast, originalAspectRatio, resolution, serverGeminiReady]);

  return (
    <div className="flex-1 relative flex min-w-0 canvas-surface h-full overflow-hidden">
      <aside className="w-[360px] shrink-0 h-full overflow-y-auto custom-scrollbar cairn-panel-left text-[11px]" style={{backdropFilter:"blur(32px) saturate(200%)",background:"linear-gradient(160deg,rgba(32,44,24,0.94) 0%,rgba(20,28,15,0.96) 100%)",boxShadow:"4px 0 48px rgba(0,0,0,0.50), inset 0 0 120px rgba(125,154,100,0.08)"}}>
        <div className="p-6 flex flex-col gap-5 min-h-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#a8bf8f] rounded-full shadow-[0_0_10px_rgba(168,191,143,0.5)]" />
            <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Reframe</h2>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!input || selectedPerspectives.length === 0 || isGenerating}
            className="mn-action-primary ambient-glow glow-green glow-weak"
          >
            {isGenerating ? `Reframe ${progress ? `${progress.completed}/${progress.total}` : '...'}` : `Generate ${selectedPerspectives.length}`}
          </button>

          <div className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between">
              <span>Vstup</span>
              <span className="text-[9px]">{input ? '1' : '0'}</span>
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
              <div className="mn-upload-zone mn-upload-zone-tall">
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
                  <div className="mn-upload-placeholder flex-col gap-2">
                    <ImagePlus className="w-5 h-5" strokeWidth={1.5} />
                    <span className="text-[10px] uppercase tracking-widest font-bold">Upload</span>
                  </div>
                )}
              </div>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setGridMode((prev) => prev === '3x3' ? 'free' : '3x3')}
              className="mn-option-button"
            >
              {gridMode}
            </button>
            {(['1K', '2K'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setResolution(value)}
                className={`mn-option-button ${resolution === value ? 'mn-option-button-active' : ''}`}
              >
                {value}
              </button>
            ))}
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
        <div className="p-6">
          {outputs.length > 0 ? (
            <div className={gridMode === '3x3' ? 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3' : 'grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3'}>
              {outputs.map((output) => {
                const isDone = output.status === 'done' && !!output.dataUrl;
                return (
                  <article key={output.id} className="overflow-hidden rounded-lg border border-[rgba(168,191,143,0.18)] bg-[rgba(20,28,16,0.85)]">
                    <button
                      type="button"
                      onClick={() => { if (isDone) setSelectedOutput(output); }}
                      className="block w-full cursor-zoom-in"
                    >
                      <div className="aspect-[4/5] bg-[rgba(28,40,20,0.70)]">
                        {isDone && output.dataUrl ? (
                          <img src={output.dataUrl} alt={output.perspectiveLabel} className="w-full h-full object-cover" />
                        ) : output.status === 'error' ? (
                          <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center">
                            <X className="w-5 h-5 text-red-400 mb-3" />
                            <div className="text-[10px] text-red-300 font-bold leading-relaxed">{output.error || 'Selhalo'}</div>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center px-6">
                            <Sparkles className="w-5 h-5 text-[#a8bf8f] mb-4" strokeWidth={1.5} />
                            <div className="w-full max-w-[220px] h-[2px] rounded-full bg-[rgba(45,62,33,0.70)] overflow-hidden">
                              {output.status === 'running' ? (
                                <div className="h-full w-1/3 rounded-full bg-[#a8bf8f] shadow-[0_0_10px_rgba(168,191,143,0.5)] animate-[reframeSlide_1.2s_ease-in-out_infinite]" />
                              ) : (
                                <div className="h-full w-[10%] rounded-full bg-white/20" />
                              )}
                            </div>
                            <div className="mt-3 text-[9px] uppercase tracking-[0.24em] text-white/45 font-bold">
                              {output.status === 'running' ? 'Generuji' : 'Ve frontě'}
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="h-12 px-3 flex items-center justify-between gap-2 bg-[rgba(24,34,18,0.70)] backdrop-blur-sm">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black text-white truncate">{output.perspectiveLabel}</div>
                        <div className="text-[8px] uppercase tracking-widest text-white/35 truncate">{output.modelId || GEMINI_PRO_IMAGE_MODEL}</div>
                      </div>
                      {isDone && output.dataUrl ? (
                        <button
                          type="button"
                          onClick={() => downloadDataUrl(output.dataUrl!, `reframe-${output.perspectiveId}.png`)}
                          className="shrink-0 p-1.5 rounded-md text-white/50 hover:text-white hover:bg-[rgba(45,62,33,0.70)]"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {isDone ? (
                      <div className="p-2 bg-[rgba(24,34,18,0.70)] backdrop-blur-sm border-t border-white/5 flex gap-2">
                        <input
                          value={output.editPrompt || ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            setOutputs((prev) => prev.map((item) => item.id === output.id ? { ...item, editPrompt: value } : item));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void handleEditOutput(output);
                          }}
                          placeholder="Prompt úprava..."
                          className="min-w-0 flex-1 h-8 rounded-md border border-[rgba(168,191,143,0.18)] bg-[rgba(28,40,20,0.70)] px-2 text-[10px] text-white outline-none focus:border-[#a8bf8f]/60"
                        />
                        <button
                          type="button"
                          onClick={() => void handleEditOutput(output)}
                          disabled={!output.editPrompt?.trim()}
                          className="h-8 px-3 rounded-md bg-[#a8bf8f] text-[#0b0c0a] text-[9px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Edit
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <AtelierEmptyState
              title="Připraveno na reframe"
              description="Nahraj vstup vlevo, vyber perspektivy a spusť úlohu."
            />
          )}
          <style>{`
            @keyframes reframeSlide {
              0% { transform: translateX(-120%); }
              100% { transform: translateX(320%); }
            }
          `}</style>
        </div>
      </section>

      <AtelierRightPanel onOpenLibrary={onOpenLibrary}>
        <AtelierSection title="Perspektivy">
          <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            <span>Vybráno</span>
            <span>{selectedPerspectives.length}/{PERSPECTIVES.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {PERSPECTIVES.map((perspective) => {
              const isSelected = selected.has(perspective.id);
              return (
                <button
                  key={perspective.id}
                  type="button"
                  onClick={() => togglePerspective(perspective.id)}
                  className="mn-checkbox-row"
                >
                  <span className={`mn-checkbox-box ${isSelected ? 'mn-checkbox-box-active' : ''}`}>
                    {isSelected ? '✓' : ''}
                  </span>
                  <span className="truncate">{perspective.label}</span>
                </button>
              );
            })}
          </div>
        </AtelierSection>

        <AtelierSection title="Stav úlohy">
          <AtelierInfoRows
            rows={[
              { label: 'Model', value: 'Gemini 3 Pro' },
              { label: 'Perspektivy', value: selectedPerspectives.length },
              { label: 'Aspect', value: originalAspectRatio },
              { label: 'Rozlišení', value: resolution },
              { label: 'Mřížka', value: gridMode },
              { label: 'Výstupů', value: outputs.filter(o => o.status === 'done').length },
            ]}
          />
          {progress ? (
            <div className="rounded-md border border-[rgba(168,191,143,0.18)] bg-[rgba(28,40,20,0.70)] px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Progress {progress.completed}/{progress.total}
            </div>
          ) : null}
        </AtelierSection>
      </AtelierRightPanel>

      <ImageComparisonModal
        isOpen={!!selectedOutput}
        onClose={() => setSelectedOutput(null)}
        generatedImage={selectedOutput?.dataUrl || null}
        originalImage={input?.dataUrl || null}
        prompt={selectedOutput ? `Reframe ${selectedOutput.perspectiveLabel}` : ''}
        timestamp={selectedOutput?.createdAt}
        resolution={resolution}
        aspectRatio={originalAspectRatio}
      />
    </div>
  );
}
