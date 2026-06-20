import React, { Suspense, lazy, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './src/index.css'; // ENFORCE NEW STYLES
import { Upload, X, FileJson, ArrowLeftRight, Folder, Sparkles } from 'lucide-react'; // Added icons for design
import { ImageUpload } from './components/ImageUpload';
import { LoadingSpinner } from './components/LoadingSpinner';
import { analyzeImageForJsonWithAI, enhancePromptWithAI, analyzeStyleTransferWithAI } from './services/geminiService';
import { AppState, GeneratedImage, GenerationRecipe, SourceImage, LineageEntry } from './types';
import { ImageComparisonModal } from './components/ImageComparisonModal';
import { ImageDetailModal } from './components/ImageDetailModal';
import { Header } from './components/Header';
import { GalleryModal } from './components/GalleryModal';
import { SavedPromptsDropdown } from './components/SavedPromptsDropdown';
import { slugify } from './utils/stringUtils.ts';
import { GalleryImage, saveToGallery, createThumbnail, getAllImages, deleteImage as deleteGalleryImage } from './utils/galleryDB';
import { ImageDatabase } from './utils/imageDatabase';
import { backfillLocalLibraryMetadataToCloud, urlToDataUrl } from './utils/supabaseStorage';
import { ApiUsagePanel } from './components/ApiUsagePanel';
import { CollectionsModal } from './components/CollectionsModal';
import { PromptTemplatesModal } from './components/PromptTemplatesModal';
import { PromptRemixModal } from './components/PromptRemixModal';
import { QuickActionsMenu, QuickAction } from './components/QuickActionsMenu';
import { ApiUsageTracker } from './utils/apiUsageTracking';
import { PromptHistory } from './utils/promptHistory';
import { detectLanguage, enhancePromptQuality, getPromptSuggestion } from './utils/languageSupport';
import { formatJsonPromptForImage } from './utils/jsonPrompting';
import { ImageGalleryPanel } from './components/ImageGalleryPanel';
import { SettingsModal } from './components/SettingsModal';
import { ProviderSelector } from './components/ProviderSelector';
import { GeminiProvider } from './services/geminiService';
import { AIProviderType, ProviderSettings, type ImageInput } from './services/aiProvider';
import { ProviderFactory } from './services/providerFactory';
import { Toast, ToastType } from './components/Toast';
import { applyAdvancedInterpretation } from './utils/promptInterpretation';
import { runSupabaseSmokeTests } from './utils/smokeTests';
import { ensureSupabaseClient, SUPABASE_ANON_DISABLED_ERROR_MESSAGE, ensureLocalAppUserId } from './utils/supabaseClient';
import { createReferenceStyleComposite } from './utils/imagePanelComposite';
import { AppIconRail } from './components/AppIconRail';
import { MaskCanvas } from './components/MaskCanvas';
import { FreeComparisonModal } from './components/FreeComparisonModal';
import { mapAspectRatio, type ProviderType } from './utils/aspectRatioMapping';
import { upscaleImage } from './utils/upscaling';
import { getInterRequestDelayMs, getRetryBackoffMs, type NanoBananaImageModel } from './constants/timings';
import { useProviderSettings } from './hooks/useProviderSettings';
import { CLOUD_SYNC_EVENT_NAME, type CloudSyncEventDetail } from './utils/cloudSyncEvents';
import { toUserFacingAiError } from './utils/aiErrorMessage';
import { useGenerationQueue, type QueuedGenerationItem } from './hooks/useGenerationQueue';
import { useGenerationSnapshot, type GenerationQueueSnapshot } from './hooks/useGenerationSnapshot';
import { useGenerationSettingsGuard } from './hooks/useGenerationSettingsGuard';
import { getGenerationResultSummary } from './utils/generationFeedback';
import { useRepopulateActions } from './hooks/useRepopulateActions';
import { usePromptHistoryActions } from './hooks/usePromptHistoryActions';
import { buildSimpleLinkPrompt, composeGenerationPrompt } from './utils/promptComposition';
import { buildGenerationLineage } from './utils/generationLineage';
import { buildBatchRecipe, buildEditRecipe, buildGenerateRecipe, buildThreeAiRecipe, buildVariantRecipe } from './utils/generationRecipe';
import {
  BATCH_PARALLEL_SIZE,
  chunkBatchImages,
  combineBatchInputImages,
  createBatchLoadingImages,
  getBatchEffectivePrompt,
  type BatchProcessImage,
} from './utils/batchProcessing';

const LazyStyleTransferScreen = lazy(async () => {
  const module = await import('./components/StyleTransferScreen');
  return { default: module.StyleTransferScreen };
});

const LazyFluxLoraGeneratorScreen = lazy(async () => {
  const module = await import('./components/FluxLoraGeneratorScreen');
  return { default: module.FluxLoraGeneratorScreen };
});

const LazyModelInfluenceScreen = lazy(async () => {
  const module = await import('./components/modelInfluence/ModelInfluenceScreen');
  return { default: module.ModelInfluenceScreen };
});

const LazyAiUpscalerScreen = lazy(async () => {
  const module = await import('./components/AiUpscalerScreen');
  return { default: module.AiUpscalerScreen };
});

const LazyFaceSwapScreen = lazy(async () => {
  const module = await import('./components/FaceSwapScreen');
  return { default: module.FaceSwapScreen };
});

const LazyReframeScreen = lazy(async () => {
  const module = await import('./components/ReframeScreen');
  return { default: module.ReframeScreen };
});

const LazyBatchScreen = lazy(async () => {
  const module = await import('./components/BatchScreen');
  return { default: module.BatchScreen };
});

const ASPECT_RATIOS = ['Original', '1:1', '2:3', '3:2', '3:4', '4:3', '5:4', '4:5', '9:16', '16:9', '21:9'];
const RESOLUTIONS = [
  { value: '1K', label: '1K (~1024px)' },
  { value: '2K', label: '2K (~2048px)' },
  { value: '4K', label: '4K (~4096px)' }
];
const MAX_GENERATED_IMAGES = 14;
const PROVIDER_SETTINGS_STORAGE_KEY = 'providerSettings';
const THEME_STORAGE_KEY = 'mulen-theme';
const SERVER_INPUT_MAX_DIMENSION = 1440;
const SERVER_INPUT_TARGET_BYTES = 1_200_000;
const SERVER_INPUT_MIN_QUALITY = 0.58;
const LEGACY_BATCH_GROUP_WINDOW_MS = 2 * 60 * 1000;
type GenerationQueueAction = 'generate' | 'variants' | '3ai';
type GenerationQueueItem = {
  action: GenerationQueueAction;
  snapshot: GenerationQueueSnapshot;
};

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek pro optimalizaci.'));
    img.src = dataUrl;
  });
}

async function getImageVisualSignature(url: string): Promise<{ hash: string; width: number; height: number } | null> {
  try {
    const image = await loadImageElement(url);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const size = 12;
    canvas.width = size;
    canvas.height = size;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, size, size);

    const { data } = ctx.getImageData(0, 0, size, size);
    const grayscale: number[] = [];
    for (let index = 0; index < data.length; index += 4) {
      grayscale.push((data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114));
    }
    const average = grayscale.reduce((sum, value) => sum + value, 0) / grayscale.length;
    const hash = grayscale.map((value) => (value >= average ? '1' : '0')).join('');

    return {
      hash,
      width: image.naturalWidth || 0,
      height: image.naturalHeight || 0,
    };
  } catch {
    return null;
  }
}

function getResolutionRank(resolution?: string): number {
  if (resolution === '4K') return 4;
  if (resolution === '2K') return 3;
  if (resolution === '1K') return 2;
  return 1;
}

function getHistoryImageQualityScore(
  image: GalleryImage,
  signature: { hash: string; width: number; height: number } | null,
): number {
  const dimensionScore = (signature?.width || 0) * (signature?.height || 0);
  const resolutionBonus = getResolutionRank(image.resolution) * 10_000_000;
  const remoteBonus = image.remoteStoragePath ? 500_000 : 0;
  return dimensionScore + resolutionBonus + remoteBonus;
}

