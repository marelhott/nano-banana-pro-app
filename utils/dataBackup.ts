// Utilita pro export a import všech dat aplikace

import { getAllImages, saveToGallery, GalleryImage } from './galleryDB';
import { getSavedPrompts, addSavedPrompt } from './savedPrompts';
import { SavedPrompt } from '../types';

export interface AppDataBackup {
  version: string;
  timestamp: number;
  savedPrompts: SavedPrompt[];
  galleryImages: GalleryImage[];
}

// Exportovat všechna data do JSON souboru
export const exportAllData = async (): Promise<void> => {
  try {
    const savedPrompts = getSavedPrompts();
    const galleryImages = await getAllImages();

    const backup: AppDataBackup = {
      version: '1.0',
      timestamp: Date.now(),
      savedPrompts,
      galleryImages,
    };

    const dataStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `nano-banana-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return Promise.resolve();
  } catch (error) {
    console.error('Failed to export data:', error);
    throw error;
  }
};

// Importovat data ze souboru
export const importData = (file: File): Promise<{ prompts: number; images: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const backup: AppDataBackup = JSON.parse(content);

        // Validace struktury
        if (!backup.version || !backup.savedPrompts || !backup.galleryImages) {
          throw new Error('Neplatný formát zálohy');
        }

        let importedPrompts = 0;
        let importedImages = 0;

        // Import saved prompts (přeskočit duplicity podle názvu)
        const existingPrompts = getSavedPrompts();
        const existingNames = new Set(existingPrompts.map(p => p.name));

        for (const prompt of backup.savedPrompts) {
          if (!existingNames.has(prompt.name)) {
            addSavedPrompt(prompt.name, prompt.prompt, prompt.category);
            importedPrompts++;
          }
        }

        // Import gallery images (přeskočit duplicity podle ID)
        const existingImages = await getAllImages();
        const existingIds = new Set(existingImages.map(img => img.id));

        for (const image of backup.galleryImages) {
          if (!existingIds.has(image.id)) {
            await saveToGallery(image);
            importedImages++;
          }
        }

        resolve({ prompts: importedPrompts, images: importedImages });
      } catch (error) {
        console.error('Failed to import data:', error);
        reject(error);
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
};

// Auto-save k localStorage jako sekundární záloha
const AUTO_BACKUP_KEY = 'nanoBanana_autoBackup';
const AUTO_BACKUP_INTERVAL = 1000 * 60 * 60; // 1 hodina

export const createAutoBackup = async (): Promise<void> => {
  try {
    const lastBackup = localStorage.getItem(AUTO_BACKUP_KEY);
    const lastBackupData = lastBackup ? JSON.parse(lastBackup) : null;

    // Kontrola, zda uplynula hodina od poslední zálohy
    if (lastBackupData && Date.now() - lastBackupData.timestamp < AUTO_BACKUP_INTERVAL) {
      return;
    }

    const savedPrompts = getSavedPrompts();
    const galleryImages = await getAllImages();

    const backup: AppDataBackup = {
      version: '1.0',
      timestamp: Date.now(),
      savedPrompts,
      galleryImages,
    };

    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(backup));
  } catch (error) {
    console.error('Failed to create auto backup:', error);
  }
};

// Obnovit z auto-zálohy
export const restoreFromAutoBackup = async (): Promise<boolean> => {
  try {
    const lastBackup = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!lastBackup) return false;

    const backup: AppDataBackup = JSON.parse(lastBackup);

    // Obnovit saved prompts
    localStorage.setItem('nanoBanana_savedPrompts', JSON.stringify(backup.savedPrompts));

    // Obnovit gallery images
    for (const image of backup.galleryImages) {
      await saveToGallery(image);
    }

    return true;
  } catch (error) {
    console.error('Failed to restore from auto backup:', error);
    return false;
  }
};
