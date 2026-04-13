import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './src/index.css'; // ENFORCE NEW STYLES
import { Upload, X, FileJson, ArrowLeftRight, Folder, Sparkles } from 'lucide-react'; // Added icons for design
import { ImageUpload } from './components/ImageUpload';
import { LoadingSpinner } from './components/LoadingSpinner';
import { analyzeImageForJsonWithAI, enhancePromptWithAI, analyzeStyleTransferWithAI } from './services/geminiService';
import { AppState, GeneratedImage, GenerationRecipe, SourceImage, LineageEntry } from './types';
import { ImageComparisonModal } from './components/ImageComparisonModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { Header } from './components/Header';
import { GalleryModal } from './components/GalleryModal';
import { SavedPromptsDropdown } from './components/SavedPromptsDropdown';
import { slugify } from './utils/stringUtils.ts';
import { GalleryImage, saveToGallery, createThumbnail } from './utils/galleryDB';
import { ImageDatabase } from './utils/imageDatabase';
import { urlToDataUrl } from './utils/supabaseStorage';
import JSZip from 'jszip';
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
import { AIProviderType, ProviderSettings } from './services/aiProvider';
import { ProviderFactory } from './services/providerFactory';
import { Toast, ToastType } from './components/Toast';
import { applyAdvancedInterpretation } from './utils/promptInterpretation';
import { runSupabaseSmokeTests } from './utils/smokeTests';
import { ensureSupabaseClient, SUPABASE_ANON_DISABLED_ERROR_MESSAGE, ensureLocalAppUserId } from './utils/supabaseClient';
import { StyleTransferScreen } from './components/StyleTransferScreen';
import { createReferenceStyleComposite } from './utils/imagePanelComposite';
import { AppIconRail } from './components/AppIconRail';
import { FluxLoraGeneratorScreen } from './components/FluxLoraGeneratorScreen';
import { ModelInfluenceScreen } from './components/modelInfluence/ModelInfluenceScreen';
import { MaskCanvas } from './components/MaskCanvas';
import { FreeComparisonModal } from './components/FreeComparisonModal';
import { mapAspectRatio, type ProviderType } from './utils/aspectRatioMapping';
import { upscaleImage } from './utils/upscaling';
import { AiUpscalerScreen } from './components/AiUpscalerScreen';
import { FaceSwapScreen } from './components/FaceSwapScreen';
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

