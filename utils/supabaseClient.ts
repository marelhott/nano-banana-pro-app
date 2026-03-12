import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SAFE_PLACEHOLDER_SUPABASE_KEY = 'missing-supabase-anon-key';
const SUPABASE_RETRY_ATTEMPTS = 4;
const SUPABASE_RETRY_BASE_DELAY_MS = 650;
const SUPABASE_AUTH_TIMEOUT_MS = 8000;
const SUPABASE_DB_TIMEOUT_MS = 7000;
export const SUPABASE_ANON_DISABLED_ERROR_MESSAGE =
  'Anonymní přihlášení je v Supabase vypnuté. V Supabase Dashboard zapněte Authentication → Providers → Anonymous sign-ins.';

type SupabaseRuntimeConfig = {
  url: string;
  anonKey: string;
};

const DEFAULT_SUPABASE_URL = 'https://poregdcgfwokxgmhpvac.supabase.co';

let runtimeConfig: SupabaseRuntimeConfig = {
  url: import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
};

export let isSupabaseConfigured = Boolean(runtimeConfig.url && runtimeConfig.anonKey);

if (!isSupabaseConfigured) {
  console.error(
    '❌ Supabase není nakonfigurovaná. Nastavte VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY.'
  );
}

export let supabase: SupabaseClient = createClient(runtimeConfig.url, runtimeConfig.anonKey || SAFE_PLACEHOLDER_SUPABASE_KEY, {
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

let initPromise: Promise<void> | null = null;

function applyRuntimeConfig(next: SupabaseRuntimeConfig) {
  runtimeConfig = next;
  isSupabaseConfigured = Boolean(runtimeConfig.url && runtimeConfig.anonKey);
  supabase = createClient(runtimeConfig.url, runtimeConfig.anonKey || SAFE_PLACEHOLDER_SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  if (typeof window !== 'undefined') {
    supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUserId = session?.user?.id;
      if (sessionUserId) persistSupabaseAuthUserId(sessionUserId);
    });
  }
}

async function fetchRuntimeConfigFromNetlify(): Promise<SupabaseRuntimeConfig | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('/api/public-config', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const url = String(json?.supabaseUrl || '').trim();
    const anonKey = String(json?.supabaseAnonKey || '').trim();
    if (!url || !anonKey) return null;
    return { url, anonKey };
  } catch {
    return null;
  }
}

export async function ensureSupabaseClient(): Promise<void> {
  if (isSupabaseConfigured) return;
  if (!initPromise) {
    initPromise = (async () => {
      // Attempt to fetch runtime config (Netlify Functions env) so deploys without local .env keep working.
      const fetched = await fetchRuntimeConfigFromNetlify();
      if (fetched) applyRuntimeConfig(fetched);
    })();
  }
  await initPromise;

  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase není nakonfigurovaná. Doplňte VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY v prostředí (nebo nastavte Netlify env pro public-config).'
    );
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withTimeout<T>(label: string, operation: PromiseLike<T>, timeoutMs = SUPABASE_AUTH_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timeout po ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withDbTimeout<T>(label: string, operation: PromiseLike<T>): Promise<T> {
  return withTimeout(label, operation, SUPABASE_DB_TIMEOUT_MS);
}

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
  await ensureSupabaseClient();

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

function isMissingUserAuthIdentitiesTableError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  const code = String((error as any)?.code || '').toLowerCase();

  return (
    code === '42p01' ||
    message.includes('user_auth_identities') ||
    message.includes('relation') && message.includes('does not exist')
  );
}

async function linkAuthIdentity(appUserId: string, authUserId: string): Promise<void> {
  const { error } = await supabase
    .from('user_auth_identities')
    .upsert(
      {
        user_id: appUserId,
        auth_user_id: authUserId,
      },
      { onConflict: 'auth_user_id' }
    );

  if (!error) return;
  if (isMissingUserAuthIdentitiesTableError(error)) return;
  throw error;
}

function linkAuthIdentityInBackground(appUserId: string): void {
  void ensureAnonymousSession()
    .then((authUserId) => linkAuthIdentity(appUserId, authUserId))
    .catch((error) => {
      console.warn('[Supabase] Background auth identity link failed:', error);
    });
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

type PinAuthResponse = {
  success: boolean;
  userId?: string | null;
  pinHash?: string | null;
  error?: string;
};

async function requestPinAuth(payload: Record<string, unknown>): Promise<PinAuthResponse | null> {
  try {
    const response = await withTimeout(
      'PIN auth proxy',
      fetch('/api/pin-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
      9000
    );

    const result = (await response.json()) as PinAuthResponse;
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        return result;
      }
      throw new Error(result.error || 'PIN auth request failed');
    }

    return result;
  } catch (error) {
    console.warn('[PIN auth] Netlify proxy failed, falling back to client Supabase flow:', error);
    return null;
  }
}