async function dedupeHistoryImages(images: GalleryImage[]): Promise<GalleryImage[]> {
  const annotated = await Promise.all(
    images.map(async (image) => ({
      image,
      signature: image.url ? await getImageVisualSignature(image.url) : null,
    })),
  );

  const groups = new Map<string, Array<(typeof annotated)[number]>>();
  for (const item of annotated) {
    const key = item.signature?.hash
      ? `hash:${item.signature.hash}`
      : `fallback:${item.image.prompt.trim().toLowerCase()}::${Math.floor(item.image.timestamp / 10_000)}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const deduped: GalleryImage[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      deduped.push(bucket[0].image);
      continue;
    }

    bucket.sort((left, right) => {
      const scoreDiff = getHistoryImageQualityScore(right.image, right.signature) - getHistoryImageQualityScore(left.image, left.signature);
      if (scoreDiff !== 0) return scoreDiff;
      return right.image.timestamp - left.image.timestamp;
    });
    deduped.push(bucket[0].image);
  }

  return deduped.sort((a, b) => b.timestamp - a.timestamp);
}

async function optimizeServerImageInput(
  input: ImageInput,
  options?: {
    maxDimension?: number;
    targetBytes?: number;
  }
): Promise<ImageInput> {
  const sourceBytes = Math.ceil((input.data.length * 3) / 4);
  const targetBytes = options?.targetBytes ?? SERVER_INPUT_TARGET_BYTES;
  const maxDimension = options?.maxDimension ?? SERVER_INPUT_MAX_DIMENSION;

  if (sourceBytes <= targetBytes && !String(input.mimeType || '').includes('png')) {
    return input;
  }

  const image = await loadImageElement(input.data);
  const longestSide = Math.max(image.width, image.height);
  const initialScale = longestSide > maxDimension ? maxDimension / longestSide : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * initialScale));
  canvas.height = Math.max(1, Math.round(image.height * initialScale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return input;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.84;
  let output = canvas.toDataURL('image/jpeg', quality);

  while (quality > SERVER_INPUT_MIN_QUALITY && Math.ceil((output.length * 3) / 4) > targetBytes) {
    quality -= 0.08;
    output = canvas.toDataURL('image/jpeg', quality);
  }

  if (Math.ceil((output.length * 3) / 4) > targetBytes && Math.max(canvas.width, canvas.height) > 1024) {
    const secondaryScale = 1024 / Math.max(canvas.width, canvas.height);
    canvas.width = Math.max(1, Math.round(canvas.width * secondaryScale));
    canvas.height = Math.max(1, Math.round(canvas.height * secondaryScale));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    output = canvas.toDataURL('image/jpeg', Math.max(SERVER_INPUT_MIN_QUALITY, quality));
  }

  return {
    data: output,
    mimeType: 'image/jpeg',
  };
}

async function prepareServerProviderImages(
  images: ImageInput[],
  options?: {
    maxDimension?: number;
    targetBytes?: number;
  }
): Promise<ImageInput[]> {
  return await Promise.all(images.map((image) => optimizeServerImageInput(image, options)));
}

function inferLegacyBatchRunId(image: GalleryImage): string | undefined {
  const recipe = image.params as Partial<GenerationRecipe> | undefined;
  if (recipe?.operation !== 'batch') return undefined;
  const promptKey = (image.prompt || '').trim().toLowerCase().slice(0, 120) || 'batch';
  const timeBucket = Math.floor(image.timestamp / LEGACY_BATCH_GROUP_WINDOW_MS);
  return `legacy-batch-${timeBucket}-${promptKey}`;
}

function getImageRowKey(image: Pick<GeneratedImage, 'id' | 'runId' | 'prompt' | 'timestamp' | 'recipe'>): string {
  if (image.runId) return image.runId;
  if (image.recipe?.operation === 'batch') {
    const promptKey = (image.prompt || '').trim().toLowerCase().slice(0, 120) || 'batch';
    const timeBucket = Math.floor(image.timestamp / LEGACY_BATCH_GROUP_WINDOW_MS);
    return `legacy-batch-${timeBucket}-${promptKey}`;
  }
  return image.id;
}

const App: React.FC = () => {
  // Supabase connectivity state (separate from app identity)
  const [isSupabaseReady, setIsSupabaseReady] = useState(false);
  const [isAuthBootstrapping, setIsAuthBootstrapping] = useState(true);
  const [authFailureMessage, setAuthFailureMessage] = useState<string | null>(null);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [isAppUserBootstrapping, setIsAppUserBootstrapping] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document !== 'undefined') {
      const domTheme = document.documentElement.dataset.theme;
      if (domTheme === 'dark' || domTheme === 'light') return domTheme;
    }
    if (typeof window !== 'undefined') {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme === 'dark' || storedTheme === 'light') return storedTheme;
    }
    return 'light';
  });


  // AI Provider state
  const {
    defaultProviderSettings,
    providerSettings,
    selectedProvider,
    nanoBananaImageModel,
    setProviderSettings,
    setSelectedProvider,
    setNanoBananaImageModel,
  } = useProviderSettings();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [promptMode, setPromptMode] = useState<'simple' | 'advanced'>('simple');
  const [advancedVariant, setAdvancedVariant] = useState<'A' | 'B' | 'C'>('C'); // Default: Balanced
  const [faceIdentityMode, setFaceIdentityMode] = useState(false);
  const [simpleLinkMode, setSimpleLinkMode] = useState<'style' | 'merge' | 'object' | null>(null);
  const [useGrounding, setUseGrounding] = useState(false);
  const [jsonContext, setJsonContext] = useState<{ fileName: string; content: any } | null>(null);
  const [generationPromptPreview, setGenerationPromptPreview] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentChunk: number;
    totalChunks: number;
  } | null>(null);

  const [selectedGeneratedImages, setSelectedGeneratedImages] = useState<Set<string>>(new Set());
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [isHoveringGallery, setIsHoveringGallery] = useState(false);

  // Nové umělecké funkce
  const [styleStrength, setStyleStrength] = useState(50);
  const [styleWeights, setStyleWeights] = useState<Record<string, number>>({});
  const [isFreeComparisonOpen, setIsFreeComparisonOpen] = useState(false);
  const [maskCanvasState, setMaskCanvasState] = useState<{
    isOpen: boolean;
    mode: 'inpaint' | 'outpaint';
    imageId: string;
    imageUrl: string;
    width: number;
    height: number;
    outpaintDirection?: 'top' | 'bottom' | 'left' | 'right' | 'all';
    outpaintPixels?: number;
  } | null>(null);
  const [upscalingImageId, setUpscalingImageId] = useState<string | null>(null);
  const [styleAnalysisCache, setStyleAnalysisCache] = useState<{ description: string; strength: number } | null>(null);

  // Refs
  const galleryPanelRef = useRef<any>(null);
  const [analyzingImageId, setAnalyzingImageId] = useState<string | null>(null);
  const hasTriggeredCloudMetadataBackfill = useRef(false);

  useEffect(() => {
    setIsAppUserBootstrapping(true);
    setAppUserId(ensureLocalAppUserId());
    setIsAppUserBootstrapping(false);
    void ImageDatabase.getAll();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    const themeColor = theme === 'dark' ? '#0b0c0a' : '#f2f4ec';

    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.body.style.colorScheme = theme;
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', themeColor);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    const handleCloudSyncEvent = (event: Event) => {
      const customEvent = event as CustomEvent<CloudSyncEventDetail>;
      if (customEvent.detail?.status !== 'failed') return;
      setToast({ message: customEvent.detail.message, type: 'warning' });
    };

    window.addEventListener(CLOUD_SYNC_EVENT_NAME, handleCloudSyncEvent as EventListener);
    return () => {
      window.removeEventListener(CLOUD_SYNC_EVENT_NAME, handleCloudSyncEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let smokeExecuted = false;
    let lastAuthError = '';
    let hasPermanentAuthFailure = false;

    const clearRetryTimer = () => {
      if (!retryTimer) return;
      window.clearTimeout(retryTimer);
      retryTimer = null;
    };

    const scheduleReconnect = (delayMs = 5000) => {
      if (cancelled || retryTimer) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void bootstrapAuth(true);
      }, delayMs);
    };

    const runSmokeIfRequested = async () => {
      if (smokeExecuted) return;
      if (new URLSearchParams(window.location.search).get('smoke') !== '1') return;
      smokeExecuted = true;

      const result = await runSupabaseSmokeTests((message, data) => {
        if (data !== undefined) {
          console.log(`[Smoke] ${message}`, data);
        } else {
          console.log(`[Smoke] ${message}`);
        }
      });
      if (cancelled) return;

      if (result.ok) {
        setToast({ message: '✅ Smoke test Supabase: OK', type: 'success' });
      } else {
        setToast({ message: `❌ Smoke test Supabase: ${result.failures[0]}`, type: 'error' });
        console.error('[Smoke] Failures:', result.failures);
      }
    };

    const bootstrapAuth = async (isRetry = false) => {
      if (!isRetry) setIsAuthBootstrapping(true);

      try {
        await ensureSupabaseClient();
        if (cancelled) return;

        hasPermanentAuthFailure = false;
        clearRetryTimer();
        lastAuthError = '';
        setAuthFailureMessage(null);
        setIsSupabaseReady(true);
        void ImageDatabase.getAll();
        if (!hasTriggeredCloudMetadataBackfill.current) {
          hasTriggeredCloudMetadataBackfill.current = true;
          void backfillLocalLibraryMetadataToCloud()
            .then((result) => {
              if (cancelled) return;
              if (result.saved > 0 || result.generated > 0) {
                setToast({
                  message: `Obnoveno do cloudu: ${result.saved} ulozenych a ${result.generated} generovanych obrazku.`,
                  type: 'success',
                });
              }
            })
            .catch((error) => {
              hasTriggeredCloudMetadataBackfill.current = false;
              console.warn('[Cloud Backfill] Metadata sync failed:', error);
            });
        }
        void runSmokeIfRequested();
      } catch (error: any) {
        if (cancelled) return;
        const message = error?.message || 'Nepodařilo se inicializovat Supabase.';
        const isPermanentError =
          message.includes('Anonymní přihlášení je v Supabase vypnuté') ||
          message.includes('Supabase není nakonfigurovaná');

        hasPermanentAuthFailure = isPermanentError;
        setIsSupabaseReady(true);
        setAuthFailureMessage(message);
        if (message !== lastAuthError) {
          setToast({ message: `${message} Aplikace pokračuje v single-user režimu.`, type: 'error' });
          lastAuthError = message;
        }
        if (isPermanentError) {
          clearRetryTimer();
        } else {
          scheduleReconnect(5000);
        }
      } finally {
        if (!cancelled && !isRetry) setIsAuthBootstrapping(false);
      }
    };

    const startHeartbeat = () => {
      heartbeatTimer = window.setInterval(async () => {
        if (cancelled) return;
        if (hasPermanentAuthFailure) return;
        try {
          await ensureSupabaseClient();
          if (cancelled) return;
          setAuthFailureMessage(null);
          setIsSupabaseReady(true);
        } catch (error: any) {
          if (cancelled) return;
          const message = error?.message || 'Spojení se Supabase bylo přerušeno.';
          const isPermanentError =
            message.includes('Anonymní přihlášení je v Supabase vypnuté') ||
            message.includes('Supabase není nakonfigurovaná');

          hasPermanentAuthFailure = isPermanentError;
          setIsSupabaseReady(true);
          setAuthFailureMessage(message);
          if (message !== lastAuthError) {
            setToast({ message: `${message} Cloud sync zkusím znovu na pozadí.`, type: 'error' });
            lastAuthError = message;
          }
          if (isPermanentError) {
            clearRetryTimer();
          } else {
            scheduleReconnect(2000);
          }
        }
      }, 60_000);
    };

    void bootstrapAuth(false);
    startHeartbeat();

    const onOnline = () => {
      void bootstrapAuth(true);
    };
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      clearRetryTimer();
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventDefault, { capture: true });
    window.addEventListener('drop', preventDefault, { capture: true });
    return () => {
      window.removeEventListener('dragover', preventDefault, { capture: true } as any);
      window.removeEventListener('drop', preventDefault, { capture: true } as any);
    };
  }, []);

  const [state, setState] = useState<AppState>({
    sourceImages: [],
    styleImages: [],
    assetImages: [],
    generatedImages: [],
    prompt: '',
    aspectRatio: 'Original',
    resolution: '1K',
    error: null,
    numberOfImages: 1,
    multiRefMode: 'together',
    styleStrength: 50,
    styleWeights: {},
  });

  useEffect(() => {
    const saved = localStorage.getItem('multiRefMode');
    if (saved === 'batch' || saved === 'together') {
      setState(prev => ({ ...prev, multiRefMode: saved }));
    }
  }, []);

  useEffect(() => {
    if (state.multiRefMode) {
      localStorage.setItem('multiRefMode', state.multiRefMode);
    }
  }, [state.multiRefMode]);

  // Load persistent generation history from IndexedDB on mount
  useEffect(() => {
    getAllImages().then(async images => {
      if (!images || images.length === 0) return;

      const limitedImages = images.slice(0, 80);
      const dedupedImages = await dedupeHistoryImages(limitedImages);
      const keptIds = new Set(dedupedImages.map((image) => image.id));
      const duplicateIds = limitedImages
        .filter((image) => !keptIds.has(image.id))
        .map((image) => image.id);

      if (duplicateIds.length > 0) {
        void Promise.allSettled(duplicateIds.map((id) => deleteGalleryImage(id)));
      }

      const restoredImages: GeneratedImage[] = dedupedImages
        .slice(0, 40)
        .map(img => ({
          id: img.id,
          url: img.url,
          prompt: img.prompt,
          timestamp: img.timestamp,
          status: 'success' as const,
          resolution: img.resolution,
          aspectRatio: img.aspectRatio,
          recipe: img.params as any,
          runId: (img.params as any)?.runId ?? inferLegacyBatchRunId(img) ?? img.id,
          lineage: img.lineage,
        }));
      setState(prev => ({
        ...prev,
        generatedImages: restoredImages,
      }));
    }).catch(() => { /* silently ignore load errors */ });
  }, []);

  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [gridCols, setGridCols] = useState<number>(3);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [editPrompts, setEditPrompts] = useState<Record<string, string>>({});
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isGalleryExpanded, setIsGalleryExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const activeGenerationsRef = useRef(0);
  const [inlineEditStates, setInlineEditStates] = useState<Record<string, { prompt: string; referenceImages: SourceImage[] }>>({});
  const [showReferenceUpload, setShowReferenceUpload] = useState<Record<string, boolean>>({});
  const [isGenerateClicked, setIsGenerateClicked] = useState(false);
  const [referenceImageSource, setReferenceImageSource] = useState<'computer' | 'database'>('computer');
  const [styleImageSource, setStyleImageSource] = useState<'computer' | 'database'>('computer');
  const [dragOverTarget, setDragOverTarget] = useState<'reference' | 'style' | 'asset' | null>(null);

  const [routePath, setRoutePath] = useState('/');
  const navigate = useCallback((to: string) => {
    if (window.location.pathname === to) return;
    window.history.pushState({}, '', to);
    setRoutePath(to);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    setRoutePath(window.location.pathname);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('isRightPanelCollapsed');
    if (saved === 'true') {
      setIsRightPanelCollapsed(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('isRightPanelCollapsed', isRightPanelCollapsed ? 'true' : 'false');
  }, [isRightPanelCollapsed]);

  useEffect(() => {
    const onPop = () => setRoutePath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const isStyleTransferRoute = routePath === '/style-transfer' || routePath.startsWith('/style-transfer/');
  const isFaceSwapRoute = routePath === '/face-swap' || routePath.startsWith('/face-swap/');
  const isFluxLoraRoute = routePath === '/flux-lora' || routePath.startsWith('/flux-lora/');
  const isLoraInfluenceRoute = isFluxLoraRoute;
  const isModelInfluenceRoute = routePath === '/model-influence' || routePath.startsWith('/model-influence/');
  const isAiUpscalerRoute = routePath === '/ai-upscaler' || routePath.startsWith('/ai-upscaler/');
  const isReframeRoute = routePath === '/reframe' || routePath.startsWith('/reframe/');
  const isBatchRoute = routePath === '/batch' || routePath.startsWith('/batch/');
  // Nové state pro featury
  const [isCollectionsModalOpen, setIsCollectionsModalOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isRemixModalOpen, setIsRemixModalOpen] = useState(false);
  const [promptHistory] = useState(() => new PromptHistory());
  const {
    setPrompt,
    handleUndoPrompt,
    handleRedoPrompt,
  } = usePromptHistoryActions({
    promptHistory,
    setState,
  });
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [quickActionsMenu, setQuickActionsMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    imageId: string | null;
  }>({ isOpen: false, position: { x: 0, y: 0 }, imageId: null });
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const supabaseAuthSettingsUrl = useMemo(() => {
    const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const match = rawSupabaseUrl?.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
    if (!match?.[1]) return 'https://supabase.com/dashboard';
    return `https://supabase.com/dashboard/project/${match[1]}/auth/providers`;
  }, []);

  const isResizingRef = useRef(false);
  const isResizingRightRef = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const mobilePromptRef = useRef<HTMLTextAreaElement>(null);
  const createGenerationSnapshot = useGenerationSnapshot({
    state,
    providerSettings,
    selectedProvider,
    nanoBananaImageModel,
    promptMode,
    advancedVariant,
    faceIdentityMode,
    simpleLinkMode,
    useGrounding,
    jsonContext,
    styleStrength,
    styleWeights,
    styleAnalysisCache,
  });
  const {
    generationLockRef,
    queuedGenerationCount,
    createSnapshot: createQueuedGenerationSnapshot,
    enqueueGenerationSnapshot,
    dequeueGenerationSnapshot,
  } = useGenerationQueue<GenerationQueueSnapshot, GenerationQueueAction>({
    createSnapshot: createGenerationSnapshot,
    onToast: setToast,
  });
  const {
    handleProviderChange,
    handleNanoBananaModelChange,
  } = useGenerationSettingsGuard({
    isGenerating,
    queuedGenerationCount,
    selectedProvider,
    nanoBananaImageModel,
    onProviderChange: setSelectedProvider,
    onModelChange: setNanoBananaImageModel,
  });

  // canGenerate: Check if user can trigger generation
  const canGenerate = useMemo(() => {
    const hasTextPrompt = state.prompt.trim().length > 0;
    const hasReferencePrompt = state.sourceImages.some(img => img.prompt && img.prompt.trim().length > 0);
    const hasFixedSimpleMode =
      promptMode === 'simple' &&
      !!simpleLinkMode &&
      state.sourceImages.length > 0 &&
      state.styleImages.length > 0;

    return hasTextPrompt || hasReferencePrompt || hasFixedSimpleMode;
  }, [promptMode, simpleLinkMode, state.prompt, state.sourceImages, state.styleImages]);

  useEffect(() => {
    // Check for prompt in URL params
    const params = new URLSearchParams(window.location.search);
    const urlPrompt = params.get('prompt');
    if (urlPrompt) {
      setState(prev => ({ ...prev, prompt: urlPrompt }));
    }

    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 1024;
      setIsMobile(mobile);

      if (width < 640) {
        setGridCols(1);
      } else if (width < 1024) {
        setGridCols(2);
      } else {
        setGridCols(prev => prev < 3 ? 3 : prev);
      }

      // Zajistit že pravý panel se vejde do viewportu
      // Layout: [levý panel 320px] [resize 1px] [main flex-1] [resize 1px] [pravý panel]
      if (!mobile) {
        const leftPanelWidth = sidebarWidth || 320;
        const resizeHandles = 2; // 2x 1px pro resize handles
        const minMainWidth = 360;
        const maxAllowedWidth = width - leftPanelWidth - resizeHandles - minMainWidth;

        setRightPanelWidth(prev => {
          const newWidth = Math.max(320, Math.min(prev, maxAllowedWidth));
          return newWidth;
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isGalleryExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsGalleryExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isGalleryExpanded]);

  // Auto-expand prompt textarea
  useEffect(() => {
    const adjust = (ref: React.RefObject<HTMLTextAreaElement>) => {
      if (ref.current) {
        ref.current.style.height = 'auto';
        ref.current.style.height = `${ref.current.scrollHeight}px`;
      }
    };
    adjust(promptRef);
    adjust(mobilePromptRef);
  }, [state.prompt, isMobileMenuOpen]);

  // Ochrana: Zajisti že pravý panel zůstane viditelný
  useEffect(() => {
    const enforceMaxWidth = () => {
      if (rightPanelRef.current && !isMobile) {
        const viewportWidth = window.innerWidth;
        const leftPanelWidth = sidebarWidth || 320;
        const resizeHandles = 2;
        const minMainWidth = 360;
        const maxAllowed = viewportWidth - leftPanelWidth - resizeHandles - minMainWidth;

        if (rightPanelWidth > maxAllowed) {
          setRightPanelWidth(Math.max(320, maxAllowed));
        }
      }
    };

    enforceMaxWidth();
    window.addEventListener('resize', enforceMaxWidth);
    return () => window.removeEventListener('resize', enforceMaxWidth);
  }, [rightPanelWidth, isMobile, sidebarWidth]);

  const startResizing = useCallback(() => {
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
  }, []);

  const startResizingRight = useCallback(() => {
    isResizingRightRef.current = true;
    document.body.style.cursor = 'col-resize';
  }, []);

  const stopResizing = useCallback(() => {
    isResizingRef.current = false;
    isResizingRightRef.current = false;
    document.body.style.cursor = '';
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizingRef.current) {
      const newWidth = Math.max(280, Math.min(620, e.clientX));
      setSidebarWidth(newWidth);
    }
    if (isResizingRightRef.current) {
      const windowWidth = window.innerWidth;
      const rightWidth = windowWidth - e.clientX;
      const leftPanelWidth = sidebarWidth || 320;
      const resizeHandles = 2;
      const minMainWidth = 360;
      const maxAllowedWidth = windowWidth - leftPanelWidth - resizeHandles - minMainWidth;

      setRightPanelWidth(Math.max(320, Math.min(maxAllowedWidth, rightWidth)));
    }
  }, [sidebarWidth]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const getLoadingAspectRatio = useCallback((ratio: string | undefined): React.CSSProperties => {
    if (!ratio || ratio === 'Original') return { aspectRatio: '1 / 1' };
    const [w, h] = ratio.split(':');
    if (!w || !h) return { aspectRatio: '1 / 1' };
    return { aspectRatio: `${w} / ${h}` };
  }, []);

  const handleImagesSelected = useCallback((files: File[]) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          const dataUrl = e.target.result;
          const newImage: SourceImage = {
            id: Math.random().toString(36).substr(2, 9),
            url: dataUrl,
            file: file
          };
          setState(prev => ({
            ...prev,
            sourceImages: [...prev.sourceImages, newImage],
            error: null,
          }));

          // Uložit do databáze
          try {
            await ImageDatabase.add(file, dataUrl, 'reference');
          } catch (error) {
            console.error('Failed to save image to database:', error);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }, [state.sourceImages]);

  const handleStyleImagesSelected = useCallback((files: File[]) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          const dataUrl = e.target.result;
          const newImage: SourceImage = {
            id: Math.random().toString(36).substr(2, 9),
            url: dataUrl,
            file: file
          };
          setState(prev => ({
            ...prev,
            styleImages: [...prev.styleImages, newImage],
            error: null,
          }));

          // Uložit do databáze
          try {
            await ImageDatabase.add(file, dataUrl, 'style');
          } catch (error) {
            console.error('Failed to save image to database:', error);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }, [state.styleImages]);

  const handleAssetImagesSelected = useCallback((files: File[]) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          const dataUrl = e.target.result;
          const newImage: SourceImage = {
            id: Math.random().toString(36).substr(2, 9),
            url: dataUrl,
            file: file
          };
          setState(prev => ({
            ...prev,
            assetImages: [...prev.assetImages, newImage],
            error: null,
          }));

          try {
            await ImageDatabase.add(file, dataUrl, 'reference');
          } catch (error) {
            console.error('Failed to save asset image to database:', error);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }, [state.assetImages]);

  const handleDatabaseImagesSelected = useCallback((images: { url: string; fileName: string; fileType: string }[]) => {
    images.forEach(async ({ url, fileName, fileType }) => {
      // Konvertuj data URL na File objekt
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: fileType });

      const newImage: SourceImage = {
        id: Math.random().toString(36).substr(2, 9),
        url: url,
        file: file
      };

      setState(prev => ({
        ...prev,
        sourceImages: [...prev.sourceImages, newImage],
        error: null,
      }));
    });
  }, []);

  const handleDatabaseStyleImagesSelected = useCallback((images: { url: string; fileName: string; fileType: string }[]) => {
    images.forEach(async ({ url, fileName, fileType }) => {
      // Konvertuj data URL na File objekt
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: fileType });

      const newImage: SourceImage = {
        id: Math.random().toString(36).substr(2, 9),
        url: url,
        file: file
      };

      setState(prev => ({
        ...prev,
        styleImages: [...prev.styleImages, newImage],
        error: null,
      }));
    });
  }, []);

  const handleDatabaseAssetImagesSelected = useCallback((images: { url: string; fileName: string; fileType: string }[]) => {
    images.forEach(async ({ url, fileName, fileType }) => {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: fileType });

      const newImage: SourceImage = {
        id: Math.random().toString(36).substr(2, 9),
        url: url,
        file: file
      };

      setState(prev => ({
        ...prev,
        assetImages: [...prev.assetImages, newImage],
        error: null,
      }));
    });
  }, []);

  const blobToDataUrl = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Nepodařilo se převést Blob na data URL.'));
      reader.readAsDataURL(blob);
    });
  }, []);

  const fileToDataUrl = useCallback((file: File): Promise<string> => {
    return blobToDataUrl(file);
  }, [blobToDataUrl]);

  // Drag & Drop handlery pro pravý panel
  const handleDragOverReference = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget('reference');
  }, []);

  const handleDragOverStyle = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget('style');
  }, []);

  const handleDragOverAsset = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget('asset');
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
  }, []);

  const handleDropReference = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);

    console.log('[Drop Reference] Drop event received');

    try {
      // Try JSON first
      let imageData = null;
      const internalData = e.dataTransfer.getData('application/x-mulen-image');
      const jsonData = e.dataTransfer.getData('application/json');

      if (internalData) {
        console.log('[Drop Reference] Got internal data');
        imageData = JSON.parse(internalData);
      } else if (jsonData) {
        console.log('[Drop Reference] Got JSON data payload');
        imageData = JSON.parse(jsonData);
      } else {
        const files = Array.from(e.dataTransfer.files as FileList).filter((f) => f.type.startsWith('image/'));
        if (files.length > 0) {
          const file = files[0];
          console.log('[Drop Reference] Got file drop:', file.name);
          imageData = { file, fileName: file.name, fileType: file.type };
        } else {
          const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
          console.log('[Drop Reference] Got text url', { hasUrl: Boolean(url) });
          if (url) {
            imageData = {
              url: url,
              fileName: 'dropped-image.jpg',
              fileType: 'image/jpeg'
            };
          }
        }
      }

      const hasDroppedFile = imageData?.file instanceof File;
      if (!imageData || (!imageData.url && !hasDroppedFile)) {
        console.warn('[Drop Reference] No valid image data found');
        return;
      }

      const { url, fileName, fileType, prompt, file: droppedFile } = imageData;

      if (droppedFile instanceof File) {
        const dataUrl = await fileToDataUrl(droppedFile);
        const newImage: SourceImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: dataUrl,
          file: droppedFile,
          prompt: prompt
        };

        setState(prev => ({
          ...prev,
          sourceImages: [...prev.sourceImages, newImage],
          error: null,
        }));
        return;
      }

      // Kontrola jestli už není v seznamu
      if (state.sourceImages.some(img => img.url === url)) {
        console.log('[Drop Reference] Image already in list');
        return;
      }

      // Konvertuj URL na File objekt
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], fileName, { type: fileType });

        const dataUrl = await blobToDataUrl(blob);

        const newImage: SourceImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: dataUrl,
          file: file,
          prompt: prompt // Uložit prompt pokud existuje
        };

        setState(prev => ({
          ...prev,
          sourceImages: [...prev.sourceImages, newImage],
          error: null,
        }));

        console.log('[Drop Reference] Image added successfully', { hasPrompt: Boolean(prompt) });
      } catch (fetchError) {
        console.error('[Drop Reference] Failed to fetch image, using URL directly:', fetchError);
        // Fallback - použij URL přímo bez File objektu
        const newImage: SourceImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: url,
          file: new File([], fileName, { type: fileType }), // Dummy file
          prompt: prompt // Uložit prompt pokud existuje
        };

        setState(prev => ({
          ...prev,
          sourceImages: [...prev.sourceImages, newImage],
          error: null,
        }));
      }
    } catch (error) {
      console.error('[Drop Reference] Drop failed:', error);
    }
  }, [blobToDataUrl, state.sourceImages]);

  const handleDropStyle = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);

    console.log('[Drop Style] Drop event received');

    try {
      // Try JSON first
      let imageData = null;
      const internalData = e.dataTransfer.getData('application/x-mulen-image');
      const jsonData = e.dataTransfer.getData('application/json');

      if (internalData) {
        console.log('[Drop Style] Got internal data');
        imageData = JSON.parse(internalData);
      } else if (jsonData) {
        console.log('[Drop Style] Got JSON data payload');
        imageData = JSON.parse(jsonData);
      } else {
        const files = Array.from(e.dataTransfer.files as FileList).filter((f) => f.type.startsWith('image/'));
        if (files.length > 0) {
          const file = files[0];
          console.log('[Drop Style] Got file drop:', file.name);
          imageData = { file, fileName: file.name, fileType: file.type };
        } else {
          const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
          console.log('[Drop Style] Got text url', { hasUrl: Boolean(url) });
          if (url) {
            imageData = {
              url: url,
              fileName: 'dropped-image.jpg',
              fileType: 'image/jpeg'
            };
          }
        }
      }

      const hasDroppedFile = imageData?.file instanceof File;
      if (!imageData || (!imageData.url && !hasDroppedFile)) {
        console.warn('[Drop Style] No valid image data found');
        return;
      }

      const { url, fileName, fileType, file: droppedFile } = imageData;

      if (droppedFile instanceof File) {
        const dataUrl = await fileToDataUrl(droppedFile);
        const newImage: SourceImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: dataUrl,
          file: droppedFile
        };

        setState(prev => ({
          ...prev,
          styleImages: [...prev.styleImages, newImage],
          error: null,
        }));
        return;
      }

      // Kontrola jestli už není v seznamu
      if (state.styleImages.some(img => img.url === url)) {
        console.log('[Drop Style] Image already in list');
        return;
      }

      // Konvertuj URL na File objekt
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], fileName, { type: fileType });

        const dataUrl = await blobToDataUrl(blob);

        const newImage: SourceImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: dataUrl,
          file: file
        };

        setState(prev => ({
          ...prev,
          styleImages: [...prev.styleImages, newImage],
          error: null,
        }));

        console.log('[Drop Style] Image added successfully');
      } catch (fetchError) {
        console.error('[Drop Style] Failed to fetch image, using URL directly:', fetchError);
        // Fallback - použij URL přímo bez File objektu
        const newImage: SourceImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: url,
          file: new File([], fileName, { type: fileType }) // Dummy file
        };

        setState(prev => ({
          ...prev,
          styleImages: [...prev.styleImages, newImage],
          error: null,
        }));
      }
    } catch (error) {
      console.error('[Drop Style] Drop failed:', error);
    }
  }, [blobToDataUrl, state.styleImages]);

  const handleDropAsset = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);

    try {
      let imageData = null;
      const internalData = e.dataTransfer.getData('application/x-mulen-image');
      const jsonData = e.dataTransfer.getData('application/json');

      if (internalData) {
        imageData = JSON.parse(internalData);
      } else if (jsonData) {
        imageData = JSON.parse(jsonData);
      } else {
        const files = Array.from(e.dataTransfer.files as FileList).filter((f) => f.type.startsWith('image/'));
        if (files.length > 0) {
          const file = files[0];
          imageData = { file, fileName: file.name, fileType: file.type };
        } else {
          const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
          if (url) {
            imageData = {
              url: url,
              fileName: 'asset-image.jpg',
              fileType: 'image/jpeg'
            };
          }
        }
      }

      const hasDroppedFile = imageData?.file instanceof File;
      if (!imageData || (!imageData.url && !hasDroppedFile)) return;

      const { url, fileName, fileType, file: droppedFile } = imageData;

      if (droppedFile instanceof File) {
        const dataUrl = await fileToDataUrl(droppedFile);
        const newImage: SourceImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: dataUrl,
          file: droppedFile
        };

        setState(prev => ({
          ...prev,
          assetImages: [...prev.assetImages, newImage],
          error: null,
        }));
        return;
      }

      if (state.assetImages.some(img => img.url === url)) return;

      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], fileName, { type: fileType });

        const dataUrl = await blobToDataUrl(blob);

        const newImage: SourceImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: dataUrl,
          file: file
        };

        setState(prev => ({
          ...prev,
          assetImages: [...prev.assetImages, newImage],
          error: null,
        }));
      } catch (fetchError) {
        console.error('[Drop Asset] Failed to fetch image, using URL directly:', fetchError);
        const newImage: SourceImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: url,
          file: new File([], fileName, { type: fileType })
        };

        setState(prev => ({
          ...prev,
          assetImages: [...prev.assetImages, newImage],
          error: null,
        }));
      }
    } catch (error) {
      console.error('[Drop Asset] Drop failed:', error);
    }
  }, [blobToDataUrl, fileToDataUrl, state.assetImages]);

  // Auto-generate effect
  useEffect(() => {
    if (state.shouldAutoGenerate) {
      if (!state.prompt.trim()) return;

      // Reset flag immediately to prevent loop
      setState(prev => ({ ...prev, shouldAutoGenerate: false }));

      // Trigger generation
      console.log('[AutoGenerate] Triggered by Repopulate');
      handleGenerate();
    }
  }, [state.shouldAutoGenerate, state.prompt]); // Dep needs prompt to be updated first

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        handleImagesSelected(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleImagesSelected]);

  // #1: Auto-analýza stylu, když jsou k dispozici referenční + stylový obrázek
  useEffect(() => {
    if (state.sourceImages.length === 0 || state.styleImages.length === 0) {
      setStyleAnalysisCache(null);
      return;
    }
    const geminiKey = providerSettings[AIProviderType.GEMINI]?.apiKey;

    let cancelled = false;
    const analyze = async () => {
      try {
        const refUrl = state.sourceImages[0].url;
        const styleUrl = state.styleImages[0].url;
        const result = await analyzeStyleTransferWithAI(refUrl, styleUrl, geminiKey);
        if (!cancelled) {
          setStyleAnalysisCache({
            description: result.styleDescription,
            strength: result.recommendedStrength,
          });
          setStyleStrength(result.recommendedStrength);
        }
      } catch (error) {
        console.warn('[Style Analysis] Auto-analysis failed:', error);
      }
    };
    analyze();
    return () => { cancelled = true; };
  }, [state.sourceImages.length, state.styleImages.length]);

  const handleEnhancePrompt = async () => {
    if (!state.prompt.trim() || isEnhancingPrompt) return;

    setIsEnhancingPrompt(true);
    try {
      console.log('[Enhance Prompt] Starting enhancement...');
      const geminiKey = providerSettings[AIProviderType.GEMINI]?.apiKey;
      const enhanced = await enhancePromptWithAI(state.prompt, geminiKey);

      if (!enhanced || enhanced === state.prompt) {
        console.warn('[Enhance Prompt] No enhancement received or same as original');
        setToast({ message: 'Nepodařilo se vylepšit prompt', type: 'error' });
      } else {
        console.log('[Enhance Prompt] Success:', enhanced);
        setPrompt(enhanced);
        setToast({ message: '✨ Prompt vylepšen', type: 'success' });
      }
    } catch (error: any) {
      console.error('[Enhance Prompt] Error:', error);
      setToast({ message: toUserFacingAiError(error, 'Chyba při vylepšování promptu'), type: 'error' });
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  const handleExtractPromptFromImage = async (img: SourceImage) => {
    if (analyzingImageId) return;
    setAnalyzingImageId(img.id);

    try {
      const dataUrl = await urlToDataUrl(img.url);
      const geminiKey = providerSettings[AIProviderType.GEMINI]?.apiKey;
      const json = await analyzeImageForJsonWithAI(dataUrl, geminiKey);
      const formatted = formatJsonPromptForImage(json);
      setPrompt(formatted);
      setToast({ message: '✨ Prompt byl extrahován z obrázku', type: 'success' });
    } catch (error: any) {
      console.error('[Extract Prompt] Error:', error);
      setToast({ message: toUserFacingAiError(error, 'Extrahování promptu selhalo'), type: 'error' });
    } finally {
      setAnalyzingImageId(null);
    }
  };

  const {
    applyRecipe,
    handleRepopulate,
    handleRepopulateFromGallery,
  } = useRepopulateActions({
    isMobile,
    setPromptMode,
    setAdvancedVariant,
    setFaceIdentityMode,
    setUseGrounding,
    setSelectedProvider,
    setJsonContext,
    setIsMobileMenuOpen,
    setState,
  });

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/json" && !file.name.endsWith('.json')) {
      setToast({ message: 'Only JSON files are allowed', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target?.result as string);
        setJsonContext({ fileName: file.name, content });
        setToast({ message: 'JSON context attached successfully', type: 'success' });
      } catch (err) {
        console.error('JSON Parse Error:', err);
        setToast({ message: 'Invalid JSON file content', type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const handleGenerateVariations = async (baseImage: GeneratedImage) => {
    if (!baseImage.url) return;

    // Generovat 3 variace se stejným promptem ale jiným style seedem
    const numberOfVariations = 3;

    setState(prev => ({
      ...prev,
      prompt: baseImage.prompt,
      resolution: baseImage.resolution || '2K',
      aspectRatio: baseImage.aspectRatio || 'Original',
      numberOfImages: numberOfVariations,
    }));

    // Automaticky spustit generování
    setTimeout(() => handleGenerate(), 100);
  };

  /**
   * Generate 3 sophisticated prompt variants and create images for each
   */
  const isRetriableProviderError = (err: any): boolean => {
    const message = String(err?.message || err || '').toLowerCase();
    return (
      message.includes('429') ||
      message.includes('toomanyrequests') ||
      message.includes('resource_exhausted') ||
      message.includes('request blocked') ||
      message.includes('503') ||
      message.includes('unavailable') ||
      message.includes('high demand') ||
      message.includes('temporarily unavailable') ||
      message.includes('overloaded')
    );
  };

  const processGenerate3VariantsSnapshot = async (snapshot: GenerationQueueSnapshot) => {
    const {
      state,
      providerSettings,
      promptMode,
      advancedVariant,
      faceIdentityMode,
      useGrounding,
      jsonContext,
    } = snapshot;

    if (!state.prompt.trim()) return;

    generationLockRef.current = true;
    setIsMobileMenuOpen(false);
    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: 3 });

    try {
      // 1. Generate 3 prompt variants using AI
      const provider = ProviderFactory.getProvider(AIProviderType.GEMINI, providerSettings);

      console.log('[3 Variants] Generating variants', { promptLength: state.prompt.length });
      setToast({ message: '🎨 Generating 3 sophisticated variants...', type: 'info' });

      const variants = await (provider as any).generate3PromptVariants(state.prompt);

      console.log('[3 Variants] Received variants:', variants.map((v: any) => v.variant).join(', '));

      // Prepare source images data if any
      const sourceImagesData = await Promise.all(
        state.sourceImages.map(async img => ({
          data: await urlToDataUrl(img.url),
          mimeType: img.file.type
        }))
      );
      const assetImagesData = await Promise.all(
        state.assetImages.map(async img => ({
          data: await urlToDataUrl(img.url),
          mimeType: img.file.type
        }))
      );
      const providerImages = await prepareServerProviderImages([...sourceImagesData, ...assetImagesData]);

      // 2. Generate image for each variant sequentially
      const variantsRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];

        console.log(`[3 Variants] Processing variant ${i + 1}/3: ${variant.variant}`);

        // Add delay between requests (except first one)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Create loading entry
        const newId = `${Date.now()}-variant-${i}`;
        setState(prev => ({
          ...prev,
          generatedImages: [{
            id: newId,
            prompt: variant.prompt,
            timestamp: Date.now() + i,
            status: 'loading' as const,
            resolution: state.resolution,
            aspectRatio: state.aspectRatio,
            runId: variantsRunId,
            variantInfo: {
              isVariant: true,
              variantNumber: i + 1,
              variant: variant.variant,
              approach: variant.approach,
              originalPrompt: state.prompt
            }
          }, ...prev.generatedImages]
        }));

        // Generate image with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        let success = false;

        while (retryCount <= maxRetries && !success) {
          try {
            const recipe = buildVariantRecipe({
              prompt: variant.prompt,
              useGrounding,
              promptMode,
              advancedVariant,
              faceIdentityMode,
              jsonContextFileName: jsonContext?.fileName,
              resolution: state.resolution,
              aspectRatio: state.aspectRatio,
              sourceImageCount: state.sourceImages.length,
              styleImageCount: state.styleImages.length,
              assetImageCount: state.assetImages.length,
              createdAt: Date.now(),
            });

            const result = await provider.generateImage(
              providerImages,
              variant.prompt,
              state.resolution,
              state.aspectRatio,
              useGrounding
            );
            const recipeWithModel = result.modelId ? { ...recipe, modelId: result.modelId } : recipe;

            setState(prev => ({
              ...prev,
              generatedImages: prev.generatedImages.map(img =>
                img.id === newId
                  ? { ...img, status: 'success', url: result.imageBase64, groundingMetadata: result.groundingMetadata, recipe: recipeWithModel }
                  : img
              )
            }));

            // Save to gallery
            try {
              const thumbnail = await createThumbnail(result.imageBase64);
              await saveToGallery({
                url: result.imageBase64,
                prompt: variant.prompt,
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                thumbnail,
                params: recipeWithModel
              });
              console.log(`[3 Variants] Variant ${i + 1} saved to gallery`);
            } catch (err) {
              console.error(`[3 Variants] Failed to save variant ${i + 1} to gallery:`, err);
              setToast({ message: `⚠️ Varianta ${i + 1} se nepodařila uložit do galerie`, type: 'warning' });
            }

            // Track API usage
            ApiUsageTracker.trackImageGeneration(state.resolution, 1);

            setGenerationProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
            success = true;
          } catch (err: any) {
            const isRetriable = isRetriableProviderError(err);
            if (isRetriable && retryCount < maxRetries) {
              retryCount++;
              const waitTime = 6000 * Math.pow(2, retryCount - 1);
              console.log(`[3 Variants] Provider overload for variant ${i + 1}, waiting ${waitTime / 1000}s (retry ${retryCount}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
              console.error(`[3 Variants] Failed to generate variant ${i + 1}:`, err);
              setState(prev => ({
                ...prev,
                generatedImages: prev.generatedImages.map(img =>
                  img.id === newId
                    ? { ...img, status: 'error', error: err instanceof Error ? err.message : 'Generation failed' }
                    : img
                )
              }));
              break;
            }
          }
        }
      }

      setToast({ message: '✨ 3 variants generated successfully!', type: 'success' });
    } catch (error: any) {
      console.error('[3 Variants] Error:', error);
      setToast({ message: toUserFacingAiError(error, 'Generování variant selhalo.'), type: 'error' });
    } finally {
      generationLockRef.current = false;
      setIsGenerating(false);
      setGenerationProgress(null);
      setGenerationPromptPreview(null);
      const nextItem = dequeueGenerationSnapshot();
      if (nextItem) {
        void runQueuedGenerationItem(nextItem);
      }
    }
  };

  const handleGenerate3Variants = async () => {
    const snapshot = createQueuedGenerationSnapshot();
    if (!snapshot.state.prompt.trim()) return;

    if (generationLockRef.current || isGenerating) {
      enqueueGenerationSnapshot({ action: 'variants', snapshot });
      return;
    }

    await processGenerate3VariantsSnapshot(snapshot);
  };

  // ── All models: generate from every top preset simultaneously ───────────
  const processGenerate3AISnapshot = async (snapshot: GenerationQueueSnapshot) => {
    const {
      state,
      providerSettings,
      promptMode,
      advancedVariant,
      faceIdentityMode,
    } = snapshot;

    if (!state.prompt.trim()) return;

    generationLockRef.current = true;
    setIsMobileMenuOpen(false);
    setIsGenerating(true);
    const runTargets = imageModelPresets.map((preset) => ({
      id: preset.id,
      type: preset.provider,
      label: preset.title,
      subtitle: preset.subtitle,
      geminiModel: preset.provider === AIProviderType.GEMINI ? preset.model : undefined,
    }));

    setGenerationProgress({ current: 0, total: runTargets.length });

    // Helper: burn label text into image using canvas
    const burnLabel = (imageBase64: string, label: string): Promise<string> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          // Semi-transparent badge at bottom-right
          const fontSize = Math.max(14, Math.round(img.width / 32));
          ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
          const textMetrics = ctx.measureText(label);
          const padH = fontSize * 0.6;
          const padV = fontSize * 0.4;
          const boxW = textMetrics.width + padH * 2;
          const boxH = fontSize + padV * 2;
          const bx = img.width - boxW - fontSize * 0.5;
          const by = img.height - boxH - fontSize * 0.5;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.beginPath();
          ctx.roundRect(bx, by, boxW, boxH, fontSize * 0.3);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, bx + padH, by + boxH / 2);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Failed to load image for labelling'));
        img.src = imageBase64;
      });

    try {
      const prompt = state.prompt.trim();
      setToast({ message: `🤖 Spouštím všechny modely (${runTargets.length})…`, type: 'info' });

      // Prepare source images
      const sourceImagesData = await Promise.all(
        state.sourceImages.map(async img => ({
          data: await urlToDataUrl(img.url),
          mimeType: img.file.type
        }))
      );
      const assetImagesData = await Promise.all(
        state.assetImages.map(async img => ({
          data: await urlToDataUrl(img.url),
          mimeType: img.file.type
        }))
      );
      const providerImages = await prepareServerProviderImages([...sourceImagesData, ...assetImagesData], {
        maxDimension: 1280,
        targetBytes: 900_000,
      });

      // Create loading entries for all model presets.
      const ids = runTargets.map((p, i) => `${Date.now()}-all-models-${i}`);
      setState(prev => ({
        ...prev,
        generatedImages: [
          ...runTargets.map((p, i) => ({
            id: ids[i],
            prompt,
            timestamp: Date.now() + i,
            status: 'loading' as const,
            resolution: state.resolution,
            aspectRatio: state.aspectRatio,
            variantInfo: {
              isVariant: true,
              variantNumber: i + 1,
              variant: p.label,
              approach: `Generated by ${p.label} (${p.subtitle})`,
              originalPrompt: prompt,
            },
          })),
          ...prev.generatedImages,
        ],
      }));

      // Launch all model presets in parallel.
      const promises = runTargets.map(async (p, i) => {
        try {
          const provider =
            p.type === AIProviderType.GEMINI
              ? new GeminiProvider(providerSettings[AIProviderType.GEMINI]?.apiKey || '', p.geminiModel)
              : ProviderFactory.getProvider(p.type, providerSettings);
          const result = await provider.generateImage(
            providerImages,
            prompt,
            state.resolution,
            state.aspectRatio,
            false
          );

          // Burn provider label onto the image
          const labelledImage = await burnLabel(result.imageBase64, p.label);

          const recipe = buildThreeAiRecipe({
            provider: p.type,
            prompt,
            useGrounding: false,
            promptMode,
            advancedVariant,
            faceIdentityMode,
            resolution: state.resolution,
            aspectRatio: state.aspectRatio,
            sourceImageCount: state.sourceImages.length,
            styleImageCount: state.styleImages.length,
            assetImageCount: state.assetImages.length,
            createdAt: Date.now(),
          });

          setState(prev => ({
            ...prev,
            generatedImages: prev.generatedImages.map(img =>
              img.id === ids[i]
                ? { ...img, status: 'success', url: labelledImage, recipe }
                : img
            ),
          }));

          // Save to gallery
          try {
            const thumbnail = await createThumbnail(labelledImage);
            await saveToGallery({
              url: labelledImage,
              prompt,
              resolution: state.resolution,
              aspectRatio: state.aspectRatio,
              thumbnail,
              params: recipe,
            });
          } catch { }

          ApiUsageTracker.trackImageGeneration(state.resolution, 1);
          setGenerationProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
          return { success: true };
        } catch (err: any) {
          console.error(`[All Models] ${p.label} failed:`, err);
          setState(prev => ({
            ...prev,
            generatedImages: prev.generatedImages.map(img =>
              img.id === ids[i]
                ? { ...img, status: 'error', error: `${p.label}: ${err?.message || 'Failed'}` }
                : img
            ),
          }));
          return { success: false, label: p.label, error: err?.message };
        }
      });

      const results = await Promise.allSettled(promises);
      const successes = results.filter(r => r.status === 'fulfilled' && (r.value as any)?.success).length;

      if (successes === runTargets.length) {
        setToast({ message: `✨ Hotovo. Všechny modely (${runTargets.length}) doběhly.`, type: 'success' });
      } else if (successes > 0) {
        setToast({ message: `⚠️ Uspělo ${successes}/${runTargets.length} modelů.`, type: 'info' });
      } else {
        setToast({ message: '❌ Selhal běh všech modelů.', type: 'error' });
      }
    } catch (error: any) {
      console.error('[All Models] Error:', error);
      setToast({ message: toUserFacingAiError(error, 'Běh všech modelů selhal.'), type: 'error' });
    } finally {
      generationLockRef.current = false;
      setIsGenerating(false);
      setGenerationProgress(null);
      setGenerationPromptPreview(null);
      const nextItem = dequeueGenerationSnapshot();
      if (nextItem) {
        void runQueuedGenerationItem(nextItem);
      }
    }
  };

  const handleGenerate3AI = async () => {
    const snapshot = createQueuedGenerationSnapshot();
    if (!snapshot.state.prompt.trim()) return;

    if (generationLockRef.current || isGenerating) {
      enqueueGenerationSnapshot({ action: '3ai', snapshot });
      return;
    }

    await processGenerate3AISnapshot(snapshot);
  };

  const processGenerationSnapshot = async (snapshot: GenerationQueueSnapshot) => {
    try {
    const {
      state,
      providerSettings,
      selectedProvider,
      nanoBananaImageModel,
      promptMode,
      advancedVariant,
      faceIdentityMode,
      simpleLinkMode,
      useGrounding,
      jsonContext,
      styleStrength,
      styleWeights,
      styleAnalysisCache,
    } = snapshot;

    setIsMobileMenuOpen(false);
    setGenerationPromptPreview(null);

    // Multiple reference images: batch only when explicitly enabled
    if (state.sourceImages.length > 1 && state.multiRefMode === 'batch') {
      console.log(`[Multi-Ref] Batch mode ON (${state.sourceImages.length} reference images)`);
      await handleBatchProcess(state.sourceImages);
      return;
    }

    // Single image generation (original logic)
    const hasReferencePrompt = state.sourceImages.some(img => img.prompt);
    const hasAnyReference = state.sourceImages.length > 0;

    // Validate prompt based on mode
    if (promptMode === 'simple') {
      const hasFixedSimpleMode = !!simpleLinkMode && state.sourceImages.length > 0 && state.styleImages.length > 0;
      if (!state.prompt.trim() && !hasReferencePrompt && !hasFixedSimpleMode) {
        setToast({ message: 'Vyberte Styl / Merge / Object (a přidejte vstupní + stylový obrázek) nebo napište prompt', type: 'error' });
        return;
      }
      if (!!simpleLinkMode && (state.sourceImages.length === 0 || state.styleImages.length === 0)) {
        setToast({ message: 'Pro Styl / Merge / Object přidejte aspoň 1 vstupní a 1 stylový obrázek', type: 'error' });
        return;
      }
    }

    // Přidat prompt do historie
    promptHistory.add(state.prompt);

    // Detekce jazyka a quality enhancement
    const language = detectLanguage(state.prompt);
    if (language) {
      console.log(language);
    }

    activeGenerationsRef.current++;
    setIsGenerating(true);

    // Respect the selected output count while keeping it within the Mulen Nano UI range.
    const countToGenerate = Math.max(1, Math.min(5, Math.round(state.numberOfImages || 1)));
    setGenerationProgress({ current: 0, total: countToGenerate });
    setToast({ message: `Spouštím generování ${countToGenerate} obrázků…`, type: 'info' });

    // Vytvořit pole s požadovaným počtem obrázků (všechny sdílí runId pro řádkové zobrazení)
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const imagesToGenerate = Array.from({ length: countToGenerate }, (_, index) => {
      const newId = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      return {
        id: newId,
        prompt: state.prompt,
        timestamp: Date.now() + index,
        status: 'loading' as const,
        resolution: state.resolution,
        aspectRatio: state.aspectRatio,
        runId,
      };
    });

    // Přidat všechny loading obrázky do state + FIFO removal (max 14 images)
    setState(prev => {
      const newImages = [...imagesToGenerate, ...prev.generatedImages];
      // FIFO: Keep only last 14 images (remove oldest)
      const limitedImages = newImages.length > MAX_GENERATED_IMAGES ? newImages.slice(0, MAX_GENERATED_IMAGES) : newImages;
      return {
        ...prev,
        generatedImages: limitedImages,
      };
    });

    // Generovat obrázky téměř souběžně.
    // Zachováme jen malý stagger startu, aby providery nedostaly burst ve stejnou milisekundu.
    const generateInParallel = async () => {
      const sourceImagesData = await Promise.all(
        state.sourceImages.map(async img => ({
          data: await urlToDataUrl(img.url),
          mimeType: img.file.type
        }))
      );
      const styleImagesData = await Promise.all(
        state.styleImages.map(async img => ({
          data: await urlToDataUrl(img.url),
          mimeType: img.file.type
        }))
      );
      const assetImagesData = await Promise.all(
        state.assetImages.map(async img => ({
          data: await urlToDataUrl(img.url),
          mimeType: img.file.type
        }))
      );
      const allImages = await prepareServerProviderImages([...sourceImagesData, ...styleImagesData, ...assetImagesData]);

      const generationResults = await Promise.all(
        imagesToGenerate.map(async (imageData, i) => {
          const interRequestDelay = getInterRequestDelayMs(selectedProvider, nanoBananaImageModel, i);
          if (interRequestDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, interRequestDelay));
          }

          // Retry logika pro 429 errory s exponential backoff
          let retryCount = 0;
          const maxRetries = 3;
          let success = false;

          while (retryCount <= maxRetries && !success) {
            try {
            const sourcePrompt = state.sourceImages.find(img => img.prompt)?.prompt;
            if (!state.prompt.trim() && sourcePrompt) {
              console.log('[Generation] Using prompt from reference image', { promptLength: sourcePrompt.length });
            }

            const { basePrompt, enhancedPrompt } = composeGenerationPrompt({
              prompt: state.prompt,
              promptMode,
              advancedVariant,
              faceIdentityMode,
              simpleLinkMode,
              jsonContext,
              sourceImageCount: state.sourceImages.length,
              styleImageCount: state.styleImages.length,
              assetImageCount: state.assetImages.length,
              sourcePrompt,
              multiRefMode: state.multiRefMode,
              styleStrength,
              styleWeights,
              styleAnalysisCache,
            });

            if (promptMode === 'simple' && simpleLinkMode) {
              setGenerationPromptPreview(basePrompt);
            }

            if (jsonContext) {
              console.log('[Generation] Appended JSON context to prompt');
            }
            if (promptMode === 'advanced') {
              console.log('[Interpretive Mode] Applied variant:', advancedVariant);
            } else if (faceIdentityMode) {
              console.log('[Face Identity Mode] Applied identity preservation with variation requirement');
            }

            // #2: Aspect ratio normalizace pro provider
            const providerTypeKey = selectedProvider as unknown as ProviderType;
            const mappedRatio = mapAspectRatio(state.aspectRatio, providerTypeKey);
            if (mappedRatio.warning) {
              console.log(`[Aspect Ratio] ${mappedRatio.warning}`);
              setToast({ message: mappedRatio.warning, type: 'info' });
            }

            // #13 + #14: Lineage tracking + kompletní recipe
            const lineage = buildGenerationLineage({
              sourceImages: state.sourceImages,
              styleImages: state.styleImages,
              assetImages: state.assetImages,
            });

            const recipe = buildGenerateRecipe({
              provider: selectedProvider,
              prompt: basePrompt,
              effectivePrompt: enhancedPrompt,
              useGrounding,
              promptMode,
              advancedVariant,
              faceIdentityMode,
              jsonContextFileName: jsonContext?.fileName,
              resolution: state.resolution,
              aspectRatio: state.aspectRatio,
              sourceImageCount: state.sourceImages.length,
              styleImageCount: state.styleImages.length,
              assetImageCount: state.assetImages.length,
              createdAt: Date.now(),
              styleStrength: state.styleImages.length > 0 ? styleStrength : undefined,
              styleAnalysis: styleAnalysisCache ? {
                recommendedStrength: styleAnalysisCache.strength,
                styleDescription: styleAnalysisCache.description,
                negativePrompt: '',
              } : undefined,
              lineage,
              styleWeights: Object.keys(styleWeights).length > 0 ? styleWeights : undefined,
            });

            // Get selected AI provider
            const provider = ProviderFactory.getProvider(selectedProvider, providerSettings);

            // #2: Použít mapovaný aspect ratio pro provider
            const effectiveAspectRatio = mappedRatio.value;

            // Image generation
            let providerImages = allImages;
            let providerPrompt = enhancedPrompt;

            if (
              selectedProvider === AIProviderType.CHATGPT &&
              sourceImagesData.length > 0 &&
              styleImagesData.length > 0
            ) {
              const composite = await createReferenceStyleComposite({
                referenceImages: sourceImagesData,
                styleImages: styleImagesData,
              });
              providerImages = [composite, ...assetImagesData];
              providerPrompt += `\n\n[POZN.: Vstupní obrázek je KOMPOZIT: levá polovina = reference (osoby/identita), pravá polovina = styl (kompozice, světlo, barevnost). Použij pravou polovinu jako stylovou/kompoziční šablonu pro výsledek.]`;
            }

            const result = await provider.generateImage(
              providerImages,
              providerPrompt,
              state.resolution,
              effectiveAspectRatio,
              useGrounding
            );
            const recipeWithModel = result.modelId ? { ...recipe, modelId: result.modelId } : recipe;


            const imgRunId = state.generatedImages.find(img => img.id === imageData.id)?.runId;
            setState(prev => ({
              ...prev,
              generatedImages: prev.generatedImages.map(img =>
                img.id === imageData.id
                  ? { ...img, status: 'success', url: result.imageBase64, groundingMetadata: result.groundingMetadata, prompt: basePrompt, recipe: recipeWithModel, lineage }
                  : img
              ),
            }));

            // Automaticky uložit do galerie
            try {
              const thumbnail = await createThumbnail(result.imageBase64);
              await saveToGallery({
                id: imageData.id,
                url: result.imageBase64,
                prompt: basePrompt,
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                thumbnail,
                params: { ...recipeWithModel, runId: imgRunId },
              });
              console.log('[Gallery] Image saved successfully');
              // Refresh gallery to show new image
              galleryPanelRef.current?.refresh();
            } catch (err) {
              console.error('Failed to save to gallery:', err);
              setToast({ message: `⚠️ Obrázek se nepodařilo uložit do galerie: ${err instanceof Error ? err.message : 'Neznámá chyba'}`, type: 'warning' });
            }

            // Trackovat API usage
            ApiUsageTracker.trackImageGeneration(state.resolution, 1);

            // Aktualizovat progress
            setGenerationProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);

            success = true; // Úspěch, pokračuj na další obrázek
            return { success: true as const };
            }
            catch (err: any) {
              const isRetriable = isRetriableProviderError(err);
              if (isRetriable && retryCount < maxRetries) {
                retryCount++;
                const waitTime = getRetryBackoffMs(selectedProvider, retryCount);
                console.log(`Provider overload hit for image ${i + 1}, waiting ${waitTime / 1000}s before retry ${retryCount}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
              } else {
                // Finální chyba - buď příliš mnoho pokusů nebo jiný typ chyby
                setState(prev => ({
                  ...prev,
                  generatedImages: prev.generatedImages.map(img =>
                    img.id === imageData.id ? { ...img, status: 'error', error: err instanceof Error ? err.message : 'Generation failed' } : img
                  ),
                }));
                return { success: false as const, error: err };
              }
            }
          }

          return { success: false as const, error: new Error('Generování skončilo bez výsledku.') };
        })
      );

      const successfulGenerations = generationResults.filter((result) => result.success).length;
      const failedGenerations = generationResults.length - successfulGenerations;

      const summaryToast = getGenerationResultSummary({
        totalCount: generationResults.length,
        successfulCount: successfulGenerations,
        failedCount: failedGenerations,
        firstError: generationResults.find((result) => !result.success)?.error,
      });
      if (summaryToast) {
        setToast(summaryToast);
      }

      activeGenerationsRef.current = Math.max(0, activeGenerationsRef.current - 1);
      if (activeGenerationsRef.current === 0) setIsGenerating(false);
      setGenerationProgress(null);
    };

    await generateInParallel();
    } finally {
      const nextItem = dequeueGenerationSnapshot();
      if (nextItem) {
        void runQueuedGenerationItem(nextItem);
      }
    }
  };

  async function runQueuedGenerationItem(item: GenerationQueueItem) {
    if (item.action === 'variants') {
      await processGenerate3VariantsSnapshot(item.snapshot);
      return;
    }
    if (item.action === '3ai') {
      await processGenerate3AISnapshot(item.snapshot);
      return;
    }
    await processGenerationSnapshot(item.snapshot);
  }

  const handleGenerate = async () => {
    const snapshot = createQueuedGenerationSnapshot();

    if (generationLockRef.current) {
      // Complex operation (3variants/3AI) is holding the lock - queue behind it.
      if (snapshot.state.sourceImages.length > 1 && snapshot.state.multiRefMode === 'batch') {
        setToast({
          message: 'Batch multi-ref zatím nejde řadit do fronty. Počkejte na dokončení aktuálního běhu.',
          type: 'info',
        });
        return;
      }
      enqueueGenerationSnapshot({ action: 'generate', snapshot });
      return;
    }

    // Fire immediately in parallel with any other running generations.
    void processGenerationSnapshot(snapshot);
  };

  const handleEditImage = async (imageId: string) => {
    const editPrompt = editPrompts[imageId];
    if (!editPrompt || !editPrompt.trim()) return;

    const image = state.generatedImages.find(img => img.id === imageId);
    if (!image || !image.url) {
      setToast({ message: 'Chyba: Obrázek nebyl nalezen', type: 'error' });
      return;
    }

    // Nastavit loading stav
    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.map(img =>
        img.id === imageId ? { ...img, isEditing: true } : img
      ),
    }));

    // Zavřít reference upload po zahájení editace
    setShowReferenceUpload(prev => ({ ...prev, [imageId]: false }));

    // User feedback
    setToast({ message: 'Zahajuji úpravu obrázku...', type: 'info' });

    try {
      // DŮLEŽITÉ: První obrázek = obrázek k editaci, další obrázky = reference pro inspiraci
      const editState = inlineEditStates[imageId];

      // Konvertovat všechny URL na base64 data URL pro Gemini API
      console.log('[Edit] Converting images to base64...');
      let baseImageData: string;
      try {
        baseImageData = await urlToDataUrl(image.url);
      } catch (err) {
        console.error('[Edit] Failed to convert base image:', err);
        throw new Error('Nepodařilo se načíst původní obrázek. Zkuste to prosím znovu.');
      }

      const referenceImagesData = await Promise.all(
        (editState?.referenceImages || []).map(async i => {
          try {
            return {
              data: await urlToDataUrl(i.url),
              mimeType: i.file.type
            };
          } catch (e) {
            console.warn('[Edit] Failed to load reference image, skipping:', i.url);
            return null;
          }
        })
      );

      // Filter out failed reference images
      const validReferenceImages = referenceImagesData.filter(img => img !== null) as { data: string; mimeType: string }[];

      const sourceImages = [
        // Původní vygenerovaný obrázek - VŽDY první (je to obrázek, který má být editován)
        { data: baseImageData, mimeType: 'image/jpeg' },
        // Referenční obrázky - jako kontext/inspirace pro úpravu
        ...validReferenceImages
      ];

      console.log('[Edit] Sending request to Gemini...', { promptLength: editPrompt.length, imageCount: sourceImages.length });

      const provider = ProviderFactory.getProvider(AIProviderType.GEMINI, providerSettings);
      const recipe = buildEditRecipe({
        prompt: editPrompt,
        useGrounding,
        promptMode,
        advancedVariant,
        faceIdentityMode,
        resolution: image.resolution,
        aspectRatio: image.aspectRatio,
        sourceImageCount: sourceImages.length,
        styleImageCount: 0,
        createdAt: Date.now(),
      });
      const result = await provider.generateImage(sourceImages, editPrompt, image.resolution, image.aspectRatio, useGrounding);

      console.log('[Edit] Success! updating gallery...');

      // Uložit starou verzi a aktualizovat obrázek
      setState(prev => ({
        ...prev,
        generatedImages: prev.generatedImages.map(img => {
          if (img.id === imageId) {
            // #11: Save current version to history with full recipe
            const newVersions = [
              ...(img.versions || []),
              { url: img.url!, prompt: img.prompt, timestamp: img.timestamp, recipe: img.recipe }
            ];

            return {
              ...img,
              url: result.imageBase64,
              prompt: editPrompt,
              timestamp: Date.now(),
              versions: newVersions,
              currentVersionIndex: newVersions.length,
              isEditing: false,
              recipe,
            };
          }
          return img;
        }),
      }));

      // Vymazat edit prompt
      setEditPrompts(prev => {
        const newPrompts = { ...prev };
        delete newPrompts[imageId];
        return newPrompts;
      });

      setToast({ message: 'Obrázek byl úspěšně upraven!', type: 'success' });

      // Uložit upravenou verzi do galerie
      try {
        const thumbnail = await createThumbnail(result.imageBase64);
        await saveToGallery({
          url: result.imageBase64,
          prompt: editPrompt,
          resolution: image.resolution,
          aspectRatio: image.aspectRatio,
          thumbnail,
          params: recipe,
        });
      } catch (err) {
        console.error('Failed to save edited image to gallery:', err);
      }
    } catch (err: any) {
      console.error('Edit error:', err);
      setToast({ message: toUserFacingAiError(err, 'Úprava obrázku selhala.'), type: 'error' });

      setState(prev => ({
        ...prev,
        generatedImages: prev.generatedImages.map(img =>
          img.id === imageId ? { ...img, isEditing: false, error: err instanceof Error ? err.message : 'Edit failed' } : img
        ),
      }));
    }
  };
  // Batch processing handler
  const handleBatchProcess = async (images: BatchProcessImage[]) => {
    console.log('[Batch] Starting batch process with', images.length, 'images');
    console.log('[Batch] Prompt metadata', { promptLength: state.prompt.length });

    const canRunFixedSimpleBatch =
      promptMode === 'simple' &&
      !!simpleLinkMode &&
      state.styleImages.length > 0;

    if (!state.prompt.trim() && !canRunFixedSimpleBatch) {
      console.error('[Batch] No prompt provided');
      setToast({ message: 'Vyplňte prompt pro batch zpracování, nebo vyberte Styl/Merge/Object + stylový obrázek', type: 'error' });
      return;
    }

    const chunks = chunkBatchImages(images);
    const batchRunId = `batch-run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const loadingImages = createBatchLoadingImages({
      images,
      prompt: state.prompt,
      resolution: state.resolution,
      aspectRatio: state.aspectRatio,
      runId: batchRunId,
    });

    // Add all loading images to state
    setState(prev => ({
      ...prev,
      generatedImages: [...loadingImages, ...prev.generatedImages],
    }));

    setBatchProgress({
      current: 0,
      total: images.length,
      currentChunk: 0,
      totalChunks: chunks.length
    });

    let processedCount = 0;
    const provider = ProviderFactory.getProvider(selectedProvider, providerSettings);

    try {
      const styleImagesData = canRunFixedSimpleBatch
        ? await Promise.all(
          state.styleImages.map(async (img) => ({
            data: await urlToDataUrl(img.url),
            mimeType: img.file.type,
          }))
        )
        : [];
      const assetImagesData = await Promise.all(
        state.assetImages.map(async (img) => ({
          data: await urlToDataUrl(img.url),
          mimeType: img.file.type,
        }))
      );

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];

        setBatchProgress(prev => prev ? {
          ...prev,
          currentChunk: chunkIndex + 1
        } : null);

        // Generate chunk in parallel
        const results = await Promise.all(
          chunk.map(async (image, indexInChunk) => {
            const globalIndex = chunkIndex * BATCH_PARALLEL_SIZE + indexInChunk;
            const loadingId = loadingImages[globalIndex].id;

            try {
              const effectivePrompt = getBatchEffectivePrompt({
                prompt: state.prompt,
                promptMode,
                simpleLinkMode,
                styleImageCount: styleImagesData.length,
                assetImageCount: assetImagesData.length,
              });

              const recipe = buildBatchRecipe({
                provider: selectedProvider,
                prompt: state.prompt,
                effectivePrompt,
                useGrounding,
                promptMode,
                advancedVariant,
                faceIdentityMode,
                jsonContextFileName: jsonContext?.fileName,
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                sourceImageCount: 1,
                styleImageCount: styleImagesData.length,
                assetImageCount: assetImagesData.length,
                createdAt: Date.now(),
              });

              // Prepare image data
              const sourceImagesData = [{
                data: await urlToDataUrl(image.url),
                mimeType: image.file?.type || image.fileType || 'image/jpeg'
              }];

              const allImages = combineBatchInputImages({
                sourceImagesData,
                styleImagesData,
                assetImagesData,
              });

              // Generate image
              const result = await provider.generateImage(
                allImages,
                effectivePrompt,
                state.resolution,
                state.aspectRatio,
                useGrounding
              );
              const recipeWithModel = result.modelId ? { ...recipe, modelId: result.modelId } : recipe;

              // Update state with generated image
              setState(prev => ({
                ...prev,
                generatedImages: prev.generatedImages.map(img =>
                  img.id === loadingId
                    ? {
                      ...img,
                      status: 'success' as const,
                      url: result.imageBase64,
                      timestamp: Date.now(),
                      recipe: recipeWithModel,
                    }
                    : img
                ),
              }));

              // Save to gallery
              const thumbnail = await createThumbnail(result.imageBase64);
              await saveToGallery({
                id: loadingId,
                url: result.imageBase64,
                prompt: effectivePrompt,
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                thumbnail,
                params: { ...recipeWithModel, runId: batchRunId }
              });

              processedCount++;
              setBatchProgress(prev => prev ? {
                ...prev,
                current: processedCount
              } : null);

              return { success: true, loadingId };
            } catch (error) {
              console.error(`Failed to process image ${image.id}:`, error);

              // Update state with error
              setState(prev => ({
                ...prev,
                generatedImages: prev.generatedImages.map(img =>
                  img.id === loadingId
                    ? {
                      ...img,
                      status: 'error' as const,
                      error: error instanceof Error ? error.message : 'Generation failed',
                    }
                    : img
                ),
              }));

              return { success: false, loadingId, error };
            }
          })
        );

        // Pause between chunks (except last)
        if (chunkIndex < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setBatchProgress(null);
      galleryPanelRef.current?.refresh();
      setToast({
        message: `✅ Zpracováno ${processedCount}/${images.length} obrázků`,
        type: 'success'
      });
    } catch (error) {
      setBatchProgress(null);
      setToast({ message: toUserFacingAiError(error, 'Batch zpracování selhalo.'), type: 'error' });
    }
  };

  const handleUndoImageEdit = (imageId: string) => {
    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.map(img => {
        if (img.id === imageId && img.versions && img.versions.length > 0) {
          const currentIndex = img.currentVersionIndex ?? img.versions.length;

          // Can only undo if we're not at the beginning
          if (currentIndex > 0) {
            const previousVersion = img.versions[currentIndex - 1];
            return {
              ...img,
              url: previousVersion.url,
              prompt: previousVersion.prompt,
              timestamp: previousVersion.timestamp,
              currentVersionIndex: currentIndex - 1,
            };
          }
        }
        return img;
      }),
    }));
  };

  // Redo to next version (step forward in history)
  const handleRedoImageEdit = (imageId: string) => {
    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.map(img => {
        if (img.id === imageId && img.versions && img.versions.length > 0) {
          const currentIndex = img.currentVersionIndex ?? img.versions.length;

          // Can only redo if we're not at the end
          if (currentIndex < img.versions.length) {
            const nextVersion = img.versions[currentIndex];
            return {
              ...img,
              url: nextVersion.url,
              prompt: nextVersion.prompt,
              timestamp: nextVersion.timestamp,
              currentVersionIndex: currentIndex + 1,
            };
          }
        }
        return img;
      }),
    }));
  };

  // OLD handleUndoEdit - keeping for backward compatibility with existing UI
  const handleUndoEdit = (imageId: string) => {
    handleUndoImageEdit(imageId);
  };

  const handleDeleteImage = (imageId: string) => {
    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.filter(img => img.id !== imageId),
    }));
    // Clean up edit states
    setInlineEditStates(prev => {
      const newState = { ...prev };
      delete newState[imageId];
      return newState;
    });
    setShowReferenceUpload(prev => {
      const newState = { ...prev };
      delete newState[imageId];
      return newState;
    });
  };

  // #5: Upscaling
  const handleUpscaleImage = async (imageId: string, factor: 2 | 4 = 2) => {
    const image = state.generatedImages.find(img => img.id === imageId);
    if (!image?.url) return;

    const replicateKey = providerSettings[AIProviderType.REPLICATE]?.apiKey;
    if (!replicateKey) {
      setToast({ message: 'Pro upscaling je potřeba Replicate API klíč (nastavení)', type: 'error' });
      return;
    }

    setUpscalingImageId(imageId);
    setToast({ message: `Zvětšuji obrázek ${factor}×…`, type: 'info' });

    try {
      const result = await upscaleImage({
        token: replicateKey,
        imageDataUrl: image.url,
        factor,
      });

      // Uložit starou verzi a nahradit zvětšeným
      setState(prev => ({
        ...prev,
        generatedImages: prev.generatedImages.map(img => {
          if (img.id === imageId) {
            const newVersions = [
              ...(img.versions || []),
              { url: img.url!, prompt: img.prompt, timestamp: img.timestamp, recipe: img.recipe }
            ];
            return {
              ...img,
              url: result.imageDataUrl,
              timestamp: Date.now(),
              versions: newVersions,
              currentVersionIndex: newVersions.length,
              recipe: {
                ...img.recipe!,
                operation: 'upscale' as const,
                upscaleFactor: factor,
                createdAt: Date.now(),
              },
            };
          }
          return img;
        }),
      }));

      // Uložit do galerie
      try {
        const thumbnail = await createThumbnail(result.imageDataUrl);
        await saveToGallery({
          url: result.imageDataUrl,
          prompt: `[Upscaled ${factor}×] ${image.prompt}`,
          resolution: `${result.newWidth}×${result.newHeight}`,
          aspectRatio: image.aspectRatio,
          thumbnail,
          params: { ...image.recipe, operation: 'upscale', upscaleFactor: factor },
        });
      } catch (err) {
        console.error('Failed to save upscaled image to gallery:', err);
      }

      setToast({ message: `Obrázek zvětšen ${factor}× (${result.newWidth}×${result.newHeight}px)`, type: 'success' });
    } catch (err: any) {
      console.error('[Upscale] Error:', err);
      setToast({ message: toUserFacingAiError(err, 'Upscaling selhal.'), type: 'error' });
    } finally {
      setUpscalingImageId(null);
    }
  };

  // #3: Inpainting — otevřít mask canvas
  const handleOpenInpaint = async (imageId: string) => {
    const image = state.generatedImages.find(img => img.id === imageId);
    if (!image?.url) return;

    // Zjistit rozměry
    const img = new Image();
    img.src = image.url;
    await new Promise<void>(resolve => { img.onload = () => resolve(); });

    setMaskCanvasState({
      isOpen: true,
      mode: 'inpaint',
      imageId,
      imageUrl: image.url,
      width: img.width,
      height: img.height,
    });
  };

  // #4: Outpainting — otevřít canvas s rozšířením
  const handleOpenOutpaint = async (imageId: string, direction: 'all' | 'top' | 'bottom' | 'left' | 'right' = 'all', pixels = 256) => {
    const image = state.generatedImages.find(img => img.id === imageId);
    if (!image?.url) return;

    const img = new Image();
    img.src = image.url;
    await new Promise<void>(resolve => { img.onload = () => resolve(); });

    setMaskCanvasState({
      isOpen: true,
      mode: 'outpaint',
      imageId,
      imageUrl: image.url,
      width: img.width,
      height: img.height,
      outpaintDirection: direction,
      outpaintPixels: pixels,
    });
  };

  // #3+4: Zpracovat masku a spustit generování
  const handleMaskComplete = async (maskDataUrl: string) => {
    if (!maskCanvasState) return;
    const { imageId, mode, outpaintDirection, outpaintPixels } = maskCanvasState;
    setMaskCanvasState(null);

    const image = state.generatedImages.find(img => img.id === imageId);
    if (!image?.url) return;

    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.map(img =>
        img.id === imageId ? { ...img, isEditing: true } : img
      ),
    }));

    setToast({ message: mode === 'inpaint' ? 'Zahajuji inpainting…' : 'Zahajuji outpainting…', type: 'info' });

    try {
      const provider = ProviderFactory.getProvider(AIProviderType.GEMINI, providerSettings);
      const editPrompt = state.prompt.trim() || (mode === 'inpaint'
        ? 'Domaluj zamaskované oblasti tak, aby přirozeně navazovaly na okolní kontext.'
        : 'Rozšiř obrázek za jeho okraje. Domaluj chybějící oblasti tak, aby přirozeně navazovaly na existující scénu.');

      const sourceImages = [
        { data: image.url, mimeType: 'image/jpeg' },
        { data: maskDataUrl, mimeType: 'image/png' },
      ];

      const maskPrompt = `${editPrompt}\n\n[MASKA: Druhý obrázek je maska. Bílé oblasti = regiony k ${mode === 'inpaint' ? 'přegenerování' : 'dogenerování'}. Černé oblasti = zachovat beze změn.]`;

      const recipe: GenerationRecipe = {
        provider: AIProviderType.GEMINI,
        operation: mode,
        prompt: editPrompt,
        effectivePrompt: maskPrompt,
        useGrounding: false,
        promptMode,
        resolution: image.resolution,
        aspectRatio: image.aspectRatio,
        sourceImageCount: 1,
        styleImageCount: 0,
        createdAt: Date.now(),
        maskData: maskDataUrl,
        outpaintDirection: mode === 'outpaint' ? outpaintDirection : undefined,
        outpaintPixels: mode === 'outpaint' ? outpaintPixels : undefined,
      };

      const result = await provider.generateImage(
        sourceImages,
        maskPrompt,
        image.resolution,
        image.aspectRatio,
        false
      );

      setState(prev => ({
        ...prev,
        generatedImages: prev.generatedImages.map(img => {
          if (img.id === imageId) {
            const newVersions = [
              ...(img.versions || []),
              { url: img.url!, prompt: img.prompt, timestamp: img.timestamp, recipe: img.recipe }
            ];
            return {
              ...img,
              url: result.imageBase64,
              prompt: editPrompt,
              timestamp: Date.now(),
              versions: newVersions,
              currentVersionIndex: newVersions.length,
              isEditing: false,
              recipe,
            };
          }
          return img;
        }),
      }));

      try {
        const thumbnail = await createThumbnail(result.imageBase64);
        await saveToGallery({
          url: result.imageBase64,
          prompt: editPrompt,
          resolution: image.resolution,
          aspectRatio: image.aspectRatio,
          thumbnail,
          params: recipe,
        });
      } catch (err) {
        console.error(`Failed to save ${mode} result to gallery:`, err);
      }

      setToast({ message: mode === 'inpaint' ? 'Inpainting dokončen!' : 'Outpainting dokončen!', type: 'success' });
    } catch (err: any) {
      console.error(`[${mode}] Error:`, err);
      setToast({ message: toUserFacingAiError(err, `${mode === 'inpaint' ? 'Inpainting' : 'Outpainting'} selhal.`), type: 'error' });
      setState(prev => ({
        ...prev,
        generatedImages: prev.generatedImages.map(img =>
          img.id === imageId ? { ...img, isEditing: false } : img
        ),
      }));
    }
  };

  const handleImageContextMenu = (e: React.MouseEvent, imageId: string) => {
    e.preventDefault();
    setQuickActionsMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      imageId,
    });
  };

  const getQuickActionsForImage = (imageId: string): QuickAction[] => {
    const image = state.generatedImages.find(img => img.id === imageId);
    if (!image || !image.url) return [];

    return [
      {
        label: 'Stáhnout',
        icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
        onClick: () => {
          const link = document.createElement('a');
          link.href = image.url!;
          link.download = `${image.id}-${slugify(image.prompt)}.jpg`;
          link.click();
        },
      },
      {
        label: 'Kopírovat do schránky',
        icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>,
        onClick: async () => {
          try {
            const response = await fetch(image.url!);
            const blob = await response.blob();
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
          } catch (error) {
            console.error('Failed to copy image:', error);
          }
        },
      },
      {
        label: 'Regenerovat',
        icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
        onClick: () => handleRepopulate(image),
      },
      {
        label: 'Generovat variace',
        icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
        onClick: () => handleGenerateVariations(image),
      },
      {
        label: 'Inpainting (maska)',
        icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
        onClick: () => handleOpenInpaint(imageId),
      },
      {
        label: 'Outpainting (rozšířit)',
        icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>,
        onClick: () => handleOpenOutpaint(imageId),
      },
      {
        label: upscalingImageId === imageId ? 'Zvětšuji…' : 'Upscale 2×',
        icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>,
        onClick: () => handleUpscaleImage(imageId, 2),
      },
      {
        label: 'Smazat',
        icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
        onClick: () => handleDeleteImage(imageId),
        dangerous: true,
      },
    ];
  };

  const addInlineReferenceImages = (imageId: string, files: File[]) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          const newImage: SourceImage = {
            id: Math.random().toString(36).substr(2, 9),
            url: e.target.result,
            file: file
          };
          setInlineEditStates(prev => ({
            ...prev,
            [imageId]: {
              ...prev[imageId],
              referenceImages: [...(prev[imageId]?.referenceImages || []), newImage]
            }
          }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeInlineReferenceImage = (imageId: string, refImageId: string) => {
    setInlineEditStates(prev => ({
      ...prev,
      [imageId]: {
        ...prev[imageId],
        referenceImages: prev[imageId].referenceImages.filter(img => img.id !== refImageId)
      }
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleNextImage = () => {
    if (!selectedImage) return;
    const idx = state.generatedImages.findIndex(img => img.id === selectedImage.id);
    if (idx < state.generatedImages.length - 1) {
      setSelectedImage(state.generatedImages[idx + 1]);
    }
  };

  const handlePrevImage = () => {
    if (!selectedImage) return;
    const idx = state.generatedImages.findIndex(img => img.id === selectedImage.id);
    if (idx > 0) {
      setSelectedImage(state.generatedImages[idx - 1]);
    }
  };

  const getDomainFromUrl = (url: string, title?: string) => {
    try {
      const parsedUrl = new URL(url);

      // Attempt to extract from Vertex AI Search proxy if it's there
      if (parsedUrl.hostname.includes('vertexaisearch.cloud.google.com')) {
        const urlParam = parsedUrl.searchParams.get('url');
        if (urlParam) {
          return new URL(urlParam).hostname.replace(/^www\./, '');
        }
      }

      // If title looks like a domain or is a short brand name, use it
      if (title && title.length > 0 && title.length < 25) {
        if (title.includes('.')) return title.toLowerCase();
        // If it's a short title without spaces, it's often the site name
        if (!title.includes(' ')) return title;
      }

      return parsedUrl.hostname.replace(/^www\./, '');
    } catch {
      return title || 'Link';
    }
  };

  const imageModelPresets: Array<{
    id: string;
    provider: AIProviderType;
    model?: NanoBananaImageModel;
    title: string;
    subtitle: string;
  }> = [
    {
      id: 'gemini-flash',
      provider: AIProviderType.GEMINI,
      model: 'gemini-3.1-flash-image-preview',
      title: 'Nano 2',
      subtitle: 'Gemini 3.1 Flash',
    },
    {
      id: 'gemini-pro',
      provider: AIProviderType.GEMINI,
      model: 'gemini-3-pro-image-preview',
      title: 'Nano Pro',
      subtitle: 'Gemini 3 Pro',
    },
    {
      id: 'openai-image',
      provider: AIProviderType.CHATGPT,
      title: 'GPT Img 2',
      subtitle: 'OpenAI',
    },
    {
      id: 'flux-pro',
      provider: AIProviderType.FLUX_PRO,
      title: 'Flux Pro',
      subtitle: 'fal.ai',
    },
  ];

  const selectedImagePresetId =
    selectedProvider === AIProviderType.GEMINI
      ? nanoBananaImageModel === 'gemini-3-pro-image-preview'
        ? 'gemini-pro'
        : 'gemini-flash'
      : selectedProvider === AIProviderType.CHATGPT
        ? 'openai-image'
        : selectedProvider === AIProviderType.FLUX_PRO
          ? 'flux-pro'
          : null;

  const handleImageModelPresetSelect = useCallback((presetId: string) => {
    const preset = imageModelPresets.find((item) => item.id === presetId);
    if (!preset) return;

    const nextProvider = preset.provider;
    const nextGeminiModel = preset.model;
    const providerWillChange = nextProvider !== selectedProvider;
    const geminiModelWillChange =
      nextProvider === AIProviderType.GEMINI &&
      !!nextGeminiModel &&
      nextGeminiModel !== nanoBananaImageModel;

    if (!providerWillChange && !geminiModelWillChange) return;

    if (isGenerating || queuedGenerationCount > 0) {
      const confirmed = window.confirm(
        'Generování právě běží nebo čeká ve frontě. Opravdu chceš změnit provider nebo model? Nové nastavení se projeví až pro další běh.'
      );
      if (!confirmed) return;
    }

    setSelectedProvider(nextProvider);
    if (nextProvider === AIProviderType.GEMINI && nextGeminiModel) {
      setNanoBananaImageModel(nextGeminiModel);
    }
  }, [imageModelPresets, isGenerating, nanoBananaImageModel, queuedGenerationCount, selectedProvider, setNanoBananaImageModel, setSelectedProvider]);

  const simpleLinkModeOptions = [
    { id: 'style' as const, label: 'STYL', summary: 'kompozice', tooltip: 'Přenese kompozici, nasvícení a barvy ze stylu. Obsah/identita zůstává ze vstupního obrázku.' },
    { id: 'merge' as const, label: 'MERGE', summary: 'spojení', tooltip: 'Volně spojí oba obrázky (obsah i formu) do jednoho výsledku.' },
    { id: 'object' as const, label: 'OBJECT', summary: 'objekt', tooltip: 'Přenese dominantní objekt/prvek ze stylu do vstupního obrázku (např. dekorativní zeď).' },
  ];

  const renderSimpleModeTray = () => {
    if (promptMode !== 'simple') return null;

    return (
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {simpleLinkModeOptions.map((m) => (
            <button
              key={m.id}
              onClick={() => setSimpleLinkMode((prev) => (prev === m.id ? null : m.id))}
              className={`h-8 rounded-lg border px-2.5 text-left transition-all ${simpleLinkMode === m.id
                ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]'
                : 'bg-transparent border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-panel)]/50'
                }`}
              title={m.tooltip}
            >
              <span className="text-[8px] font-black uppercase tracking-[0.18em]">{m.label}</span>
              <span className="ml-1 text-[8px] font-medium lowercase tracking-normal opacity-75">{m.summary}</span>
            </button>
          ))}

          <button
            onClick={handleEnhancePrompt}
            disabled={!state.prompt.trim() || isEnhancingPrompt}
            className="h-8 rounded-lg border border-[rgba(168,191,143,0.16)] bg-[rgba(32,44,24,0.55)] px-2.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-all hover:border-[rgba(168,191,143,0.38)] hover:bg-[rgba(45,62,33,0.70)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEnhancingPrompt ? 'Vylepšuji…' : 'Vylepšit'}
          </button>

          <button
            onClick={() => setIsTemplatesModalOpen(true)}
            className="h-8 rounded-lg border border-[rgba(168,191,143,0.16)] bg-[rgba(32,44,24,0.55)] px-2.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-all hover:border-[rgba(168,191,143,0.38)] hover:bg-[rgba(45,62,33,0.70)] hover:text-[var(--text-primary)]"
          >
            Šablony
          </button>

          <button
            onClick={() => setIsCollectionsModalOpen(true)}
            className="h-8 rounded-lg border border-[rgba(168,191,143,0.16)] bg-[rgba(32,44,24,0.55)] px-2.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-all hover:border-[rgba(168,191,143,0.38)] hover:bg-[rgba(45,62,33,0.70)] hover:text-[var(--text-primary)]"
            title="Kolekce"
          >
            Kolekce
          </button>

          <button
            onClick={handleUndoPrompt}
            disabled={!promptHistory.canUndo()}
            className="h-8 w-8 rounded-lg border border-[rgba(168,191,143,0.14)] bg-[rgba(28,38,22,0.50)] text-[10px] font-bold text-[var(--text-secondary)] transition-all hover:border-[rgba(168,191,143,0.36)] hover:bg-[rgba(40,55,30,0.65)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-20"
            title="Vrátit zpět"
          >
            ↶
          </button>

          <button
            onClick={handleRedoPrompt}
            disabled={!promptHistory.canRedo()}
            className="h-8 w-8 rounded-lg border border-[rgba(168,191,143,0.14)] bg-[rgba(28,38,22,0.50)] text-[10px] font-bold text-[var(--text-secondary)] transition-all hover:border-[rgba(168,191,143,0.36)] hover:bg-[rgba(40,55,30,0.65)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-20"
            title="Znovu"
          >
            ↷
          </button>
        </div>

        {simpleLinkMode && isGenerating && generationPromptPreview && (
          <div className="rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)]/50 p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Použitý prompt
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generationPromptPreview);
                  setToast({ message: 'Prompt zkopírován', type: 'success' });
                }}
                className="rounded-md border border-[rgba(168,191,143,0.14)] bg-[rgba(32,44,24,0.50)] px-2 py-1 text-[9px] font-bold text-[var(--text-secondary)] transition-all hover:border-[rgba(168,191,143,0.35)] hover:bg-[rgba(45,62,33,0.65)] hover:text-[var(--accent)]"
              >
                Kopírovat
              </button>
            </div>
            <pre className="max-h-[120px] overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-[var(--text-2)] custom-scrollbar">
              {generationPromptPreview}
            </pre>
          </div>
        )}
      </div>
    );
  };

  const renderSidebarControls = (isMobileView: boolean = false) => (
    <div className="space-y-3">
      {/* 1. Generate Button Section */}
      <div className="space-y-2">
        <div className="space-y-1.5">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`mn-action-primary w-full ${isGenerateClicked ? 'bg-blue-600 text-white border-blue-600' : ''}`}
            style={{ borderRadius: '100px' }}
          >
            <div className="text-[10px] font-black uppercase tracking-[0.18em]">
              {isGenerating ? 'Běží…' : 'Generovat'}
            </div>
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={handleGenerate3Variants}
              disabled={!canGenerate}
              className="mn-subaction mn-subaction-variants"
            >
              <div className="text-[9px] font-black uppercase tracking-[0.18em]">
                {isGenerating ? 'Varianty…' : '3 varianty'}
              </div>
              <div className="mt-1 text-[8px] font-semibold opacity-75">
                promptu
              </div>
            </button>

            <button
              onClick={handleGenerate3AI}
              disabled={!canGenerate}
              className="mn-subaction mn-subaction-models"
            >
              <div className="text-[9px] font-black uppercase tracking-[0.18em]">
                {isGenerating ? 'Všechny…' : 'Všechny'}
              </div>
              <div className="mt-1 text-[8px] font-semibold opacity-75">
                modely
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Image Count (Minimal 1-5) */}
      <div className="space-y-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Počet obrázků
        </h3>
        <div className="mn-count-selector">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setState(p => ({ ...p, numberOfImages: n }))}
              className={`mn-count-option ${state.numberOfImages === n ? 'mn-count-option-active' : ''}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Prompt Section (Redesigned Header & Compact) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between rounded-lg border border-[rgba(168,191,143,0.18)] bg-[linear-gradient(135deg,rgba(35,48,26,0.70)_0%,rgba(20,28,15,0.80)_100%)] px-2 py-1">
          <span className="pl-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Zadání (Prompt)
          </span>
          <div className="flex items-center gap-1">
            {/* JSON Context */}
            <label
              htmlFor="json-context-upload"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-[var(--bg-input)] text-[var(--accent)] transition-all hover:border-[var(--accent)] border border-[var(--accent)]/30"
              title={jsonContext ? "Změnit JSON kontext" : "Připojit JSON kontext"}
            >
              <FileJson className="w-3 h-3" />
              <input
                id="json-context-upload"
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleJsonUpload}
              />
            </label>

            {/* JSON Context Badge */}
            {jsonContext && (
              <div className="flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5">
                <span className="max-w-[66px] truncate text-[8px] font-medium text-blue-400">{jsonContext.fileName}</span>
                <button
                  onClick={() => setJsonContext(null)}
                  className="text-blue-400 hover:text-blue-300"
                  title="Odebrat JSON kontext"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}

            {/* Mode Switch (Compact) */}
            <button
              onClick={() => setPromptMode(promptMode === 'simple' ? 'advanced' : 'simple')}
              className={`flex h-6 w-6 items-center justify-center rounded border transition-all ${promptMode === 'advanced' ? 'bg-[var(--bg-input)] text-[var(--accent)] border-[var(--accent)]/30' : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-color)]'}`}
              title={`Režim: ${promptMode === 'simple' ? 'Jednoduchý' : 'Interpretační'}`}
            >
              <ArrowLeftRight className="w-3 h-3" />
            </button>

            <SavedPromptsDropdown
              currentPrompt={state.prompt}
              onSelectPrompt={(prompt) => {
                setState(prev => ({ ...prev, prompt }));
                promptHistory.add(prompt);
              }}
            />

          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="mb-1.5 flex gap-1">
          <button
            onClick={() => setPromptMode('simple')}
            className={`flex-1 rounded px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em] transition-all ${promptMode === 'simple'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
              : 'bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              }`}
          >
            Simple
          </button>
          <button
            onClick={() => setPromptMode('advanced')}
            className={`flex-1 rounded px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em] transition-all ${promptMode === 'advanced'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
              : 'bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              }`}
          >
            Interpretace
          </button>
        </div>

        <div className="relative">
          <textarea
            ref={isMobileView ? mobilePromptRef : promptRef}
            value={state.prompt}
            onChange={(e) => { setState(p => ({ ...p, prompt: e.target.value })); promptHistory.add(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder={promptMode === 'advanced' ? "Popište obrázek přirozeně. Vyberte variantu níže pro určení stylu interpretace..." : "Volitelné: doplňující prompt (Styl/Merge/Object funguje i bez textu)…"}
            className="w-full min-h-[110px] max-h-[220px] resize-none rounded-none border-0 border-b border-[var(--border-color)] bg-transparent p-1.5 text-[11px] font-medium text-[var(--text-primary)] placeholder-gray-500 outline-none transition-all focus:border-[var(--accent)] focus:ring-0 custom-scrollbar"
          />
        </div>

        {/* Advanced Mode Controls (Conditional) */}
        {promptMode === 'advanced' && (
          <div className="mt-2 space-y-2 animate-fadeIn">
            {/* Variant Selector A/B/C */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'A', label: 'VARIANTA A', subtitle: 'Autenticita', tooltip: 'Maximální autenticita (Priorita reality). Přirozené, nedokonalé, věrohodné.' },
                { id: 'B', label: 'VARIANTA B', subtitle: 'Vylepšení', tooltip: 'Maximální vylepšení (Idealizované). Vybroušené, filmové, prémiové.' },
                { id: 'C', label: 'VARIANTA C', subtitle: 'Vyvážené', tooltip: 'Vyvážený realismus (Přirozené + Estetické). Neutrální výchozí.' }
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setAdvancedVariant(v.id as 'A' | 'B' | 'C')}
                  className={`group relative flex flex-col items-center p-2 rounded-md border transition-all text-center ${advancedVariant === v.id
                    ? 'bg-[var(--accent)]/10 border-[var(--accent)] ring-1 ring-[var(--accent)]/50'
                    : 'bg-transparent border-[var(--border-color)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-panel)]/50'
                    }`}
                >
                  <span className={`text-[9px] font-black uppercase tracking-wider mb-0.5 ${advancedVariant === v.id ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                    }`}>
                    {v.label}
                  </span>
                  <span className="text-[8px] text-[var(--text-secondary)] font-medium">
                    {v.subtitle}
                  </span>
                  {/* Tooltip */}
                  <div className="invisible group-hover:visible absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-[#0b0c0a]/90 backdrop-blur-sm text-white text-[9px] rounded-md shadow-xl z-50 pointer-events-none text-left leading-relaxed">
                    {v.tooltip}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-[#0b0c0a]/90"></div>
                  </div>
                </button>
              ))}
            </div>

            {/* Face Identity Toggle */}
            <label
              className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-all ${faceIdentityMode
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-transparent border-[var(--border-color)] hover:border-[var(--text-secondary)]'
                }`}
            >
              {/* Custom Toggle Switch */}
              <div className="relative">
                <input
                  type="checkbox"
                  checked={faceIdentityMode}
                  onChange={(e) => setFaceIdentityMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`w-8 h-4 rounded-full transition-all ${faceIdentityMode ? 'bg-amber-500' : 'bg-[var(--border-color)]'
                  }`}>
                  <div className={`absolute top-0.5 left-0.5 bg-white border border-gray-300 rounded-full h-3 w-3 transition-all ${faceIdentityMode ? 'translate-x-full' : 'translate-x-0'
                    }`}></div>
                </div>
              </div>

              {/* Label */}
              <div className="flex-1">
                <div className={`text-[9px] font-black uppercase tracking-wider ${faceIdentityMode ? 'text-amber-800' : 'text-[var(--text-secondary)]'
                  }`}>
                  Zachování Identity Tváře
                </div>
                <div className="text-[8px] text-[var(--text-secondary)]">
                  Upřednostnit věrnost tváře před estetikou
                </div>
              </div>
            </label>
          </div>
        )}

      </div>

      {/* 5. Input Images (Compacted) */}
      <div className="space-y-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between">
          <span>Vstupní Obrázky</span>
          <span className="text-[9px] text-[var(--text-secondary)]">{state.sourceImages.length}</span>
        </h3>

        {state.sourceImages.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'together', label: 'Sloučit' },
              { id: 'batch', label: 'Varianty' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setState((p) => ({ ...p, multiRefMode: opt.id }))}
                className={`mn-option-button ${state.multiRefMode === opt.id ? 'mn-option-button-active' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div
          className={`mn-upload-zone ${dragOverTarget === 'reference' ? 'border-[var(--accent)] bg-[var(--accent)]/5' : ''}`}
          onDragOver={handleDragOverReference}
          onDragLeave={handleDragLeave}
          onDrop={handleDropReference}
        >
          {state.sourceImages.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center cursor-pointer" onClick={() => document.getElementById('ref-upload-input')?.click()}>
              <span className="text-[var(--text-secondary)] text-lg group-hover:text-[var(--text-primary)] transition-colors">+</span>
              <input
                id="ref-upload-input"
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const inputEl = e.currentTarget;
                  if (e.target.files) handleImagesSelected(Array.from(e.target.files));
                  inputEl.value = '';
                }}
              />
            </div>
          ) : (
            <div className="p-1 grid grid-cols-4 gap-1">
              {state.sourceImages.map((img, idx) => (
                <div key={img.id} className="relative group aspect-square rounded overflow-hidden bg-[var(--bg-card)] border border-[var(--border-color)]">
                  <img src={img.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" alt={`Input ${idx}`} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setState(prev => ({ ...prev, sourceImages: prev.sourceImages.filter(i => i.id !== img.id) })); }}
                    className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleExtractPromptFromImage(img); }}
                    disabled={!!analyzingImageId}
                    className="absolute bottom-0 left-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100 disabled:opacity-60"
                    title="Extrahovat prompt z obrázku"
                  >
                    {analyzingImageId === img.id ? (
                      <span className="text-[10px] font-bold px-1">…</span>
                    ) : (
                      <Sparkles className="w-2.5 h-2.5" />
                    )}
                  </button>
                </div>
              ))}
              <label className="flex items-center justify-center aspect-square rounded border border-dashed border-[var(--border-color)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-panel)]/50 cursor-pointer">
                <span className="text-[var(--text-secondary)]">+</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const inputEl = e.currentTarget;
                    if (e.target.files) handleImagesSelected(Array.from(e.target.files));
                    inputEl.value = '';
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 6. Style Images (Compacted) */}
      <div className="space-y-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between">
          <span>Stylové Obrázky</span>
          <span className="text-[9px] text-[var(--text-secondary)]">{state.styleImages.length}</span>
        </h3>
        <div
          className={`mn-upload-zone mn-upload-zone-compact ${dragOverTarget === 'style' ? 'border-[var(--accent)] bg-[var(--accent)]/5' : ''}`}
          onDragOver={handleDragOverStyle}
          onDragLeave={handleDragLeave}
          onDrop={handleDropStyle}
        >
          {state.styleImages.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center cursor-pointer" onClick={() => document.getElementById('style-upload-input')?.click()}>
              <span className="text-[var(--text-secondary)] text-lg group-hover:text-[var(--text-primary)] transition-colors">+</span>
              <input
                id="style-upload-input"
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const inputEl = e.currentTarget;
                  if (e.target.files) handleStyleImagesSelected(Array.from(e.target.files));
                  inputEl.value = '';
                }}
              />
            </div>
          ) : (
            <div className="p-1 grid grid-cols-4 gap-1">
              {state.styleImages.map((img, idx) => (
                <div key={img.id} className="mn-upload-thumb group">
                  <img src={img.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" alt={`Style ${idx}`} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setState(prev => ({ ...prev, styleImages: prev.styleImages.filter(i => i.id !== img.id) })); }}
                    className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <label className="mn-upload-tile">
                <span className="text-[var(--text-secondary)]">+</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const inputEl = e.currentTarget;
                    if (e.target.files) handleStyleImagesSelected(Array.from(e.target.files));
                    inputEl.value = '';
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* #6: Slider síly stylu */}
        {state.styleImages.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Síla stylu
              </label>
              <span className="text-[10px] font-mono text-[var(--accent)]">{styleStrength}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={styleStrength}
              onChange={(e) => setStyleStrength(Number(e.target.value))}
              className="range-green w-full"
            />
            <div className="flex justify-between text-[8px] text-[var(--text-secondary)]">
              <span>Jemný náznak</span>
              <span>Kopírovat přesně</span>
            </div>
          </div>
        )}

        {/* #7: Váhy stylových obrázků */}
        {state.styleImages.length > 1 && (
          <div className="mt-2 space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Mix stylů
            </label>
            {state.styleImages.map((img, idx) => (
              <div key={img.id} className="flex items-center gap-2">
                <img src={img.url} className="w-6 h-6 rounded object-cover border border-[var(--border-color)]" alt="" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={styleWeights[img.id] ?? Math.round(100 / state.styleImages.length)}
                  onChange={(e) => setStyleWeights(prev => ({ ...prev, [img.id]: Number(e.target.value) }))}
                  className="range-green flex-1"
                />
                <span className="text-[9px] font-mono text-[var(--text-secondary)] w-8 text-right">
                  {styleWeights[img.id] ?? Math.round(100 / state.styleImages.length)}%
                </span>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* 7. Proprietary Assets (Compacted) */}
      <div className="space-y-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between">
          <span>Proprietární Prvky</span>
          <span className="text-[9px] text-[var(--text-secondary)]">{state.assetImages.length}</span>
        </h3>
        <div
          className={`mn-upload-zone mn-upload-zone-compact ${dragOverTarget === 'asset' ? 'border-[var(--accent)] bg-[var(--accent)]/5' : ''}`}
          onDragOver={handleDragOverAsset}
          onDragLeave={handleDragLeave}
          onDrop={handleDropAsset}
        >
          {state.assetImages.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center cursor-pointer" onClick={() => document.getElementById('asset-upload-input')?.click()}>
              <span className="text-[var(--text-secondary)] text-lg group-hover:text-[var(--text-primary)] transition-colors">+</span>
              <input
                id="asset-upload-input"
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const inputEl = e.currentTarget;
                  if (e.target.files) handleAssetImagesSelected(Array.from(e.target.files));
                  inputEl.value = '';
                }}
              />
            </div>
          ) : (
            <div className="p-1 grid grid-cols-4 gap-1">
              {state.assetImages.map((img, idx) => (
                <div key={img.id} className="mn-upload-thumb group">
                  <img src={img.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" alt={`Asset ${idx}`} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setState(prev => ({ ...prev, assetImages: prev.assetImages.filter(i => i.id !== img.id) })); }}
                    className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <label className="mn-upload-tile">
                <span className="text-[var(--text-secondary)]">+</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const inputEl = e.currentTarget;
                    if (e.target.files) handleAssetImagesSelected(Array.from(e.target.files));
                    inputEl.value = '';
                  }}
                />
              </label>
            </div>
          )}
        </div>
        <div className="text-[8px] text-[var(--text-secondary)]/80">
          Logo / klobouk / boty / produkt. Neovlivňuje styl, pouze obsahové doplnění výstupu.
        </div>
      </div>

      {/* #12: Tlačítko pro volné porovnání */}
      {state.generatedImages.filter(img => img.status === 'success').length >= 2 && (
        <div className="pt-2">
          <button
            onClick={() => setIsFreeComparisonOpen(true)}
            className="w-full py-2 px-3 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all border border-[rgba(168,191,143,0.18)] bg-[rgba(32,44,24,0.55)] text-[var(--text-secondary)] hover:border-[rgba(168,191,143,0.40)] hover:bg-[rgba(45,62,33,0.70)] hover:text-[var(--accent)]"
          >
            Porovnat obrázky
          </button>
        </div>
      )}
    </div >
  );

  const renderModelPresetGrid = () => (
    <div className="grid grid-cols-2 gap-1">
      {imageModelPresets.map((preset) => {
        const isActive = selectedImagePresetId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => handleImageModelPresetSelect(preset.id)}
            className={`mn-option-button ${isActive ? 'mn-option-button-active' : ''}`}
            title={`${preset.title} — ${preset.subtitle}`}
          >
            <div className="text-[8px] font-black uppercase tracking-[0.18em] leading-tight">{preset.title}</div>
            <div className={`mt-0.5 text-[6px] font-semibold leading-tight ${isActive ? 'text-[var(--accent-contrast)]/80' : 'text-[var(--text-3)]'}`}>
              {preset.subtitle}
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderRightNanoPanel = () => (
    <div className="flex h-full flex-col overflow-y-auto custom-scrollbar p-6">
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Výběr modelů
          </h3>
          {renderModelPresetGrid()}
        </section>

        <section className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Režimy promptu
          </h3>
          {renderSimpleModeTray()}
        </section>

        <section className="space-y-4">
          {renderGroundingControl()}
          <ProviderSelector
            selectedProvider={selectedProvider}
            onChange={handleProviderChange}
            settings={providerSettings}
          />
        </section>
      </div>

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={() => setIsGalleryExpanded(true)}
          className="w-full rounded-lg border border-[rgba(168,191,143,0.20)] bg-[linear-gradient(135deg,rgba(30,42,22,0.65)_0%,rgba(18,26,14,0.75)_100%)] px-3 py-3 text-left transition-all hover:border-[rgba(168,191,143,0.45)] hover:bg-[linear-gradient(135deg,rgba(42,58,30,0.78)_0%,rgba(26,36,18,0.85)_100%)]"
        >
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            Knihovna
          </div>
          <div className="mt-1 text-[8px] font-medium leading-relaxed text-[var(--text-secondary)]">
            Vstupní i generované obrázky. Otevře samostatné okno pro přetažení do sekcí.
          </div>
        </button>
      </div>
    </div>
  );

  const renderGroundingControl = () => (
    <label className="flex items-center justify-between gap-3 rounded-md border border-[rgba(168,191,143,0.18)] bg-[linear-gradient(135deg,rgba(28,40,20,0.65)_0%,rgba(16,24,12,0.72)_100%)] px-3 py-2 transition-all hover:border-[rgba(168,191,143,0.38)] cursor-pointer">
      <div className="flex flex-col">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]">Grounding</span>
        <span className="text-[8px] leading-relaxed text-[var(--text-secondary)]">Použít Google Search pro zdroje a odkazy</span>
      </div>
      <div className="relative">
        <input
          type="checkbox"
          checked={useGrounding}
          onChange={(e) => setUseGrounding(e.target.checked)}
          className="sr-only peer"
        />
        <div className="h-5 w-9 rounded-full border border-[var(--border-color)] bg-white/6 transition-colors peer-checked:border-[var(--accent)]/35 peer-checked:bg-[var(--accent)]/22"></div>
        <div className="absolute left-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-[var(--text-secondary)] transition-transform peer-checked:translate-x-4 peer-checked:bg-[var(--accent)]"></div>
      </div>
    </label>
  );

  const expandedGalleryViewportStyle = isMobile
    ? undefined
    : {
        left: `${73 + sidebarWidth}px`,
      };

  // Show auth bootstrap screen
  if (isAuthBootstrapping) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0c0a]">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isSupabaseReady) {
    const isAnonDisabled = Boolean(
      authFailureMessage &&
      (authFailureMessage.includes('Anonymní přihlášení je v Supabase vypnuté') ||
        authFailureMessage === SUPABASE_ANON_DISABLED_ERROR_MESSAGE)
    );

    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0c0a] text-white gap-4">
        <p className="text-sm text-white/70">{authFailureMessage || 'Nepodařilo se inicializovat anonymní přihlášení.'}</p>
        {isAnonDisabled ? (
          <div className="text-xs text-white/45 text-center max-w-md space-y-2">
            <p>V Supabase je potřeba povolit anonymní přihlášení.</p>
            <p>Authentication → Providers → Anonymous sign-ins → Enable</p>
          </div>
        ) : (
          <p className="text-xs text-white/45">Aplikace průběžně zkouší obnovit spojení se Supabase.</p>
        )}
        <div className="flex items-center gap-2">
          {isAnonDisabled && (
            <a
              href={supabaseAuthSettingsUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-lg border border-[#a8bf8f]/30 hover:border-[#a8bf8f]/60 text-xs uppercase tracking-wider text-[#a7eb89]"
            >
              Otevřít Supabase Auth
            </a>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg border border-[rgba(168,191,143,0.22)] bg-[rgba(32,44,24,0.55)] hover:border-[rgba(168,191,143,0.45)] hover:bg-[rgba(45,62,33,0.70)] text-xs uppercase tracking-wider transition-all"
          >
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }

  if (isAppUserBootstrapping) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0c0a]">
        <LoadingSpinner />
      </div>
    );
  }

  const handleSaveSettings = async (newSettings: ProviderSettings) => {
    const merged: ProviderSettings = {
      ...defaultProviderSettings,
      ...newSettings,
      [AIProviderType.GEMINI]: newSettings[AIProviderType.GEMINI] || defaultProviderSettings[AIProviderType.GEMINI],
      [AIProviderType.CHATGPT]: newSettings[AIProviderType.CHATGPT] || defaultProviderSettings[AIProviderType.CHATGPT],
      [AIProviderType.GROK]: newSettings[AIProviderType.GROK] || defaultProviderSettings[AIProviderType.GROK],
      [AIProviderType.REPLICATE]: newSettings[AIProviderType.REPLICATE] || defaultProviderSettings[AIProviderType.REPLICATE],
      [AIProviderType.FLUX_PRO]: newSettings[AIProviderType.FLUX_PRO] || defaultProviderSettings[AIProviderType.FLUX_PRO],
      fal: newSettings.fal || defaultProviderSettings.fal,
      a1111: newSettings.a1111,
    };
    setProviderSettings(merged);
    localStorage.setItem(PROVIDER_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    setToast({ message: 'Settings applied for current session.', type: 'success' });
  };

  const routeScreenFallback = (
    <div className="flex-1 min-w-0 flex items-center justify-center canvas-surface">
      <div className="flex flex-col items-center gap-4 text-center">
        <LoadingSpinner />
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-secondary)]">
          Načítám sekci
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen transition-colors duration-300 text-[var(--text-primary)] font-sans flex" style={{background:'transparent'}}>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={providerSettings}
        onSave={handleSaveSettings}
      />

      <AppIconRail
        active={
          isFaceSwapRoute
              ? 'face-swap'
            : isReframeRoute
              ? 'reframe'
            : isBatchRoute
              ? 'batch'
            : isStyleTransferRoute
              ? 'style-transfer'
              : isModelInfluenceRoute
                ? 'model-influence'
                : isAiUpscalerRoute
                  ? 'ai-upscaler'
                : isLoraInfluenceRoute
                  ? 'flux-lora'
                  : 'mulen'
        }
        onNavigate={(route) => {
          if (route === 'mulen') {
            navigate('/');
            return;
          }
          if (route === 'model-influence') {
            navigate('/model-influence');
            return;
          }
          if (route === 'face-swap') {
            navigate('/face-swap');
            return;
          }
          if (route === 'reframe') {
            navigate('/reframe');
            return;
          }
          if (route === 'style-transfer') {
            navigate('/style-transfer');
            return;
          }
          if (route === 'batch') {
            navigate('/batch');
            return;
          }
          if (route === 'ai-upscaler') {
            navigate('/ai-upscaler');
            return;
          }
          if (route === 'flux-lora') {
            navigate('/flux-lora');
            return;
          }
        }}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <Header
          onSettingsClick={() => setIsSettingsModalOpen(true)}
          theme={theme}
          onThemeToggle={toggleTheme}
        />

        <div className="flex h-[calc(100vh-73px)] overflow-hidden relative">
          {isFaceSwapRoute ? (
            <Suspense fallback={routeScreenFallback}>
              <LazyFaceSwapScreen
                providerSettings={providerSettings}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onOpenLibrary={() => setIsGalleryExpanded(true)}
                onToast={(t) => setToast(t)}
                theme={theme}
              />
            </Suspense>
          ) : isReframeRoute ? (
            <Suspense fallback={routeScreenFallback}>
              <LazyReframeScreen
                providerSettings={providerSettings}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onOpenLibrary={() => setIsGalleryExpanded(true)}
                onToast={(t) => setToast(t)}
                theme={theme}
              />
            </Suspense>
          ) : isStyleTransferRoute ? (
            <Suspense fallback={routeScreenFallback}>
              <LazyStyleTransferScreen
                providerSettings={providerSettings}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onOpenLibrary={() => setIsGalleryExpanded(true)}
                onBack={() => navigate('/')}
                onToast={(t) => setToast(t)}
                isHoveringGallery={isHoveringGallery}
                theme={theme}
              />
            </Suspense>
          ) : isModelInfluenceRoute ? (
            <Suspense fallback={routeScreenFallback}>
              <LazyModelInfluenceScreen
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onOpenLibrary={() => setIsGalleryExpanded(true)}
                onToast={(t) => setToast(t)}
                theme={theme}
              />
            </Suspense>
          ) : isAiUpscalerRoute ? (
            <Suspense fallback={routeScreenFallback}>
              <LazyAiUpscalerScreen
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onOpenLibrary={() => setIsGalleryExpanded(true)}
                onToast={(t) => setToast(t)}
                theme={theme}
              />
            </Suspense>
          ) : isBatchRoute ? (
            <Suspense fallback={routeScreenFallback}>
              <LazyBatchScreen
                providerSettings={providerSettings}
                selectedProvider={selectedProvider}
                nanoBananaImageModel={nanoBananaImageModel}
                onProviderChange={handleProviderChange}
                onNanoBananaModelChange={handleNanoBananaModelChange}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onOpenLibrary={() => setIsGalleryExpanded(true)}
                onToast={(t) => setToast(t)}
                theme={theme}
              />
            </Suspense>
          ) : isLoraInfluenceRoute ? (
            <Suspense fallback={routeScreenFallback}>
              <LazyFluxLoraGeneratorScreen
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onOpenLibrary={() => setIsGalleryExpanded(true)}
                onToast={(t) => setToast(t)}
                theme={theme}
              />
            </Suspense>
          ) : (
            <>
              {/* Left Sidebar - resizable Nano workflow controls (Hidden on Mobile) */}
              <div
                ref={sidebarRef}
                className="hidden lg:flex shrink-0 flex-col h-full overflow-y-auto custom-scrollbar cairn-panel-left z-20"
                style={theme === 'dark' ? { width: sidebarWidth, backdropFilter:'blur(32px) saturate(200%)', background:'linear-gradient(160deg,rgba(32,44,24,0.94) 0%,rgba(20,28,15,0.96) 100%)', boxShadow:'4px 0 48px rgba(0,0,0,0.50), inset 0 0 120px rgba(125,154,100,0.08)' } : { width: sidebarWidth, background:'#ffffff', borderRight:'1px solid #cdd8ba' }}
              >
                <div className="p-6 flex flex-col gap-6 min-h-full">
                  <div className="pt-2">
                    {renderSidebarControls(false)}
                  </div>
                </div>
              </div>

              <div className="hidden lg:block relative w-0 shrink-0">
                <div
                  className="absolute inset-y-0 -left-1 w-2 cursor-col-resize bg-transparent"
                  onMouseDown={startResizing}
                  title="Změnit šířku levého panelu"
                />
              </div>

              {/* Main Content - Flexible Center */}
              <div
                className="flex-1 relative flex flex-col min-w-0 canvas-surface h-full overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out"
              >
                <button
                  type="button"
                  onClick={() => setIsRightPanelCollapsed(prev => !prev)}
                  className="hidden lg:flex absolute top-6 right-4 z-30 h-10 w-10 items-center justify-center rounded-xl transition-all duration-200"
                  style={theme === 'dark'
                    ? {
                      background: 'rgba(18,24,14,0.92)',
                      border: '1px solid rgba(168,191,143,0.22)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
                      color: 'rgba(168,191,143,0.72)',
                    }
                    : {
                      background: '#ffffff',
                      border: '1px solid #cdd8ba',
                      boxShadow: 'none',
                      color: '#6f7f68',
                    }}
                  title={isRightPanelCollapsed ? 'Otevřít pravý panel' : 'Skrýt pravý panel'}
                >
                  <span
                    className="block h-4 w-2 rounded-full transition-all"
                    style={theme === 'dark'
                      ? { background: 'rgba(168,191,143,0.72)' }
                      : { background: '#7b8c71' }}
                  />
                </button>
                <div className="p-6 lg:p-10 pb-32 w-full">
                  <div className="space-y-6 md:space-y-8 w-full">
                    <header className="hidden lg:flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-4 bg-[#a8bf8f] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]"></div>
                          <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Výsledky Generování</h2>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 hidden lg:flex">
                        {state.generatedImages.length > 0 && (
                          <button
                            onClick={async () => {
                              const successImages = state.generatedImages.filter(img => img.status === 'success' && img.url);
                              if (successImages.length === 0) return;
                              setDownloadingAll(true);
                              // ... download logic ...
                            }}
                            disabled={downloadingAll}
                            className="mn-toolbar-button flex items-center gap-2 px-4 py-2 font-black text-[9px] uppercase tracking-widest rounded-md transition-all active:scale-95"
                          >
                            {downloadingAll ? 'Balím...' : 'Exportovat vše'}
                          </button>
                        )}
                      </div>
                    </header>

                    {/* Selection Toolbar */}
                    {selectedGeneratedImages.size > 0 && (
                      <div className="px-4 py-3 sticky top-0 z-10 card-surface">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[#a8bf8f]">
                            ✓ Vybráno: {selectedGeneratedImages.size}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setSelectedGeneratedImages(new Set())}
                              className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors"
                            >
                              Zrušit
                            </button>
                            <button
                              onClick={async () => {
                                const JSZip = (await import('jszip')).default;
                                const zip = new JSZip();
                                const folderName = `selected_images_${Date.now()}`;
                                const folder = zip.folder(folderName);

                                const selectedImages = state.generatedImages.filter(img =>
                                  selectedGeneratedImages.has(img.id) && img.status === 'success'
                                );

                                await Promise.all(selectedImages.map(async (img, index) => {
                                  const response = await fetch(img.url!);
                                  const blob = await response.blob();
                                  const baseFilename = `image_${index + 1}`;
                                  folder!.file(`${baseFilename}.jpg`, blob);

                                  const metadata = [
                                    `Prompt: ${img.prompt}`,
                                    `Resolution: ${img.resolution || 'N/A'}`,
                                    `Aspect Ratio: ${img.aspectRatio || 'N/A'}`,
                                    `Timestamp: ${new Date(img.timestamp).toLocaleString()}`,
                                    `ID: ${img.id}`,
                                  ].join('\n');

                                  folder!.file(`${baseFilename}.txt`, metadata);
                                }));

                                const content = await zip.generateAsync({ type: "blob" });
                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(content);
                                link.download = `${folderName}.zip`;
                                link.click();

                                setSelectedGeneratedImages(new Set());
                                setToast({ message: `✅ Staženo ${selectedImages.length} obrázků`, type: 'success' });
                              }}
                              className="px-4 py-2 bg-[#a8bf8f] hover:bg-[#6bc547] text-[#0b0c0a] font-black text-xs uppercase tracking-widest rounded-md transition-all shadow-lg shadow-[#a8bf8f]/20"
                            >
                              Stáhnout ({selectedGeneratedImages.size})
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Main Generation Grid */}
                    {state.generatedImages.length === 0 ? (
                      <div className="py-20 md:py-40 flex flex-col items-center justify-center space-y-6 relative">
                        <div className="text-center space-y-1.5 relative z-10">
                          <span className="text-[10px] font-[900] uppercase tracking-[0.28em] block" style={{color:'var(--text-3)'}}>
                            Zatím žádné vygenerované obrázky
                          </span>
                          <p className="text-[9px] font-medium" style={{color:'var(--text-soft)'}}>
                            Zadejte prompt v postranním panelu (vlevo) a začněte tvořit
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {(() => {
                          // Group images by runId into rows
                          const rows: Array<{ runId: string; images: typeof state.generatedImages }> = [];
                          const seen = new Map<string, number>();
                          for (const img of state.generatedImages) {
                            const key = getImageRowKey(img);
                            if (seen.has(key)) {
                              rows[seen.get(key)!].images.push(img);
                            } else {
                              seen.set(key, rows.length);
                              rows.push({ runId: key, images: [img] });
                            }
                          }
                          return rows.map((row) => (
                            <div key={row.runId} className="group/row space-y-2 animate-fadeIn">
                              {/* Row header */}
                              <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'rgba(168,191,143,0.50)' }}>
                                    {row.images[0]?.prompt
                                      ? row.images[0].prompt.length > 60
                                        ? row.images[0].prompt.slice(0, 60) + '…'
                                        : row.images[0].prompt
                                      : 'Generování…'}
                                  </span>
                                  {row.images.length > 1 && (
                                    <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(168,191,143,0.10)', color: 'rgba(168,191,143,0.55)' }}>
                                      {row.images.length}×
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => {
                                    const toDelete = row.images.map(img => img.id);
                                    setState(prev => ({
                                      ...prev,
                                      generatedImages: prev.generatedImages.filter(img => getImageRowKey(img) !== row.runId),
                                    }));
                                    toDelete.forEach(id => deleteGalleryImage(id).catch(() => {}));
                                    setToast({ message: 'Řádek smazán', type: 'success' });
                                  }}
                                  className="p-1 rounded transition-all opacity-30 hover:opacity-100"
                                  style={{ color: 'rgba(168,191,143,0.35)' }}
                                  title="Smazat celý řádek"
                                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.80)')}
                                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(168,191,143,0.35)')}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                              {/* Images in row */}
                              <div className={`grid gap-3 ${row.images.length === 1 ? 'grid-cols-1 max-w-sm' : row.images.length === 2 ? 'grid-cols-2' : row.images.length === 3 ? 'grid-cols-3' : row.images.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
                        {row.images.map((image) => (
                          <article
                            key={image.id}
                            className="group flex flex-col overflow-hidden card-surface card-surface-hover transition-all"
                            onContextMenu={(e) => image.status === 'success' && handleImageContextMenu(e, image.id)}
                          >
                            <div
                              className="relative bg-[var(--bg-panel)] cursor-zoom-in aspect-square overflow-hidden"
                              onClick={() => setSelectedImage(image)}
                            >
                              {/* Image Rendering Logic - Simplified for brevity, assume existing mostly works but ensure styles are updated */}
                              {image.status === 'loading' ? (
                                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md px-6 transition-all duration-300">
                                  {/* Elegant Progress Bar */}
                                  <div className="w-full max-w-[200px] space-y-3">
                                    {/* Animated Progress Bar */}
                                    <div className="relative h-[2px] bg-gray-800 rounded-full overflow-hidden">
                                      <div
                                        className="absolute inset-y-0 left-0 bg-[#a8bf8f] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]"
                                        style={{
                                          width: '0%',
                                          animation: 'growWidth 10s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                                        }}
                                      />
                                      <style>{`
                                  @keyframes growWidth {
                                    0% { width: 0%; }
                                    10% { width: 15%; }
                                    40% { width: 50%; }
                                    70% { width: 80%; }
                                    100% { width: 95%; }
                                  }
                                `}</style>
                                    </div>
                                    {/* "generuji" text */}
                                    <div className="text-center">
                                      <span className="text-[10px] text-[#a8bf8f] font-bold tracking-widest uppercase animate-pulse">Generuji...</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                image.url && (
                                  <img
                                    src={image.url}
                                    className={`w-full h-full object-contain bg-[var(--bg-contrast)] ${image.isEditing ? 'blur-sm scale-105' : ''} transition-all duration-500`}
                                    decoding="sync"
                                    style={{ imageRendering: '-webkit-optimize-contrast' }}
                                  />
                                )
                              )}
                              {/* Error Overlay */}
                              {image.status === 'error' && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/80 backdrop-blur-sm">
                                  <div className="w-10 h-10 bg-red-500/20 text-red-500 border border-red-500/30 rounded-md flex items-center justify-center mb-4">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                  </div>
                                  <p className="text-[10px] font-bold text-red-400 leading-relaxed max-w-[150px]">{image.error}</p>
                                </div>
                              )}
                            </div>

                            {/* Card Footer */}
                            < div className="px-4 py-3 flex flex-col gap-2 border-t border-[rgba(168,191,143,0.12)] bg-[linear-gradient(135deg,rgba(28,38,22,0.85)_0%,rgba(16,22,12,0.90)_100%)]" >
                              {/* Prompt + Actions Row */}
                              < div className="flex items-center gap-2" >
                                <p className="text-[9px] font-medium text-[var(--text-muted)] leading-snug line-clamp-1 flex-1" title={image.prompt}>
                                  {image.prompt}
                                </p>
                                <div className="flex gap-1 shrink-0">
                                  {/* Copy Prompt */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(image.prompt);
                                      setToast({ message: 'Prompt zkopírován', type: 'success' });
                                    }}
                                    className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-highlight)] rounded transition-colors"
                                    title="Kopírovat prompt"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                  </button>

                                  {/* Repopulate */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRepopulate(image); }}
                                    className="p-1.5 text-[var(--text-secondary)] hover:text-blue-500 hover:bg-blue-500/10 rounded transition-colors"
                                    title="Repopulate (nahrát do editoru)"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                  </button>

                                  {/* Download */}
                                  {image.url && (
                                    <a
                                      href={image.url}
                                      download
                                      onClick={(e) => e.stopPropagation()}
                                      className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[color:var(--selection-surface)] rounded transition-colors"
                                      title="Stáhnout"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    </a>
                                  )}

                                  {/* Delete */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setState(prev => ({
                                        ...prev,
                                        generatedImages: prev.generatedImages.filter(img => img.id !== image.id)
                                      }));
                                      deleteGalleryImage(image.id).catch(() => {});
                                      setToast({ message: 'Obrázek smazán', type: 'success' });
                                    }}
                                    className="p-1.5 text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                    title="Smazat"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              </div>

                              {/* Grounding Links (if present) */}
                              {image.groundingMetadata && image.groundingMetadata.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {image.groundingMetadata.slice(0, 3).map((link, idx) => (
                                    <a
                                      key={idx}
                                      href={link.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-[9px] px-2 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded border border-blue-500/20 hover:border-blue-500/40 transition-colors font-medium truncate max-w-[150px]"
                                      title={link.title || link.url}
                                    >
                                      {link.title || new URL(link.url).hostname}
                                    </a>
                                  ))}
                                  {image.groundingMetadata.length > 3 && (
                                    <span className="text-[9px] text-[var(--text-secondary)] px-2 py-0.5">
                                      +{image.groundingMetadata.length - 3} více
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Inline Edit Section - removed, use ImageDetailModal instead */}
                            {false && image.status === 'success' && image.url && (
                              <div className="px-4 py-3 border-t border-[rgba(168,191,143,0.12)] bg-[linear-gradient(135deg,rgba(28,38,22,0.85)_0%,rgba(16,22,12,0.90)_100%)] space-y-2.5">
                                {/* Header Row */}
                                <div className="flex items-center justify-between px-1">
                                  <div className="flex items-center gap-1.5">
                                    <svg className="w-3 h-3 text-[#a8bf8f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                                      Upravit prompt
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {(editPrompts[image.id] !== undefined && editPrompts[image.id] !== image.prompt) && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditPrompts(prev => {
                                            const next = { ...prev };
                                            delete next[image.id];
                                            return next;
                                          });
                                        }}
                                        className="px-2 py-1 text-[8px] font-bold uppercase tracking-wider rounded bg-[var(--surface-highlight)] hover:bg-[var(--surface-highlight-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                        title="Vrátit původní text"
                                      >
                                        Vrátit
                                      </button>
                                    )}

                                    {(image.versions && image.versions.length > 0) && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditPrompts(prev => {
                                            const next = { ...prev };
                                            delete next[image.id];
                                            return next;
                                          });
                                          setState(prev => ({
                                            ...prev,
                                            generatedImages: prev.generatedImages.map(img => {
                                              if (img.id !== image.id || !img.versions || img.versions.length === 0) return img;
                                              const original = img.versions[0];
                                              return {
                                                ...img,
                                                url: original.url,
                                                prompt: original.prompt,
                                                timestamp: original.timestamp,
                                                currentVersionIndex: 0,
                                              };
                                            })
                                          }));
                                        }}
                                        className="px-2 py-1 text-[8px] font-bold uppercase tracking-wider rounded bg-[var(--surface-highlight)] hover:bg-[var(--surface-highlight-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                        title="Vrátit obrázek na původní verzi"
                                      >
                                        Původní
                                      </button>
                                    )}

                                    {/* Add Images Toggle */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowReferenceUpload(prev => ({
                                          ...prev,
                                          [image.id]: !prev[image.id]
                                        }));
                                      }}
                                      className={`flex items-center gap-1 px-2 py-1 text-[8px] font-bold uppercase tracking-wider rounded transition-all ${showReferenceUpload[image.id]
                                        ? 'bg-[#a8bf8f] text-[#0b0c0a] border border-[#a8bf8f]'
                                        : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[color:var(--border-color)] hover:border-[color:var(--border-strong)]'
                                        }`}
                                      title="Přidat referenční obrázky"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                      {showReferenceUpload[image.id] ? 'Skrýt' : '+ Obrázky'}
                                    </button>
                                  </div>
                                </div>

                                {/* Edit Textarea */}
                                <textarea
                                  value={editPrompts[image.id] ?? image.prompt}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setEditPrompts(prev => ({ ...prev, [image.id]: e.target.value }));
                                  }}
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      if (editPrompts[image.id]?.trim()) {
                                        handleEditImage(image.id);
                                      }
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Popište úpravy a stiskněte Enter..."
                                  className="w-full min-h-[80px] bg-[var(--bg-elevated)] border border-[color:var(--border-color)] hover:border-[color:var(--border-strong)] focus:border-[var(--accent)] rounded-md p-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-soft)] focus:ring-0 outline-none transition-all resize-none custom-scrollbar"
                                />

                                {/* Inline Reference Images (Conditional) */}
                                {showReferenceUpload[image.id] && (
                                  <div className="grid grid-cols-4 gap-1 p-2 bg-[var(--bg-elevated)] border border-[color:var(--border-color)] rounded-md">
                                    {(inlineEditStates[image.id]?.referenceImages || []).map((img, idx) => (
                                      <div key={idx} className="relative group aspect-square rounded overflow-hidden bg-[var(--bg-panel)] border border-[color:var(--border-color)]">
                                        <img src={img.url} className="w-full h-full object-cover" alt={`Ref ${idx}`} />
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setInlineEditStates(prev => ({
                                              ...prev,
                                              [image.id]: {
                                                ...prev[image.id],
                                                referenceImages: prev[image.id]?.referenceImages?.filter((_, i) => i !== idx) || []
                                              }
                                            }));
                                          }}
                                          className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <X className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    ))}
                                    <label className="flex items-center justify-center aspect-square rounded border border-dashed border-[color:var(--border-strong)] hover:border-[var(--accent)] hover:bg-[var(--surface-highlight)] cursor-pointer transition-colors">
                                      <span className="text-[var(--text-secondary)]">+</span>
                                      <input
                                        type="file"
                                        multiple
                                        accept="image/*"
                                        className="hidden"
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          const inputEl = e.currentTarget;
                                          if (e.target.files) {
                                            addInlineReferenceImages(image.id, Array.from(e.target.files));
                                          }
                                          inputEl.value = '';
                                        }}
                                      />
                                    </label>
                                  </div>
                                )}

                                {/* Regenerate Button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditImage(image.id);
                                  }}
                                  disabled={!editPrompts[image.id]?.trim()}
                                  className="w-full py-2 px-3 bg-gradient-to-r from-blue-500/20 to-blue-600/20 hover:from-blue-500/30 hover:to-blue-600/30 text-blue-400 hover:text-blue-300 font-black text-[9px] uppercase tracking-widest rounded-md border border-blue-500/30 hover:border-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
                                >
                                  Regenerovat obrázek
                                </button>
                              </div>
                            )}
                          </article>
                        ))}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div >

              {!isRightPanelCollapsed && (
                <>
                  <div className="hidden lg:block relative w-0 shrink-0">
                    <div
                      className="absolute inset-y-0 -right-1 w-2 cursor-col-resize bg-transparent"
                      onMouseDown={startResizingRight}
                      title="Změnit šířku pravého panelu"
                    />
                  </div>

                  <aside
                    ref={rightPanelRef}
                    className="hidden lg:flex shrink-0 flex-col h-full z-20 cairn-panel-right"
                    style={theme === 'dark' ? { width: rightPanelWidth, backdropFilter:'blur(32px) saturate(200%)', background:'linear-gradient(200deg,rgba(32,44,24,0.94) 0%,rgba(20,28,15,0.96) 100%)', boxShadow:'-4px 0 48px rgba(0,0,0,0.50), inset 0 0 120px rgba(125,154,100,0.08)' } : { width: rightPanelWidth, background:'#ffffff', borderLeft:'1px solid #cdd8ba' }}
                  >
                    {renderRightNanoPanel()}
                  </aside>
                </>
              )}
            </>
          )}

          {isGalleryExpanded && (
            <div
              className="absolute inset-y-0 right-0 z-[80] bg-transparent"
              style={expandedGalleryViewportStyle}
              onClick={() => setIsGalleryExpanded(false)}
            >
              <div
                className="absolute inset-4 sm:inset-6 rounded-xl overflow-hidden flex flex-col"
                style={{background:'linear-gradient(160deg,rgba(28,40,20,0.97) 0%,rgba(14,20,10,0.98) 100%)',border:'1px solid rgba(168,191,143,0.22)',boxShadow:'0 0 80px rgba(0,0,0,0.70), inset 0 0 120px rgba(125,154,100,0.06)'}}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 py-4 border-b border-white/5 bg-transparent flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-[#a8bf8f] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]"></div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-white/55">Knihovna obrázků</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGalleryExpanded(false)}
                    className="px-3 py-1.5 border border-[rgba(168,191,143,0.16)] bg-[rgba(32,44,24,0.55)] hover:border-[rgba(168,191,143,0.38)] hover:bg-[rgba(45,62,33,0.70)] text-[var(--text-secondary)] hover:text-[var(--accent)] rounded-md transition-all text-[10px] font-bold uppercase tracking-wider"
                  >
                    Zpět
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <ImageGalleryPanel
                    onDragStart={(imageData, type) => {
                      console.log('[Drag] Started from gallery', { type });
                    }}
                    onBatchProcess={handleBatchProcess}
                    view="expanded"
                  />
                </div>
              </div>
            </div>
          )}
        </div >

        <ImageDetailModal
          isOpen={!!selectedImage && !!selectedImage.url}
          onClose={() => setSelectedImage(null)}
          image={selectedImage}
          onNext={handleNextImage}
          onPrev={handlePrevImage}
          hasNext={selectedImage ? state.generatedImages.findIndex(img => img.id === selectedImage.id) < state.generatedImages.length - 1 : false}
          hasPrev={selectedImage ? state.generatedImages.findIndex(img => img.id === selectedImage.id) > 0 : false}
          onUseImage={(img) => {
            if (!img.url) return;
            handleRepopulate(img);
          }}
          onRegenerate={(_img, newPrompt) => {
            setState(prev => ({ ...prev, prompt: newPrompt }));
            setSelectedImage(null);
          }}
        />

        <GalleryModal
          isOpen={isGalleryOpen}
          onClose={() => setIsGalleryOpen(false)}
          onRepopulate={handleRepopulateFromGallery}
        />

        <CollectionsModal
          isOpen={isCollectionsModalOpen}
          onClose={() => setIsCollectionsModalOpen(false)}
        />

        <PromptTemplatesModal
          isOpen={isTemplatesModalOpen}
          onClose={() => setIsTemplatesModalOpen(false)}
          onSelectTemplate={(template) => {
            setState(prev => ({ ...prev, prompt: template }));
            promptHistory.add(template);
          }}
        />

        <PromptRemixModal
          isOpen={isRemixModalOpen}
          onClose={() => setIsRemixModalOpen(false)}
          recentPrompts={promptHistory.getAll().slice(-10)}
          onUseRemix={(remix) => {
            setState(prev => ({ ...prev, prompt: remix }));
            promptHistory.add(remix);
          }}
        />

        <QuickActionsMenu
          isOpen={quickActionsMenu.isOpen}
          onClose={() => setQuickActionsMenu(prev => ({ ...prev, isOpen: false }))}
          position={quickActionsMenu.position}
          actions={quickActionsMenu.imageId ? getQuickActionsForImage(quickActionsMenu.imageId) : []}
        />

        {/* #12: Free Comparison Modal */}
        <FreeComparisonModal
          isOpen={isFreeComparisonOpen}
          onClose={() => setIsFreeComparisonOpen(false)}
          images={state.generatedImages}
        />

        {/* #3+4: Mask Canvas (Inpainting/Outpainting) */}
        {maskCanvasState && maskCanvasState.isOpen && (
          <MaskCanvas
            imageUrl={maskCanvasState.imageUrl}
            width={maskCanvasState.width}
            height={maskCanvasState.height}
            mode={maskCanvasState.mode}
            outpaintDirection={maskCanvasState.outpaintDirection}
            outpaintPixels={maskCanvasState.outpaintPixels}
            onMaskComplete={handleMaskComplete}
            onCancel={() => setMaskCanvasState(null)}
          />
        )}

        {/* Toast Notification */}
        {
          toast && (
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )
        }
      </div>
    </div >
  );
};

export default App;