const ASPECT_RATIOS = ['Original', '1:1', '2:3', '3:2', '3:4', '4:3', '5:4', '4:5', '9:16', '16:9', '21:9'];
const RESOLUTIONS = [
  { value: '1K', label: '1K (~1024px)' },
  { value: '2K', label: '2K (~2048px)' },
  { value: '4K', label: '4K (~4096px)' }
];
const MAX_GENERATED_IMAGES = 14;
const PROVIDER_SETTINGS_STORAGE_KEY = 'providerSettings';
const THEME_STORAGE_KEY = 'mulen-theme';
type GenerationQueueAction = 'generate' | 'variants' | '3ai';
type GenerationQueueItem = {
  action: GenerationQueueAction;
  snapshot: GenerationQueueSnapshot;
};

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
    return 'dark';
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

  useEffect(() => {
    setIsAppUserBootstrapping(true);
    setAppUserId(ensureLocalAppUserId());
    setIsAppUserBootstrapping(false);
    void ImageDatabase.getAll();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    const themeColor = theme === 'dark' ? '#0a0f0d' : '#f5f7f2';

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

  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [gridCols, setGridCols] = useState<number>(3);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [editPrompts, setEditPrompts] = useState<Record<string, string>>({});
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isGalleryExpanded, setIsGalleryExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
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
    if (window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
    setRoutePath('/');
  }, []);

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
    const checkKey = async () => {
      try {
        // @ts-ignore
        if (typeof window !== 'undefined' && window.aistudio?.hasSelectedApiKey) {
          // @ts-ignore
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        } else {
          // Running locally, assume API key is in environment
          setHasApiKey(true);
        }
      } catch (err) {
        console.error('Failed to check API key:', err);
        // Assume true to allow local development
        setHasApiKey(true);
      }
    };
    checkKey();

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
        const minMainWidth = 400;
        const maxAllowedWidth = width - leftPanelWidth - resizeHandles - minMainWidth;

        setRightPanelWidth(prev => {
          const newWidth = Math.max(280, Math.min(prev, maxAllowedWidth));
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
        const minMainWidth = 400;
        const maxAllowed = viewportWidth - leftPanelWidth - resizeHandles - minMainWidth;

        if (rightPanelWidth > maxAllowed) {
          setRightPanelWidth(Math.max(280, maxAllowed));
        }
      }
    };

    enforceMaxWidth();
    window.addEventListener('resize', enforceMaxWidth);
    return () => window.removeEventListener('resize', enforceMaxWidth);
  }, [rightPanelWidth, isMobile, sidebarWidth]);

  const handleKeySelected = () => {
    setHasApiKey(true);
  };

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
      const newWidth = Math.max(280, Math.min(500, e.clientX));
      setSidebarWidth(newWidth);
    }
    if (isResizingRightRef.current) {
      const windowWidth = window.innerWidth;
      const rightWidth = windowWidth - e.clientX;
      const leftPanelWidth = sidebarWidth || 320;
      const resizeHandles = 2;
      const minMainWidth = 400;
      const maxAllowedWidth = windowWidth - leftPanelWidth - resizeHandles - minMainWidth;

      setRightPanelWidth(Math.max(280, Math.min(maxAllowedWidth, rightWidth)));
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
    if (!geminiKey) return;

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
      const providerImages = [...sourceImagesData, ...assetImagesData];

      // 2. Generate image for each variant sequentially
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

            setState(prev => ({
              ...prev,
              generatedImages: prev.generatedImages.map(img =>
                img.id === newId
                  ? { ...img, status: 'success', url: result.imageBase64, groundingMetadata: result.groundingMetadata, recipe }
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
                params: recipe
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

  // ── 3 AI: Generate from 3 providers simultaneously ──────────────────────
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
    setGenerationProgress({ current: 0, total: 3 });

    const AI_PROVIDERS: Array<{ type: AIProviderType; label: string }> = [
      { type: AIProviderType.GEMINI, label: 'Nano Banana Pro' },
      { type: AIProviderType.CHATGPT, label: 'ChatGPT Image Latest' },
      { type: AIProviderType.REPLICATE, label: 'FLUX 2' },
    ];

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
      setToast({ message: '🤖 Generating from 3 AI providers…', type: 'info' });

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
      const providerImages = [...sourceImagesData, ...assetImagesData];

      // Create loading entries for all 3
      const ids = AI_PROVIDERS.map((p, i) => `${Date.now()}-3ai-${i}`);
      setState(prev => ({
        ...prev,
        generatedImages: [
          ...AI_PROVIDERS.map((p, i) => ({
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
              approach: `Generated by ${p.label}`,
              originalPrompt: prompt,
            },
          })),
          ...prev.generatedImages,
        ],
      }));

      // Launch all 3 in parallel
      const promises = AI_PROVIDERS.map(async (p, i) => {
        try {
          const provider = ProviderFactory.getProvider(p.type, providerSettings);
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
          console.error(`[3 AI] ${p.label} failed:`, err);
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

      if (successes === 3) {
        setToast({ message: '✨ All 3 AI providers generated successfully!', type: 'success' });
      } else if (successes > 0) {
        setToast({ message: `⚠️ ${successes}/3 AI providers succeeded.`, type: 'info' });
      } else {
        setToast({ message: '❌ All 3 AI providers failed.', type: 'error' });
      }
    } catch (error: any) {
      console.error('[3 AI] Error:', error);
      setToast({ message: toUserFacingAiError(error, '3 AI běh selhal.'), type: 'error' });
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
    generationLockRef.current = true;
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

    setIsGenerating(true);

    // Respect the selected output count while keeping it within the Mulen Nano UI range.
    const countToGenerate = Math.max(1, Math.min(5, Math.round(state.numberOfImages || 1)));
    setGenerationProgress({ current: 0, total: countToGenerate });
    setToast({ message: `Spouštím generování ${countToGenerate} obrázků…`, type: 'info' });

    // Vytvořit pole s požadovaným počtem obrázků
    const imagesToGenerate = Array.from({ length: countToGenerate }, (_, index) => {
      const newId = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      return {
        id: newId,
        prompt: state.prompt,
        timestamp: Date.now() + index,
        status: 'loading' as const,
        resolution: state.resolution,
        aspectRatio: state.aspectRatio,
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
      const allImages = [...sourceImagesData, ...styleImagesData, ...assetImagesData];

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
              (selectedProvider === AIProviderType.CHATGPT || selectedProvider === AIProviderType.GROK) &&
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


            setState(prev => ({
              ...prev,
              generatedImages: prev.generatedImages.map(img =>
                img.id === imageData.id
                  ? { ...img, status: 'success', url: result.imageBase64, groundingMetadata: result.groundingMetadata, prompt: basePrompt, recipe, lineage }
                  : img
              ),
            }));

            // Automaticky uložit do galerie
            try {
              const thumbnail = await createThumbnail(result.imageBase64);
              await saveToGallery({
                url: result.imageBase64,
                prompt: basePrompt,
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                thumbnail,
                params: recipe,
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
                if (err?.code === 'API_KEY_NOT_FOUND') {
                  setHasApiKey(false);
                }
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

      setIsGenerating(false);
      setGenerationProgress(null);
    };

    await generateInParallel();
    } finally {
      generationLockRef.current = false;
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

    if (generationLockRef.current || isGenerating) {
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

    await processGenerationSnapshot(snapshot);
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
    const loadingImages = createBatchLoadingImages({
      images,
      prompt: state.prompt,
      resolution: state.resolution,
      aspectRatio: state.aspectRatio,
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
                      recipe,
                    }
                    : img
                ),
              }));

              // Save to gallery
              const thumbnail = await createThumbnail(result.imageBase64);
              await saveToGallery({
                url: result.imageBase64,
                prompt: effectivePrompt,
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                thumbnail,
                params: recipe
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

  if (hasApiKey === false) {
    return <ApiKeyModal onKeySelected={handleKeySelected} />;
  }

  const renderSidebarControls = (isMobileView: boolean = false) => (
    <div className="space-y-4">
      {/* 1. Generate Button Section */}
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Action
          </h3>
        </div>
        <div className="flex flex-col gap-2">
          <div className="relative">
            <select
              value={nanoBananaImageModel}
              onChange={(e) => handleNanoBananaModelChange(e.target.value as NanoBananaImageModel)}
              className="w-full h-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 text-[10px] font-semibold tracking-wide text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
              title="Mulen Nano model (Gemini image model)"
            >
              <option value="gemini-3.1-flash-image-preview">Nano Banana 2 (Gemini 3.1 Flash Image Preview)</option>
              <option value="gemini-3-pro-image-preview">Nano Banana Pro (Gemini 3 Pro Image Preview)</option>
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak ${isGenerateClicked
              ? 'bg-blue-600 text-white shadow-blue-500/20'
              : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40'
              } disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none`}
          >
            {isGenerating
              ? queuedGenerationCount > 0
                ? `Generating… + ${queuedGenerationCount} ve frontě`
                : `Generating ${Math.max(1, Math.min(5, Math.round(state.numberOfImages || 1)))}...`
              : state.sourceImages.length > 1 && state.multiRefMode === 'batch'
                ? `Generate (${state.sourceImages.length})`
                : `Generate ${Math.max(1, Math.min(5, Math.round(state.numberOfImages || 1)))}`}
          </button>

          {/* Varianty — same font weight & style as Generate Image */}
          <button
            onClick={handleGenerate3Variants}
            disabled={!canGenerate}
            className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all bg-white/5 hover:bg-white/10 border border-white/8 text-white/80 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
          >
            {isGenerating
              ? queuedGenerationCount > 0
                ? `Varianty + ${queuedGenerationCount} ve frontě`
                : 'Generuji varianty…'
              : 'Varianty'}
          </button>

          {/* 3 AI — generates from Nano Banana Pro, ChatGPT 5.2, FLUX 2 simultaneously */}
          <button
            onClick={handleGenerate3AI}
            disabled={!canGenerate}
            className="w-full py-2 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all bg-gradient-to-r from-[#7ed957]/10 via-purple-500/10 to-blue-500/10 hover:from-[#7ed957]/20 hover:via-purple-500/20 hover:to-blue-500/20 border border-white/8 text-white/75 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
          >
            {isGenerating
              ? queuedGenerationCount > 0
                ? `3 AI + ${queuedGenerationCount} ve frontě`
                : 'Generuji 3 AI…'
              : '3 AI'}
          </button>
        </div>
      </div>

      {/* 2. Image Count (Minimal 1-5) */}
      <div className="space-y-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Počet obrázků
        </h3>
        <div className="flex items-center justify-between bg-transparent pt-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setState(p => ({ ...p, numberOfImages: n }))}
              className={`w-10 h-6 text-xs font-medium transition-all flex items-center justify-center rounded-sm ${state.numberOfImages === n
                ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Prompt Section (Redesigned Header & Compact) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between bg-[var(--bg-panel)] p-1.5 rounded-lg border border-[var(--border-color)]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)] pl-1">
            Zadání (Prompt)
          </span>
          <div className="flex items-center gap-1">
            {/* JSON Context */}
            <label
              htmlFor="json-context-upload"
              className="w-7 h-7 flex items-center justify-center rounded bg-[var(--bg-input)] text-[var(--accent)] border border-[var(--accent)]/30 hover:border-[var(--accent)] transition-all cursor-pointer"
              title={jsonContext ? "Změnit JSON kontext" : "Připojit JSON kontext"}
            >
              <FileJson className="w-3.5 h-3.5" />
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
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30">
                <span className="text-[9px] font-medium text-blue-400 max-w-[80px] truncate">{jsonContext.fileName}</span>
                <button
                  onClick={() => setJsonContext(null)}
                  className="text-blue-400 hover:text-blue-300"
                  title="Odebrat JSON kontext"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Mode Switch (Compact) */}
            <button
              onClick={() => setPromptMode(promptMode === 'simple' ? 'advanced' : 'simple')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-all ${promptMode === 'advanced' ? 'bg-[var(--bg-input)] text-[var(--accent)] border border-[var(--accent)]/30' : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-color)]'}`}
              title={`Režim: ${promptMode === 'simple' ? 'Jednoduchý' : 'Interpretační'}`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
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
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setPromptMode('simple')}
            className={`flex-1 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded transition-all ${promptMode === 'simple'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
              : 'bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              }`}
          >
            Jednoduchý Režim
          </button>
          <button
            onClick={() => setPromptMode('advanced')}
            className={`flex-1 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded transition-all ${promptMode === 'advanced'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
              : 'bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              }`}
          >
            Interpretační Režim
          </button>
        </div>

        <div className="relative">
          <textarea
            ref={isMobileView ? mobilePromptRef : promptRef}
            value={state.prompt}
            onChange={(e) => { setState(p => ({ ...p, prompt: e.target.value })); promptHistory.add(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder={promptMode === 'advanced' ? "Popište obrázek přirozeně. Vyberte variantu níže pro určení stylu interpretace..." : "Volitelné: doplňující prompt (Styl/Merge/Object funguje i bez textu)…"}
            className="w-full min-h-[120px] max-h-[240px] bg-transparent border-0 border-b border-[var(--border-color)] rounded-none p-2 text-[11px] font-medium text-[var(--text-primary)] placeholder-gray-500 focus:border-[var(--accent)] focus:ring-0 outline-none transition-all resize-none custom-scrollbar"
          />
        </div>

        {promptMode === 'simple' && (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[
              { id: 'style' as const, label: 'STYL', subtitle: 'Přenos kompozice', tooltip: 'Přenese kompozici, nasvícení a barvy ze stylu. Obsah/identita zůstává ze vstupního obrázku.' },
              { id: 'merge' as const, label: 'MERGE', subtitle: 'Volné spojení', tooltip: 'Volně spojí oba obrázky (obsah i formu) do jednoho výsledku.' },
              { id: 'object' as const, label: 'OBJECT', subtitle: 'Přenos objektu', tooltip: 'Přenese dominantní objekt/prvek ze stylu do vstupního obrázku (např. dekorativní zeď).' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setSimpleLinkMode((prev) => (prev === m.id ? null : m.id))}
                className={`group relative flex flex-col items-center p-2 rounded-md border transition-all text-center ${simpleLinkMode === m.id
                  ? 'bg-[var(--accent)]/10 border-[var(--accent)] ring-1 ring-[var(--accent)]/50'
                  : 'bg-transparent border-[var(--border-color)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-panel)]/50'
                  }`}
                title={m.tooltip}
              >
                <span className={`text-[9px] font-black uppercase tracking-wider mb-0.5 ${simpleLinkMode === m.id ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                  }`}>
                  {m.label}
                </span>
                <span className="text-[8px] text-[var(--text-secondary)] font-medium">
                  {m.subtitle}
                </span>
              </button>
            ))}
          </div>
        )}

        {promptMode === 'simple' && simpleLinkMode && isGenerating && generationPromptPreview && (
          <div className="mt-2 p-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)]/50">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Použitý prompt
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generationPromptPreview);
                  setToast({ message: 'Prompt zkopírován', type: 'success' });
                }}
                className="px-2 py-1 text-[9px] font-bold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-md transition-all"
              >
                Kopírovat
              </button>
            </div>
            <pre className="text-[10px] text-[var(--text-2)] whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-auto custom-scrollbar">
              {generationPromptPreview}
            </pre>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleEnhancePrompt}
            disabled={!state.prompt.trim() || isEnhancingPrompt}
            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-white/80 hover:text-white rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEnhancingPrompt ? 'Vylepšuji…' : 'Vylepšit prompt'}
          </button>

          <div className="flex-1" />

          <button
            onClick={handleUndoPrompt}
            disabled={!promptHistory.canUndo()}
            className="px-2 py-1 text-[10px] font-bold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-md transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            title="Vrátit zpět"
          >
            ↶
          </button>
          <button
            onClick={handleRedoPrompt}
            disabled={!promptHistory.canRedo()}
            className="px-2 py-1 text-[10px] font-bold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-md transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            title="Znovu"
          >
            ↷
          </button>
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
                  <div className="invisible group-hover:visible absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-[#0a0f0d]/90 backdrop-blur-sm text-white text-[9px] rounded-md shadow-xl z-50 pointer-events-none text-left leading-relaxed">
                    {v.tooltip}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-[#0a0f0d]/90"></div>
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

        {/* Prompt Tools (Compacted) */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => setIsTemplatesModalOpen(true)}
            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-all"
          >
            Šablony
          </button>

          <button
            onClick={() => setIsCollectionsModalOpen(true)}
            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-all"
            title="Kolekce"
          >
            Kolekce
          </button>

          <div className="flex-1" />

        </div>
      </div>

      {/* 5. Input Images (Compacted) */}
      <div className="space-y-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between">
          <span>Vstupní Obrázky</span>
          <span className="text-[9px] text-[var(--text-secondary)]">{state.sourceImages.length}</span>
        </h3>

        {state.sourceImages.length > 1 && (
          <div className="flex p-1 rounded-lg control-surface">
            {([
              { id: 'together', label: 'Sloučit' },
              { id: 'batch', label: 'Varianty' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setState((p) => ({ ...p, multiRefMode: opt.id }))}
                className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all flex-1 ${state.multiRefMode === opt.id
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div
          className={`relative min-h-[80px] border border-dashed rounded-lg transition-all ${dragOverTarget === 'reference' ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-color)] hover:border-[var(--text-secondary)] bg-[var(--bg-panel)]/50'}`}
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
          className={`relative min-h-[60px] border border-dashed rounded-lg transition-all ${dragOverTarget === 'style' ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-color)] hover:border-[var(--text-secondary)] bg-[var(--bg-panel)]/50'}`}
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
                <div key={img.id} className="relative group aspect-square rounded overflow-hidden bg-[var(--bg-card)] border border-[var(--border-color)]">
                  <img src={img.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" alt={`Style ${idx}`} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setState(prev => ({ ...prev, styleImages: prev.styleImages.filter(i => i.id !== img.id) })); }}
                    className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-2.5 h-2.5" />
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
              className="w-full h-1.5 bg-[var(--border-color)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
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
                  className="flex-1 h-1 bg-[var(--border-color)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
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
          className={`relative min-h-[60px] border border-dashed rounded-lg transition-all ${dragOverTarget === 'asset' ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-color)] hover:border-[var(--text-secondary)] bg-[var(--bg-panel)]/50'}`}
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
                <div key={img.id} className="relative group aspect-square rounded overflow-hidden bg-[var(--bg-card)] border border-[var(--border-color)]">
                  <img src={img.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" alt={`Asset ${idx}`} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setState(prev => ({ ...prev, assetImages: prev.assetImages.filter(i => i.id !== img.id) })); }}
                    className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-2.5 h-2.5" />
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
            className="w-full py-2 px-3 text-[9px] font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-all border border-[var(--border-color)]"
          >
            Porovnat obrázky
          </button>
        </div>
      )}
    </div >
  );

  const renderGroundingControl = () => (
    <label className="flex items-center justify-between gap-3 p-2 rounded-md border border-[var(--border-color)] hover:border-[var(--text-secondary)] transition-all">
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)]">Grounding</span>
        <span className="text-[9px] text-[var(--text-secondary)]">Použít Google Search pro zdroje a odkazy</span>
      </div>
      <div className="relative">
        <input
          type="checkbox"
          checked={useGrounding}
          onChange={(e) => setUseGrounding(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-10 h-6 bg-gray-700 rounded-full peer peer-checked:bg-[var(--accent)] transition-colors"></div>
        <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
      </div>
    </label>
  );

  // Show auth bootstrap screen
  if (isAuthBootstrapping) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f0d]">
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
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0f0d] text-white gap-4">
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
              className="px-4 py-2 rounded-lg border border-[#7ed957]/30 hover:border-[#7ed957]/60 text-xs uppercase tracking-wider text-[#a7eb89]"
            >
              Otevřít Supabase Auth
            </a>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg border border-white/20 hover:border-white/40 text-xs uppercase tracking-wider"
          >
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }

  if (isAppUserBootstrapping) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f0d]">
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
      fal: newSettings.fal || defaultProviderSettings.fal,
      a1111: newSettings.a1111,
    };
    setProviderSettings(merged);
    localStorage.setItem(PROVIDER_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    setToast({ message: 'Settings applied for current session.', type: 'success' });
  };

  return (
    <div className="min-h-screen transition-colors duration-300 bg-[var(--bg-main)] text-[var(--text-primary)] font-sans flex">

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
          if (route === 'style-transfer') {
            navigate('/style-transfer');
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
            <FaceSwapScreen
              providerSettings={providerSettings}
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onToast={(t) => setToast(t)}
            />
          ) : isStyleTransferRoute ? (
            <StyleTransferScreen
              providerSettings={providerSettings}
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onBack={() => navigate('/')}
              onToast={(t) => setToast(t)}
              isHoveringGallery={isHoveringGallery}
            />
          ) : isModelInfluenceRoute ? (
            <ModelInfluenceScreen
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onToast={(t) => setToast(t)}
            />
          ) : isAiUpscalerRoute ? (
            <AiUpscalerScreen
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onToast={(t) => setToast(t)}
            />
          ) : isLoraInfluenceRoute ? (
            <FluxLoraGeneratorScreen
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onToast={(t) => setToast(t)}
            />
          ) : (
            <>
              {/* Left Sidebar - Fixed Width (Hidden on Mobile) */}
              <div className="hidden lg:flex w-[340px] shrink-0 border-r border-white/5 bg-[var(--bg-card)] flex-col h-full overflow-y-auto custom-scrollbar z-20">
                <div className="p-6 flex flex-col gap-6 min-h-full">
                  <div className="pt-2">
                    {renderSidebarControls(false)}
                  </div>

                  <div className="mt-auto space-y-4">
                    {renderGroundingControl()}
                    <ProviderSelector
                      selectedProvider={selectedProvider}
                      onChange={handleProviderChange}
                      settings={providerSettings}
                    />
                  </div>
                </div>
              </div>

              {/* Main Content - Flexible Center */}
              <div
                className="flex-1 relative flex flex-col min-w-0 canvas-surface h-full overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out"
                style={{ marginRight: isHoveringGallery && window.innerWidth >= 1024 ? '340px' : '0' }}
              >
                <div className="p-6 lg:p-10 pb-32 w-full">
                  <div className="space-y-6 md:space-y-8 w-full">
                    <header className="hidden lg:flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]"></div>
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
                            className="flex items-center gap-2 px-4 py-2 bg-[#0f1512] text-[#7ed957] font-black text-[9px] uppercase tracking-widest rounded-md border border-gray-800 hover:border-[#7ed957]/50 shadow-sm transition-all active:scale-95"
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
                          <span className="text-sm font-bold text-[#7ed957]">
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
                              className="px-4 py-2 bg-[#7ed957] hover:bg-[#6bc547] text-[#0a0f0d] font-black text-xs uppercase tracking-widest rounded-md transition-all shadow-lg shadow-[#7ed957]/20"
                            >
                              Stáhnout ({selectedGeneratedImages.size})
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Main Generation Grid */}
                    {state.generatedImages.length === 0 ? (
                      <div className="py-20 md:py-40 flex flex-col items-center justify-center space-y-6">
                        {/* Dot Matrix Sphere SVG */}
                        <div className="opacity-80" style={{ animation: 'spin-slow 20s linear infinite' }}>
                          <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <style>{`
                        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                      `}</style>
                            {/* Center - Highlight */}
                            <circle cx="50" cy="50" r="2.5" fill="currentColor" className="text-white" />

                            {/* Inner Ring - Light Gray */}
                            <circle cx="50" cy="40" r="2.2" fill="currentColor" className="text-gray-300" />
                            <circle cx="58" cy="44" r="2.2" fill="currentColor" className="text-gray-300" />
                            <circle cx="60" cy="50" r="2.2" fill="currentColor" className="text-gray-300" />
                            <circle cx="58" cy="56" r="2.2" fill="currentColor" className="text-gray-300" />
                            <circle cx="50" cy="60" r="2.2" fill="currentColor" className="text-gray-300" />
                            <circle cx="42" cy="56" r="2.2" fill="currentColor" className="text-gray-300" />
                            <circle cx="40" cy="50" r="2.2" fill="currentColor" className="text-gray-300" />
                            <circle cx="42" cy="44" r="2.2" fill="currentColor" className="text-gray-300" />

                            {/* Middle Ring - Mid Gray */}
                            <circle cx="50" cy="30" r="2" fill="currentColor" className="text-gray-500" />
                            <circle cx="64" cy="36" r="2" fill="currentColor" className="text-gray-500" />
                            <circle cx="70" cy="50" r="2" fill="currentColor" className="text-gray-500" />
                            <circle cx="64" cy="64" r="2" fill="currentColor" className="text-gray-500" />
                            <circle cx="50" cy="70" r="2" fill="currentColor" className="text-gray-500" />
                            <circle cx="36" cy="64" r="2" fill="currentColor" className="text-gray-500" />
                            <circle cx="30" cy="50" r="2" fill="currentColor" className="text-gray-500" />
                            <circle cx="36" cy="36" r="2" fill="currentColor" className="text-gray-500" />

                            {/* Outer Ring - Dark Gray/Fading */}
                            <circle cx="50" cy="20" r="1.5" fill="currentColor" className="text-gray-700" />
                            <circle cx="70" cy="28" r="1.5" fill="currentColor" className="text-gray-700" />
                            <circle cx="80" cy="50" r="1.5" fill="currentColor" className="text-gray-700" />
                            <circle cx="70" cy="72" r="1.5" fill="currentColor" className="text-gray-700" />
                            <circle cx="50" cy="80" r="1.5" fill="currentColor" className="text-gray-700" />
                            <circle cx="30" cy="72" r="1.5" fill="currentColor" className="text-gray-700" />
                            <circle cx="20" cy="50" r="1.5" fill="currentColor" className="text-gray-700" />
                            <circle cx="30" cy="28" r="1.5" fill="currentColor" className="text-gray-700" />
                          </svg>
                        </div>
                        <div className="text-center space-y-1.5">
                          <span className="text-[10px] font-[900] uppercase tracking-[0.28em] text-gray-400 block">
                            Zatím žádné vygenerované obrázky
                          </span>
                          <p className="text-[9px] font-medium text-gray-600">
                            Zadejte prompt v postranním panelu (vlevo) a začněte tvořit
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-min">
                        {state.generatedImages.map((image) => (
                          <article
                            key={image.id}
                            className="group flex flex-col overflow-hidden card-surface card-surface-hover transition-all animate-fadeIn"
                            onContextMenu={(e) => image.status === 'success' && handleImageContextMenu(e, image.id)}
                          >
                            <div
                              className="relative bg-black/50 cursor-zoom-in aspect-square overflow-hidden"
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
                                        className="absolute inset-y-0 left-0 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]"
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
                                      <span className="text-[10px] text-[#7ed957] font-bold tracking-widest uppercase animate-pulse">Generuji...</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                image.url && (
                                  <img
                                    src={image.url}
                                    className={`w-full h-full object-contain bg-black/30 ${image.isEditing ? 'blur-sm scale-105' : ''} transition-all duration-500`}
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
                            < div className="px-4 py-3 flex flex-col gap-2 border-t border-white/5 bg-transparent" >
                              {/* Prompt + Actions Row */}
                              < div className="flex items-center gap-2" >
                                <p className="text-[9px] font-medium text-white/75 leading-snug line-clamp-1 flex-1" title={image.prompt}>
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
                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded transition-colors"
                                    title="Kopírovat prompt"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                  </button>

                                  {/* Repopulate */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRepopulate(image); }}
                                    className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
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
                                      className="p-1.5 text-gray-500 hover:text-[#7ed957] hover:bg-[#7ed957]/10 rounded transition-colors"
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
                                      setToast({ message: 'Obrázek smazán', type: 'success' });
                                    }}
                                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
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
                                    <span className="text-[9px] text-gray-500 px-2 py-0.5">
                                      +{image.groundingMetadata.length - 3} více
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Inline Edit Section */}
                            {image.status === 'success' && image.url && (
                              <div className="px-4 py-3 border-t border-gray-800/50 bg-[#0a0f0d]/30 space-y-2.5">
                                {/* Header Row */}
                                <div className="flex items-center justify-between px-1">
                                  <div className="flex items-center gap-1.5">
                                    <svg className="w-3 h-3 text-[#7ed957]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">
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
                                        className="px-2 py-1 text-[8px] font-bold uppercase tracking-wider rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
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
                                        className="px-2 py-1 text-[8px] font-bold uppercase tracking-wider rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
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
                                        ? 'bg-[#7ed957] text-[#0a0f0d] border border-[#7ed957]'
                                        : 'bg-[#0f1512] text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700'
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
                                  className="w-full min-h-[80px] bg-[#0f1512] border border-gray-800 hover:border-gray-700 focus:border-[#7ed957] rounded-md p-2 text-xs text-gray-200 placeholder-gray-600 focus:ring-0 outline-none transition-all resize-none custom-scrollbar"
                                />

                                {/* Inline Reference Images (Conditional) */}
                                {showReferenceUpload[image.id] && (
                                  <div className="grid grid-cols-4 gap-1 p-2 bg-[#0a0f0d] border border-gray-800 rounded-md">
                                    {(inlineEditStates[image.id]?.referenceImages || []).map((img, idx) => (
                                      <div key={idx} className="relative group aspect-square rounded overflow-hidden bg-gray-900 border border-gray-800">
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
                                    <label className="flex items-center justify-center aspect-square rounded border border-dashed border-gray-700 hover:border-gray-600 hover:bg-gray-900/50 cursor-pointer transition-colors">
                                      <span className="text-gray-500">+</span>
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
                    )}
                  </div>
                </div>
              </div >
            </>
          )}

          {/* Right Sidebar - Sliding Library */}
          {!isGalleryExpanded && (
            < div
              className={`absolute right-0 top-0 bottom-0 z-50 w-[85vw] sm:w-[340px] transition-transform duration-300 ease-in-out border-l border-white/5 bg-[var(--bg-card)] flex flex-col h-full shadow-2xl group ${isHoveringGallery ? 'translate-x-0' : 'translate-x-[calc(100%-20px)]'}`}
              onMouseEnter={() => setIsHoveringGallery(true)}
              onMouseLeave={() => setIsHoveringGallery(false)}
            >
              <div className={`p-4 border-b border-gray-800/50 bg-[#0f1512] flex items-center justify-between transition-opacity duration-300 delay-100 ${isHoveringGallery ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-[#7ed957] rounded-full"></div>
                  <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Knihovna Obrázků</h2>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsGalleryExpanded(true);
                  }}
                  className="p-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-md transition-all"
                  title="Rozbalit"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 012-2h2M20 8V6a2 2 0 00-2-2h-2M4 16v2a2 2 0 002 2h2M20 16v2a2 2 0 01-2 2h-2" />
                  </svg>
                </button>
              </div>
              <div className={`flex-1 overflow-y-auto p-4 custom-scrollbar transition-opacity duration-300 delay-100 ${isHoveringGallery ? 'opacity-100' : 'opacity-0'}`}>
                <ImageGalleryPanel
                  ref={galleryPanelRef}
                  onDragStart={(imageData, type) => {
                    console.log('[Drag] Started from gallery', { type });
                  }}
                  onBatchProcess={handleBatchProcess}
                  view="sidebar"
                />
              </div>
              {/* Handle indicator - Increased width for better hit target */}
              <div className="absolute left-0 top-0 bottom-0 w-[20px] bg-transparent cursor-pointer flex items-center justify-center transition-opacity" style={{ opacity: isHoveringGallery ? 0 : 1 }}>
                <div className="w-1 h-8 bg-gray-700/50 rounded-full"></div>
              </div>
            </div >
          )}

          {isGalleryExpanded && (
            <div
              className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
              onClick={() => setIsGalleryExpanded(false)}
            >
              <div
                className="absolute inset-4 sm:inset-6 bg-[var(--bg-card)] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-white/10 bg-[#0f1512] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-[#7ed957] rounded-full"></div>
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Knihovna Obrázků</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGalleryExpanded(false)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-md transition-all text-[10px] font-bold uppercase tracking-widest"
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

        <ImageComparisonModal
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
          generatedImage={selectedImage?.url || null}
          originalImage={state.sourceImages[0]?.url || null}
          prompt={selectedImage?.prompt || ''}
          timestamp={selectedImage?.timestamp || 0}
          resolution={selectedImage?.resolution}
          aspectRatio={selectedImage?.aspectRatio}
          groundingMetadata={selectedImage?.groundingMetadata}
          onNext={handleNextImage}
          onPrev={handlePrevImage}
          hasNext={selectedImage ? state.generatedImages.findIndex(img => img.id === selectedImage.id) < state.generatedImages.length - 1 : false}
          hasPrev={selectedImage ? state.generatedImages.findIndex(img => img.id === selectedImage.id) > 0 : false}
          recipe={selectedImage?.recipe}
          lineage={selectedImage?.lineage}
          versions={selectedImage?.versions}
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
