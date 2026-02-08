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

function getSubpath(eventPath) {
  const p = String(eventPath || '');
  // Can be invoked via redirects (/api/comfy/...) or directly (/.netlify/functions/comfy/...).
  const apiIdx = p.indexOf('/api/comfy/');
  if (apiIdx >= 0) return p.slice(apiIdx + '/api/comfy/'.length);
  const fnIdx = p.indexOf('/.netlify/functions/comfy/');
  if (fnIdx >= 0) return p.slice(fnIdx + '/.netlify/functions/comfy/'.length);
  if (p.endsWith('/api/comfy')) return '';
  if (p.endsWith('/.netlify/functions/comfy')) return '';
  return p.replace(/^\/+/, '');
}

function withAuthHeaders(headers = {}) {
  const token = process.env.COMFY_AUTH_TOKEN;
  if (!token) return headers;
  return { ...headers, Authorization: `Bearer ${token}` };
}

function resolveBaseUrl() {
  const raw = String(process.env.COMFY_BASE_URL || '').trim();
  if (!raw) return null;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

exports.handler = async (event) => {
  try {
    const baseUrl = resolveBaseUrl();
    if (!baseUrl) {
      return json(500, {
        error: 'COMFY_BASE_URL není nastavená (Netlify env).',
        hint: 'Nastav COMFY_BASE_URL na URL tvého ComfyUI serveru.',
      });
    }

    const method = String(event.httpMethod || 'GET').toUpperCase();
    const subpath = getSubpath(event.path || '');
    const qs = event.rawQuery || '';
    const upstreamUrl = `${baseUrl}/${subpath}${qs ? `?${qs}` : ''}`;

    // Minimal allowlist of endpoints we proxy (avoid becoming a generic open proxy).
    const allowedPrefixes = [
      'object_info',
      'prompt',
      'history/',
      'view',
      'upload',
      'system_stats',
      'queue',
    ];
    if (!allowedPrefixes.some((pfx) => subpath === pfx || subpath.startsWith(pfx))) {
      return json(404, { error: 'Unsupported Comfy endpoint.' });
    }

    if (method === 'POST' && subpath === 'upload') {
      let body = {};
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: 'Invalid JSON body' });
      }

      const dataUrl = String(body.dataUrl || '');
      const fileName = String(body.fileName || 'input.png');
      const overwrite = Boolean(body.overwrite ?? true);

      const commaIdx = dataUrl.indexOf(',');
      if (!dataUrl.startsWith('data:') || commaIdx < 0) {
        return json(400, { error: 'Missing/invalid dataUrl' });
      }

      const b64 = dataUrl.slice(commaIdx + 1);
      const buffer = Buffer.from(b64, 'base64');

      const form = new FormData();
      form.append('image', new Blob([buffer]), fileName);
      form.append('overwrite', overwrite ? 'true' : 'false');

      const upstream = await fetch(`${baseUrl}/upload/image`, {
        method: 'POST',
        headers: withAuthHeaders({}),
        body: form,
      });

      const text = await upstream.text();
      return {
        statusCode: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
        },
        body: text,
      };
    }

    const init = {
      method,
      headers: withAuthHeaders({}),
    };

    if (method === 'POST' && (subpath === 'prompt')) {
      init.headers['Content-Type'] = 'application/json';
      init.body = event.body || '{}';
    }

    const upstream = await fetch(upstreamUrl, init);

    // Binary responses (view) must be base64-encoded for Netlify Functions.
    const contentType = upstream.headers.get('content-type') || '';
    const isBinary = contentType.startsWith('image/') || contentType === 'application/octet-stream';
    if (isBinary) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      return {
        statusCode: upstream.status,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': upstream.headers.get('cache-control') || 'no-store',
        },
        isBase64Encoded: true,
        body: buf.toString('base64'),
      };
    }

    const text = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: {
        'Content-Type': contentType || 'application/json',
      },
      body: text,
    };
  } catch (err) {
    return json(500, { error: 'Comfy proxy failed', detail: String(err?.message || err) });
  }
};

