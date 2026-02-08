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
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    const falKey = String(process.env.FAL_KEY || '').trim();
    if (!falKey) {
      return json(500, {
        error: 'FAL_KEY není nastavený (Netlify env).',
        hint: 'Vytvoř fal.ai API key a nastav ho jako FAL_KEY.',
      });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const input = body?.input;
    if (!input || typeof input !== 'object') {
      return json(400, { error: 'Missing input' });
    }

    const upstream = await requestWithTimeout('https://fal.run/fal-ai/lora/image-to-image', {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
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
    return json(500, { error: 'fal proxy failed', detail: String(err?.message || err) });
  }
};

