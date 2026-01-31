
export interface ImageVersion {
  url: string;
  prompt: string;
  timestamp: number;
}

export type ProviderId = 'gemini' | 'grok' | 'chatgpt';

export interface GenerationRecipe {
  provider: ProviderId;
  operation: 'generate' | 'edit' | 'variant' | 'batch';
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
  versions?: Array<{ url: string; prompt: string; timestamp: number }>;
  currentVersionIndex?: number; // Track which version is currently displayed (for undo/redo)
  isEditing?: boolean;
  progress?: number; // 0-100 for generation progress tracking
  recipe?: GenerationRecipe;

  // Variant generation metadata
  variantInfo?: {
    isVariant: boolean;
    variantNumber: number; // 1, 2, or 3
    variant: string; // "Photorealistic", "Artistic", "Technical"
    approach: string; // Detailed approach description
    originalPrompt: string; // The simple prompt user entered
  };
  selected?: boolean; // Pro batch operations
  collectionIds?: string[]; // ID kolekcí, do kterých patří
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
  sourceImages: SourceImage[]; // Referenční obrázky - hlavní obsah k úpravě
  styleImages: SourceImage[]; // Stylové obrázky - reference pro styl
  generatedImages: GeneratedImage[];
  prompt: string;
  aspectRatio: string; // 'Original', '1:1', '2:3', '3:2', '3:4', '4:3', '5:4', '4:5', '9:16', '16:9', '21:9'
  resolution: string; // '1k', '2k', '4k'
  error: string | null; // For global/upload errors
  numberOfImages: number; // Number of images to generate at once (1-5)
  shouldAutoGenerate?: boolean;
}

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic' | 'image/heif';
