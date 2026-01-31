import { SavedPrompt } from '../types';
import { getCurrentUserId, supabase } from './supabaseClient';

const LEGACY_STORAGE_KEY = 'nanoBanana_savedPrompts';
const MIGRATION_FLAG_KEY = 'nanoBanana_savedPrompts_migratedToSupabase_v1';

type SavedPromptRow = {
  id: string;
  user_id: string;
  name: string;
  prompt: string;
  created_at: string;
  updated_at: string;
};

const mapRowToPrompt = (row: SavedPromptRow): SavedPrompt => ({
  id: row.id,
  name: row.name,
  prompt: row.prompt,
  timestamp: new Date(row.created_at).getTime(),
});

const migrateLegacyPromptsIfNeeded = async (userId: string) => {
  const migrated = localStorage.getItem(MIGRATION_FLAG_KEY);
  if (migrated) return;

  const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    return;
  }

  try {
    const legacy = JSON.parse(stored) as Array<{ name: string; prompt: string }>;
    for (const item of legacy) {
      if (!item?.name?.trim() || !item?.prompt?.trim()) continue;
      await supabase
        .from('saved_prompts')
        .upsert(
          {
            user_id: userId,
            name: item.name.trim(),
            prompt: item.prompt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,name' }
        );
    }
  } catch {
  } finally {
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
};

export const listSavedPrompts = async (): Promise<SavedPrompt[]> => {
  const userId = getCurrentUserId();
  if (!userId) return [];

  await migrateLegacyPromptsIfNeeded(userId);

  const { data, error } = await supabase
    .from('saved_prompts')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data as SavedPromptRow[]).map(mapRowToPrompt);
};

export const upsertSavedPromptByName = async (name: string, prompt: string): Promise<void> => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Uživatel není přihlášen');

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Chybí název promptu');
  if (!prompt.trim()) throw new Error('Chybí text promptu');

  const { error } = await supabase
    .from('saved_prompts')
    .upsert(
      {
        user_id: userId,
        name: trimmedName,
        prompt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,name' }
    );
  if (error) throw error;
};

export const updateSavedPrompt = async (id: string, updates: { name?: string; prompt?: string }): Promise<void> => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Uživatel není přihlášen');

  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof updates.name === 'string') payload.name = updates.name;
  if (typeof updates.prompt === 'string') payload.prompt = updates.prompt;

  const { error } = await supabase
    .from('saved_prompts')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
};

export const deleteSavedPrompt = async (id: string): Promise<void> => {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Uživatel není přihlášen');

  const { error } = await supabase
    .from('saved_prompts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
};

