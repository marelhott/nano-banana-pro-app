import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://poregdcgfwokxgmhpvac.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SAFE_PLACEHOLDER_SUPABASE_KEY = 'missing-supabase-anon-key';
const SUPABASE_RETRY_ATTEMPTS = 4;
const SUPABASE_RETRY_BASE_DELAY_MS = 650;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.error(
    '❌ Supabase není nakonfigurovaná. Nastavte VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey || SAFE_PLACEHOLDER_SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const USER_ID_STORAGE_KEY = 'userId';
const PIN_HASH_STORAGE_KEY = 'pinHash';

function ensureSupabaseConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase není nakonfigurovaná. Doplňte VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY v prostředí.'
    );
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SUPABASE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === SUPABASE_RETRY_ATTEMPTS) break;
      const backoff = SUPABASE_RETRY_BASE_DELAY_MS * attempt;
      console.warn(`[Supabase] ${label} failed (attempt ${attempt}/${SUPABASE_RETRY_ATTEMPTS}), retry in ${backoff}ms`, error);
      await wait(backoff);
    }
  }

  throw lastError;
}

function persistUserId(userId: string | null): void {
  if (userId) {
    localStorage.setItem(USER_ID_STORAGE_KEY, userId);
    return;
  }
  localStorage.removeItem(USER_ID_STORAGE_KEY);
}

async function ensureLegacyUserProfile(userId: string): Promise<void> {
  ensureSupabaseConfigured();
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

async function getOrCreateSessionUserId(): Promise<string> {
  ensureSupabaseConfigured();

  const { data: sessionData, error: sessionError } = await withRetry('auth.getSession', async () => {
    const response = await supabase.auth.getSession();
    if (response.error) throw response.error;
    return response;
  });

  const existingUserId = sessionData.session?.user?.id;
  if (existingUserId) {
    return existingUserId;
  }

  const { data: signInData, error: signInError } = await withRetry('auth.signInAnonymously', async () => {
    const response = await supabase.auth.signInAnonymously();
    if (response.error) throw response.error;
    return response;
  });

  if (sessionError || signInError) {
    throw sessionError || signInError;
  }

  const createdUserId = signInData.user?.id;
  if (!createdUserId) {
    throw new Error('Anonymní session byla vytvořena bez user id.');
  }

  return createdUserId;
}

/**
 * Bootstrap anonymní Supabase session pro nekomerční provoz.
 */
export async function ensureAnonymousSession(): Promise<string> {
  ensureSupabaseConfigured();
  const userId = await getOrCreateSessionUserId();
  await withRetry('users.upsert', () => ensureLegacyUserProfile(userId));
  persistUserId(userId);
  return userId;
}

/**
 * Aktivně obnoví session; vrací userId pokud je spojení zdravé.
 */
export async function refreshSupabaseSession(): Promise<string> {
  return ensureAnonymousSession();
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
  if (isSupabaseConfigured) {
    void supabase.auth.signOut();
  }
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
