/**
 * Collections/Mood Boards - organizace obrázků do kolekcí
 */

export interface Collection {
  id: string;
  name: string;
  description?: string;
  imageIds: string[]; // Reference na obrázky v galerii
  createdAt: number;
  updatedAt: number;
  color?: string; // Barva pro vizuální rozlišení
}

const STORAGE_KEY = 'nanoBanana_collections';

export class CollectionsDB {
  /**
   * Načíst všechny kolekce
   */
  static getAll(): Collection[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse collections:', error);
      return [];
    }
  }

  /**
   * Získat kolekci podle ID
   */
  static getById(id: string): Collection | null {
    const collections = this.getAll();
    return collections.find(c => c.id === id) || null;
  }

  /**
   * Vytvořit novou kolekci
   */
  static create(name: string, description?: string, color?: string): Collection {
    const collections = this.getAll();

    const newCollection: Collection = {
      id: `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      imageIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      color,
    };

    collections.push(newCollection);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));

    return newCollection;
  }

  /**
   * Aktualizovat kolekci
   */
  static update(id: string, updates: Partial<Omit<Collection, 'id' | 'createdAt'>>): void {
    const collections = this.getAll();
    const index = collections.findIndex(c => c.id === id);

    if (index !== -1) {
      collections[index] = {
        ...collections[index],
        ...updates,
        updatedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
    }
  }

  /**
   * Smazat kolekci
   */
  static delete(id: string): void {
    const collections = this.getAll().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
  }

  /**
   * Přidat obrázek do kolekce
   */
  static addImage(collectionId: string, imageId: string): void {
    const collections = this.getAll();
    const collection = collections.find(c => c.id === collectionId);

    if (collection && !collection.imageIds.includes(imageId)) {
      collection.imageIds.push(imageId);
      collection.updatedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
    }
  }

  /**
   * Odstranit obrázek z kolekce
   */
  static removeImage(collectionId: string, imageId: string): void {
    const collections = this.getAll();
    const collection = collections.find(c => c.id === collectionId);

    if (collection) {
      collection.imageIds = collection.imageIds.filter(id => id !== imageId);
      collection.updatedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
    }
  }

  /**
   * Získat kolekce obsahující daný obrázek
   */
  static getCollectionsForImage(imageId: string): Collection[] {
    return this.getAll().filter(c => c.imageIds.includes(imageId));
  }

  /**
   * Přesunout obrázek mezi kolekcemi
   */
  static moveImage(imageId: string, fromCollectionId: string, toCollectionId: string): void {
    this.removeImage(fromCollectionId, imageId);
    this.addImage(toCollectionId, imageId);
  }

  /**
   * Přidat více obrázků do kolekce najednou
   */
  static addImages(collectionId: string, imageIds: string[]): void {
    imageIds.forEach(imageId => this.addImage(collectionId, imageId));
  }
}
