// IndexedDB utilita pro ukládání obrázků do galerie

const DB_NAME = 'NanoBananaGallery';
const DB_VERSION = 1;
const STORE_NAME = 'images';

export interface GalleryImage {
  id: string;
  url: string; // base64 data URL
  prompt: string;
  timestamp: number;
  resolution?: string;
  aspectRatio?: string;
  thumbnail?: string; // menší verze pro grid
}

// Otevřít databázi
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

// Uložit obrázek do galerie
export const saveToGallery = async (image: GalleryImage): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(image);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Získat všechny obrázky z galerie
export const getAllImages = async (): Promise<GalleryImage[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev'); // Nejnovější první

    const images: GalleryImage[] = [];
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        images.push(cursor.value);
        cursor.continue();
      } else {
        resolve(images);
      }
    };

    request.onerror = () => reject(request.error);
  });
};

// Smazat obrázek z galerie
export const deleteImage = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Vymazat celou galerii
export const clearGallery = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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
