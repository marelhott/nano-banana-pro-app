/**
 * Supabase Storage helper pro upload a správu obrázků
 */

import { supabase, getCurrentUserId } from './supabaseClient';

/**
 * Upload obrázku do Supabase Storage
 *
 * @param file - File objekt
 * @param folder - Složka ('saved' nebo 'generated')
 * @returns Storage path
 */
export async function uploadImage(file: File | Blob, folder: 'saved' | 'generated'): Promise<string> {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error('Uživatel není přihlášen');
  }

  // Vytvoř unikátní název souboru
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const extension = file instanceof File ? file.name.split('.').pop() : 'jpg';
  const fileName = `${userId}/${folder}/${timestamp}-${random}.${extension}`;

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
