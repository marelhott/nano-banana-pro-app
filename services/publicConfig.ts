export type PublicConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  r2PublicModelsBaseUrl?: string;
  r2PublicLorasBaseUrl?: string;
};

let cached: { value: PublicConfig; at: number } | null = null;

function normalizeBaseUrl(v: unknown): string {
  const s = String(v || '').trim();
  return s.replace(/\/+$/, '');
}

export async function fetchPublicConfig(opts: { maxAgeMs?: number } = {}): Promise<PublicConfig> {
  const maxAgeMs = typeof opts.maxAgeMs === 'number' ? Math.max(0, opts.maxAgeMs) : 30_000;
  if (cached && Date.now() - cached.at <= maxAgeMs) return cached.value;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('/api/public-config', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`public-config HTTP ${res.status}`);
    const json = (await res.json()) as any;
    const value: PublicConfig = {
      supabaseUrl: String(json?.supabaseUrl || '').trim() || undefined,
      supabaseAnonKey: String(json?.supabaseAnonKey || '').trim() || undefined,
      r2PublicModelsBaseUrl: normalizeBaseUrl(json?.r2PublicModelsBaseUrl || json?.r2_public_models_base_url),
      r2PublicLorasBaseUrl: normalizeBaseUrl(json?.r2PublicLorasBaseUrl || json?.r2_public_loras_base_url),
    };
    cached = { value, at: Date.now() };
    return value;
  } catch {
    // Non-fatal: callers can fallback to other mechanisms.
    return cached?.value || {};
  }
}

