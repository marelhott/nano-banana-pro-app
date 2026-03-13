export function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[single-user-store] Failed to read ${key}:`, error);
    return fallback;
  }
}

export function writeJsonStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[single-user-store] Failed to write ${key}:`, error);
  }
}

export function createSingleUserId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${random}`;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout po ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function shouldRetryTimedMigration(key: string, cooldownMs: number): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const lastAttempt = Number(localStorage.getItem(key) || '0');
    return !lastAttempt || Date.now() - lastAttempt > cooldownMs;
  } catch {
    return true;
  }
}

export function markTimedMigrationAttempt(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, String(Date.now()));
}
