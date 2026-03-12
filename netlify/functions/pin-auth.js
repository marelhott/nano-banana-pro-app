const { createHash } = require('crypto');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function getSupabaseConfig() {
  const url = String(process.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!url || !anonKey) {
    throw new Error('Missing Supabase runtime config');
  }

  return { url, anonKey };
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function buildPinHashCandidates(pin) {
  const p = String(pin || '').trim();
  const sha = sha256Hex(p);
  const sha2 = sha256Hex(`pin:${p}`);
  return [
    p,
    `pin${p}`,
    `pin:${p}`,
    `pin_${p}`,
    sha,
    `sha256:${sha}`,
    sha2,
    `sha256:${sha2}`,
  ];
}

async function supabaseRequest(path, init = {}, timeoutMs = 10000) {
  const { url, anonKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function queryUsersByPin(pin) {
  const candidates = buildPinHashCandidates(pin).map(encodeURIComponent).join(',');
  const response = await supabaseRequest(
    `/rest/v1/users?select=id,pin_hash&pin_hash=in.(${candidates})&limit=2`,
    { method: 'GET' }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Users lookup failed: ${response.status} ${detail}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function queryUserByPinHash(pinHash) {
  const response = await supabaseRequest(
    `/rest/v1/users?select=id,pin_hash&pin_hash=eq.${encodeURIComponent(pinHash)}&limit=1`,
    {
      method: 'GET',
      headers: {
        Prefer: 'count=exact',
      },
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Auto-login lookup failed: ${response.status} ${detail}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function queryUserCount() {
  const response = await supabaseRequest('/rest/v1/users?select=id', {
    method: 'HEAD',
    headers: {
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Users count failed: ${response.status} ${detail}`);
  }

  const countHeader = response.headers.get('content-range') || '';
  const count = Number(countHeader.split('/')[1] || '0');
  return Number.isFinite(count) ? count : 0;
}

async function createUser(pin) {
  const pinHash = `sha256:${sha256Hex(pin)}`;
  const response = await supabaseRequest('/rest/v1/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([{ pin_hash: pinHash, last_login: new Date().toISOString() }]),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Create user failed: ${response.status} ${detail}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function updateLastLogin(userId) {
  await supabaseRequest(`/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ last_login: new Date().toISOString() }),
  }).catch(() => {});
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = String(body.action || '').trim();

    if (action === 'auto-login') {
      const storedPinHash = String(body.pinHash || '').trim();
      if (!storedPinHash) {
        return json(200, { success: true, userId: null, pinHash: null });
      }

      const existing = await queryUserByPinHash(storedPinHash);
      if (!existing?.id) {
        return json(200, { success: true, userId: null, pinHash: null });
      }

      return json(200, {
        success: true,
        userId: existing.id,
        pinHash: existing.pin_hash,
      });
    }

    if (action === 'login') {
      const normalizedPin = String(body.pin || '').replace(/\D/g, '');
      if (normalizedPin.length < 4 || normalizedPin.length > 6) {
        return json(400, { success: false, error: 'PIN musí mít 4–6 číslic' });
      }

      const matches = await queryUsersByPin(normalizedPin);
      if (matches[0]?.id) {
        void updateLastLogin(matches[0].id);
        return json(200, {
          success: true,
          userId: matches[0].id,
          pinHash: matches[0].pin_hash,
        });
      }

      const count = await queryUserCount();
      if (count > 0) {
        return json(401, { success: false, error: 'Nesprávný PIN' });
      }

      const created = await createUser(normalizedPin);
      if (!created?.id) {
        throw new Error('Create user returned empty result');
      }

      return json(200, {
        success: true,
        userId: created.id,
        pinHash: created.pin_hash,
      });
    }

    return json(400, { success: false, error: 'Unsupported action' });
  } catch (error) {
    return json(500, {
      success: false,
      error: String(error?.message || error || 'Unexpected pin auth error'),
    });
  }
};
