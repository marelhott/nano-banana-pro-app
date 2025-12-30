// LocalStorage utilita pro ukládání promptů

import { SavedPrompt } from '../types';

const STORAGE_KEY = 'nanoBanana_savedPrompts';

// Předpřipravené prompty
const DEFAULT_PROMPTS: SavedPrompt[] = [
  {
    id: 'interior-1',
    name: 'Interiér - Moderní nábytek',
    prompt: 'Použij v nezměněné podobě dekorativní zeď, doplň moderní jednoduchý nábytek tak, aby působil co nejpřirozeněji a ne jako reklama nebo ai, rozmísti běžné věci po místnosti a zdech, jako jsou záclony, obrázky, různé předměty denní potřeby. Udělej pohled z více úhlů. Lehce odzoomuj a uprav osvětlení, aby působil obrázek přirozeně a živě.',
    category: 'Interiér',
    timestamp: Date.now(),
  },
];

// Načíst uložené prompty
export const getSavedPrompts = (): SavedPrompt[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    // Pokud nejsou žádné uložené, vrátit defaultní
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PROMPTS));
    return DEFAULT_PROMPTS;
  } catch (error) {
    console.error('Failed to load saved prompts:', error);
    return DEFAULT_PROMPTS;
  }
};

// Uložit prompty
const savePrompts = (prompts: SavedPrompt[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  } catch (error) {
    console.error('Failed to save prompts:', error);
  }
};

// Přidat nový prompt
export const addSavedPrompt = (name: string, prompt: string, category?: string): SavedPrompt => {
  const prompts = getSavedPrompts();
  const newPrompt: SavedPrompt = {
    id: `custom-${Date.now()}`,
    name,
    prompt,
    category,
    timestamp: Date.now(),
  };
  prompts.push(newPrompt);
  savePrompts(prompts);
  return newPrompt;
};

// Smazat prompt
export const deleteSavedPrompt = (id: string): void => {
  const prompts = getSavedPrompts();
  const filtered = prompts.filter(p => p.id !== id);
  savePrompts(filtered);
};

// Upravit prompt
export const updateSavedPrompt = (id: string, updates: Partial<SavedPrompt>): void => {
  const prompts = getSavedPrompts();
  const updated = prompts.map(p => p.id === id ? { ...p, ...updates } : p);
  savePrompts(updated);
};
