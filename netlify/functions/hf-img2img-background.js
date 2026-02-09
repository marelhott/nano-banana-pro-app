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

async function fetchAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (HTTP ${res.status})`);
  const ct = res.headers.get('content-type') || 'image/png';
  const ab = await res.arrayBuffer();
  const b64 = Buffer.from(ab).toString('base64');
  return `data:${ct};base64,${b64}`;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    // Background Function: long-running requests are allowed (e.g. cold start + model download).
    // This is the fix for "Netlify 10-26s timeout".
    const endpointUrl = String(process.env.HF_IMG2IMG_URL || '').trim();
    if (!endpointUrl) {
      return json(500, {
        error: 'HF_IMG2IMG_URL není nastavený (Netlify env).',
        hint: 'Nastav plnou URL na tvůj HF Space endpoint (POST /api/img2img).',
      });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const input = body?.input;
    if (!input || typeof input !== 'object') return json(400, { error: 'Missing input' });

    // Optional: if HF Space is private, you can set HF_TOKEN in Netlify env.
    // For public Spaces, leave it unset.
    const hfToken = String(process.env.HF_TOKEN || '').trim();
    const headers = { 'Content-Type': 'application/json' };
    if (hfToken) headers.Authorization = `Bearer ${hfToken}`;

    const upstream = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input }),
    });

    const contentType = upstream.headers.get('content-type') || '';
    const text = await upstream.text();
    if (!upstream.ok) {
      // Preserve upstream error verbatim (as text) but wrap with context.
      return json(upstream.status, {
        error: 'HF Space request selhal',
        upstream_status: upstream.status,
        upstream_content_type: contentType,
        upstream_body: text,
      });
    }

    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      return json(502, {
        error: 'HF Space vratil ne-JSON odpoved',
        upstream_content_type: contentType,
        upstream_body: text,
      });
    }

    // If the Space already returns inline base64 images, just return them.
    if (payload && Array.isArray(payload.images_b64) && payload.images_b64.length) {
      return json(200, payload);
    }

    // Otherwise, download /files URLs server-side and return inline base64.
    const urls = Array.isArray(payload?.images)
      ? payload.images.map((i) => String(i?.url || '')).filter(Boolean)
      : [];

    if (!urls.length) {
      return json(502, { error: 'HF Space nevratil images ani images_b64', payload });
    }

    const out = [];
    for (const u of urls) {
      // Force https for hf.space files URLs; avoid mixed-content origins.
      let fixed = u;
      try {
        const uu = new URL(u);
        if (uu.protocol === 'http:' && uu.hostname.endsWith('.hf.space')) {
          uu.protocol = 'https:';
          fixed = uu.toString();
        }
      } catch {
        // ignore
      }
      out.push(await fetchAsDataUrl(fixed));
    }

    return json(200, { ...payload, images_b64: out });
  } catch (err) {
    return json(500, { error: 'HF background proxy failed', detail: String(err?.message || err) });
  }
};

