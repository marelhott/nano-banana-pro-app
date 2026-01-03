// Utilita pro správu databáze obrázků v localStorage

export interface StoredImage {
  id: string;
  url: string; // base64 data URL
  fileName: string;
  fileType: string;
  fileSize: number;
  timestamp: number;
  category: 'reference' | 'style'; // typ obrázku
}

const DB_KEY = 'nano-banana-image-database';
const MAX_DB_SIZE = 50; // maximální počet obrázků v databázi

export class ImageDatabase {
  // Získat všechny obrázky z databáze
  static getAll(): StoredImage[] {
    try {
      const data = localStorage.getItem(DB_KEY);
      if (!data) return [];
      return JSON.parse(data) as StoredImage[];
    } catch (error) {
      console.error('Error reading image database:', error);
      return [];
    }
  }

  // Získat obrázky podle kategorie
  static getByCategory(category: 'reference' | 'style'): StoredImage[] {
    return this.getAll().filter(img => img.category === category);
  }

  // Přidat obrázek do databáze
  static async add(file: File, dataUrl: string, category: 'reference' | 'style'): Promise<StoredImage> {
    const images = this.getAll();

    // Pokud je databáze plná, odstraň nejstarší obrázek
    if (images.length >= MAX_DB_SIZE) {
      images.sort((a, b) => a.timestamp - b.timestamp);
      images.shift(); // odstraň nejstarší
    }

    const newImage: StoredImage = {
      id: Math.random().toString(36).substr(2, 9) + Date.now(),
      url: dataUrl,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      timestamp: Date.now(),
      category
    };

    images.push(newImage);

    try {
      localStorage.setItem(DB_KEY, JSON.stringify(images));
      return newImage;
    } catch (error) {
      // Pokud je localStorage plný, zkus odstranit víc obrázků
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        // Odstraň 10 nejstarších obrázků a zkus znovu
        images.sort((a, b) => a.timestamp - b.timestamp);
        const reduced = images.slice(10);
        reduced.push(newImage);
        localStorage.setItem(DB_KEY, JSON.stringify(reduced));
        return newImage;
      }
      throw error;
    }
  }

  // Odstranit obrázek z databáze
  static remove(id: string): void {
    const images = this.getAll().filter(img => img.id !== id);
    localStorage.setItem(DB_KEY, JSON.stringify(images));
  }

  // Vymazat všechny obrázky
  static clear(): void {
    localStorage.removeItem(DB_KEY);
  }

  // Vymazat obrázky podle kategorie
  static clearByCategory(category: 'reference' | 'style'): void {
    const images = this.getAll().filter(img => img.category !== category);
    localStorage.setItem(DB_KEY, JSON.stringify(images));
  }

  // Získat velikost databáze v MB
  static getSize(): number {
    const data = localStorage.getItem(DB_KEY);
    if (!data) return 0;
    return new Blob([data]).size / (1024 * 1024); // MB
  }

  // Získat počet obrázků
  static getCount(): number {
    return this.getAll().length;
  }
}
