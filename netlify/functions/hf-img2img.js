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

    // If Space is private, direct /files URLs often return 404/blocked in the browser.
    // Rewrite `images[].url` to go through our own Netlify proxy: /api/hf/files/<name>
    // so downloads include HF_TOKEN server-side.
    const contentType = upstream.headers.get('content-type') || '';
    if (upstream.ok && contentType.includes('application/json')) {
      try {
        const payload = JSON.parse(text);
        if (payload && Array.isArray(payload.images)) {
          payload.images = payload.images.map((img) => {
            const u = String(img?.url || '');
            // If upstream already returns our proxy URL, keep it.
            if (u.startsWith('/api/hf/files/')) return img;
            let name = '';
            try {
              const uu = new URL(u);
              name = (uu.pathname || '').split('/').pop() || '';
            } catch {
              name = u.split('/').pop() || '';
            }
            name = String(name).split('?')[0].split('#')[0];
            if (!name) return img;
            return { ...img, url: `/api/hf/files/${encodeURIComponent(name)}` };
          });
          return json(200, payload);
        }
      } catch {
        // ignore parse errors; fall through to raw passthrough
      }
    }
    return {
      statusCode: upstream.status,
      headers: {
        'Content-Type': contentType || 'application/json',
        'Cache-Control': 'no-store',
      },
      body: text,
    };
  } catch (err) {
    return json(500, { error: 'HF proxy failed', detail: String(err?.message || err) });
  }
};
