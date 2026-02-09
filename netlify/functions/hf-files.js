function bin(statusCode, bodyBuffer, contentType = 'application/octet-stream') {
  return {
    statusCode,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
    isBase64Encoded: true,
    body: Buffer.from(bodyBuffer).toString('base64'),
  };
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload),
  };
}

async function requestWithTimeout(url, init = {}, timeoutMs = 60_000) {
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
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const endpointUrl = String(process.env.HF_IMG2IMG_URL || '').trim();
    if (!endpointUrl) {
      return json(500, {
        error: 'HF_IMG2IMG_URL není nastavený (Netlify env).',
      });
    }

    // Netlify maps /api/hf/files/<name> -> /.netlify/functions/hf-files/<name>
    // but `event.path` can be either of those depending on routing.
    const rawPath = String(event.path || '');
    const prefixes = ['/.netlify/functions/hf-files/', '/api/hf/files/'];
    let splat = '';
    for (const p of prefixes) {
      if (rawPath.includes(p)) {
        splat = rawPath.split(p).slice(1).join(p);
        break;
      }
    }
    if (!splat) {
      // Fallback: take last path segment.
      const parts = rawPath.split('/').filter(Boolean);
      splat = parts[parts.length - 1] || '';
    }
    // Strip query/hash if present.
    splat = String(splat).split('?')[0].split('#')[0];
    const fileName = decodeURIComponent(splat || '').trim();

    if (!fileName) return json(400, { error: 'Missing file name' });
    // Prevent traversal / unexpected paths.
    if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) return json(400, { error: 'Invalid file name' });

    const origin = new URL(endpointUrl).origin;
    const upstreamUrl = `${origin}/files/${encodeURIComponent(fileName)}`;

    const hfToken = String(process.env.HF_TOKEN || '').trim();
    const headers = {};
    if (hfToken) headers.Authorization = `Bearer ${hfToken}`;

    const upstream = await requestWithTimeout(upstreamUrl, { method: 'GET', headers }, 90_000);
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return json(upstream.status, {
        error: `HF files fetch failed (HTTP ${upstream.status})`,
        detail: text || undefined,
      });
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    const ab = await upstream.arrayBuffer();
    return bin(200, ab, contentType);
  } catch (err) {
    return json(500, { error: 'HF files proxy failed', detail: String(err?.message || err) });
  }
};
