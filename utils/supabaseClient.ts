import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://poregdcgfwokxgmhpvac.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SAFE_PLACEHOLDER_SUPABASE_KEY = 'missing-supabase-anon-key';
const SUPABASE_RETRY_ATTEMPTS = 4;
const SUPABASE_RETRY_BASE_DELAY_MS = 650;
export const SUPABASE_ANON_DISABLED_ERROR_MESSAGE =
  'Anonymní přihlášení je v Supabase vypnuté. V Supabase Dashboard zapněte Authentication → Providers → Anonymous sign-ins.';

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

// App identity (PIN-based). This is the ID used in app tables (saved_images, generated_images, saved_prompts).
const APP_USER_ID_STORAGE_KEY = 'userId';
const PIN_HASH_STORAGE_KEY = 'pinHash';
// Supabase Auth identity (anonymous). Used only for connectivity and user_settings RLS.
const SUPABASE_AUTH_USER_ID_STORAGE_KEY = 'supabaseAuthUserId';

function ensureSupabaseConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase není nakonfigurovaná. Doplňte VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY v prostředí.'
    );
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isAnonymousSignInDisabledError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  const code = String((error as any)?.code || '').toLowerCase();
  const status = Number((error as any)?.status || 0);

  return (
    message.includes('anonymous sign-ins are disabled') ||
    message.includes('anonymous signups are disabled') ||
    code.includes('anonymous') ||
    (status === 422 && message.includes('anonymous'))
  );
}

async function withRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SUPABASE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (isAnonymousSignInDisabledError(error)) {
        throw new Error(SUPABASE_ANON_DISABLED_ERROR_MESSAGE);
      }

      lastError = error;
      if (attempt === SUPABASE_RETRY_ATTEMPTS) break;
      const backoff = SUPABASE_RETRY_BASE_DELAY_MS * attempt;
      console.warn(`[Supabase] ${label} failed (attempt ${attempt}/${SUPABASE_RETRY_ATTEMPTS}), retry in ${backoff}ms`, error);
      await wait(backoff);
    }
  }

  throw lastError;
}

function persistAppUserId(userId: string | null): void {
  if (userId) {
    localStorage.setItem(APP_USER_ID_STORAGE_KEY, userId);
    return;
  }
  localStorage.removeItem(APP_USER_ID_STORAGE_KEY);
}

function persistSupabaseAuthUserId(userId: string | null): void {
  if (userId) {
    localStorage.setItem(SUPABASE_AUTH_USER_ID_STORAGE_KEY, userId);
    return;
  }
  localStorage.removeItem(SUPABASE_AUTH_USER_ID_STORAGE_KEY);
}

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((_event, session) => {
    const sessionUserId = session?.user?.id;
    if (sessionUserId) persistSupabaseAuthUserId(sessionUserId);
  });
}

