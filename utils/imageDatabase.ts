import { AIProviderType, ProviderSettings } from '../services/aiProvider';
import { dataUrlToBlob, deleteImage as deleteStorageImage, uploadImage } from './supabaseStorage';
import {
  clearSavedLibraryImages,
  getSavedLibraryImageRecord,
  getSavedLibraryImageStats,
  listSavedLibraryImages,
  removeSavedLibraryImage,
  saveSavedLibraryImage,
  type SingleUserSavedImage,
} from './singleUserMediaStore';
import { readJsonStorage, writeJsonStorage } from './singleUserStore';

export interface StoredImage extends SingleUserSavedImage {}

const PROVIDER_SETTINGS_STORAGE_KEY = 'providerSettings';
let cachedImages: StoredImage[] = [];

export class ImageDatabase {
  static async getAll(): Promise<StoredImage[]> {
    try {
      cachedImages = await listSavedLibraryImages();
      return cachedImages;
    } catch (error) {
      console.error('Error reading image database:', error);
      return [];
    }
  }

  static getByCategory(category: 'reference' | 'style' | 'asset'): StoredImage[] {
    return cachedImages.filter((img) => img.category === category);
  }

  static async getByCategoryAsync(category: 'reference' | 'style' | 'asset'): Promise<StoredImage[]> {
    const all = await this.getAll();
    return all.filter((img) => img.category === category);
  }

  static async add(file: File, dataUrl: string, category: 'reference' | 'style' | 'asset'): Promise<StoredImage> {
    const blob = await dataUrlToBlob(dataUrl);

    const localRecord = await saveSavedLibraryImage({
      fileName: file.name,
      fileType: file.type || blob.type || 'image/jpeg',
      fileSize: file.size || blob.size || 0,
      timestamp: Date.now(),
      category,
      blob,
    });

    void (async () => {
      try {
        const storagePath = await uploadImage(blob, 'saved');
        await saveSavedLibraryImage({
          id: localRecord.id,
          fileName: localRecord.fileName,
          fileType: localRecord.fileType,
          fileSize: localRecord.fileSize,
          timestamp: localRecord.timestamp,
          category: localRecord.category,
          blob,
          remoteStoragePath: storagePath,
        });
      } catch (error) {
        console.warn('[ImageDatabase] Cloud mirror for saved image failed:', error);
      }
    })();

    return localRecord;
  }

  static async remove(id: string): Promise<void> {
    const existing = await getSavedLibraryImageRecord(id);
    await removeSavedLibraryImage(id);
    cachedImages = cachedImages.filter((image) => image.id !== id);

    if (existing?.remoteStoragePath) {
      void deleteStorageImage(existing.remoteStoragePath).catch((error) => {
        console.warn('[ImageDatabase] Failed to delete cloud saved image:', error);
      });
    }
  }

  static async clear(): Promise<void> {
    const all = await this.getAll();
    await clearSavedLibraryImages();
    cachedImages = [];

    for (const image of all) {
      if (!image.remoteStoragePath) continue;
      void deleteStorageImage(image.remoteStoragePath).catch((error) => {
        console.warn('[ImageDatabase] Failed to delete cloud saved image during clear:', error);
      });
    }
  }

  static async clearByCategory(category: 'reference' | 'style' | 'asset'): Promise<void> {
    const all = await this.getAll();
    const toDelete = all.filter((image) => image.category === category);
    await Promise.all(toDelete.map((image) => this.remove(image.id)));
  }

  static async getSize(): Promise<number> {
    const stats = await getSavedLibraryImageStats();
    return stats.totalBytes / (1024 * 1024);
  }

  static async getCount(): Promise<number> {
    const stats = await getSavedLibraryImageStats();
    return stats.count;
  }
}

export class SettingsDatabase {
  private static sanitizeProviderSettings(settings: ProviderSettings): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const provider of Object.values(AIProviderType)) {
      const config = settings[provider];
      sanitized[provider] = {
        enabled: Boolean(config?.enabled || config?.apiKey),
      };
    }

    if (settings.fal) {
      sanitized.fal = {
        enabled: Boolean(settings.fal.enabled || settings.fal.apiKey),
      };
    }

    if (settings.a1111) {
      sanitized.a1111 = {
        enabled: Boolean(settings.a1111.enabled || settings.a1111.baseUrl),
        baseUrl: settings.a1111.baseUrl || '',
        sdxlVae: settings.a1111.sdxlVae || '',
      };
    }

    return sanitized;
  }

  static async saveProviderSettings(settings: ProviderSettings): Promise<void> {
    writeJsonStorage(PROVIDER_SETTINGS_STORAGE_KEY, {
      ...settings,
      __singleUserSavedAt: new Date().toISOString(),
    });
  }

  static async loadProviderSettings(): Promise<ProviderSettings | null> {
    const data = readJsonStorage<Record<string, any> | null>(PROVIDER_SETTINGS_STORAGE_KEY, null);
    if (!data) return null;

    const restored: ProviderSettings = {};

    for (const provider of Object.values(AIProviderType)) {
      const entry = data?.[provider];
      if (!entry || typeof entry !== 'object') continue;
      restored[provider] = {
        apiKey: String((entry as any).apiKey || ''),
        enabled: Boolean((entry as any).enabled),
      };
    }

    if (data?.fal) {
      restored.fal = {
        apiKey: String(data.fal.apiKey || ''),
        enabled: Boolean(data.fal.enabled),
      };
    }

    if (data?.a1111) {
      restored.a1111 = {
        baseUrl: String(data.a1111.baseUrl || ''),
        sdxlVae: String(data.a1111.sdxlVae || ''),
        enabled: Boolean(data.a1111.enabled),
      };
    }

    const sanitized = this.sanitizeProviderSettings(restored);
    return {
      ...restored,
      ...Object.fromEntries(
        Object.entries(sanitized).map(([provider, value]) => [
          provider,
          {
            ...(restored as any)[provider],
            enabled: Boolean((value as any).enabled),
          },
        ])
      ),
    };
  }
}
