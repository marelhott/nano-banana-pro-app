/**
 * Collections/Mood Boards — organizace obrázků do kolekcí
 * localStorage jako primární store + Supabase sync na pozadí
 */

import { supabase, ensureLocalAppUserId } from './supabaseClient';

export interface Collection {
  id: string;
  name: string;
  description?: string;
  imageIds: string[];
  createdAt: number;
  updatedAt: number;
  color?: string;
  isPublic?: boolean;
  publicUrl?: string;
}

const STORAGE_KEY = 'nanoBanana_collections';

// Uložit kolekce do localStorage
function persist(collections: Collection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
}

// Synchronizovat kolekci do Supabase (best-effort, tiché selhání)
async function syncToSupabase(collection: Collection): Promise<void> {
  try {
    const userId = ensureLocalAppUserId();
    await supabase.from('collections').upsert({
      id: collection.id,
      user_id: userId,
      name: collection.name,
      description: collection.description ?? null,
      image_ids: collection.imageIds,
      color: collection.color ?? null,
      created_at: new Date(collection.createdAt).toISOString(),
      updated_at: new Date(collection.updatedAt).toISOString(),
    }, { onConflict: 'id' });
  } catch {
    // Supabase není dostupný — pokračujeme s localStorage
  }
}

async function deleteFromSupabase(id: string): Promise<void> {
  try {
    await supabase.from('collections').delete().eq('id', id);
  } catch {
    // ignore
  }
}

// Při startu aplikace stáhnout kolekce ze Supabase a sloučit s lokálními
export async function syncCollectionsFromCloud(): Promise<void> {
  try {
    const userId = ensureLocalAppUserId();
    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', userId);
    if (error || !data) return;

    const local = CollectionsDB.getAll();
    const localMap = new Map(local.map(c => [c.id, c]));

    for (const row of data) {
      const local = localMap.get(row.id);
      const remote: Collection = {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        imageIds: row.image_ids ?? [],
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
        color: row.color ?? undefined,
      };
      if (!local || remote.updatedAt > local.updatedAt) {
        localMap.set(row.id, remote);
      }
    }

    persist(Array.from(localMap.values()));
  } catch {
    // ignore
  }
}

export class CollectionsDB {
  static getAll(): Collection[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  static getById(id: string): Collection | null {
    return this.getAll().find(c => c.id === id) || null;
  }

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
    persist(collections);
    syncToSupabase(newCollection);
    return newCollection;
  }

  static update(id: string, updates: Partial<Omit<Collection, 'id' | 'createdAt'>>): void {
    const collections = this.getAll();
    const index = collections.findIndex(c => c.id === id);
    if (index !== -1) {
      collections[index] = { ...collections[index], ...updates, updatedAt: Date.now() };
      persist(collections);
      syncToSupabase(collections[index]);
    }
  }

  static delete(id: string): void {
    const collections = this.getAll().filter(c => c.id !== id);
    persist(collections);
    deleteFromSupabase(id);
  }

  static addImage(collectionId: string, imageId: string): void {
    const collections = this.getAll();
    const collection = collections.find(c => c.id === collectionId);
    if (collection && !collection.imageIds.includes(imageId)) {
      collection.imageIds.push(imageId);
      collection.updatedAt = Date.now();
      persist(collections);
      syncToSupabase(collection);
    }
  }

  static removeImage(collectionId: string, imageId: string): void {
    const collections = this.getAll();
    const collection = collections.find(c => c.id === collectionId);
    if (collection) {
      collection.imageIds = collection.imageIds.filter(id => id !== imageId);
      collection.updatedAt = Date.now();
      persist(collections);
      syncToSupabase(collection);
    }
  }

  static getCollectionsForImage(imageId: string): Collection[] {
    return this.getAll().filter(c => c.imageIds.includes(imageId));
  }

  static moveImage(imageId: string, fromCollectionId: string, toCollectionId: string): void {
    this.removeImage(fromCollectionId, imageId);
    this.addImage(toCollectionId, imageId);
  }

  static addImages(collectionId: string, imageIds: string[]): void {
    imageIds.forEach(imageId => this.addImage(collectionId, imageId));
  }

  static async setPublic(collectionId: string, isPublic: boolean): Promise<string | null> {
    const collection = this.getById(collectionId);
    if (!collection) return null;
    const publicUrl = isPublic ? `${window.location.origin}/shared/collection/${collectionId}` : undefined;
    this.update(collectionId, { isPublic, publicUrl });
    try {
      const userId = ensureLocalAppUserId();
      await supabase.from('collections').update({ is_public: isPublic }).eq('id', collectionId).eq('user_id', userId);
    } catch {
      // ignore
    }
    return publicUrl ?? null;
  }
}
