// Supabase utilita pro ukládání vygenerovaných obrázků do galerie

import { supabase, getCurrentUserId } from './supabaseClient';
import { uploadImage, getPublicUrl, deleteImage as deleteStorageImage, dataUrlToBlob } from './supabaseStorage';

export interface GalleryImage {
  id: string;
  url: string; // Public URL z Supabase Storage
  prompt: string;
  timestamp: number;
  resolution?: string;
  aspectRatio?: string;
  thumbnail?: string; // URL thumbnailů z Storage
  isVideo?: boolean;   // Flag for video results
  duration?: number;   // Video duration in seconds
}

type SaveToGalleryInput = Omit<GalleryImage, 'id' | 'timestamp'> & {
  id?: string;
  timestamp?: number;
};

// Uložit obrázek do galerie
export const saveToGallery = async (image: SaveToGalleryInput): Promise<void> => {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error('Uživatel není přihlášen');
  }

  try {
    // 1. Upload hlavního obrázku
    const imageBlob = await dataUrlToBlob(image.url);
    const storagePath = await uploadImage(imageBlob, 'generated');

    // 2. Upload thumbnai (pokud existuje)
    let thumbnailPath: string | undefined;
    if (image.thumbnail) {
      const thumbnailBlob = await dataUrlToBlob(image.thumbnail);
      thumbnailPath = await uploadImage(thumbnailBlob, 'generated');
    }

    // 3. Uložit metadata do DB
    const row: Record<string, any> = {
      user_id: userId,
      prompt: image.prompt,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      resolution: image.resolution,
      aspect_ratio: image.aspectRatio
    };

    if (image.id) {
      row.id = image.id;
    }

    if (image.timestamp) {
      row.created_at = new Date(image.timestamp).toISOString();
    }

    const { error } = await supabase
      .from('generated_images')
      .upsert(row, { onConflict: 'id' });

    if (error) throw error;
  } catch (error) {
    console.error('Error saving to gallery:', error);
    throw error;
  }
};

// Helper function to generate a simple hash from image data
const generateImageHash = (dataUrl: string): string => {
  // Extract just the base64 data part (after the comma)
  const base64Data = dataUrl.split(',')[1] || dataUrl;

  // Take a sample of the data for hash (first 200 chars + last 200 chars + length)
  // This is fast and catches most duplicates
  const sample = base64Data.substring(0, 200) + base64Data.substring(base64Data.length - 200) + base64Data.length;

  // Simple hash using btoa (base64 encode)
  return btoa(sample).substring(0, 64);
};

// Získat všechny obrázky z galerie
export const getAllImages = async (): Promise<GalleryImage[]> => {
  const userId = getCurrentUserId();
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from('generated_images')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(row => ({
      id: row.id,
      url: getPublicUrl(row.storage_path),
      prompt: row.prompt,
      timestamp: new Date(row.created_at).getTime(),
      resolution: row.resolution,
      aspectRatio: row.aspect_ratio,
      thumbnail: row.thumbnail_path ? getPublicUrl(row.thumbnail_path) : undefined
    }));
  } catch (error) {
    console.error('Error loading gallery:', error);
    return [];
  }
};

// Smazat obrázek z galerie
export const deleteImage = async (id: string): Promise<void> => {
  try {
    // 1. Najít storage paths
    const { data } = await supabase
      .from('generated_images')
      .select('storage_path, thumbnail_path')
      .eq('id', id)
      .single();

    if (data) {
      // 2. Smazat ze storage
      await deleteStorageImage(data.storage_path);
      if (data.thumbnail_path) {
        await deleteStorageImage(data.thumbnail_path);
      }

      // 3. Smazat z DB
      await supabase
        .from('generated_images')
        .delete()
        .eq('id', id);
    }
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
};

// Vymazat celou galerii
export const clearGallery = async (): Promise<void> => {
  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    // 1. Získat všechny storage paths
    const { data } = await supabase
      .from('generated_images')
      .select('storage_path, thumbnail_path')
      .eq('user_id', userId);

    if (data) {
      // 2. Smazat všechny obrázky ze storage
      for (const row of data) {
        await deleteStorageImage(row.storage_path);
        if (row.thumbnail_path) {
          await deleteStorageImage(row.thumbnail_path);
        }
      }
    }

    // 3. Smazat z DB
    await supabase
      .from('generated_images')
      .delete()
      .eq('user_id', userId);
  } catch (error) {
    console.error('Error clearing gallery:', error);
    throw error;
  }
};

// Vytvořit thumbnail z plného obrázku
export const createThumbnail = (dataUrl: string, maxSize: number = 400): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Zapnout antialiasing pro lepší kvalitu
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
      }
      // Zvýšit kvalitu JPEG komprese z 0.7 na 0.85
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
};
