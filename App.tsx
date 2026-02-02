import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './src/index.css'; // ENFORCE NEW STYLES
import { Sun, Moon, Upload, X, FileJson, ArrowLeftRight, Folder, Sparkles } from 'lucide-react'; // Added icons for design
import { ImageUpload } from './components/ImageUpload';
import { LoadingSpinner } from './components/LoadingSpinner';
import { analyzeImageForJsonWithAI, enhancePromptWithAI } from './services/geminiService';
import { AppState, GeneratedImage, GenerationRecipe, SourceImage } from './types';
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
import { PinAuth } from './components/PinAuth';
import { SettingsModal } from './components/SettingsModal';
import { ProviderSelector } from './components/ProviderSelector';
import { AIProviderType, ProviderSettings } from './services/aiProvider';
import { ProviderFactory } from './services/providerFactory';
import { SettingsDatabase } from './utils/imageDatabase';
import { Toast, ToastType } from './components/Toast';
import { applyAdvancedInterpretation } from './utils/promptInterpretation';
import { runSupabaseSmokeTests } from './utils/smokeTests';
import { StyleTransferScreen } from './components/StyleTransferScreen';

const ASPECT_RATIOS = ['Original', '1:1', '2:3', '3:2', '3:4', '4:3', '5:4', '4:5', '9:16', '16:9', '21:9'];
const RESOLUTIONS = [
  { value: '1K', label: '1K (~1024px)' },
  { value: '2K', label: '2K (~2048px)' },
  { value: '4K', label: '4K (~4096px)' }
];
const MAX_IMAGES = 14;

