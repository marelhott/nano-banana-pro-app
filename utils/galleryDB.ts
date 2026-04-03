import { clearGeneratedLibraryImages, getGeneratedLibraryImageRecord, listGeneratedLibraryImages, removeGeneratedLibraryImage, resolveBlobFromSource, saveGeneratedLibraryImage, type SingleUserGeneratedImage } from './singleUserMediaStore';
import { dataUrlToBlob, deleteImage as deleteStorageImage, uploadImage } from './supabaseStorage';
import { dispatchCloudSyncEvent } from './cloudSyncEvents';

export interface GalleryImage extends SingleUserGeneratedImage {}

type SaveToGalleryInput = Omit<GalleryImage, 'id' | 'timestamp'> & {
  id?: string;
  timestamp?: number;
};

export const saveToGallery = async (image: SaveToGalleryInput): Promise<void> => {
  let mainBlob: Blob | undefined;
  let thumbBlob: Blob | undefined;

  try {
    if (image.url) {
      mainBlob = image.url.startsWith('data:')
        ? await dataUrlToBlob(image.url)
        : await resolveBlobFromSource(image.url);
    }
  } catch (error) {
    console.warn('[Gallery] Failed to persist full image blob locally, falling back to URL only:', error);
  }

  try {
    if (image.thumbnail) {
      thumbBlob = image.thumbnail.startsWith('data:')
        ? await dataUrlToBlob(image.thumbnail)
        : await resolveBlobFromSource(image.thumbnail);
    }
  } catch (error) {
    console.warn('[Gallery] Failed to persist thumbnail blob locally, falling back to URL only:', error);
  }

  const localRecord = await saveGeneratedLibraryImage({
    id: image.id,
    prompt: image.prompt,
    timestamp: image.timestamp,
    resolution: image.resolution,
    aspectRatio: image.aspectRatio,
    blob: mainBlob,
    sourceUrl: mainBlob ? undefined : image.url,
    thumbnailBlob: thumbBlob,
    thumbnailUrl: thumbBlob ? undefined : image.thumbnail,
    params: image.params,
    versions: image.versions,
    lineage: image.lineage,
  });

  void (async () => {
    if (!mainBlob) return;

    try {
      const storagePath = await uploadImage(mainBlob, 'generated');
      let thumbnailPath: string | undefined;
      if (thumbBlob) {
        thumbnailPath = await uploadImage(thumbBlob, 'generated');
      }

      await saveGeneratedLibraryImage({
        id: localRecord.id,
        prompt: localRecord.prompt,
        timestamp: localRecord.timestamp,
        resolution: localRecord.resolution,
        aspectRatio: localRecord.aspectRatio,
        blob: mainBlob,
        thumbnailBlob: thumbBlob,
        params: localRecord.params,
        versions: localRecord.versions,
        lineage: localRecord.lineage,
        remoteStoragePath: storagePath,
        remoteThumbnailPath: thumbnailPath,
      });
    } catch (error) {
      console.warn('[Gallery] Cloud mirror for generated image failed:', error);
      dispatchCloudSyncEvent({
        status: 'failed',
        resource: 'generated-image',
        message: 'Cloud sync se nepodařil. Vygenerovaný obrázek zůstal uložený lokálně.',
      });
    }
  })();
};

export const getAllImages = async (): Promise<GalleryImage[]> => {
  try {
    return await listGeneratedLibraryImages();
  } catch (error) {
    console.error('Error loading gallery:', error);
    return [];
  }
};

export const deleteImage = async (id: string): Promise<void> => {
  const existing = await getGeneratedLibraryImageRecord(id);
  await removeGeneratedLibraryImage(id);

  if (existing?.remoteStoragePath) {
    void deleteStorageImage(existing.remoteStoragePath).catch((error) => {
      console.warn('[Gallery] Failed to delete cloud generated image:', error);
    });
  }

  if (existing?.remoteThumbnailPath) {
    void deleteStorageImage(existing.remoteThumbnailPath).catch((error) => {
      console.warn('[Gallery] Failed to delete cloud generated thumbnail:', error);
    });
  }
};

export const clearGallery = async (): Promise<void> => {
  const all = await getAllImages();
  await clearGeneratedLibraryImages();

  for (const image of all) {
    if (image.remoteStoragePath) {
      void deleteStorageImage(image.remoteStoragePath).catch((error) => {
        console.warn('[Gallery] Failed to delete cloud generated image during clear:', error);
      });
    }
    if (image.remoteThumbnailPath) {
      void deleteStorageImage(image.remoteThumbnailPath).catch((error) => {
        console.warn('[Gallery] Failed to delete cloud generated thumbnail during clear:', error);
      });
    }
  }
};

export const createThumbnail = (dataUrl: string, maxSize: number = 400): Promise<string> => {
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
      } else if (height > maxSize) {
        width = (width * maxSize) / height;
        height = maxSize;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
      }
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek pro thumbnail.'));
    img.src = dataUrl;
  });
};
