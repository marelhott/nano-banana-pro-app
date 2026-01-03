import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { LoadingSpinner } from './components/LoadingSpinner';
import { editImageWithGemini } from './services/geminiService';
import { AppState, GeneratedImage, SourceImage } from './types';
import { ImageComparisonModal } from './components/ImageComparisonModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { Header } from './components/Header';
import { GalleryModal } from './components/GalleryModal';
import { SavedPromptsDropdown } from './components/SavedPromptsDropdown';
import { slugify } from './utils/stringUtils.ts';
import { saveToGallery, createThumbnail } from './utils/galleryDB';
import JSZip from 'jszip';

const ASPECT_RATIOS = ['Original', '1:1', '2:3', '3:2', '3:4', '4:3', '5:4', '4:5', '9:16', '16:9', '21:9'];
const RESOLUTIONS = [
  { value: '1K', label: '1K (~1024px)' },
  { value: '2K', label: '2K (~2048px)' },
  { value: '4K', label: '4K (~4096px)' }
];
const MAX_IMAGES = 14;

const App: React.FC = () => {
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
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [editPrompts, setEditPrompts] = useState<Record<string, string>>({});
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [inlineEditStates, setInlineEditStates] = useState<Record<string, { prompt: string; referenceImages: SourceImage[] }>>({});
  const [showReferenceUpload, setShowReferenceUpload] = useState<Record<string, boolean>>({});
  const [isGenerateClicked, setIsGenerateClicked] = useState(false);
  
  const isResizingRef = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const mobilePromptRef = useRef<HTMLTextAreaElement>(null);

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

  const handleKeySelected = () => {
    setHasApiKey(true);
  };

  const startResizing = useCallback(() => {
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
  }, []);

  const stopResizing = useCallback(() => {
    isResizingRef.current = false;
    document.body.style.cursor = '';
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizingRef.current) {
      setSidebarWidth(Math.max(280, Math.min(500, e.clientX)));
    }
  }, []);

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
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          const newImage: SourceImage = {
            id: Math.random().toString(36).substr(2, 9),
            url: e.target.result,
            file: file
          };
          setState(prev => ({
            ...prev,
            sourceImages: [...prev.sourceImages, newImage],
            error: null,
          }));
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
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          const newImage: SourceImage = {
            id: Math.random().toString(36).substr(2, 9),
            url: e.target.result,
            file: file
          };
          setState(prev => ({
            ...prev,
            styleImages: [...prev.styleImages, newImage],
            error: null,
          }));
        }
      };
      reader.readAsDataURL(file);
    });
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

  const handleGenerate = async () => {
    setIsMobileMenuOpen(false);
    if (!state.prompt.trim()) return;

    setIsGenerateClicked(true);
    setIsGenerating(true);

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
            const allImages = [
              ...state.sourceImages.map(img => ({ data: img.url, mimeType: img.file.type })),
              ...state.styleImages.map(img => ({ data: img.url, mimeType: img.file.type }))
            ];

            // Vytvořit prompt s informací o stylu, pokud jsou stylové obrázky
            let enhancedPrompt = state.prompt;
            if (state.styleImages.length > 0) {
              const styleImageCount = state.styleImages.length;
              const referenceImageCount = state.sourceImages.length;
              enhancedPrompt = `${state.prompt}\n\n[Technická instrukce: První ${referenceImageCount} obrázek${referenceImageCount > 1 ? 'y' : ''} ${referenceImageCount > 1 ? 'jsou' : 'je'} referenční obsah k úpravě. Následující ${styleImageCount} obrázek${styleImageCount > 1 ? 'y' : ''} ${styleImageCount > 1 ? 'jsou' : 'je'} stylová reference - použij jejich vizuální styl, estetiku a umělecký přístup pro úpravu referenčního obsahu.]`;
            }

            const result = await editImageWithGemini(
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
                id: imageData.id,
                url: result.imageBase64,
                prompt: state.prompt,
                timestamp: Date.now(),
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                thumbnail,
              });
            } catch (err) {
              console.error('Failed to save to gallery:', err);
            }

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
              console.log(`Rate limit hit for image ${i + 1}, waiting ${waitTime/1000}s before retry ${retryCount}/${maxRetries}`);
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
      const sourceImages = [
        // Původní vygenerovaný obrázek - VŽDY první (je to obrázek, který má být editován)
        { data: image.url, mimeType: 'image/jpeg' },
        // Referenční obrázky - jako kontext/inspirace pro úpravu
        ...(editState?.referenceImages || []).map(i => ({ data: i.url, mimeType: i.file.type }))
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
            const newVersions = [
              ...(img.versions || []),
              { url: img.url!, prompt: img.prompt, timestamp: img.timestamp }
            ];
            return {
              ...img,
              url: result.imageBase64,
              prompt: editPrompt,
              timestamp: Date.now(),
              versions: newVersions,
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
          id: imageId,
          url: result.imageBase64,
          prompt: editPrompt,
          timestamp: Date.now(),
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

  const handleUndoEdit = (imageId: string) => {
    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.map(img => {
        if (img.id === imageId && img.versions && img.versions.length > 0) {
          const versions = [...img.versions];
          const previousVersion = versions.pop()!;
          return {
            ...img,
            url: previousVersion.url,
            prompt: previousVersion.prompt,
            timestamp: previousVersion.timestamp,
            versions,
          };
        }
        return img;
      }),
    }));
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
    <div className="space-y-5">
      {/* Tlačítko Generovat */}
      <div className="pt-2">
        <button
          onClick={handleGenerate}
          disabled={!state.prompt.trim()}
          className={`w-full py-3 px-6 font-[900] text-[13px] uppercase tracking-[0.2em] border-2 border-ink rounded-md transition-all shadow-[5px_5px_0_rgba(13,33,23,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-20 disabled:cursor-not-allowed disabled:grayscale ${
            isGenerateClicked
              ? 'bg-gradient-to-br from-blue-400 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white'
              : 'bg-gradient-to-br from-monstera-300 to-monstera-400 hover:from-ink hover:to-monstera-900 hover:text-white text-ink'
          }`}
        >
          {isGenerating ? 'Generuji' : 'Generovat'}
        </button>
      </div>

      <section className="space-y-1">
        <header className="flex items-center justify-between px-1">
          <label className="text-[10px] font-black text-monstera-800 uppercase tracking-widest">Prompt</label>
          <div className="flex items-center gap-2">
            <SavedPromptsDropdown
              onSelectPrompt={(prompt) => setState(p => ({ ...p, prompt }))}
              currentPrompt={state.prompt}
            />
            <span className="text-[8px] font-bold text-monstera-400 uppercase tracking-widest">↵ to run</span>
          </div>
        </header>
        <textarea
          ref={isMobileView ? mobilePromptRef : promptRef}
          value={state.prompt}
          onChange={(e) => setState(p => ({ ...p, prompt: e.target.value }))}
          onKeyDown={handleKeyDown}
          placeholder=""
          className="w-full min-h-[140px] max-h-[300px] bg-white border border-monstera-200 rounded-md p-3 text-[13px] font-medium placeholder-monstera-300 focus:bg-white focus:border-monstera-400 transition-all outline-none resize-none leading-relaxed shadow-inner overflow-y-auto custom-scrollbar"
        />
      </section>

      <section className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <label className="text-[10px] font-black text-monstera-800 uppercase tracking-widest">Referenční obrázky</label>
          {isGenerating && (
            <span className="text-[8px] font-black text-monstera-500 uppercase tracking-widest animate-pulse">● Generuji...</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {state.sourceImages.map((img) => (
            <div key={img.id} className="relative group aspect-square rounded-md overflow-hidden border border-monstera-200 bg-monstera-50 shadow-sm transition-all hover:border-monstera-300">
              <img
                src={img.url}
                className={`w-full h-full object-cover transition-all duration-500 ${isGenerating ? 'blur-sm scale-105' : 'blur-0 scale-100'}`}
              />
              {isGenerating && (
                <div className="absolute inset-0 bg-white/20 pointer-events-none" />
              )}
              <div className={`absolute inset-0 bg-ink/60 transition-all flex items-center justify-center ${isGenerating ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
                <button
                  onClick={() => setState(p => ({ ...p, sourceImages: p.sourceImages.filter(i => i.id !== img.id) }))}
                  className="bg-white text-ink p-1.5 rounded-md shadow-xl"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          ))}
          {state.sourceImages.length < MAX_IMAGES && (
            <ImageUpload onImagesSelected={handleImagesSelected} compact={true} remainingSlots={MAX_IMAGES - state.sourceImages.length} />
          )}
        </div>
        {isGenerating && (
          <div className="relative w-full h-1 bg-monstera-100 rounded-full overflow-hidden animate-fadeIn">
            <div className="absolute inset-0 bg-gradient-to-r from-monstera-400 via-monstera-500 to-monstera-400 animate-pulse" style={{
              animation: 'shimmer 2s ease-in-out infinite',
              backgroundSize: '200% 100%'
            }} />
          </div>
        )}
      </section>

      {/* Oddělovač mezi referenčními a stylovými obrázky */}
      <div className="relative flex items-center py-4">
        <div className="flex-grow border-t border-monstera-200"></div>
        <span className="flex-shrink mx-3 text-[8px] font-bold text-monstera-400 uppercase tracking-widest">Stylová reference</span>
        <div className="flex-grow border-t border-monstera-200"></div>
      </div>

      <section className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black text-monstera-800 uppercase tracking-widest">Stylové obrázky</label>
            <div className="group relative">
              <svg className="w-3 h-3 text-monstera-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="invisible group-hover:visible absolute left-0 top-5 z-50 w-56 p-2 bg-ink text-white text-[9px] rounded-md shadow-xl">
                Tyto obrázky definují vizuální styl pro generování. AI použije jejich estetiku a umělecký přístup.
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {state.styleImages.map((img) => (
            <div key={img.id} className="relative group aspect-square rounded-md overflow-hidden border border-monstera-200 bg-monstera-50 shadow-sm transition-all hover:border-monstera-300">
              <img
                src={img.url}
                className="w-full h-full object-cover transition-all duration-500"
              />
              <div className="absolute inset-0 bg-ink/60 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => setState(p => ({ ...p, styleImages: p.styleImages.filter(i => i.id !== img.id) }))}
                  className="bg-white text-ink p-1.5 rounded-md shadow-xl"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          ))}
          {state.styleImages.length < MAX_IMAGES && (
            <ImageUpload onImagesSelected={handleStyleImagesSelected} compact={true} remainingSlots={MAX_IMAGES - state.styleImages.length} />
          )}
        </div>
      </section>

      <section className="bg-white border border-monstera-200 rounded-md shadow-md overflow-hidden">
        <div className="bg-monstera-50 border-b border-monstera-200 px-3 py-2 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-monstera-800" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
            <span className="text-[10px] font-black text-monstera-800 uppercase tracking-widest">Nastavení generování</span>
        </div>
        
        <div className="p-3.5 space-y-3">
          <div className="space-y-1">
            <label className="text-[9px] text-monstera-800 font-black uppercase tracking-widest px-1">Rozlišení</label>
            <div className="relative">
              <select
                value={state.resolution}
                onChange={(e) => setState(p => ({ ...p, resolution: e.target.value }))}
                className="w-full bg-white border border-monstera-200 text-[11px] font-bold rounded-md px-2.5 py-1.5 outline-none cursor-pointer hover:border-monstera-300 appearance-none shadow-sm"
              >
                {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] text-monstera-800 font-black uppercase tracking-widest px-1">Počet obrázků</label>
            <div className="flex items-center gap-1.5 bg-monstera-50 p-1.5 rounded-md border border-monstera-200 shadow-sm">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setState(p => ({ ...p, numberOfImages: n }))}
                  className={`flex-1 h-8 rounded-md font-black text-[11px] transition-all flex items-center justify-center ${state.numberOfImages === n ? 'bg-white text-ink shadow-sm border border-monstera-300' : 'text-monstera-600 hover:text-ink hover:bg-white/50'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-white text-ink font-sans selection:bg-monstera-200">
      
      <div
        ref={sidebarRef}
        style={{ width: `${sidebarWidth}px` }}
        className="hidden lg:flex shrink-0 border-r border-monstera-200 bg-paper flex-col z-20 h-full relative shadow-sm"
      >
        <Header />

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {renderSidebarControls(false)}
        </div>
      </div>

      <div 
        className="w-1 bg-transparent hover:bg-monstera-300/60 transition-colors z-30 hidden lg:block cursor-col-resize active:bg-monstera-300 h-full"
        onMouseDown={startResizing}
      />

      <main className="flex-1 h-full overflow-y-auto custom-scrollbar bg-white relative flex flex-col">
        <div className="lg:hidden">
          <Header />
        </div>

        <div className="lg:hidden sticky top-0 z-40 bg-white/95 backdrop-blur border-y border-monstera-200 shadow-sm p-3 flex gap-3 items-center transition-all">
          <div
            className="flex-1 bg-monstera-50 border border-monstera-200 rounded-md px-3 py-2 text-xs font-medium text-ink truncate cursor-text hover:bg-white hover:border-monstera-300 transition-colors"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            {state.prompt || "Zadejte prompt..."}
          </div>
          <button
             onClick={() => setIsGalleryOpen(true)}
             className="p-2 bg-white rounded-md border border-monstera-200 text-monstera-600 hover:text-ink hover:border-monstera-400 transition-colors"
             title="Galerie"
          >
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </button>
          <button
             onClick={() => setIsMobileMenuOpen(true)}
             className="p-2 bg-white rounded-md border border-monstera-200 text-monstera-600 hover:text-ink hover:border-monstera-400 transition-colors"
             title="Nastavení"
          >
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
          </button>
          <button
             onClick={handleGenerate}
             disabled={!state.prompt.trim()}
             className="bg-monstera-400 font-black text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-md border border-ink shadow-[2px_2px_0_rgba(13,33,23,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:grayscale"
          >
             Generovat
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-paper flex flex-col animate-fadeIn">
             <div className="flex items-center justify-between p-4 border-b border-monstera-200 bg-white">
                <span className="font-black uppercase tracking-widest text-xs text-ink">Konfigurace</span>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-monstera-600 hover:text-ink bg-white border border-monstera-200 rounded-md"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
             </div>
             <div className="flex-1 overflow-y-auto p-5 pb-20 custom-scrollbar">
                {renderSidebarControls(true)}
             </div>
             <div className="p-5 border-t border-monstera-200 bg-paper absolute bottom-0 left-0 right-0">
                <button
                  onClick={handleGenerate}
                  disabled={!state.prompt.trim()}
                  className="w-full py-3.5 px-6 bg-monstera-400 text-ink font-[900] text-[13px] uppercase tracking-[0.2em] border-2 border-ink rounded-md transition-all shadow-[4px_4px_0_rgba(13,33,23,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-20 disabled:grayscale"
                >
                  Generovat
                </button>
             </div>
          </div>
        )}

        <div className="p-4 lg:px-10 lg:pt-6 lg:pb-10 space-y-6 md:space-y-8 max-w-[1800px] mx-auto w-full">
          <header className="hidden lg:flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 bg-ink rounded-full"></div>
                <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-ink">Galerie</h2>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 hidden lg:flex">
              <button
                onClick={() => setIsGalleryOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-monstera-400 hover:bg-monstera-500 text-ink font-black text-[9px] uppercase tracking-widest rounded-md border-2 border-ink shadow-lg transition-all active:scale-95"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Galerie
              </button>
              {state.generatedImages.length > 0 && (
                <button 
                  onClick={async () => {
                    const successImages = state.generatedImages.filter(img => img.status === 'success' && img.url);
                    if (successImages.length === 0) return;
                    setDownloadingAll(true);
                    const zip = new JSZip();
                    const folderName = `nano-banana-pro-${Date.now()}`;
                    const folder = zip.folder(folderName);
                    await Promise.all(successImages.map(async img => {
                      const res = await fetch(img.url!);
                      const blob = await res.blob();
                      const slug = slugify(img.prompt);
                      const baseFilename = `${img.id}${slug ? '-' + slug : ''}`;
                      folder!.file(`${baseFilename}.jpg`, blob);

                      const metadata = [
                        `Prompt: ${img.prompt}`,
                        `Resolution: ${img.resolution || 'N/A'}`,
                        `Aspect Ratio: ${img.aspectRatio || 'N/A'}`,
                        `Timestamp: ${new Date(img.timestamp).toLocaleString()}`,
                        `ID: ${img.id}`,
                        img.groundingMetadata ? `Grounding Metadata: ${JSON.stringify(img.groundingMetadata, null, 2)}` : ''
                      ].filter(Boolean).join('\n');

                      folder!.file(`${baseFilename}.txt`, metadata);
                    }));
                    const content = await zip.generateAsync({type:"blob"});
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(content);
                    link.download = `${folderName}.zip`;
                    link.click();
                    setDownloadingAll(false);
                  }}
                  disabled={downloadingAll}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-ink font-black text-[9px] uppercase tracking-widest rounded-md border border-monstera-200 hover:border-ink shadow-sm transition-all active:scale-95"
                >
                  {downloadingAll ? (
                    <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  )}
                  {downloadingAll ? 'Balím...' : 'Exportovat vše'}
                </button>
              )}
            </div>
          </header>

          {state.generatedImages.length === 0 ? (
            <div className="py-20 md:py-40 flex flex-col items-center justify-center space-y-6">
              <div className="w-16 h-16 bg-monstera-50 rounded-md flex items-center justify-center grayscale opacity-20 border border-monstera-200 shadow-inner">
                <span className="text-3xl">🍌</span>
              </div>
              <div className="text-center space-y-2">
                <span className="text-lg font-bold text-ink block">Zatím žádné vygenerované obrázky</span>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:gap-6" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
              {state.generatedImages.map((image) => (
                <article key={image.id} className="group flex flex-col bg-white border border-monstera-200 rounded-md overflow-hidden shadow-sm hover:shadow-lg transition-all animate-fadeIn">
                  <div
                    className={`relative bg-monstera-50 cursor-zoom-in ${image.status !== 'success' ? 'aspect-square' : ''}`}
                    style={gridCols === 1 && image.status !== 'success' ? getLoadingAspectRatio(image.aspectRatio) : undefined}
                    onClick={() => setSelectedImage(image)}
                  >
                    {image.status === 'loading' ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/40">
                        <LoadingSpinner />
                      </div>
                    ) : (
                      image.url && (
                        <>
                          <img
                            src={image.url}
                            className={`w-full h-auto ${image.isEditing ? 'blur-sm scale-105' : ''} transition-all duration-500`}
                            decoding="sync"
                            style={{ imageRendering: '-webkit-optimize-contrast' }}
                          />
                          {image.isEditing && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/20 pointer-events-none">
                              <div className="bg-white/90 backdrop-blur-sm px-6 py-3 rounded-lg shadow-2xl border-2 border-monstera-400">
                                <span className="text-[11px] font-black text-monstera-700 uppercase tracking-widest animate-pulse">● Upravuji...</span>
                              </div>
                            </div>
                          )}
                        </>
                      )
                    )}

                    {image.status === 'error' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-10 h-10 bg-red-500 text-white rounded-md flex items-center justify-center mb-4 shadow-lg">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                        </div>
                        <h4 className="text-red-700 font-[900] uppercase text-[9px] mb-2 tracking-[0.2em]">Chyba</h4>
                        <p className="text-[8px] font-bold text-red-500 leading-relaxed max-w-[150px]">{image.error}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="px-3 py-2.5 flex flex-col gap-2 border-t border-monstera-200 bg-white">
                    <div className="flex items-center gap-3">
                      <p className="text-[11px] font-bold text-ink leading-snug line-clamp-1 flex-1" title={image.prompt}>
                        {image.prompt}
                      </p>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(image.prompt); }}
                          className="p-2 text-monstera-400 hover:text-ink hover:bg-monstera-100 rounded-md transition-all border border-transparent hover:border-monstera-200"
                          title="Kopírovat prompt"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRepopulate(image); }}
                          className="p-2 text-monstera-400 hover:text-ink hover:bg-monstera-100 rounded-md transition-all border border-transparent hover:border-monstera-200"
                          title="Použít nastavení"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                        </button>
                        {image.url && (
                          <a
                            href={image.url}
                            download={`${image.id}${slugify(image.prompt) ? '-' + slugify(image.prompt) : ''}.jpg`}
                            className="p-2 text-monstera-400 hover:text-ink hover:bg-monstera-100 rounded-md transition-all border border-transparent hover:border-monstera-200"
                            title="Stáhnout"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          </a>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteImage(image.id); }}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all border border-transparent hover:border-red-200"
                          title="Smazat obrázek"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                    {image.groundingMetadata?.groundingChunks && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {image.groundingMetadata.groundingChunks.map((chunk: any, i: number) => (
                          chunk.web?.uri && (
                            <a
                              key={i}
                              href={chunk.web.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-monstera-50 text-monstera-600 hover:bg-monstera-200 hover:text-ink rounded border border-monstera-200 transition-all truncate max-w-full"
                              title={chunk.web.title || chunk.web.uri}
                            >
                              {getDomainFromUrl(chunk.web.uri, chunk.web.title)}
                            </a>
                          )
                        ))}
                      </div>
                    )}

                    {image.status === 'success' && image.url && (
                      <div className="mt-3 pt-3 border-t border-monstera-100 space-y-2.5">
                        {/* Edit Prompt Section */}
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 space-y-1.5">
                              <div className="flex items-center justify-between px-1">
                                <label className="text-[9px] font-black text-monstera-700 uppercase tracking-wider flex items-center gap-1.5">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Upravit prompt
                                </label>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowReferenceUpload(prev => ({ ...prev, [image.id]: !prev[image.id] }));
                                    if (!inlineEditStates[image.id]) {
                                      setInlineEditStates(prev => ({
                                        ...prev,
                                        [image.id]: { prompt: editPrompts[image.id] || '', referenceImages: [] }
                                      }));
                                    }
                                  }}
                                  className={`flex items-center gap-1 px-2 py-1 text-[8px] font-bold uppercase tracking-wider rounded transition-all ${
                                    showReferenceUpload[image.id]
                                      ? 'bg-monstera-400 text-ink border border-ink'
                                      : 'bg-monstera-100 text-monstera-600 hover:bg-monstera-200 border border-monstera-200'
                                  }`}
                                  title="Přidat referenční obrázky"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  {showReferenceUpload[image.id] ? 'Obrázky' : '+ Obrázky'}
                                </button>
                              </div>
                              <textarea
                                value={editPrompts[image.id] || ''}
                                onChange={(e) => {
                                  setEditPrompts(prev => ({ ...prev, [image.id]: e.target.value }));
                                  if (inlineEditStates[image.id]) {
                                    setInlineEditStates(prev => ({
                                      ...prev,
                                      [image.id]: { ...prev[image.id], prompt: e.target.value }
                                    }));
                                  }
                                }}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleEditImage(image.id);
                                  }
                                }}
                                placeholder="Popište, jak upravit tento obrázek... (⏎ pro aplikaci)"
                                disabled={image.isEditing}
                                className="w-full min-h-[60px] text-[11px] font-medium bg-white border-2 border-monstera-200 rounded-lg px-3 py-2 outline-none focus:border-monstera-400 focus:ring-2 focus:ring-monstera-200 resize-none transition-all disabled:opacity-50 disabled:bg-monstera-50 leading-relaxed placeholder-monstera-300"
                              />
                            </div>
                            <div className="flex flex-col gap-1.5 pt-6">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditImage(image.id); }}
                                disabled={!editPrompts[image.id]?.trim() || image.isEditing}
                                className="p-2.5 bg-gradient-to-br from-monstera-300 to-monstera-400 hover:from-monstera-400 hover:to-monstera-500 text-ink rounded-lg transition-all disabled:opacity-20 disabled:cursor-not-allowed disabled:grayscale border-2 border-ink shadow-md hover:shadow-lg active:scale-95"
                                title="Aplikovat úpravu (Enter)"
                              >
                                {image.isEditing ? (
                                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                              {image.versions && image.versions.length > 0 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleUndoEdit(image.id); }}
                                  disabled={image.isEditing}
                                  className="p-2.5 bg-white hover:bg-monstera-100 text-monstera-600 hover:text-ink rounded-lg transition-all border-2 border-monstera-300 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm hover:shadow-md active:scale-95"
                                  title={`Vrátit zpět (${image.versions.length} verze)`}
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Reference Images Upload Section */}
                          {showReferenceUpload[image.id] && (
                            <div className="space-y-1.5 animate-fadeIn">
                              <label className="text-[8px] font-black text-monstera-600 uppercase tracking-wider px-1">Referenční obrázky (volitelné)</label>
                              <div className="grid grid-cols-4 gap-2 p-2 bg-monstera-50/50 rounded-lg border border-monstera-200">
                                {inlineEditStates[image.id]?.referenceImages?.map((img) => (
                                  <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border-2 border-monstera-300 bg-white shadow-sm hover:shadow-md transition-all">
                                    <img src={img.url} className="w-full h-full object-cover" alt="Reference" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent opacity-0 group-hover:opacity-100 transition-all flex items-end justify-center pb-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); removeInlineReferenceImage(image.id, img.id); }}
                                        className="bg-white text-red-600 hover:bg-red-600 hover:text-white p-1.5 rounded-md shadow-xl transition-all transform hover:scale-110"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                {(!inlineEditStates[image.id]?.referenceImages || inlineEditStates[image.id].referenceImages.length < MAX_IMAGES) && (
                                  <ImageUpload
                                    onImagesSelected={(files) => addInlineReferenceImages(image.id, files)}
                                    compact={true}
                                    remainingSlots={MAX_IMAGES - (inlineEditStates[image.id]?.referenceImages?.length || 0)}
                                  />
                                )}
                              </div>
                            </div>
                          )}

                          {/* Progress Bar */}
                          {image.isEditing && (
                            <div className="relative w-full h-2 bg-monstera-100 rounded-full overflow-hidden shadow-inner animate-fadeIn">
                              <div
                                className="absolute inset-0 bg-gradient-to-r from-monstera-400 via-monstera-500 to-monstera-400"
                                style={{
                                  animation: 'shimmer 2s ease-in-out infinite',
                                  backgroundSize: '200% 100%'
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

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
    </div>
  );
};

export default App;