const App: React.FC = () => {
  // PIN Autentizace state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  // Theme state
  // Theme state - Enforced Dark Mode (v2)
  const isDark = true;


  // AI Provider state
  const [selectedProvider, setSelectedProvider] = useState<AIProviderType>(AIProviderType.GEMINI);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>({
    [AIProviderType.GEMINI]: { apiKey: process.env.API_KEY || '', enabled: true },
    [AIProviderType.REPLICATE]: { apiKey: '', enabled: false }
  });
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

  // Refs
  const galleryPanelRef = useRef<any>(null);
  const [analyzingImageId, setAnalyzingImageId] = useState<string | null>(null);

  // Load provider settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('providerSettings');
    if (savedSettings) {
      setProviderSettings(JSON.parse(savedSettings));
    }
    const savedProvider = localStorage.getItem('selectedProvider');
    if (savedProvider && Object.values(AIProviderType).includes(savedProvider as AIProviderType)) {
      setSelectedProvider(savedProvider as AIProviderType);
    }
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
    generatedImages: [],
    prompt: '',
    aspectRatio: 'Original',
    resolution: '1K', // Default to 1K
    error: null,
    numberOfImages: 1, // Default to 1 image only
  });

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
  const [dragOverTarget, setDragOverTarget] = useState<'reference' | 'style' | null>(null);

  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const navigate = useCallback((to: string) => {
    if (window.location.pathname === to) return;
    window.history.pushState({}, '', to);
    setRoutePath(to);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onPop = () => setRoutePath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const isStyleTransferRoute = routePath === '/style-transfer' || routePath.startsWith('/style-transfer/');

  // Nové state pro featury
  const [isCollectionsModalOpen, setIsCollectionsModalOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isRemixModalOpen, setIsRemixModalOpen] = useState(false);
  const [promptHistory] = useState(() => new PromptHistory());
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

  const isResizingRef = useRef(false);
  const isResizingRightRef = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const mobilePromptRef = useRef<HTMLTextAreaElement>(null);

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
    const remainingSlots = MAX_IMAGES - state.sourceImages.length;
    if (remainingSlots <= 0) return;

    files.slice(0, remainingSlots).forEach(file => {
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
    const remainingSlots = MAX_IMAGES - state.styleImages.length;
    if (remainingSlots <= 0) return;

    files.slice(0, remainingSlots).forEach(file => {
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
        console.log('[Drop Reference] Got JSON data:', jsonData);
        imageData = JSON.parse(jsonData);
      } else {
        const files = Array.from(e.dataTransfer.files as FileList).filter((f) => f.type.startsWith('image/'));
        if (files.length > 0) {
          const file = files[0];
          const url = URL.createObjectURL(file);
          console.log('[Drop Reference] Got file drop:', file.name);
          imageData = { url, fileName: file.name, fileType: file.type };
        } else {
          const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
          console.log('[Drop Reference] Got text url:', url);
          if (url) {
            imageData = {
              url: url,
              fileName: 'dropped-image.jpg',
              fileType: 'image/jpeg'
            };
          }
        }
      }

      if (!imageData || !imageData.url) {
        console.warn('[Drop Reference] No valid image data found');
        return;
      }

      const { url, fileName, fileType, prompt } = imageData;

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

        if (typeof url === 'string' && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }

        const newImage: SourceImage = {
          id: Math.random().toString(36).substr(2, 9),
          url: url,
          file: file,
          prompt: prompt // Uložit prompt pokud existuje
        };

        setState(prev => ({
          ...prev,
          sourceImages: [...prev.sourceImages, newImage],
          error: null,
        }));

        console.log('[Drop Reference] Image added successfully', prompt ? `with prompt: ${prompt}` : 'without prompt');
      } catch (fetchError) {
        console.error('[Drop Reference] Failed to fetch image, using URL directly:', fetchError);
        if (typeof url === 'string' && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
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
  }, [state.sourceImages]);

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
        console.log('[Drop Style] Got JSON data:', jsonData);
        imageData = JSON.parse(jsonData);
      } else {
        const files = Array.from(e.dataTransfer.files as FileList).filter((f) => f.type.startsWith('image/'));
        if (files.length > 0) {
          const file = files[0];
          const url = URL.createObjectURL(file);
          console.log('[Drop Style] Got file drop:', file.name);
          imageData = { url, fileName: file.name, fileType: file.type };
        } else {
          const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
          console.log('[Drop Style] Got text url:', url);
          if (url) {
            imageData = {
              url: url,
              fileName: 'dropped-image.jpg',
              fileType: 'image/jpeg'
            };
          }
        }
      }

      if (!imageData || !imageData.url) {
        console.warn('[Drop Style] No valid image data found');
        return;
      }

      const { url, fileName, fileType } = imageData;

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

        if (typeof url === 'string' && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }

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

        console.log('[Drop Style] Image added successfully');
      } catch (fetchError) {
        console.error('[Drop Style] Failed to fetch image, using URL directly:', fetchError);
        if (typeof url === 'string' && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
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
  }, [state.styleImages]);

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
        setState(prev => ({ ...prev, prompt: enhanced }));
        promptHistory.add(enhanced);
        setToast({ message: '✨ Prompt vylepšen', type: 'success' });
      }
    } catch (error: any) {
      console.error('[Enhance Prompt] Error:', error);
      const errorMessage = error.message?.includes('API Key')
        ? 'Chybí API klíč - nastavte ho v nastavení'
        : 'Chyba při vylepšování promptu';
      setToast({ message: errorMessage, type: 'error' });
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
      setState(prev => ({ ...prev, prompt: formatted }));
      promptHistory.add(formatted);
      setToast({ message: '✨ Prompt byl extrahován z obrázku', type: 'success' });
    } catch (error: any) {
      console.error('[Extract Prompt] Error:', error);
      setToast({ message: error?.message?.includes('API Key') ? 'Chybí API klíč - nastavte ho v nastavení' : 'Extrahování promptu selhalo', type: 'error' });
    } finally {
      setAnalyzingImageId(null);
    }
  };

  const applyRecipe = (recipe: GenerationRecipe, autoGenerate: boolean) => {
    setPromptMode(recipe.promptMode || 'simple');
    if (recipe.advancedVariant) {
      setAdvancedVariant(recipe.advancedVariant);
    }
    setFaceIdentityMode(!!recipe.faceIdentityMode);
    setUseGrounding(!!recipe.useGrounding);
    if (recipe.provider && Object.values(AIProviderType).includes(recipe.provider as any)) {
      setSelectedProvider(recipe.provider as AIProviderType);
    }

    setJsonContext(null);
    setState(prev => ({
      ...prev,
      prompt: recipe.prompt ?? prev.prompt,
      aspectRatio: recipe.aspectRatio || prev.aspectRatio,
      resolution: recipe.resolution || prev.resolution,
      shouldAutoGenerate: autoGenerate,
    }));

    if (isMobile) {
      setIsMobileMenuOpen(true);
    }
  };

  const handleUndoPrompt = () => {
    const previous = promptHistory.undo();
    if (previous !== null) {
      setState(prev => ({ ...prev, prompt: previous }));
    }
  };

  const handleRedoPrompt = () => {
    const next = promptHistory.redo();
    if (next !== null) {
      setState(prev => ({ ...prev, prompt: next }));
    }
  };

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
  const handleGenerate3Variants = async () => {
    if (!state.prompt.trim() || isGenerating) return;

    setIsMobileMenuOpen(false);
    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: 3 });

    try {
      // 1. Generate 3 prompt variants using AI
      const provider = ProviderFactory.getProvider(AIProviderType.GEMINI, providerSettings);

      console.log('[3 Variants] Generating variants for prompt:', state.prompt);
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
            const recipe: GenerationRecipe = {
              provider: AIProviderType.GEMINI,
              operation: 'variant',
              prompt: variant.prompt,
              effectivePrompt: variant.prompt,
              useGrounding,
              promptMode,
              advancedVariant: promptMode === 'advanced' ? advancedVariant : undefined,
              faceIdentityMode,
              jsonContextFileName: jsonContext?.fileName,
              resolution: state.resolution,
              aspectRatio: state.aspectRatio,
              sourceImageCount: state.sourceImages.length,
              styleImageCount: state.styleImages.length,
              createdAt: Date.now(),
            };

            const result = await provider.generateImage(
              sourceImagesData,
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
              setToast({ message: `⚠️ Varianta ${i + 1} se nepodařila uložit do galerie`, type: 'error' });
            }

            // Track API usage
            ApiUsageTracker.trackImageGeneration(state.resolution, 1);

            setGenerationProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
            success = true;
          } catch (err: any) {
            const is429 = err.message?.includes('429') ||
              err.message?.includes('TooManyRequests') ||
              err.message?.includes('RESOURCE_EXHAUSTED');

            if (is429 && retryCount < maxRetries) {
              retryCount++;
              const waitTime = 5000 * Math.pow(2, retryCount - 1);
              console.log(`[3 Variants] Rate limit for variant ${i + 1}, waiting ${waitTime / 1000}s (retry ${retryCount}/${maxRetries})`);
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
      setToast({ message: `Failed to generate variants: ${error.message}`, type: 'error' });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
      setGenerationPromptPreview(null);
    }
  };


  const handleGenerate = async () => {
    setIsMobileMenuOpen(false);
    setGenerationPromptPreview(null);

    // Auto-detect batch processing: if multiple reference images, use batch mode
    if (state.sourceImages.length > 1) {
      console.log(`[Auto-Batch] Detected ${state.sourceImages.length} reference images, using batch processing`);
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
        setToast({ message: 'Vyberte Styl / Merge / Object (a přidejte referenční + stylový obrázek) nebo napište prompt', type: 'error' });
        return;
      }
      if (!!simpleLinkMode && (state.sourceImages.length === 0 || state.styleImages.length === 0)) {
        setToast({ message: 'Pro Styl / Merge / Object přidejte aspoň 1 referenční a 1 stylový obrázek', type: 'error' });
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

    // Force 1 image if somehow set otherwise, to prevent double generation issues
    const countToGenerate = 1;
    setGenerationProgress({ current: 0, total: countToGenerate });

    // Vytvořit pole s požadovaným počtem obrázků
    const imagesToGenerate = Array.from({ length: countToGenerate }, (_, index) => {
      const newId = `${Date.now()}-${index}`;
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
      const limitedImages = newImages.length > MAX_IMAGES ? newImages.slice(0, MAX_IMAGES) : newImages;
      return {
        ...prev,
        generatedImages: limitedImages,
      };
    });

    // Generovat obrázky sekvenčně s malým zpožděním mezi požadavky
    // aby nedošlo k rate limitingu API
    const generateSequentially = async () => {
      for (let i = 0; i < imagesToGenerate.length; i++) {
        const imageData = imagesToGenerate[i];

        // Přidat zpoždění mezi požadavky (kromě prvního)
        // Pro Nano Banana Pro používáme 5s pauzu kvůli striktnímu rate limitingu
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Retry logika pro 429 errory s exponential backoff
        let retryCount = 0;
        const maxRetries = 3;
        let success = false;

        while (retryCount <= maxRetries && !success) {
          try {
            // Sestavit pole obrázků - referenční první, pak stylové
            // Konvertovat všechny URL na base64 data URL pro Gemini API
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
            const allImages = [...sourceImagesData, ...styleImagesData];

            const buildSimpleLinkPrompt = (
              mode: 'style' | 'merge' | 'object',
              extra: string,
              referenceImageCount: number,
              styleImageCount: number
            ) => {
              const header = `
[LINK MODE: ${mode.toUpperCase()}]
Images order: first ${referenceImageCount} reference image(s), then ${styleImageCount} style image(s).
`;

              if (mode === 'style') {
                return `${header}
Apply the visual style, composition, lighting, color grading, lens feel, and overall mood from the style image(s) to the reference image(s), while preserving the identity and content of the reference subject(s). Do NOT transfer objects/content from style; transfer only aesthetic and photographic/artistic treatment.

${extra ? `Additional instructions:
${extra}
` : ''}`.trim();
              }

              if (mode === 'merge') {
                return `${header}
Create a cohesive merge of reference and style images. You may blend both aesthetic and content elements to produce a unified result that feels intentional, natural, and high quality.

${extra ? `Additional instructions:
${extra}
` : ''}`.trim();
              }

              return `${header}
Transfer the dominant object/element from the style image(s) onto the reference image(s) in a realistic way. Keep the reference scene intact and place/replace the matching region with the style object (e.g., decorative wall), with correct perspective, lighting, scale, and shadows.

${extra ? `Additional instructions:
${extra}
` : ''}`.trim();
            };

            // Handle Advanced Mode: Serialize JSON data first
            let basePrompt = state.prompt;

            let extraPrompt = basePrompt;

            // Pokud není vyplněn hlavní prompt, použij prompt z prvního referenčního obrázku
            if (!extraPrompt.trim() && state.sourceImages.length > 0) {
              const imageWithPrompt = state.sourceImages.find(img => img.prompt);
              if (imageWithPrompt?.prompt) {
                extraPrompt = imageWithPrompt.prompt;
                console.log('[Generation] Using prompt from reference image:', extraPrompt);
              }
            }

            if (promptMode === 'simple' && simpleLinkMode) {
              basePrompt = buildSimpleLinkPrompt(simpleLinkMode, extraPrompt, state.sourceImages.length, state.styleImages.length);
              setGenerationPromptPreview(basePrompt);
            } else {
              basePrompt = extraPrompt;
            }

            // Append JSON context if present (High Priority Context)
            if (jsonContext) {
              basePrompt += `\n\n[DODATEČNÝ KONTEXT Z JSON SOUBORU (${jsonContext.fileName})]\n`;
              basePrompt += JSON.stringify(jsonContext.content, null, 2);
              basePrompt += `\n\n[INSTRUKCE K JSONU: Použij tato data jako dodatečný kontext, parametry nebo nastavení pro generování obrazu. Mají vysokou prioritu.]`;
              console.log('[Generation] Appended JSON context to prompt');
            }

            // Apply Interpretive Mode Logic
            if (promptMode === 'advanced') {
              basePrompt = applyAdvancedInterpretation(basePrompt, advancedVariant, faceIdentityMode);
              console.log('[Interpretive Mode] Applied variant:', advancedVariant);
            } else if (faceIdentityMode) {
              // Apply face identity preservation with creative variation
              basePrompt = applyAdvancedInterpretation(basePrompt, 'C', true);
              // Add explicit instruction to maximize variation
              basePrompt += `\n\n[VARIATION REQUIREMENT: Create a unique and visually distinct interpretation. Vary pose, angle, clothing, environment, lighting, mood, and context significantly. Make each image tell a different story while keeping the same recognizable face.]`;
              console.log('[Face Identity Mode] Applied identity preservation with variation requirement');
            }

            // Vytvořit prompt s informací o stylu, pokud jsou stylové obrázky
            let enhancedPrompt = basePrompt;
            if (state.styleImages.length > 0) {
              const styleImageCount = state.styleImages.length;
              const referenceImageCount = state.sourceImages.length;
              enhancedPrompt = `${basePrompt}\n\n[Technická instrukce: První ${referenceImageCount} obrázek${referenceImageCount > 1 ? 'y' : ''} ${referenceImageCount > 1 ? 'jsou' : 'je'} referenční obsah k úpravě. Následující ${styleImageCount} obrázek${styleImageCount > 1 ? 'y' : ''} ${styleImageCount > 1 ? 'jsou' : 'je'} stylová reference - použij jejich vizuální styl, estetiku a umělecký přístup pro úpravu referenčního obsahu.]`;
            }



            const recipe: GenerationRecipe = {
              provider: selectedProvider,
              operation: 'generate',
              prompt: basePrompt,
              effectivePrompt: enhancedPrompt,
              useGrounding,
              promptMode,
              advancedVariant: promptMode === 'advanced' ? advancedVariant : undefined,
              faceIdentityMode,
              jsonContextFileName: jsonContext?.fileName,
              resolution: state.resolution,
              aspectRatio: state.aspectRatio,
              sourceImageCount: state.sourceImages.length,
              styleImageCount: state.styleImages.length,
              createdAt: Date.now(),
            };

            // Get selected AI provider
            const provider = ProviderFactory.getProvider(selectedProvider, providerSettings);

            // Image generation
            const result = await provider.generateImage(
              allImages,
              enhancedPrompt,
              state.resolution,
              state.aspectRatio,
              useGrounding
            );


            setState(prev => ({
              ...prev,
              generatedImages: prev.generatedImages.map(img =>
                img.id === imageData.id
                  ? { ...img, status: 'success', url: result.imageBase64, groundingMetadata: result.groundingMetadata, prompt: basePrompt, recipe }
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
              setToast({ message: `⚠️ Obrázek se nepodařilo uložit do galerie: ${err instanceof Error ? err.message : 'Neznámá chyba'}`, type: 'error' });
            }

            // Trackovat API usage
            ApiUsageTracker.trackImageGeneration(state.resolution, 1);

            // Aktualizovat progress
            setGenerationProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);

            success = true; // Úspěch, pokračuj na další obrázek
          } catch (err: any) {
            const is429 = err.message?.includes('429') ||
              err.message?.includes('TooManyRequests') ||
              err.message?.includes('RESOURCE_EXHAUSTED') ||
              err.message?.includes('Request blocked');

            if (is429 && retryCount < maxRetries) {
              retryCount++;
              // Exponential backoff: 5s, 10s, 20s
              const waitTime = 5000 * Math.pow(2, retryCount - 1);
              console.log(`Rate limit hit for image ${i + 1}, waiting ${waitTime / 1000}s before retry ${retryCount}/${maxRetries}`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
              // Finální chyba - buď příliš mnoho pokusů nebo jiný typ chyby
              if (err.message === "API_KEY_NOT_FOUND") {
                setHasApiKey(false);
              }
              setState(prev => ({
                ...prev,
                generatedImages: prev.generatedImages.map(img =>
                  img.id === imageData.id ? { ...img, status: 'error', error: err instanceof Error ? err.message : 'Generation failed' } : img
                ),
              }));
              break; // Přeruš retry loop
            }
          }
        }
      }
      setIsGenerating(false);
      setGenerationProgress(null);
    };

    generateSequentially();
  };

  const handleRepopulate = (image: GeneratedImage) => {
    if (image.recipe) {
      applyRecipe(image.recipe, true);
      return;
    }

    setState(prev => ({
      ...prev,
      prompt: image.prompt,
      aspectRatio: image.aspectRatio || 'Original',
      resolution: image.resolution || '2K',
      shouldAutoGenerate: true,
    }));
    if (isMobile) {
      setIsMobileMenuOpen(true);
    }
  };

  const handleRepopulateFromGallery = (image: GalleryImage) => {
    const recipe = image.params as GenerationRecipe | undefined;
    if (recipe) {
      applyRecipe(recipe, true);
      return;
    }

    setState(prev => ({
      ...prev,
      prompt: image.prompt,
      aspectRatio: image.aspectRatio || 'Original',
      resolution: image.resolution || '2K',
      shouldAutoGenerate: true,
    }));
    if (isMobile) {
      setIsMobileMenuOpen(true);
    }
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

      console.log('[Edit] Sending request to Gemini...', { prompt: editPrompt, imageCount: sourceImages.length });

      const provider = ProviderFactory.getProvider(AIProviderType.GEMINI, providerSettings);
      const recipe: GenerationRecipe = {
        provider: AIProviderType.GEMINI,
        operation: 'edit',
        prompt: editPrompt,
        effectivePrompt: editPrompt,
        useGrounding,
        promptMode,
        advancedVariant: promptMode === 'advanced' ? advancedVariant : undefined,
        faceIdentityMode,
        resolution: image.resolution,
        aspectRatio: image.aspectRatio,
        sourceImageCount: sourceImages.length,
        styleImageCount: 0,
        createdAt: Date.now(),
      };
      const result = await provider.generateImage(sourceImages, editPrompt, image.resolution, image.aspectRatio, useGrounding);

      console.log('[Edit] Success! updating gallery...');

      // Uložit starou verzi a aktualizovat obrázek
      setState(prev => ({
        ...prev,
        generatedImages: prev.generatedImages.map(img => {
          if (img.id === imageId) {
            // Save current version to history
            const newVersions = [
              ...(img.versions || []),
              { url: img.url!, prompt: img.prompt, timestamp: img.timestamp }
            ];

            // After new edit, set currentVersionIndex to the latest (newest) version
            // This makes undo available but clears redo history
            return {
              ...img,
              url: result.imageBase64,
              prompt: editPrompt,
              timestamp: Date.now(),
              versions: newVersions,
              currentVersionIndex: newVersions.length, // Point to the new current version (after all history)
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
      setToast({
        message: `Chyba při úpravě: ${err instanceof Error ? err.message : 'Neznámá chyba'}`,
        type: 'error'
      });

      setState(prev => ({
        ...prev,
        generatedImages: prev.generatedImages.map(img =>
          img.id === imageId ? { ...img, isEditing: false, error: err instanceof Error ? err.message : 'Edit failed' } : img
        ),
      }));
    }
  };
  // Batch processing handler
  const handleBatchProcess = async (images: any[]) => {
    console.log('[Batch] Starting batch process with', images.length, 'images');
    console.log('[Batch] Prompt:', state.prompt);

    const canRunFixedSimpleBatch =
      promptMode === 'simple' &&
      !!simpleLinkMode &&
      state.styleImages.length > 0;

    if (!state.prompt.trim() && !canRunFixedSimpleBatch) {
      console.error('[Batch] No prompt provided');
      setToast({ message: 'Vyplňte prompt pro batch zpracování, nebo vyberte Styl/Merge/Object + stylový obrázek', type: 'error' });
      return;
    }

    const PARALLEL_BATCH_SIZE = 5;
    const chunks: any[][] = [];
    for (let i = 0; i < images.length; i += PARALLEL_BATCH_SIZE) {
      chunks.push(images.slice(i, i + PARALLEL_BATCH_SIZE));
    }

    // Create loading placeholders for all images
    const loadingImages = images.map((_, index) => ({
      id: `batch_${Date.now()}_${index}`,
      prompt: state.prompt,
      timestamp: Date.now() + index,
      status: 'loading' as const,
      resolution: state.resolution,
      aspectRatio: state.aspectRatio,
    }));

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

    const buildSimpleLinkPrompt = (
      mode: 'style' | 'merge' | 'object',
      extra: string,
      referenceImageCount: number,
      styleImageCount: number
    ) => {
      const header = `
[LINK MODE: ${mode.toUpperCase()}]
Images order: first ${referenceImageCount} reference image(s), then ${styleImageCount} style image(s).
`;

      if (mode === 'style') {
        return `${header}
Apply the visual style, composition, lighting, color grading, lens feel, and overall mood from the style image(s) to the reference image(s), while preserving the identity and content of the reference subject(s). Do NOT transfer objects/content from style; transfer only aesthetic and photographic/artistic treatment.

${extra ? `Additional instructions:
${extra}
` : ''}`.trim();
      }

      if (mode === 'merge') {
        return `${header}
Create a cohesive merge of reference and style images. You may blend both aesthetic and content elements to produce a unified result that feels intentional, natural, and high quality.

${extra ? `Additional instructions:
${extra}
` : ''}`.trim();
      }

      return `${header}
Transfer the dominant object/element from the style image(s) onto the reference image(s) in a realistic way. Keep the reference scene intact and place/replace the matching region with the style object (e.g., decorative wall), with correct perspective, lighting, scale, and shadows.

${extra ? `Additional instructions:
${extra}
` : ''}`.trim();
    };

    try {
      const styleImagesData = canRunFixedSimpleBatch
        ? await Promise.all(
          state.styleImages.map(async (img) => ({
            data: await urlToDataUrl(img.url),
            mimeType: img.file.type,
          }))
        )
        : [];

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];

        setBatchProgress(prev => prev ? {
          ...prev,
          currentChunk: chunkIndex + 1
        } : null);

        // Generate chunk in parallel
        const results = await Promise.all(
          chunk.map(async (image, indexInChunk) => {
            const globalIndex = chunkIndex * PARALLEL_BATCH_SIZE + indexInChunk;
            const loadingId = loadingImages[globalIndex].id;

            try {
              const effectivePrompt =
                promptMode === 'simple' && simpleLinkMode && styleImagesData.length > 0
                  ? buildSimpleLinkPrompt(simpleLinkMode, state.prompt.trim(), 1, styleImagesData.length)
                  : state.prompt;

              const recipe: GenerationRecipe = {
                provider: selectedProvider,
                operation: 'batch',
                prompt: state.prompt,
                effectivePrompt,
                useGrounding,
                promptMode,
                advancedVariant: promptMode === 'advanced' ? advancedVariant : undefined,
                faceIdentityMode,
                jsonContextFileName: jsonContext?.fileName,
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                sourceImageCount: 1,
                styleImageCount: styleImagesData.length,
                createdAt: Date.now(),
              };

              // Prepare image data
              const sourceImagesData = [{
                data: await urlToDataUrl(image.url),
                mimeType: image.fileType || 'image/jpeg'
              }];

              const allImages = styleImagesData.length > 0
                ? [...sourceImagesData, ...styleImagesData]
                : sourceImagesData;

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
      setToast({
        message: `❌ Chyba při batch zpracování: ${error instanceof Error ? error.message : 'Neznámá chyba'}`,
        type: 'error'
      });
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
        label: 'Smazat',
        icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
        onClick: () => handleDeleteImage(imageId),
        dangerous: true,
      },
    ];
  };

  const addInlineReferenceImages = (imageId: string, files: File[]) => {
    const remainingSlots = MAX_IMAGES - (inlineEditStates[imageId]?.referenceImages?.length || 0);
    if (remainingSlots <= 0) return;

    files.slice(0, remainingSlots).forEach(file => {
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
      {!isMobileView && (
        <button
          type="button"
          onClick={() => navigate('/style-transfer')}
          className="w-full card-surface card-surface-hover p-4 text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-[#7ed957] rounded-full"></div>
              <div className="text-[10px] font-black uppercase tracking-widest text-white/75">Style Transfer</div>
            </div>
            <Sparkles className="w-4 h-4 text-[#7ed957]" />
          </div>
          <div className="mt-2 text-[9px] text-white/40">
            Přenést malířský styl z jednoho obrázku na druhý.
          </div>
        </button>
      )}

      {/* 1. Generate Button Section */}
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Action
          </h3>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak ${isGenerateClicked
              ? 'bg-blue-600 text-white shadow-blue-500/20'
              : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40'
              } disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none`}
          >
            {isGenerating ? 'Generating...' : state.sourceImages.length > 1 ? `Generate (${state.sourceImages.length})` : 'Generate Image'}
          </button>

          {/* 3 Variants Button - Generates 3 sophisticated AI variations */}
          <button
            onClick={handleGenerate3Variants}
            disabled={!canGenerate || isGenerating}
            className="w-full py-2 px-3 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all bg-white/5 hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
          >
            {isGenerating ? 'Generuji varianty...' : '3 varianty'}
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
              ? 'bg-[var(--accent)] text-[#0a0f0d] shadow-sm'
              : 'bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              }`}
          >
            Jednoduchý Režim
          </button>
          <button
            onClick={() => setPromptMode('advanced')}
            className={`flex-1 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded transition-all ${promptMode === 'advanced'
              ? 'bg-[var(--accent)] text-[#0a0f0d] shadow-sm'
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
              handleKeyDown(e);
            }}
            placeholder={promptMode === 'advanced' ? "Popište obrázek přirozeně. Vyberte variantu níže pro určení stylu interpretace..." : "Volitelné: doplňující prompt (Styl/Merge/Object funguje i bez textu)…"}
            className="w-full min-h-[120px] max-h-[240px] bg-transparent border-0 border-b border-[var(--border-color)] rounded-none p-2 text-[11px] font-medium text-[var(--text-primary)] placeholder-gray-500 focus:border-[var(--accent)] focus:ring-0 outline-none transition-all resize-none custom-scrollbar"
          />
        </div>

        {promptMode === 'simple' && (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[
              { id: 'style' as const, label: 'STYL', subtitle: 'Přenos kompozice', tooltip: 'Přenese kompozici, nasvícení a barvy ze stylu. Obsah/identita zůstává z reference.' },
              { id: 'merge' as const, label: 'MERGE', subtitle: 'Volné spojení', tooltip: 'Volně spojí oba obrázky (obsah i formu) do jednoho výsledku.' },
              { id: 'object' as const, label: 'OBJECT', subtitle: 'Přenos objektu', tooltip: 'Přenese dominantní objekt/prvek ze stylu do reference (např. dekorativní zeď).' },
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

      {/* 5. Reference Images (Compacted) */}
      <div className="space-y-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between">
          <span>Referenční Obrázky</span>
          <span className="text-[9px] text-[var(--text-secondary)]">{state.sourceImages.length}/{MAX_IMAGES}</span>
        </h3>
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
                onChange={(e) => e.target.files && handleImagesSelected(Array.from(e.target.files))}
              />
            </div>
          ) : (
            <div className="p-1 grid grid-cols-4 gap-1">
              {state.sourceImages.map((img, idx) => (
                <div key={img.id} className="relative group aspect-square rounded overflow-hidden bg-[var(--bg-card)] border border-[var(--border-color)]">
                  <img src={img.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" alt={`Ref ${idx}`} />
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
              {state.sourceImages.length < MAX_IMAGES && (
                <label className="flex items-center justify-center aspect-square rounded border border-dashed border-[var(--border-color)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-panel)]/50 cursor-pointer">
                  <span className="text-[var(--text-secondary)]">+</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && handleImagesSelected(Array.from(e.target.files))} />
                </label>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 6. Style Images (Compacted) */}
      <div className="space-y-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between">
          <span>Stylové Obrázky</span>
          <span className="text-[9px] text-[var(--text-secondary)]">{state.styleImages.length}/{MAX_IMAGES}</span>
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
                onChange={(e) => e.target.files && handleStyleImagesSelected(Array.from(e.target.files))}
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
              {state.styleImages.length < MAX_IMAGES && (
                <label className="flex items-center justify-center aspect-square rounded border border-dashed border-[var(--border-color)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-panel)]/50 cursor-pointer">
                  <span className="text-[var(--text-secondary)]">+</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && handleStyleImagesSelected(Array.from(e.target.files))} />
                </label>
              )}
            </div>
          )}
        </div>
      </div>
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

  // Handle PIN authentication
  const handleAuth = async (userId: string) => {
    setAuthUserId(userId);
    setIsAuthenticated(true);
    // Pre-load data from Supabase
    ImageDatabase.getAll();

    // Load provider settings
    const savedSettings = await SettingsDatabase.loadProviderSettings();
    if (savedSettings) {
      setProviderSettings(savedSettings);
      try {
        localStorage.setItem('providerSettings', JSON.stringify(savedSettings));
      } catch {
      }
    }

    if (new URLSearchParams(window.location.search).get('smoke') === '1') {
      const result = await runSupabaseSmokeTests((message, data) => {
        if (data !== undefined) {
          console.log(`[Smoke] ${message}`, data);
        } else {
          console.log(`[Smoke] ${message}`);
        }
      });

      if (result.ok) {
        setToast({ message: '✅ Smoke test Supabase: OK', type: 'success' });
      } else {
        setToast({ message: `❌ Smoke test Supabase: ${result.failures[0]}`, type: 'error' });
        console.error('[Smoke] Failures:', result.failures);
      }
    }
  };

  // Show PIN auth screen if not authenticated
  if (!isAuthenticated) {
    return <PinAuth onAuth={handleAuth} />;
  }



  const handleSaveSettings = async (newSettings: ProviderSettings) => {
    setProviderSettings(newSettings);
    await SettingsDatabase.saveProviderSettings(newSettings);
    try {
      localStorage.setItem('providerSettings', JSON.stringify(newSettings));
    } catch {
    }
    setToast({ message: 'Settings saved successfully!', type: 'success' });
  };

  return (
    <div className="min-h-screen transition-colors duration-300 bg-[var(--bg-main)] text-[var(--text-primary)] font-sans">

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={providerSettings}
        onSave={handleSaveSettings}
      />

      {/* Top Header */}
      <Header
        onSettingsClick={() => setIsSettingsModalOpen(true)}
      />



      <div className="flex h-[calc(100vh-73px)] overflow-hidden relative">
        {isStyleTransferRoute ? (
          <StyleTransferScreen
            providerSettings={providerSettings}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onBack={() => navigate('/')}
            onToast={(t) => setToast(t)}
            isHoveringGallery={isHoveringGallery}
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
                    onChange={setSelectedProvider}
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
                              className={`w-full h-full object-cover ${image.isEditing ? 'blur-sm scale-105' : ''} transition-all duration-500`}
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
                              {(inlineEditStates[image.id]?.referenceImages?.length || 0) < MAX_IMAGES && (
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
                                      if (e.target.files) {
                                        addInlineReferenceImages(image.id, Array.from(e.target.files));
                                      }
                                    }}
                                  />
                                </label>
                              )}
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
                console.log('[Drag] Started from gallery:', type, imageData);
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
                    console.log('[Drag] Started from gallery:', type, imageData);
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
    </div >
  );
};

export default App;
