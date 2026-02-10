
export interface ImageVersion {
  url: string;
  prompt: string;
  timestamp: number;
}

export type ProviderId = 'gemini' | 'grok' | 'chatgpt' | 'replicate';

export interface StyleAnalysis {
  recommendedStrength: number;
  styleDescription: string;
  negativePrompt: string;
}

export interface LineageEntry {
  sourceImageIds: string[];
  styleImageIds: string[];
  sourceImageUrls: string[];
  styleImageUrls: string[];
}

export interface GenerationRecipe {
  provider: ProviderId;
  operation: 'generate' | 'edit' | 'variant' | 'batch' | 'upscale' | 'inpaint' | 'outpaint' | '3ai';
  prompt: string;
  effectivePrompt?: string;
  useGrounding?: boolean;
  promptMode: 'simple' | 'advanced';
  advancedVariant?: 'A' | 'B' | 'C';
  faceIdentityMode?: boolean;
  jsonContextFileName?: string;
  resolution?: string;
  aspectRatio?: string;
  sourceImageCount: number;
  styleImageCount: number;
  createdAt: number;
  styleStrength?: number;
  styleAnalysis?: StyleAnalysis;
  lineage?: LineageEntry;
  styleWeights?: Record<string, number>;
  upscaleFactor?: number;
  maskData?: string;
  outpaintDirection?: 'top' | 'bottom' | 'left' | 'right' | 'all';
  outpaintPixels?: number;
  cfgScale?: number;
  steps?: number;
  denoise?: number;
  seed?: number;
  modelId?: string;
}

export interface ImageVersionEntry {
  url: string;
  prompt: string;
  timestamp: number;
  recipe?: GenerationRecipe;
}

export interface GeneratedImage {
  id: string;
  url?: string;
  prompt: string;
  timestamp: number;
  status: 'loading' | 'success' | 'error' | 'idle';
  error?: string;
  groundingMetadata?: any;
  resolution?: string;
  aspectRatio?: string;
  styleCode?: number;
  versions?: ImageVersionEntry[];
  currentVersionIndex?: number;
  isEditing?: boolean;
  progress?: number;
  recipe?: GenerationRecipe;
  lineage?: LineageEntry;

  // Variant generation metadata
  variantInfo?: {
    isVariant: boolean;
    variantNumber: number;
    variant: string;
    approach: string;
    originalPrompt: string;
  };
  selected?: boolean;
  collectionIds?: string[];
}

export interface SourceImage {
  id: string;
  url: string;
  file: File;
  prompt?: string; // Původní prompt z galerie, pokud existuje
}

export interface SavedPrompt {
  id: string;
  name: string;
  prompt: string;
  category?: string;
  timestamp: number;
}

export interface AppState {
  sourceImages: SourceImage[];
  styleImages: SourceImage[];
  generatedImages: GeneratedImage[];
  prompt: string;
  aspectRatio: string;
  resolution: string;
  error: string | null;
  numberOfImages: number;
  multiRefMode?: 'batch' | 'together';
  shouldAutoGenerate?: boolean;
  styleStrength?: number; // 0-100 síla stylu
  styleWeights?: Record<string, number>; // váhy pro individuální stylové obrázky
}

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic' | 'image/heif';
