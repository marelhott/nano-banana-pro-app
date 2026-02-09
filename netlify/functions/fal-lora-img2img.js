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

function pickStatusUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.status_url,
    payload.statusUrl,
    payload?.urls?.get,
    payload?.urls?.status,
    payload?.response_url,
  ];
  for (const c of candidates) {
    const v = String(c || '').trim();
    if (v.startsWith('http')) return v;
  }
  return '';
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    // Prefer key provided by the app (user entered in Settings). Fallback to server env.
    const headerKey = String(event?.headers?.['x-fal-key'] || event?.headers?.['X-Fal-Key'] || '').trim();
    const falKey = headerKey || String(process.env.FAL_KEY || '').trim();
    if (!falKey) {
      return json(500, {
        error: 'Chybí fal.ai API key.',
        hint: 'Otevři Nastavení a vlož fal.ai API key, nebo nastav Netlify env FAL_KEY.',
      });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const mode = String(body?.mode || 'run').toLowerCase(); // run|submit|status

    if (mode === 'status') {
      const statusUrl = String(body?.statusUrl || body?.status_url || '').trim();
      if (!statusUrl || !statusUrl.startsWith('http')) return json(400, { error: 'Missing statusUrl' });

      const upstream = await requestWithTimeout(statusUrl, {
        method: 'GET',
        headers: {
          Authorization: `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
      }, 30_000);

      const text = await upstream.text();
      return {
        statusCode: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
        body: text,
      };
    }

    const input = body?.input;
    if (!input || typeof input !== 'object') return json(400, { error: 'Missing input' });

    // Prefer async submit for large LoRA (avoids "Inactivity Timeout" on long runs).
    const shouldSubmit = mode === 'submit' || mode === 'queue';
    const targetUrl = shouldSubmit ? 'https://queue.fal.run/fal-ai/lora/image-to-image' : 'https://fal.run/fal-ai/lora/image-to-image';

    const upstream = await requestWithTimeout(targetUrl, {
      method: 'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }, shouldSubmit ? 60_000 : 180_000);

    const text = await upstream.text();
    if (shouldSubmit && upstream.ok) {
      // Normalize submit response: ensure we return statusUrl for polling.
      try {
        const payload = JSON.parse(text);
        const statusUrl = pickStatusUrl(payload);
        if (statusUrl) {
          return json(200, { ...payload, statusUrl });
        }
      } catch {
        // fall through with raw response
      }
    }
    return {
      statusCode: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      },
      body: text,
    };
  } catch (err) {
    return json(500, { error: 'fal proxy failed', detail: String(err?.message || err) });
  }
};
