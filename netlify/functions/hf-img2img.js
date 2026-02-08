const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

async function requestWithTimeout(url, init = {}, timeoutMs = 180_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const endpointUrl = String(process.env.HF_IMG2IMG_URL || '').trim();
    if (!endpointUrl) {
      return json(500, {
        error: 'HF_IMG2IMG_URL není nastavený (Netlify env).',
        hint: 'Nastav plnou URL na tvůj HF GPU endpoint (POST).',
      });
    }

    const hfToken = String(process.env.HF_TOKEN || '').trim();

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const input = body?.input;
    if (!input || typeof input !== 'object') return json(400, { error: 'Missing input' });

    const headers = {
      'Content-Type': 'application/json',
    };
    if (hfToken) headers.Authorization = `Bearer ${hfToken}`;

    const upstream = await requestWithTimeout(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input }),
    });

    const text = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      },
      body: text,
    };
  } catch (err) {
    return json(500, { error: 'HF proxy failed', detail: String(err?.message || err) });
  }
};

