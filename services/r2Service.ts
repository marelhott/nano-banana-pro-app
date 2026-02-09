type R2PresignResponse = {
  signedUrl: string;
  objectUrl: string;
  bucket: string;
  key: string;
  expires: number;
};

function assertOk(res: Response, message: string) {
  if (!res.ok) throw new Error(`${message} (HTTP ${res.status})`);
}

export async function presignR2(params: {
  op: 'get' | 'put';
  key: string;
  expires?: number;
}): Promise<R2PresignResponse> {
  const res = await fetch('/api/r2-presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j?.error || j?.detail || j?.message || text;
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch {
      // keep raw text
    }
    throw new Error(`R2 presign selhal (HTTP ${res.status}): ${String(detail).slice(0, 500)}`);
  }

  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('R2 presign vrátil neplatnou odpověď (není to JSON).');
  }

  const signedUrl = String(payload?.signedUrl || '').trim();
  const objectUrl = String(payload?.objectUrl || '').trim();
  const bucket = String(payload?.bucket || '').trim();
  const key = String(payload?.key || '').trim();
  const expires = Number(payload?.expires || 0);
  if (!signedUrl || !objectUrl || !bucket || !key) throw new Error('R2 presign: chybí data v odpovědi.');
  return { signedUrl, objectUrl, bucket, key, expires };
}

export function isR2Ref(path: string): boolean {
  const v = String(path || '').trim();
  return v.startsWith('r2://') || v.startsWith('r2:');
}

export function r2KeyFromRef(path: string): string {
  const v = String(path || '').trim();
  if (v.startsWith('r2://')) return v.slice('r2://'.length);
  if (v.startsWith('r2:')) return v.slice('r2:'.length);
  return v;
}

