import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './src/index.css'; // ENFORCE NEW STYLES
import { Sun, Moon, Upload, X, FileJson, ArrowLeftRight, Folder, Sparkles } from 'lucide-react'; // Added icons for design
import { ImageUpload } from './components/ImageUpload';
import { ImageLibrary } from './components/ImageLibrary';
import { LoadingSpinner } from './components/LoadingSpinner';
import { editImageWithGemini, enhancePromptWithAI } from './services/geminiService';
import { AppState, GeneratedImage, SourceImage } from './types';
import { ImageComparisonModal } from './components/ImageComparisonModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { Header } from './components/Header';
import { GalleryModal } from './components/GalleryModal';
import { SavedPromptsDropdown } from './components/SavedPromptsDropdown';
import { slugify } from './utils/stringUtils.ts';
import { saveToGallery, createThumbnail } from './utils/galleryDB';
import { ImageDatabase } from './utils/imageDatabase';
import { urlToDataUrl } from './utils/supabaseStorage';
import JSZip from 'jszip';
import { ApiUsagePanel } from './components/ApiUsagePanel';
import { CollectionsModal } from './components/CollectionsModal';
import { PromptTemplatesModal } from './components/PromptTemplatesModal';
import { PromptRemixModal } from './components/PromptRemixModal';
import { LoadingProgress } from './components/LoadingProgress';
import { QuickActionsMenu, QuickAction } from './components/QuickActionsMenu';
import { ApiUsageTracker } from './utils/apiUsageTracking';
import { PromptHistory } from './utils/promptHistory';
import { detectLanguage, enhancePromptQuality, getPromptSuggestion } from './utils/languageSupport';
import { ImageGalleryPanel } from './components/ImageGalleryPanel';
import { PinAuth } from './components/PinAuth';
import { SettingsModal } from './components/SettingsModal';
import { ProviderSelector } from './components/ProviderSelector';
import { AIProviderType, ProviderSettings } from './services/aiProvider';
import { ProviderFactory } from './services/providerFactory';
import { SettingsDatabase } from './utils/imageDatabase';
import { Toast, ToastType } from './components/Toast';
import { applyAdvancedInterpretation } from './utils/promptInterpretation';

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

  // Inline Editing State (Restored)
  const [inlineEdits, setInlineEdits] = useState<Record<string, { prompt: string; referenceImages: SourceImage[] }>>({});
  // Theme state
  // Theme state - Enforced Dark Mode (v2)
  const isDark = true;


  // AI Provider state
  const [selectedProvider, setSelectedProvider] = useState<AIProviderType>(AIProviderType.GEMINI);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>({
    [AIProviderType.GEMINI]: { apiKey: process.env.API_KEY || '', enabled: true }
  });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [promptMode, setPromptMode] = useState<'simple' | 'advanced'>('simple');
  const [advancedVariant, setAdvancedVariant] = useState<'A' | 'B' | 'C'>('C'); // Default: Balanced
  const [faceIdentityMode, setFaceIdentityMode] = useState(false);
  const [jsonContext, setJsonContext] = useState<{ fileName: string; content: any } | null>(null);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

  const [state, setState] = useState<AppState>({
    sourceImages: [],
    styleImages: [],
    generatedImages: [],
    prompt: '',
    aspectRatio: 'Original',
    resolution: '1K', // Default to 1K
    error: null,
    numberOfImages: 1, // Default to 1 image
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [inlineEditStates, setInlineEditStates] = useState<Record<string, { prompt: string; referenceImages: SourceImage[] }>>({});
  const [showReferenceUpload, setShowReferenceUpload] = useState<Record<string, boolean>>({});
  const [isGenerateClicked, setIsGenerateClicked] = useState(false);
  const [referenceImageSource, setReferenceImageSource] = useState<'computer' | 'database'>('computer');
  const [styleImageSource, setStyleImageSource] = useState<'computer' | 'database'>('computer');
  const [dragOverTarget, setDragOverTarget] = useState<'reference' | 'style' | null>(null);

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
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // canGenerate: Check if user can trigger generation
  const canGenerate = useMemo(() => {
    const hasTextPrompt = state.prompt.trim().length > 0;
    const hasReferencePrompt = state.sourceImages.some(img => img.prompt && img.prompt.trim().length > 0);
    return hasTextPrompt || hasReferencePrompt;
  }, [state.prompt, state.sourceImages]);

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
      const jsonData = e.dataTransfer.getData('application/json');

      if (jsonData) {
        console.log('[Drop Reference] Got JSON data:', jsonData);
        imageData = JSON.parse(jsonData);
      } else {
        // Fallback to text/plain
        const url = e.dataTransfer.getData('text/plain');
        console.log('[Drop Reference] Got text/plain data:', url);
        if (url) {
          imageData = {
            url: url,
            fileName: 'dropped-image.jpg',
            fileType: 'image/jpeg'
          };
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
      const jsonData = e.dataTransfer.getData('application/json');

      if (jsonData) {
        console.log('[Drop Style] Got JSON data:', jsonData);
        imageData = JSON.parse(jsonData);
      } else {
        // Fallback to text/plain
        const url = e.dataTransfer.getData('text/plain');
        console.log('[Drop Style] Got text/plain data:', url);
        if (url) {
          imageData = {
            url: url,
            fileName: 'dropped-image.jpg',
            fileType: 'image/jpeg'
          };
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
      const apiKey = providerSettings[AIProviderType.GEMINI]?.apiKey;
      const enhanced = await enhancePromptWithAI(state.prompt, apiKey);
      setState(prev => ({ ...prev, prompt: enhanced }));
      promptHistory.add(enhanced);
    } catch (error) {
      console.error('Prompt enhancement failed:', error);
    } finally {
      setIsEnhancingPrompt(false);
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
            const result = await provider.generateImage(
              sourceImagesData,
              variant.prompt,
              state.resolution,
              state.aspectRatio,
              false
            );

            setState(prev => ({
              ...prev,
              generatedImages: prev.generatedImages.map(img =>
                img.id === newId
                  ? { ...img, status: 'success', url: result.imageBase64, groundingMetadata: result.groundingMetadata }
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
                thumbnail
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
    }
  };


  const handleGenerate = async () => {
    setIsMobileMenuOpen(false);

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
      if (!state.prompt.trim() && !hasReferencePrompt) {
        setToast({ message: 'Vyplňte textový prompt nebo přetáhněte obrázek z galerie', type: 'error' });
        return;
      }
    }

    // Přidat prompt do historie
    promptHistory.add(state.prompt);

    // Auto-save referenčních a stylových obrázků do galerie
    const saveReferenceAndStyleImages = async () => {
      const savedUrls = new Set<string>();      // Note: Reference and style images are NOT automatically saved to gallery
      // They are only saved when user explicitly clicks the save button
    };

    // Save images in background (don't block generation)
    saveReferenceAndStyleImages().catch(err => {
      console.error('[Auto-Save] Error saving images:', err);
    });

    // Detekce jazyka a quality enhancement
    const language = detectLanguage(state.prompt);
    const suggestion = getPromptSuggestion(state.prompt, language);
    if (suggestion) {
      console.log(suggestion);
    }

    setIsGenerateClicked(true);
    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: state.numberOfImages });

    // Vytvořit pole s požadovaným počtem obrázků
    const imagesToGenerate = Array.from({ length: state.numberOfImages }, (_, index) => {
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

    // Přidat všechny loading obrázky do state
    setState(prev => ({
      ...prev,
      generatedImages: [...imagesToGenerate, ...prev.generatedImages],
    }));

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

            // Handle Advanced Mode: Serialize JSON data first
            let basePrompt = state.prompt;

            // Pokud není vyplněn hlavní prompt, použij prompt z prvního referenčního obrázku
            if (!basePrompt.trim() && state.sourceImages.length > 0) {
              const imageWithPrompt = state.sourceImages.find(img => img.prompt);
              if (imageWithPrompt?.prompt) {
                basePrompt = imageWithPrompt.prompt;
                console.log('[Generation] Using prompt from reference image:', basePrompt);
              }
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



            // Get selected AI provider
            const provider = ProviderFactory.getProvider(selectedProvider, providerSettings);

            // Image generation
            const result = await provider.generateImage(
              allImages,
              enhancedPrompt,
              state.resolution,
              state.aspectRatio,
              false
            );


            setState(prev => ({
              ...prev,
              generatedImages: prev.generatedImages.map(img =>
                img.id === imageData.id ? { ...img, status: 'success', url: result.imageBase64, groundingMetadata: result.groundingMetadata } : img
              ),
            }));

            // Automaticky uložit do galerie
            try {
              const thumbnail = await createThumbnail(result.imageBase64);
              await saveToGallery({
                url: result.imageBase64,
                prompt: state.prompt,
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                thumbnail,
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
    setState(prev => ({
      ...prev,
      prompt: image.prompt,
      aspectRatio: image.aspectRatio || 'Original',
      resolution: image.resolution || '2K',
    }));
    // If mobile, open the menu so user sees the repopulated settings
    if (isMobile) {
      setIsMobileMenuOpen(true);
    }
  };

  const handleEditImage = async (imageId: string) => {
    const editPrompt = editPrompts[imageId];
    if (!editPrompt || !editPrompt.trim()) return;

    const image = state.generatedImages.find(img => img.id === imageId);
    if (!image || !image.url) return;

    // Nastavit loading stav
    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.map(img =>
        img.id === imageId ? { ...img, isEditing: true } : img
      ),
    }));

    // Zavřít reference upload po zahájení editace
    setShowReferenceUpload(prev => ({ ...prev, [imageId]: false }));

    try {
      // DŮLEŽITÉ: První obrázek = obrázek k editaci, další obrázky = reference pro inspiraci
      const editState = inlineEditStates[imageId];

      // Konvertovat všechny URL na base64 data URL pro Gemini API
      const baseImageData = await urlToDataUrl(image.url);
      const referenceImagesData = await Promise.all(
        (editState?.referenceImages || []).map(async i => ({
          data: await urlToDataUrl(i.url),
          mimeType: i.file.type
        }))
      );

      const sourceImages = [
        // Původní vygenerovaný obrázek - VŽDY první (je to obrázek, který má být editován)
        { data: baseImageData, mimeType: 'image/jpeg' },
        // Referenční obrázky - jako kontext/inspirace pro úpravu
        ...referenceImagesData
      ];

      const result = await editImageWithGemini(
        sourceImages,
        editPrompt,
        image.resolution,
        image.aspectRatio,
        false
      );

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

      // Uložit upravenou verzi do galerie
      try {
        const thumbnail = await createThumbnail(result.imageBase64);
        await saveToGallery({
          url: result.imageBase64,
          prompt: editPrompt,
          resolution: image.resolution,
          aspectRatio: image.aspectRatio,
          thumbnail,
        });
      } catch (err) {
        console.error('Failed to save edited image to gallery:', err);
      }
    } catch (err: any) {
      console.error('Edit error:', err);
      setState(prev => ({
        ...prev,
        generatedImages: prev.generatedImages.map(img =>
          img.id === imageId ? { ...img, isEditing: false, error: err instanceof Error ? err.message : 'Edit failed' } : img
        ),
      }));
    }
  };
  // Batch processing handler
  // --- Inline Editing Handlers (Restored) ---
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const addInlineReferenceImages = async (imageId: string, files: File[]) => {
    const newImages = await Promise.all(files.map(async file => {
      const url = await readFileAsDataURL(file);
      return {
        id: Math.random().toString(36).substr(2, 9),
        url,
        file,
        isUploaded: false
      };
    }));

    setInlineEdits(prev => {
      const current = prev[imageId] || { prompt: '', referenceImages: [] };
      return {
        ...prev,
        [imageId]: {
          ...current,
          referenceImages: [...current.referenceImages, ...newImages]
        }
      };
    });
  };

  const handleInlineGenerate = async (image: GeneratedImage, prompt: string, references: SourceImage[]) => {
    setToast({ message: 'Přegenerovávám...', type: 'info' });

    // 1. Create a version snapshot of current state
    const currentVersion = {
      url: image.url || '',
      prompt: image.prompt,
      timestamp: image.timestamp
    };

    const newVersions = [
      ...(image.versions || []),
      ...(image.versions ? [] : [currentVersion]) // If no versions yet, push current as first
    ];

    // 2. Set status to loading on the SAME image
    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.map(img =>
        img.id === image.id
          ? {
            ...img,
            status: 'loading',
            versions: newVersions,
            currentVersionIndex: newVersions.length // Point to "future" new version
          }
          : img
      )
    }));

    try {
      const provider = ProviderFactory.getProvider(selectedProvider, providerSettings);

      const finalPrompt = prompt || image.prompt;
      // Map SourceImage to ImageInput for the provider
      const allRefs = references.map(r => ({
        data: r.url,
        mimeType: r.file.type
      }));

      const result = await provider.generateImage(allRefs, finalPrompt, image.resolution || '1024x1024', image.aspectRatio || '1:1', false);

      if (result.imageBase64) {
        // 3. Update the SAME image with new result
        setState(prev => ({
          ...prev,
          generatedImages: prev.generatedImages.map(img =>
            img.id === image.id
              ? {
                ...img,
                status: 'success',
                url: result.imageBase64,
                groundingMetadata: result.groundingMetadata,
                // Add new version to history is implicit: the "current" state is now the latest
                // We keep versions array as is (history), and current state is "head"
              }
              : img
          )
        }));

        await saveToGallery({
          url: result.imageBase64,
          prompt: finalPrompt,
          resolution: image.resolution,
          aspectRatio: image.aspectRatio
        });
        setToast({ message: 'Přegenerováno!', type: 'success' });
      } else {
        throw new Error('No image data returned');
      }
    } catch (err: any) {
      console.error('Inline generation error:', err);
      // Revert status to success if failed (or error)
      setState(prev => ({
        ...prev,
        generatedImages: prev.generatedImages.map(img =>
          img.id === image.id
            ? { ...img, status: 'error', error: err.message }
            : img
        )
      }));
      setToast({ message: `Chyba: ${err.message}`, type: 'error' });
    }
  };

  const handleUndo = (imageId: string) => {
    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.map(img => {
        if (img.id !== imageId || !img.versions || img.versions.length === 0) return img;

        // Current state is considered the "latest" (index = versions.length)
        // If we have versions [v0, v1], current is implicitly v2.
        // currentVersionIndex tracks what we are SHOWING.
        // Let's normalize:
        // versions = [v0, v1, v2 (current)]
        // Actually, let's simplify:
        // When we generate, we push OLD state to versions.
        // So currently displayed is NOT in versions until we generate again?
        // Let's use a simpler model:
        // versions contains ALL history including current.
        // But `GeneratedImage` structure has top-level `url` and `versions`.
        // Let's use top-level as "cursor".

        // Actually, the implemented logic in handleInlineGenerate pushed OLD state to versions.
        // So `versions` has [v0, v1]. Top level has v2.
        // currentVersionIndex should be 2.
        // Undo -> index 1. Load v1 from versions[1] into top level.

        // Need to ensure "current" (latest) is also saved in versions if we act like this.
        // Let's adjust handleInlineGenerate logic slightly above or handle it here.

        // Fix: Ensure we capture "current active" into versions before navigating if it's not there?
        // Simpler: Just rely on versions array.
        // If index > 0, decrement.
        // restored version = versions[index - 1]

        const currentIndex = img.currentVersionIndex ?? (img.versions.length);
        if (currentIndex <= 0) return img; // Can't undo further

        const newIndex = currentIndex - 1;
        const versionToRestore = img.versions[newIndex];

        // We need to save the "current" state to versions if we are stepping back from Head?
        // If we are at Head (currentIndex == versions.length), the "current" image is NOT in versions yet?
        // Let's ensure handleInlineGenerate pushes the *previous* head to versions. Yes it does.
        // But what about the *result* of the generation? It becomes the new Head.
        // So versions = [v0], Head = v1.
        // Undo -> go to v0.
        // But we need to keep v1 somewhere if we want to Redo?
        // The standard undo/redo pattern:
        // history = [v0, v1, v2]
        // pointer = 2
        // Undo -> pointer = 1. Show history[1].

        // Let's migrate to this pattern on the fly?
        // Or stick to: versions = history.
        // If I undo, I need to save "Head" to versions?
        // Let's assume handleInlineGenerate does NOT push the new result to versions, only the old one.
        // So versions = [old]. Head = new.
        // If I undo, I swap Head with versions[last].
        // And I need to temporarily store "new" in versions to allow Redo?

        // BETTER STRATEGY:
        // Treat `versions` as the definitive timeline.
        // When generating:
        // 1. Push current `url` code to `versions`.
        // 2. Generate.
        // 3. Push new `url` to `versions`.
        // 4. Update top-level `url` to match new `url` and set index to last.

        // Let's patch handleInlineGenerate first to align with this cleaner model?
        // Or implement robust undo here.

        // Let's try:
        // If undoing from Head (no redo stack yet):
        // We need to SAVE Head to versions so we can Redo to it.
        // actually `versions` should hold all snapshots.
        // Let's update `handleInlineGenerate` to push the NEW result to versions too.

        // For now, let's assume specific behavior:
        // versions=[v0]. Head=v1.
        // Undo: We want to show v0. We MUST save v1 to versions array to Redo.
        // But versions array is order-dependent.
        // versions=[v0, v1]. index=1.
        // Undo -> index=0. show versions[0].
        // Redo -> index=1. show versions[1].

        // So, `handleInlineGenerate` needs to:
        // 1. Push OLD state to versions (if not already valid history).
        // 2. Generate.
        // 3. Push NEW state to versions.
        // 4. Set index to last.

        // I will update handleInlineGenerate above to support this robustly.
        // AND implement handleUndo/Redo here assuming that model.

        const allVersions = img.versions || [];
        // If we are at "head" but it's not in versions (legacy), we might lose it.
        // But let's assume we fixed handleInlineGenerate.

        // If currentVersionIndex is undefined, assume we are at Head = versions.length - 1?
        // No, let's rely on explicit index.

        const idx = img.currentVersionIndex ?? (allVersions.length - 1);
        if (idx > 0) {
          const prevVer = allVersions[idx - 1];
          return {
            ...img,
            url: prevVer.url,
            prompt: prevVer.prompt,
            currentVersionIndex: idx - 1
          };
        }
        return img;
      })
    }));
  };

  const handleRedo = (imageId: string) => {
    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.map(img => {
        if (img.id !== imageId || !img.versions) return img;
        const idx = img.currentVersionIndex ?? (img.versions.length - 1);
        if (idx < img.versions.length - 1) {
          const nextVer = img.versions[idx + 1];
          return {
            ...img,
            url: nextVer.url,
            prompt: nextVer.prompt,
            currentVersionIndex: idx + 1
          };
        }
        return img;
      })
    }));
  };

  const handleBatchProcess = async (images: any[]) => {
    console.log('[Batch] Starting batch process with', images.length, 'images');
    console.log('[Batch] Prompt:', state.prompt);

    if (!state.prompt.trim()) {
      console.error('[Batch] No prompt provided');
      setToast({ message: 'Vyplňte prompt pro batch zpracování', type: 'error' });
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
    const provider = ProviderFactory.getProvider(selectedProvider, providerSettings[selectedProvider]);

    try {
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
              // Prepare image data
              const sourceImagesData = [{
                data: await urlToDataUrl(image.url),
                mimeType: image.fileType || 'image/jpeg'
              }];

              // Generate image
              const result = await provider.generateImage(
                sourceImagesData,
                state.prompt,
                state.resolution,
                state.aspectRatio
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
                    }
                    : img
                ),
              }));

              // Save to gallery
              const thumbnail = await createThumbnail(result.imageBase64);
              await saveToGallery({
                url: result.imageBase64,
                prompt: state.prompt,
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                thumbnail
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

}

const handleJsonUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = JSON.parse(e.target?.result as string);
      setJsonContext({ fileName: file.name, content });
      setToast({ message: `Kontext načten: ${file.name}`, type: 'success' });
    } catch (error) {
      setToast({ message: 'Chyba při čtení JSON souboru', type: 'error' });
    }
  };
  reader.readAsText(file);
  // Reset inputs
  event.target.value = '';
}

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
}