async function findUserByPin(pin: string): Promise<UserRow | null> {
  await ensureSupabaseClient();
  const candidates = await buildPinHashCandidates(pin);
  const { data, error } = await withDbTimeout(
    'Supabase users lookup',
    supabase
      .from('users')
      .select('id,pin_hash')
      .in('pin_hash', candidates)
      .limit(2)
  );
  if (error) throw error;
  const rows = (data as UserRow[]) || [];
  if (rows.length === 0) return null;
  return rows[0];
}

/**
 * Bootstrap Supabase Auth session (anonymous). This is NOT the app identity.
 */
export async function ensureAnonymousSession(): Promise<string> {
  await ensureSupabaseClient();
  return await withTimeout('Supabase anonymous auth', getOrCreateSupabaseAuthUserId());
}

/**
 * Aktivně obnoví session; vrací userId pokud je spojení zdravé.
 */
export async function refreshSupabaseSession(): Promise<string> {
  await ensureSupabaseClient();
  return await withTimeout('Supabase session refresh', getOrCreateSupabaseAuthUserId());
}

/**
 * PIN login: resolves the app user_id (uuid in public.users) by pin_hash.
 *
 * Safety:
 * - If users table is empty, a new PIN can initialize the first user.
 * - If users already exist, unknown PIN is rejected to prevent "accidental new empty account".
 */
export async function loginWithPin(pin: string): Promise<string> {
  await ensureSupabaseClient();
  const normalized = pin.replace(/\D/g, '');
  if (normalized.length < 4 || normalized.length > 6) {
    throw new Error('PIN musí mít 4–6 číslic');
  }

  const proxyResult = await requestPinAuth({ action: 'login', pin: normalized });
  if (proxyResult?.success && proxyResult.userId && proxyResult.pinHash) {
    persistAppUserId(proxyResult.userId);
    localStorage.setItem(PIN_HASH_STORAGE_KEY, proxyResult.pinHash);
    linkAuthIdentityInBackground(proxyResult.userId);
    return proxyResult.userId;
  }
  if (proxyResult && !proxyResult.success) {
    throw new Error(proxyResult.error || 'Nesprávný PIN');
  }

  const existing = await findUserByPin(normalized);
  if (existing?.id) {
    persistAppUserId(existing.id);
    localStorage.setItem(PIN_HASH_STORAGE_KEY, existing.pin_hash);
    linkAuthIdentityInBackground(existing.id);
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
  linkAuthIdentityInBackground(created.id);
  return created.id;
}

/**
 * Automatické přihlášení (PIN-based app identity).
 */
export async function autoLogin(): Promise<string | null> {
  try {
    await ensureSupabaseClient();

    const storedPinHash = localStorage.getItem(PIN_HASH_STORAGE_KEY);

    // Without a stored PIN hash, we do not trust any cached app user id.
    // This guarantees the PIN screen shows up on new origins (e.g. mulennano.netlify.app),
    // and prevents silently landing on the wrong UUID.
    if (!storedPinHash) {
      persistAppUserId(null);
      return null;
    }

    const proxyResult = await requestPinAuth({ action: 'auto-login', pinHash: storedPinHash });
    if (proxyResult?.success) {
      if (proxyResult.userId && proxyResult.pinHash) {
        persistAppUserId(proxyResult.userId);
        localStorage.setItem(PIN_HASH_STORAGE_KEY, proxyResult.pinHash);
        linkAuthIdentityInBackground(proxyResult.userId);
        return proxyResult.userId;
      }

      persistAppUserId(null);
      localStorage.removeItem(PIN_HASH_STORAGE_KEY);
      return null;
    }
    if (proxyResult && !proxyResult.success) {
      persistAppUserId(null);
      localStorage.removeItem(PIN_HASH_STORAGE_KEY);
      return null;
    }

    if (storedPinHash) {
      const { data, error } = await withDbTimeout(
        'Supabase auto-login lookup',
        supabase
          .from('users')
          .select('id,pin_hash')
          .eq('pin_hash', storedPinHash)
          .limit(1)
          .maybeSingle()
      );
      if (error) throw error;
      const row = data as UserRow | null;
      if (row?.id) {
        persistAppUserId(row.id);
        linkAuthIdentityInBackground(row.id);
        return row.id;
      }
    }

    // Stored pinHash is present but doesn't resolve -> force PIN screen.
    persistAppUserId(null);
    localStorage.removeItem(PIN_HASH_STORAGE_KEY);
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
