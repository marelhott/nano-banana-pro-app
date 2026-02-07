import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://poregdcgfwokxgmhpvac.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseKey) {
  console.warn('⚠️ VITE_SUPABASE_ANON_KEY není nastavená. Vytvořte .env soubor.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

const USER_ID_STORAGE_KEY = 'userId';
const PIN_HASH_STORAGE_KEY = 'pinHash';

function persistUserId(userId: string | null): void {
  if (userId) {
    localStorage.setItem(USER_ID_STORAGE_KEY, userId);
    return;
  }
  localStorage.removeItem(USER_ID_STORAGE_KEY);
}

async function ensureLegacyUserProfile(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .upsert(
      {
        id: userId,
        pin_hash: `anon:${userId}`,
        last_login: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) {
    throw new Error(`Nepodařilo se synchronizovat profil uživatele: ${error.message}`);
  }
}

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((_event, session) => {
    persistUserId(session?.user?.id ?? null);
  });
}

/**
 * Bootstrap anonymní Supabase session pro nekomerční provoz.
 */
export async function ensureAnonymousSession(): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Nepodařilo se načíst session: ${sessionError.message}`);
  }

  const existingUserId = sessionData.session?.user?.id;
  if (existingUserId) {
    await ensureLegacyUserProfile(existingUserId);
    persistUserId(existingUserId);
    return existingUserId;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(`Nepodařilo se vytvořit anonymní session: ${error.message}`);
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error('Anonymní session byla vytvořena bez user id.');
  }

  await ensureLegacyUserProfile(userId);
  persistUserId(userId);
  return userId;
}

/**
 * Kompatibilita se starým PIN flow.
 * PIN ignorujeme a vracíme anonymní session userId.
 */
export async function loginWithPin(_pin: string): Promise<string> {
  return ensureAnonymousSession();
}

/**
 * Automatické přihlášení (anonymní session).
 */
export async function autoLogin(): Promise<string | null> {
  try {
    return await ensureAnonymousSession();
  } catch (error) {
    console.error('Auto-login failed:', error);
    return null;
  }
}

/**
 * Odhlášení
 */
export function logout() {
  void supabase.auth.signOut();
  persistUserId(null);
  localStorage.removeItem(PIN_HASH_STORAGE_KEY);
  window.location.reload();
}

/**
 * Získat aktuálního uživatele
 */
export function getCurrentUserId(): string | null {
  return localStorage.getItem(USER_ID_STORAGE_KEY);
}

/**
 * Legacy helper - zachováno pro kompatibilitu.
 */
export async function setAuthContext(_userId: string) {
  return ensureAnonymousSession();
}