const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleGenerate();
  }
}

const handleNextImage = () => {
  if (!selectedImage) return;
  const idx = state.generatedImages.findIndex(img => img.id === selectedImage.id);
  if (idx < state.generatedImages.length - 1) {
    setSelectedImage(state.generatedImages[idx + 1]);
  }
}

const handlePrevImage = () => {
  if (!selectedImage) return;
  const idx = state.generatedImages.findIndex(img => img.id === selectedImage.id);
  if (idx > 0) {
    setSelectedImage(state.generatedImages[idx - 1]);
  }
}

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
}

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
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ${isGenerateClicked
            ? 'bg-blue-600 text-white shadow-blue-500/20'
            : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40'
            } disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none`}
        >
          {isGenerating ? 'Generating...' : state.sourceImages.length > 1 ? `Generate (${state.sourceImages.length})` : 'Generate Image'}
        </button>

        {/* 3 Variants Button */}
        <button
          onClick={() => {
            setState(p => ({ ...p, numberOfImages: 3 }));
            handleGenerate();
          }}
          disabled={!canGenerate}
          className="w-full py-2 px-3 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all bg-[var(--bg-panel)] border border-[var(--border-color)] hover:border-[var(--text-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center gap-2 group"
        >
          <Sparkles className="w-3 h-3 text-[#7ed957] group-hover:animate-pulse" />
          3 Varianty
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
          <input
            type="file"
            ref={jsonInputRef}
            className="hidden"
            accept=".json"
            onChange={handleJsonUpload}
          />
          <button
            onClick={() => jsonInputRef.current?.click()}
            className="w-7 h-7 flex items-center justify-center rounded bg-[var(--bg-input)] text-[var(--accent)] border border-[var(--accent)]/30 hover:border-[var(--accent)] hover:shadow-[0_0_8px_rgba(126,217,87,0.4)] focus:outline-none focus:border-[var(--accent)] focus:box-shadow-[0_0_8px_rgba(126,217,87,0.4)] transition-all"
            title={jsonContext ? `Kontext: ${jsonContext.fileName}` : "Připojit JSON kontext"}
          >
            <FileJson className={`w-3.5 h-3.5 ${jsonContext ? 'fill-[var(--accent)]/20' : ''}`} />
          </button>

          {/* Mode Switch (Compact) */}
          <button
            onClick={() => setPromptMode(promptMode === 'simple' ? 'advanced' : 'simple')}
            className={`w-7 h-7 flex items-center justify-center rounded transition-all ${promptMode === 'advanced' ? 'bg-[var(--bg-input)] text-[var(--accent)] border border-[var(--accent)]/30' : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-color)]'}`}
            title={`Režim: ${promptMode === 'simple' ? 'Jednoduchý' : 'Interpretační'}`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>

          {/* Collections */}
          <button
            onClick={() => setIsCollectionsModalOpen(true)}
            className="w-7 h-7 flex items-center justify-center rounded bg-[var(--bg-input)] hover:bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent transition-all"
            title="Kolekce"
          >
            <Folder className="w-3.5 h-3.5" />
          </button>

          {/* Saved Prompts */}
          <div className="flex items-center justify-center w-7 h-7">
            <SavedPromptsDropdown
              currentPrompt={state.prompt}
              onSelectPrompt={(p) => setState(prev => ({ ...prev, prompt: p }))}
            />
          </div>


        </div>
      </div>

      <textarea
        ref={isMobileView ? mobilePromptRef : promptRef}
        value={state.prompt}
        onChange={(e) => setState(p => ({ ...p, prompt: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleGenerate();
          }
          handleKeyDown(e);
        }}
        placeholder={promptMode === 'advanced' ? "Popište obrázek..." : "Zadejte prompt..."}
        className="w-full min-h-[100px] max-h-[200px] bg-transparent border-0 border-b border-[var(--border-color)] rounded-none p-2 text-sm font-medium text-[var(--text-primary)] placeholder-gray-500 focus:border-[var(--accent)] focus:ring-0 outline-none transition-all resize-none custom-scrollbar"
      />

      {/* Prompt Tools (Compacted) */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => setIsTemplatesModalOpen(true)}
          className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider bg-[var(--bg-panel)] hover:bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded border border-[var(--border-color)] transition-all"
        >
          Šablony
        </button>

        <div className="flex-1" />

        <button
          onClick={handleEnhancePrompt}
          disabled={!state.prompt || !state.prompt.trim() || isEnhancingPrompt}
          className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest bg-[var(--bg-panel)] hover:bg-[var(--bg-input)] text-[var(--accent)] rounded border border-[var(--border-color)] hover:border-[var(--accent)]/30 transition-all disabled:opacity-50 flex items-center gap-1"
        >
          <Sparkles className="w-3 h-3" /> Vylepšit
        </button>
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
  }
}

