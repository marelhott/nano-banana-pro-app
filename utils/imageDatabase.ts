// Utilita pro správu databáze obrázků v Supabase

import { supabase, getCurrentUserId } from './supabaseClient';
import { uploadImage, getPublicUrl, deleteImage as deleteStorageImage, dataUrlToBlob } from './supabaseStorage';

export interface StoredImage {
  id: string;
  url: string; // Public URL z Supabase Storage
  fileName: string;
  fileType: string;
  fileSize: number;
  timestamp: number;
  category: 'reference' | 'style'; // typ obrázku
}

// Cache pro rychlejší načítání
let cachedImages: StoredImage[] | null = null;

export class ImageDatabase {
  // Získat všechny obrázky z databáze
  static async getAll(): Promise<StoredImage[]> {
    const userId = getCurrentUserId();
    if (!userId) return [];

    try {
      const { data, error } = await supabase
        .from('saved_images')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      cachedImages = data.map(row => ({
        id: row.id,
        url: getPublicUrl(row.storage_path),
        fileName: row.file_name,
        fileType: 'image/jpeg', // Default
        fileSize: row.file_size || 0,
        timestamp: new Date(row.created_at).getTime(),
        category: row.category as 'reference' | 'style'
      }));

      return cachedImages;
    } catch (error) {
      console.error('Error reading image database:', error);
      return [];
    }
  }

  // Získat obrázky podle kategorie (synchronní - použije cache)
  static getByCategory(category: 'reference' | 'style'): StoredImage[] {
    if (!cachedImages) return [];
    return cachedImages.filter(img => img.category === category);
  }

  // Asynchronní verze - načte z databáze
  static async getByCategoryAsync(category: 'reference' | 'style'): Promise<StoredImage[]> {
    const all = await this.getAll();
    return all.filter(img => img.category === category);
  }

  // Přidat obrázek do databáze
  static async add(file: File, dataUrl: string, category: 'reference' | 'style'): Promise<StoredImage> {
    const userId = getCurrentUserId();
    if (!userId) {
      throw new Error('Uživatel není přihlášen');
    }

    try {
      // 1. Upload do storage
      const blob = await dataUrlToBlob(dataUrl);
      const storagePath = await uploadImage(blob, 'saved');

      // 2. Uložit metadata do DB
      const { data, error } = await supabase
        .from('saved_images')
        .insert({
          user_id: userId,
          file_name: file.name,
          storage_path: storagePath,
          category: category,
          file_size: file.size
        })
        .select()
        .single();

      if (error) throw error;

      const newImage: StoredImage = {
        id: data.id,
        url: getPublicUrl(storagePath),
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        timestamp: new Date(data.created_at).getTime(),
        category
      };

      // Invalidovat cache
      cachedImages = null;

      return newImage;
    } catch (error) {
      console.error('Error adding image:', error);
      throw error;
    }
  }

  // Odstranit obrázek z databáze
  static async remove(id: string): Promise<void> {
    try {
      // 1. Najít storage path
      const { data } = await supabase
        .from('saved_images')
        .select('storage_path')
        .eq('id', id)
        .single();

      if (data) {
        // 2. Smazat ze storage
        await deleteStorageImage(data.storage_path);

        // 3. Smazat z DB
        await supabase
          .from('saved_images')
          .delete()
          .eq('id', id);

        // Invalidovat cache
        cachedImages = null;
      }
    } catch (error) {
      console.error('Error removing image:', error);
      throw error;
    }
  }

  // Vymazat všechny obrázky
  static async clear(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    try {
      // Smazat všechny obrázky uživatele
      const { data } = await supabase
        .from('saved_images')
        .select('storage_path')
        .eq('user_id', userId);

      if (data) {
        // Smazat ze storage
        for (const row of data) {
          await deleteStorageImage(row.storage_path);
        }
      }

      // Smazat z DB
      await supabase
        .from('saved_images')
        .delete()
        .eq('user_id', userId);

      // Invalidovat cache
      cachedImages = null;
    } catch (error) {
      console.error('Error clearing database:', error);
      throw error;
    }
  }

  // Vymazat obrázky podle kategorie
  static async clearByCategory(category: 'reference' | 'style'): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    try {
      const { data } = await supabase
        .from('saved_images')
        .select('storage_path')
        .eq('user_id', userId)
        .eq('category', category);

      if (data) {
        for (const row of data) {
          await deleteStorageImage(row.storage_path);
        }
      }

      await supabase
        .from('saved_images')
        .delete()
        .eq('user_id', userId)
        .eq('category', category);

      // Invalidovat cache
      cachedImages = null;
    } catch (error) {
      console.error('Error clearing category:', error);
      throw error;
    }
  }

  // Získat velikost databáze v MB (aproximace)
  static async getSize(): Promise<number> {
    const userId = getCurrentUserId();
    if (!userId) return 0;

    try {
      const { data } = await supabase
        .from('saved_images')
        .select('file_size')
        .eq('user_id', userId);

      if (!data) return 0;

      const totalBytes = data.reduce((sum, row) => sum + (row.file_size || 0), 0);
      return totalBytes / (1024 * 1024); // MB
    } catch (error) {
      console.error('Error getting size:', error);
      return 0;
    }
  }

  // Získat počet obrázků
  static async getCount(): Promise<number> {
    const userId = getCurrentUserId();
    if (!userId) return 0;

    try {
      const { count, error } = await supabase
        .from('saved_images')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting count:', error);
      return 0;
    }
  }
}

/**
 * Provider Settings Management
 */
import { AIProviderType, ProviderSettings } from '../services/aiProvider';

export class SettingsDatabase {
  private static sanitizeProviderSettings(settings: ProviderSettings): Record<string, { enabled: boolean }> {
    const sanitized: Record<string, { enabled: boolean }> = {};

    for (const provider of Object.values(AIProviderType)) {
      const config = settings[provider];
      sanitized[provider] = {
        enabled: Boolean(config?.enabled || config?.apiKey)
      };
    }

    return sanitized;
  }

  private static deserializeProviderSettings(payload: unknown): ProviderSettings | null {
    if (!payload || typeof payload !== 'object') return null;

    const source = (payload as any).providers && typeof (payload as any).providers === 'object'
      ? (payload as any).providers
      : payload;

    const restored: ProviderSettings = {};
    for (const provider of Object.values(AIProviderType)) {
      const entry = source?.[provider];
      if (!entry || typeof entry !== 'object') continue;
      restored[provider] = {
        apiKey: '',
        enabled: Boolean((entry as any).enabled)
      };
    }

    return Object.keys(restored).length > 0 ? restored : null;
  }

  /**
   * Save provider settings to Supabase
   */
  static async saveProviderSettings(settings: ProviderSettings): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          settings: {
            providers: this.sanitizeProviderSettings(settings),
            storedAt: new Date().toISOString(),
            includesSecrets: false
          },
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      console.log('[Settings] Provider settings saved to Supabase');
    } catch (error) {
      console.error('[Settings] Error saving provider settings:', error);
      throw error;
    }
  }

  /**
   * Load provider settings from Supabase
   */
  static async loadProviderSettings(): Promise<ProviderSettings | null> {
    const userId = getCurrentUserId();
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('settings')  // Changed from provider_settings to settings
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error is OK
        throw error;
      }

      if (data?.settings) {
        console.log('[Settings] Provider settings loaded from Supabase');
        return this.deserializeProviderSettings(data.settings);
      }

      return null;
    } catch (error) {
      console.error('[Settings] Error loading provider settings:', error);
      return null;
    }
  }
}
