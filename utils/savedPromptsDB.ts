import { SavedPrompt } from '../types';
import { createSingleUserId, readJsonStorage, writeJsonStorage } from './singleUserStore';

const STORAGE_KEY = 'mulenNano.singleUser.savedPrompts.v1';
const LEGACY_STORAGE_KEY = 'nanoBanana_savedPrompts';
const AUTO_BACKUP_KEY = 'nanoBanana_autoBackup';
const DEFAULT_PROMPTS_KEY = 'mulenNano.singleUser.savedPrompts.defaults.v1';
const DEFAULT_PROMPTS: SavedPrompt[] = [
  {
    id: 'interior-1',
    name: 'Interiér - Moderní nábytek',
    prompt: 'Použij v nezměněné podobě dekorativní zeď, doplň moderní jednoduchý nábytek tak, aby působil co nejpřirozeněji a ne jako reklama nebo ai, rozmísti běžné věci po místnosti a zdech, jako jsou záclony, obrázky, různé předměty denní potřeby. Udělej pohled z více úhlů. Lehce odzoomuj a uprav osvětlení, aby působil obrázek přirozeně a živě.',
    category: 'Interiér',
    timestamp: Date.now(),
  },
];

let importPromise: Promise<void> | null = null;

function getStoredPrompts(): SavedPrompt[] {
  const stored = readJsonStorage<SavedPrompt[]>(STORAGE_KEY, []);
  if (stored.length > 0) return stored;

  const defaultsSeeded = readJsonStorage<boolean>(DEFAULT_PROMPTS_KEY, false);
  if (!defaultsSeeded) {
    writeJsonStorage(STORAGE_KEY, DEFAULT_PROMPTS);
    writeJsonStorage(DEFAULT_PROMPTS_KEY, true);
    return DEFAULT_PROMPTS;
  }

  return [];
}

function saveStoredPrompts(prompts: SavedPrompt[]): void {
  writeJsonStorage(STORAGE_KEY, prompts);
}

function mergePrompts(current: SavedPrompt[], incoming: SavedPrompt[]): SavedPrompt[] {
  const byName = new Map<string, SavedPrompt>();

  for (const prompt of current) {
    if (!prompt?.name?.trim() || !prompt?.prompt?.trim()) continue;
    byName.set(prompt.name.trim().toLowerCase(), prompt);
  }

  for (const prompt of incoming) {
    if (!prompt?.name?.trim() || !prompt?.prompt?.trim()) continue;
    const key = prompt.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || (prompt.timestamp || 0) > (existing.timestamp || 0)) {
      byName.set(key, {
        id: prompt.id || createSingleUserId('prompt'),
        name: prompt.name.trim(),
        prompt: prompt.prompt,
        category: prompt.category,
        timestamp: Number(prompt.timestamp) || Date.now(),
      });
    }
  }

  return Array.from(byName.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

async function importLegacySourcesOnce(): Promise<void> {
  const current = getStoredPrompts();
  const incoming: SavedPrompt[] = [];

  const legacyPrompts = readJsonStorage<Array<{ id?: string; name?: string; prompt?: string; category?: string; timestamp?: number }>>(LEGACY_STORAGE_KEY, []);
  for (const prompt of legacyPrompts) {
    if (!prompt?.name?.trim() || !prompt?.prompt?.trim()) continue;
    incoming.push({
      id: prompt.id || createSingleUserId('prompt'),
      name: prompt.name.trim(),
      prompt: prompt.prompt,
      category: prompt.category,
      timestamp: Number(prompt.timestamp) || Date.now(),
    });
  }

  const backup = readJsonStorage<any | null>(AUTO_BACKUP_KEY, null);
  const backupPrompts = Array.isArray(backup?.savedPrompts) ? backup.savedPrompts : [];
  for (const prompt of backupPrompts) {
    if (!prompt?.name?.trim() || !prompt?.prompt?.trim()) continue;
    incoming.push({
      id: prompt.id || createSingleUserId('prompt'),
      name: prompt.name.trim(),
      prompt: prompt.prompt,
      category: prompt.category,
      timestamp: Number(prompt.timestamp) || Date.now(),
    });
  }

  const merged = mergePrompts(current, incoming);
  saveStoredPrompts(merged);

  if (typeof window !== 'undefined') {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

}

async function ensureImported(): Promise<void> {
  if (!importPromise) {
    importPromise = importLegacySourcesOnce().finally(() => {
      importPromise = null;
    });
  }

  await importPromise;
}

export const listSavedPrompts = async (): Promise<SavedPrompt[]> => {
  await ensureImported();
  return getStoredPrompts();
};

export const upsertSavedPromptByName = async (name: string, prompt: string): Promise<void> => {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Chybí název promptu');
  if (!prompt.trim()) throw new Error('Chybí text promptu');

  await ensureImported();
  const prompts = getStoredPrompts();
  const existing = prompts.find((item) => item.name.trim().toLowerCase() === trimmedName.toLowerCase());

  if (existing) {
    existing.prompt = prompt;
    existing.timestamp = Date.now();
  } else {
    prompts.unshift({
      id: createSingleUserId('prompt'),
      name: trimmedName,
      prompt,
      timestamp: Date.now(),
    });
  }

  saveStoredPrompts(prompts.sort((a, b) => b.timestamp - a.timestamp));
};

export const updateSavedPrompt = async (id: string, updates: { name?: string; prompt?: string }): Promise<void> => {
  await ensureImported();
  const prompts = getStoredPrompts();
  const next = prompts.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      name: typeof updates.name === 'string' ? updates.name : item.name,
      prompt: typeof updates.prompt === 'string' ? updates.prompt : item.prompt,
      timestamp: Date.now(),
    };
  });

  saveStoredPrompts(next.sort((a, b) => b.timestamp - a.timestamp));
};

export const deleteSavedPrompt = async (id: string): Promise<void> => {
  await ensureImported();
  saveStoredPrompts(getStoredPrompts().filter((item) => item.id !== id));
};
