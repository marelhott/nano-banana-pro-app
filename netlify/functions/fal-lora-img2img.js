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

function pickFirstHttpUrl(payload, candidates) {
  if (!payload || typeof payload !== 'object') return '';
  for (const c of candidates) {
    const v = String(c || '').trim();
    if (v.startsWith('http')) return v;
  }
  return '';
}

function pickPollingUrl(payload) {
  // Prefer a URL that represents job status (not the final result payload).
  return pickFirstHttpUrl(payload, [
    payload.status_url,
    payload.statusUrl,
    payload?.urls?.status,
    payload?.urls?.get, // some SDKs put the polling URL here
  ]);
}

function pickResultUrl(payload) {
  // Prefer a URL that returns the final output payload (images).
  return pickFirstHttpUrl(payload, [
    payload.response_url,
    payload.responseUrl,
    payload.result_url,
    payload.resultUrl,
    payload?.urls?.get,
    payload?.urls?.result,
    payload?.urls?.response,
  ]);
}

function extractImageUrls(payload) {
  const blocks = [
    payload?.images,
    payload?.output?.images,
    payload?.result?.images,
    payload?.response?.images,
    payload?.data?.images,
    payload?.outputs,
    payload?.output,
    payload?.result,
    payload?.response,
  ];
  for (const b of blocks) {
    if (!b) continue;
    if (Array.isArray(b)) {
      const urls = b
        .map((i) => (typeof i === 'string' ? i : i?.url))
        .filter((u) => typeof u === 'string' && u.length > 0);
      if (urls.length) return urls;
    } else if (typeof b === 'object') {
      const maybe = b?.images;
      if (Array.isArray(maybe)) {
        const urls = maybe
          .map((i) => (typeof i === 'string' ? i : i?.url))
          .filter((u) => typeof u === 'string' && u.length > 0);
        if (urls.length) return urls;
      }
    }
  }
  return [];
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

    // Allow switching fal endpoints (e.g. SDXL LoRA vs Flux LoRA) while keeping one proxy.
    // Keep this allowlist tight; never allow arbitrary URL passthrough from the browser.
    const endpointIdRaw = String(body?.endpointId || body?.endpoint_id || '').trim();
    const endpointId = endpointIdRaw || 'fal-ai/lora/image-to-image';
    const ALLOWED_ENDPOINTS = new Set([
      'fal-ai/lora/image-to-image',
      'fal-ai/flux-lora/image-to-image',
      'fal-ai/flux-2/lora/edit',
      'fal-ai/z-image/turbo/image-to-image/lora',
      'fal-ai/clarity-upscaler',
    ]);
    if (!ALLOWED_ENDPOINTS.has(endpointId)) {
      return json(400, {
        error: 'Nepovolený fal.ai endpoint.',
        hint: 'Použij fal-ai/lora/image-to-image, fal-ai/flux-lora/image-to-image, fal-ai/flux-2/lora/edit nebo fal-ai/z-image/turbo/image-to-image/lora.',
      });
    }

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

      // Some fal queue status endpoints return only metadata + response_url when completed.
      // In that case, fetch the response payload and return it (so the client receives images).
      try {
        const payload = JSON.parse(text);
        const status = String(payload?.status || payload?.state || '').toLowerCase();
        const hasImages = extractImageUrls(payload).length > 0;
        if ((status === 'completed' || status === 'succeeded') && !hasImages) {
          const resultUrl = pickResultUrl(payload);
          if (resultUrl && resultUrl !== statusUrl) {
            const r2 = await requestWithTimeout(resultUrl, {
              method: 'GET',
              headers: {
                Authorization: `Key ${falKey}`,
                'Content-Type': 'application/json',
              },
            }, 30_000);
            const t2 = await r2.text();
            return {
              statusCode: r2.status,
              headers: { 'Content-Type': r2.headers.get('content-type') || 'application/json' },
              body: t2,
            };
          }
        }
      } catch {
        // ignore parse issues, return raw status
      }
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
    const targetUrl = shouldSubmit ? `https://queue.fal.run/${endpointId}` : `https://fal.run/${endpointId}`;

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
        const statusUrl = pickPollingUrl(payload);
        const resultUrl = pickResultUrl(payload);
        if (statusUrl) {
          return json(200, { ...payload, statusUrl, resultUrl: resultUrl || undefined });
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
