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

function createFallbackUserId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function ensureLegacyFallbackUser(): Promise<string> {
  const storedUserId = localStorage.getItem(USER_ID_STORAGE_KEY);
  const userId = storedUserId || createFallbackUserId();

  persistUserId(userId);

  try {
    await ensureLegacyUserProfile(userId);
  } catch (error) {
    // Fallback mode musí uživatele pustit dál i při dočasném výpadku DB.
    console.warn('Legacy fallback user profile sync failed:', error);
  }

  return userId;
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
    const sessionUserId = session?.user?.id;
    if (sessionUserId) {
      persistUserId(sessionUserId);
    }
  });
}

/**
 * Bootstrap anonymní Supabase session pro nekomerční provoz.
 */
export async function ensureAnonymousSession(): Promise<string> {
  const localUserId = localStorage.getItem(USER_ID_STORAGE_KEY);
  if (localUserId) {
    try {
      await ensureLegacyUserProfile(localUserId);
      persistUserId(localUserId);
      return localUserId;
    } catch (error) {
      console.warn('Stored local user profile sync failed, trying Supabase auth:', error);
    }
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.warn('Supabase getSession failed, using fallback user mode:', sessionError.message);
    return ensureLegacyFallbackUser();
  }

  const existingUserId = sessionData.session?.user?.id;
  if (existingUserId) {
    await ensureLegacyUserProfile(existingUserId);
    persistUserId(existingUserId);
    return existingUserId;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn('Supabase anonymous sign-in failed, using fallback user mode:', error.message);
    return ensureLegacyFallbackUser();
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
