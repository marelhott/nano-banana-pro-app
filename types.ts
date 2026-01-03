
export interface ImageVersion {
  url: string;
  prompt: string;
  timestamp: number;
}

export interface GeneratedImage {
  id: string;
  url?: string;
  prompt: string;
  timestamp: number;
  status: 'loading' | 'success' | 'error';
  error?: string;
  groundingMetadata?: any;
  resolution?: string;
  aspectRatio?: string;
  styleCode?: number;
  versions?: ImageVersion[]; // Historie předchozích verzí
  isEditing?: boolean; // Je obrázek právě upravován?
}

export interface SourceImage {
  id: string;
  url: string;
  file: File;
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
}

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic' | 'image/heif';
