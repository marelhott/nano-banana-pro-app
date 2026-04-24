/**
 * Supabase Storage helper pro upload a správu obrázků
 */

import { listGeneratedLibraryImages, listSavedLibraryImages } from './singleUserMediaStore';
import { supabase, ensureAnonymousSession, getCurrentUserId } from './supabaseClient';

let metadataBackfillPromise: Promise<{ saved: number; generated: number }> | null = null;

function normalizeSavedCategory(category: 'reference' | 'style' | 'asset'): 'reference' | 'style' {
  return category === 'style' ? 'style' : 'reference';
}

function extractStoragePathFromPublicUrl(url?: string): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const marker = '/storage/v1/object/public/images/';
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return undefined;
    return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    return undefined;
  }
}

async function savedMetadataExists(storagePath: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('saved_images')
    .select('id')
    .eq('storage_path', storagePath)
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function generatedMetadataExists(storagePath: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('generated_images')
    .select('id')
    .eq('storage_path', storagePath)
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/**
 * Upload obrázku do Supabase Storage
 *
 * @param file - File objekt
 * @param folder - Složka ('saved' nebo 'generated')
 * @returns Storage path
 */
export async function uploadImage(file: File | Blob, folder: 'saved' | 'generated'): Promise<string> {
  const authUserId = await ensureAnonymousSession();

  // Vytvoř unikátní název souboru
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const extension = file instanceof File ? file.name.split('.').pop() : 'jpg';
  const fileName = `${authUserId}/${folder}/${timestamp}-${random}.${extension}`;

  // Upload do storage
  const { data, error } = await supabase.storage
    .from('images')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('Upload error:', error);
    throw new Error(`Nepodařilo se nahrát obrázek: ${error.message}`);
  }

  return data.path;
}

/**
 * Získat veřejnou URL obrázku
 */
export function getPublicUrl(path: string): string {
  const { data } = supabase.storage
    .from('images')
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Smazat obrázek ze storage
 */
export async function deleteImage(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from('images')
    .remove([path]);

  if (error) {
    console.error('Delete error:', error);
    throw new Error(`Nepodařilo se smazat obrázek: ${error.message}`);
  }
}

export async function saveSavedImageMetadata(input: {
  fileName: string;
  storagePath: string;
  category: 'reference' | 'style' | 'asset';
  fileSize?: number;
}): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error('Chybí lokální app user ID pro zápis saved_images.');
  }

  await ensureAnonymousSession();

  const { error } = await supabase
    .from('saved_images')
    .insert({
      user_id: userId,
      file_name: input.fileName,
      storage_path: input.storagePath,
      category: normalizeSavedCategory(input.category),
      file_size: input.fileSize || 0,
    });

  if (error) {
    console.error('saved_images insert error:', error);
    throw new Error(`Nepodařilo se zapsat saved_images: ${error.message}`);
  }
}

export async function saveGeneratedImageMetadata(input: {
  prompt: string;
  storagePath: string;
  thumbnailPath?: string;
  resolution?: string;
  aspectRatio?: string;
  params?: any;
}): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error('Chybí lokální app user ID pro zápis generated_images.');
  }

  await ensureAnonymousSession();

  const { error } = await supabase
    .from('generated_images')
    .insert({
      user_id: userId,
      prompt: input.prompt,
      storage_path: input.storagePath,
      thumbnail_path: input.thumbnailPath || null,
      resolution: input.resolution || null,
      aspect_ratio: input.aspectRatio || null,
      params: input.params || {},
    });

  if (error) {
    console.error('generated_images insert error:', error);
    throw new Error(`Nepodařilo se zapsat generated_images: ${error.message}`);
  }
}

export async function deleteSavedImageMetadataByStoragePath(storagePath: string): Promise<void> {
  if (!storagePath) return;
  await ensureAnonymousSession();

  const { error } = await supabase
    .from('saved_images')
    .delete()
    .eq('storage_path', storagePath);

  if (error) {
    console.error('saved_images delete error:', error);
    throw new Error(`Nepodařilo se smazat saved_images metadata: ${error.message}`);
  }
}

export async function deleteGeneratedImageMetadataByStoragePath(storagePath: string): Promise<void> {
  if (!storagePath) return;
  await ensureAnonymousSession();

  const { error } = await supabase
    .from('generated_images')
    .delete()
    .eq('storage_path', storagePath);

  if (error) {
    console.error('generated_images delete error:', error);
    throw new Error(`Nepodařilo se smazat generated_images metadata: ${error.message}`);
  }
}

export async function backfillLocalLibraryMetadataToCloud(): Promise<{ saved: number; generated: number }> {
  if (metadataBackfillPromise) {
    return metadataBackfillPromise;
  }

  metadataBackfillPromise = (async () => {
    await ensureAnonymousSession();
    const [savedItems, generatedItems] = await Promise.all([
      listSavedLibraryImages(),
      listGeneratedLibraryImages(),
    ]);

    let saved = 0;
    let generated = 0;

    for (const item of savedItems) {
      const storagePath = item.remoteStoragePath || extractStoragePathFromPublicUrl(item.url);
      if (!storagePath) continue;

      const exists = await savedMetadataExists(storagePath);
      if (exists) continue;

      await saveSavedImageMetadata({
        fileName: item.fileName,
        storagePath,
        category: item.category,
        fileSize: item.fileSize,
      });
      saved += 1;
    }

    for (const item of generatedItems) {
      const storagePath = item.remoteStoragePath || extractStoragePathFromPublicUrl(item.url);
      if (!storagePath) continue;

      const exists = await generatedMetadataExists(storagePath);
      if (exists) continue;

      const thumbnailPath = item.remoteThumbnailPath || extractStoragePathFromPublicUrl(item.thumbnail);

      await saveGeneratedImageMetadata({
        prompt: item.prompt,
        storagePath,
        thumbnailPath,
        resolution: item.resolution,
        aspectRatio: item.aspectRatio,
        params: item.params,
      });
      generated += 1;
    }

    return { saved, generated };
  })();

  try {
    return await metadataBackfillPromise;
  } finally {
    metadataBackfillPromise = null;
  }
}

/**
 * Konvertovat data URL na Blob
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return await response.blob();
}

/**
 * Konvertovat libovolnou URL (HTTP nebo data URL) na base64 data URL
 * Pro Gemini API který vyžaduje inline base64 data
 */
export async function urlToDataUrl(url: string): Promise<string> {
  // Pokud už je to data URL, vrátit rovnou
  if (url.startsWith('data:')) {
    return url;
  }

  try {
    // Stáhnout obrázek z HTTP URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new Error('URL nevrátila obrázek');
    }
    const blob = await response.blob();

    // Převést na base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert to data URL'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error converting URL to data URL:', error);
    throw new Error(`Nepodařilo se převést URL na data URL: ${error}`);
  }
}

/**
 * Vytvořit thumbnail z obrázku
 */
export async function createThumbnail(dataUrl: string, maxSize: number = 400): Promise<Blob> {
  return new Promise((resolve, reject) => {
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
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Nepodařilo se vytvořit thumbnail'));
        }
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek'));
    img.src = dataUrl;
  });
}