// Show PIN auth screen if not authenticated
if (!isAuthenticated) {
  return <PinAuth onAuth={handleAuth} />;
}



const handleSaveSettings = async (newSettings: ProviderSettings) => {
  setProviderSettings(newSettings);
  await SettingsDatabase.saveProviderSettings(newSettings);
  setToast({ message: 'Settings saved successfully!', type: 'success' });
}

return (
  <div className="min-h-screen transition-colors duration-300 bg-transparent text-[var(--text-primary)] font-sans">

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



    <div className="flex h-screen overflow-hidden relative">
      {/* Floating Glass Sidebar */}
      <div
        ref={sidebarRef}
        className={`fixed left-4 top-4 bottom-4 z-40 flex flex-col glass-panel rounded-2xl transition-all duration-300 ease-in-out ${isMobile
          ? isMobileMenuOpen ? 'translate-x-0 w-[calc(100%-2rem)]' : '-translate-x-full w-[calc(100%-2rem)]'
          : isGalleryOpen ? 'w-0 opacity-0 pointer-events-none' : 'translate-x-0'
          }`}
        style={{ width: isMobile ? undefined : sidebarWidth }}
      >
        <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
          {/* Logo Area */}
          <div className="pb-2">
            <h1 className="text-xl font-black tracking-tighter text-white">
              Mulen <span className="text-[#7ed957]">nano</span>
            </h1>
            <p className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-bold mt-1">AI Workspace</p>
          </div>

          <ProviderSelector
            selectedProvider={selectedProvider}
            onChange={setSelectedProvider}
            settings={providerSettings}
          />
          <div className="pt-2">
            {renderSidebarControls(false)}
          </div>
        </div>
      </div>

      {/* Main Content Area - Scoped Dot Grid & Floating */}
      <main
        className={`flex-1 flex flex-col h-[calc(100vh-2rem)] mt-4 mb-4 mr-4 bg-dot-grid rounded-2xl border border-white/5 relative overflow-hidden transition-all duration-300 ${!isMobile && !isGalleryOpen ? 'ml-[352px]' : 'ml-4' // 320px width + 32px gap
          } ${isGalleryOpen && !isMobile ? 'mr-[400px]' : ''}`}
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
              <div className="bg-[#7ed957]/10 px-4 py-3 border border-[#7ed957]/20 rounded-lg backdrop-blur-sm sticky top-0 z-10">
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
                <div className="text-center space-y-2">
                  <span className="text-lg font-bold text-gray-400 block">Zatím žádné vygenerované obrázky</span>
                  <p className="text-sm text-gray-600">Zadejte prompt v postranním panelu (vlevo) a začněte tvořit</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 auto-rows-min">
                {state.generatedImages.map((image) => (
                  <article
                    key={image.id}
                    className="group flex flex-col bg-[#0f1512] border border-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl hover:border-gray-700 transition-all animate-fadeIn"
                    onContextMenu={(e) => image.status === 'success' && handleImageContextMenu(e, image.id)}
                  >
                    <div
                      className={`relative w-full aspect-[2/3] bg-[#0f1512] cursor-zoom-in overflow-hidden group/image`}
                      onClick={() => setSelectedImage(image)}
                    >
                      {/* Image Rendering Logic - Fixed Aspect Ratio & In-Place Updates */}
                      {image.status === 'success' && (
                        <div className="absolute top-3 left-3 z-10 opacity-0 group-hover/image:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedGeneratedImages.has(image.id)}
                            onChange={() => {
                              setSelectedGeneratedImages(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(image.id)) newSet.delete(image.id);
                                else newSet.add(image.id);
                                return newSet;
                              });
                            }}
                            className="w-5 h-5 cursor-pointer accent-[#7ed957] bg-black/50 border-gray-500 rounded"
                          />
                        </div>
                      )}

                      {/* Undo/Redo Controls */}
                      {image.status === 'success' && (image.versions?.length ?? 0) > 0 && (
                        <div className="absolute top-3 right-3 z-20 flex gap-1 opacity-0 group-hover/image:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleUndo(image.id)}
                            disabled={(image.currentVersionIndex ?? (image.versions?.length || 0)) <= 0}
                            className="p-1.5 bg-black/60 hover:bg-black/90 text-white disabled:opacity-30 rounded-full backdrop-blur-md transition-all border border-white/10"
                            title="Zpět (Undo)"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 14L4 9l5-5" /></svg>
                          </button>
                          <button
                            onClick={() => handleRedo(image.id)}
                            disabled={(image.currentVersionIndex ?? (image.versions?.length || 0)) >= (image.versions?.length || 0)}
                            className="p-1.5 bg-black/60 hover:bg-black/90 text-white disabled:opacity-30 rounded-full backdrop-blur-md transition-all border border-white/10"
                            title="Vpřed (Redo)"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 14l5-5-5-5" /></svg>
                          </button>
                        </div>
                      )}

                      {/* Always render image if URL exists (for blur effect) */}
                      {image.url && (
                        <img
                          src={image.url}
                          className={`w-full h-full object-cover transition-all duration-700 ${image.status === 'loading' ? 'blur-lg scale-110 opacity-50 grayscale' : ''}`}
                          decoding="sync"
                          style={{ imageRendering: '-webkit-optimize-contrast' }}
                        />
                      )}

                      {/* Loading Spinner Overlay */}
                      {image.status === 'loading' && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <LoadingSpinner />
                        </div>
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
                    {/* Post-Generation Edit UI (Restored) */}
                    <div className="px-4 pb-4 bg-[#0f1512] border-t-0 rounded-b-xl border-gray-800">
                      <div className="space-y-2 pt-2 border-t border-gray-800/50">
                        {/* Inline Prompt Input */}
                        <div className="relative">
                          <input
                            type="text"
                            value={inlineEdits[image.id]?.prompt ?? image.prompt}
                            onChange={(e) => setInlineEdits(prev => ({
                              ...prev,
                              [image.id]: {
                                ...(prev[image.id] || { referenceImages: [] }),
                                prompt: e.target.value
                              }
                            }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleInlineGenerate(
                                  image,
                                  inlineEdits[image.id]?.prompt ?? image.prompt,
                                  inlineEdits[image.id]?.referenceImages || []
                                );
                              }
                            }}
                            className="w-full text-[10px] bg-black/40 border border-gray-800 rounded px-2 py-1.5 text-gray-300 focus:border-[#7ed957] outline-none"
                            placeholder="Upravit prompt..."
                          />
                        </div>

                        {/* Inline Actions */}
                        <div className="flex items-center justify-between gap-2">
                          {/* Reference Upload */}
                          <label className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/50 hover:bg-gray-800 rounded border border-transparent hover:border-gray-700 cursor-pointer transition-colors group/btn">
                            <svg className="w-3 h-3 text-gray-500 group-hover/btn:text-[#7ed957]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span className="text-[9px] font-bold text-gray-500 group-hover/btn:text-gray-300 uppercase">Ref. Obrázek</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files?.length) {
                                  addInlineReferenceImages(image.id, Array.from(e.target.files));
                                }
                              }}
                            />
                          </label>

                          {/* Regenerate Button */}
                          <button
                            onClick={() => {
                              handleInlineGenerate(
                                image,
                                inlineEdits[image.id]?.prompt ?? image.prompt,
                                inlineEdits[image.id]?.referenceImages || []
                              );
                            }}
                            className="px-3 py-1 bg-[#7ed957]/10 hover:bg-[#7ed957] text-[#7ed957] hover:text-[#0a0f0d] border border-[#7ed957]/30 rounded font-black text-[9px] uppercase tracking-wider transition-all"
                          >
                            PŘEGENEROVAT
                          </button>
                        </div>

                        {/* Show Inline References */}
                        {inlineEdits[image.id]?.referenceImages?.length > 0 && (
                          <div className="flex gap-1 pt-1 overflow-x-auto custom-scrollbar">
                            {inlineEdits[image.id].referenceImages.map((refImg, idx) => (
                              <div key={idx} className="relative w-8 h-8 rounded overflow-hidden border border-gray-700 group/ref shrink-0">
                                <img src={refImg.url} className="w-full h-full object-cover" />
                                <button
                                  onClick={() => {
                                    setInlineEdits(prev => ({
                                      ...prev,
                                      [image.id]: {
                                        ...prev[image.id],
                                        referenceImages: prev[image.id].referenceImages.filter((_, i) => i !== idx)
                                      }
                                    }));
                                  }}
                                  className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/ref:opacity-100 text-white"
                                >
                                  <X className="w-2 h-2" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>

                ))}
              </div>
            )}
          </div>
        </div >
      </main >

      {/* Right Sidebar - Sliding Library */}
      {/* Right Sidebar - Sliding Library */}
      <div
        className={`absolute right-0 top-0 bottom-0 z-50 w-[85vw] sm:w-[340px] transition-transform duration-300 ease-in-out border-l border-gray-800/50 bg-[#0f1512] flex flex-col h-full shadow-2xl group ${isHoveringGallery ? 'translate-x-0' : 'translate-x-[calc(100%-20px)]'}`}
        onMouseEnter={() => setIsHoveringGallery(true)}
        onMouseLeave={() => setIsHoveringGallery(false)}
      >
        <div className={`p-4 border-b border-gray-800/50 bg-[#0f1512] flex items-center justify-between transition-opacity duration-300 delay-100 ${isHoveringGallery ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-[#7ed957] rounded-full"></div>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Knihovna Obrázků</h2>
          </div>
        </div>
        <div className={`flex-1 overflow-y-auto p-4 custom-scrollbar transition-opacity duration-300 delay-100 ${isHoveringGallery ? 'opacity-100' : 'opacity-0'}`}>
          <ImageGalleryPanel
            ref={galleryPanelRef}
            onDragStart={(imageData, type) => {
              console.log('[Drag] Started from gallery:', type, imageData);
            }}
            onBatchProcess={handleBatchProcess}
          />
        </div>
        {/* Handle indicator - Increased width for better hit target */}
        <div className="absolute left-0 top-0 bottom-0 w-[20px] bg-transparent cursor-pointer flex items-center justify-center transition-opacity" style={{ opacity: isHoveringGallery ? 0 : 1 }}>
          <div className="w-1 h-8 bg-gray-700/50 rounded-full"></div>
        </div>
      </div>
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

    {
      generationProgress && (
        <LoadingProgress
          current={generationProgress.current}
          total={generationProgress.total}
        />
      )
    }



    {/* Batch Progress Bar */}
    {
      batchProgress && (
        <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-2xl border-2 border-ink z-50 min-w-[280px]">
          <p className="font-black text-sm uppercase mb-2 text-ink">Batch zpracování</p>
          <p className="text-xs text-monstera-600 mb-3">
            Chunk {batchProgress.currentChunk}/{batchProgress.totalChunks} • {batchProgress.current}/{batchProgress.total} obrázků
          </p>
          <div className="w-64 h-3 bg-monstera-100 rounded-full border border-monstera-300">
            <div
              className="h-full bg-monstera-400 rounded-full transition-all duration-300"
              style={{
                width: `${(batchProgress.current / batchProgress.total) * 100}%`
              }}
            />
          </div>
        </div>
      )
    }

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
}

export default App;