async function getOrCreateSupabaseAuthUserId(): Promise<string> {
  ensureSupabaseConfigured();

  const { data: sessionData, error: sessionError } = await withRetry('auth.getSession', async () => {
    const response = await supabase.auth.getSession();
    if (response.error) throw response.error;
    return response;
  });

  const existingUserId = sessionData.session?.user?.id;
  if (existingUserId) {
    persistSupabaseAuthUserId(existingUserId);
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

  persistSupabaseAuthUserId(createdUserId);
  return createdUserId;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Fallback: do not block login in older environments.
    return input;
  }
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function buildPinHashCandidates(pin: string): Promise<string[]> {
  const p = pin.trim();
  const set = new Set<string>();
  // Common historical formats (we try multiple to recover old data).
  set.add(p);
  set.add(`pin${p}`);
  set.add(`pin:${p}`);
  set.add(`pin_${p}`);
  const sha = await sha256Hex(p);
  set.add(sha);
  set.add(`sha256:${sha}`);
  const sha2 = await sha256Hex(`pin:${p}`);
  set.add(sha2);
  set.add(`sha256:${sha2}`);
  return Array.from(set);
}

type UserRow = { id: string; pin_hash: string };

async function findUserByPin(pin: string): Promise<UserRow | null> {
  ensureSupabaseConfigured();
  const candidates = await buildPinHashCandidates(pin);
  const { data, error } = await supabase
    .from('users')
    .select('id,pin_hash')
    .in('pin_hash', candidates)
    .limit(2);
  if (error) throw error;
  const rows = (data as UserRow[]) || [];
  if (rows.length === 0) return null;
  return rows[0];
}

/**
 * Bootstrap Supabase Auth session (anonymous). This is NOT the app identity.
 */
export async function ensureAnonymousSession(): Promise<string> {
  ensureSupabaseConfigured();
  return await getOrCreateSupabaseAuthUserId();
}

/**
 * Aktivně obnoví session; vrací userId pokud je spojení zdravé.
 */
export async function refreshSupabaseSession(): Promise<string> {
  return ensureAnonymousSession();
}

/**
 * PIN login: resolves the app user_id (uuid in public.users) by pin_hash.
 *
 * Safety:
 * - If users table is empty, a new PIN can initialize the first user.
 * - If users already exist, unknown PIN is rejected to prevent "accidental new empty account".
 */
export async function loginWithPin(pin: string): Promise<string> {
  ensureSupabaseConfigured();
  const normalized = pin.replace(/\D/g, '');
  if (normalized.length < 4 || normalized.length > 6) {
    throw new Error('PIN musí mít 4–6 číslic');
  }

  // Best-effort: keep Supabase auth session alive (not strictly required with RLS disabled).
  try {
    await ensureAnonymousSession();
  } catch {
    // ignore; the app tables can still work if RLS is disabled
  }

  const existing = await findUserByPin(normalized);
  if (existing?.id) {
    persistAppUserId(existing.id);
    localStorage.setItem(PIN_HASH_STORAGE_KEY, existing.pin_hash);
    // Best-effort last_login update.
    void supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', existing.id);
    return existing.id;
  }

  const { count, error: countError } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });
  if (countError) throw countError;

  if ((count || 0) > 0) {
    throw new Error('Nesprávný PIN');
  }

  // First-time initialization.
  const canonicalHash = `sha256:${await sha256Hex(normalized)}`;
  const { data, error } = await supabase
    .from('users')
    .insert({ pin_hash: canonicalHash, last_login: new Date().toISOString() })
    .select('id,pin_hash')
    .single();
  if (error) throw error;

  const created = data as UserRow;
  persistAppUserId(created.id);
  localStorage.setItem(PIN_HASH_STORAGE_KEY, created.pin_hash);
  return created.id;
}

/**
 * Automatické přihlášení (PIN-based app identity).
 */
export async function autoLogin(): Promise<string | null> {
  try {
    ensureSupabaseConfigured();

    // Best-effort keep auth session alive.
    try {
      await ensureAnonymousSession();
    } catch {
    }

    const existingAppUserId = localStorage.getItem(APP_USER_ID_STORAGE_KEY);
    const storedPinHash = localStorage.getItem(PIN_HASH_STORAGE_KEY);

    if (storedPinHash) {
      const { data, error } = await supabase
        .from('users')
        .select('id,pin_hash')
        .eq('pin_hash', storedPinHash)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = data as UserRow | null;
      if (row?.id) {
        persistAppUserId(row.id);
        return row.id;
      }
    }

    // Fallback: keep whatever app identity was previously stored.
    if (existingAppUserId) {
      // Validate the stored app user id still exists in DB.
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('id', existingAppUserId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data?.id) {
        persistAppUserId(existingAppUserId);
        return existingAppUserId;
      }
      // Stale/invalid id -> force PIN screen.
      persistAppUserId(null);
      localStorage.removeItem(PIN_HASH_STORAGE_KEY);
    }
    return null;
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
  persistAppUserId(null);
  persistSupabaseAuthUserId(null);
  localStorage.removeItem(PIN_HASH_STORAGE_KEY);
  window.location.reload();
}

/**
 * Získat aktuálního uživatele
 */
export function getCurrentUserId(): string | null {
  return localStorage.getItem(APP_USER_ID_STORAGE_KEY);
}

/**
 * Legacy helper - zachováno pro kompatibilitu.
 */
export async function setAuthContext(_userId: string) {
  return ensureAnonymousSession();
}
