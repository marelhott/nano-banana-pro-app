const BASE_URL = 'https://api.everart.ai/v1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/json',
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function splitDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) throw new Error('Neplatný data URL obrázku.');
  const mimeType = m[1] || 'image/jpeg';
  const b64 = m[2] || '';
  return {
    mimeType,
    buffer: Buffer.from(b64, 'base64'),
  };
}

function extFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[String(mime || '').toLowerCase()] || 'jpg';
}

async function everartFetch(apiKey, path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const detail = data?.error || data?.message || data?.raw || `HTTP ${res.status}`;
    const err = new Error(String(detail));
    err.status = res.status;
    err.detail = data;
    throw err;
  }

  return data;
}

async function uploadImageToEverArt(apiKey, dataUrl, namePrefix = 'image') {
  const { mimeType, buffer } = splitDataUrl(dataUrl);
  const ext = extFromMime(mimeType);
  const filename = `${namePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const upload = await everartFetch(apiKey, '/images/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images: [{ filename, content_type: mimeType }],
    }),
  });

  const uploadData = upload?.image_uploads?.[0];
  if (!uploadData?.upload_url || !uploadData?.file_url) {
    throw new Error('EverArt nevrátil upload URL.');
  }

  const putRes = await fetch(uploadData.upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });

  if (!putRes.ok) {
    throw new Error(`Upload do EverArt selhal (HTTP ${putRes.status}).`);
  }

  return {
    fileUrl: uploadData.file_url,
    uploadToken: uploadData.upload_token,
  };
}

async function listModels(apiKey) {
  const response = await everartFetch(apiKey, '/models', { method: 'GET' });
  const models = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.models)
      ? response.models
      : [];

  return models.map((m) => ({
    id: String(m.id || ''),
    everartId: String(m.id || ''),
    name: String(m.name || 'Untitled'),
    subject: String(m.subject || m.type || 'STYLE'),
    status: String(m.status || 'UNKNOWN'),
    thumbnailUrl: m.thumbnail_url ? String(m.thumbnail_url) : undefined,
    createdAt: m.created_at ? String(m.created_at) : undefined,
  }));
}

async function createModel(apiKey, body) {
  const name = String(body?.name || '').trim();
  const subject = String(body?.subject || 'STYLE').trim().toUpperCase();
  const images = Array.isArray(body?.images) ? body.images : [];

  if (!name) throw new Error('Název modelu je povinný.');
  if (images.length < 1) throw new Error('Nahraj aspoň 1 obrázek pro trénink.');

  const uploadTokens = [];
  for (let i = 0; i < images.length; i += 1) {
    const up = await uploadImageToEverArt(apiKey, images[i], `train-${i + 1}`);
    if (up.uploadToken) uploadTokens.push(up.uploadToken);
  }

  const created = await everartFetch(apiKey, '/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      subject,
      image_upload_tokens: uploadTokens,
    }),
  });

  const model = created?.model || created?.data?.model || created?.data || {};
  return {
    id: String(model.id || ''),
    everartId: String(model.id || ''),
    name: String(model.name || name),
    subject: String(model.subject || subject),
    status: String(model.status || 'TRAINING'),
    thumbnailUrl: model.thumbnail_url ? String(model.thumbnail_url) : undefined,
    createdAt: model.created_at ? String(model.created_at) : new Date().toISOString(),
  };
}

async function generateStart(apiKey, body) {
  const imageDataUrl = String(body?.imageDataUrl || '').trim();
  const modelIds = Array.isArray(body?.modelIds) ? body.modelIds.map((v) => String(v || '').trim()).filter(Boolean) : [];
  const styleStrength = Number(body?.styleStrength ?? 0.8);
  const numImages = Math.max(1, Math.min(4, Number(body?.numImages || 1)));
  const width = Math.max(256, Math.min(2048, Number(body?.width || 1024)));
  const height = Math.max(256, Math.min(2048, Number(body?.height || 1024)));

  if (!imageDataUrl) throw new Error('Chybí vstupní obrázek.');
  if (modelIds.length === 0) throw new Error('Vyber aspoň 1 model.');

  const upload = await uploadImageToEverArt(apiKey, imageDataUrl, 'input');

  const results = [];
  for (const modelId of modelIds) {
    try {
      const gen = await everartFetch(apiKey, `/models/${modelId}/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: ' ',
          type: 'img2img',
          image: upload.fileUrl,
          image_count: numImages,
          width,
          height,
          style_strength: styleStrength,
        }),
      });

      const gens = Array.isArray(gen?.generations) ? gen.generations : [];
      const generationIds = gens.map((g) => String(g?.id || '')).filter(Boolean);

      results.push({
        modelId,
        success: generationIds.length > 0,
        generationIds,
      });
    } catch (error) {
      results.push({
        modelId,
        success: false,
        generationIds: [],
        error: String(error?.message || 'Chyba při spuštění generování.'),
      });
    }
  }

  return results;
}

async function generationStatus(apiKey, body) {
  const generationId = String(body?.generationId || '').trim();
  if (!generationId) throw new Error('Chybí generationId.');

  const response = await everartFetch(apiKey, `/generations/${generationId}`, { method: 'GET' });
  const generation = response?.generation || response?.data?.generation || response?.data || {};

  return {
    id: String(generation.id || generationId),
    status: String(generation.status || 'UNKNOWN'),
    imageUrl: generation.image_url ? String(generation.image_url) : undefined,
    progress: typeof generation.progress === 'number' ? generation.progress : undefined,
    error: generation.error ? String(generation.error) : undefined,
    failureReason: generation.failure_reason ? String(generation.failure_reason) : undefined,
    createdAt: generation.created_at ? String(generation.created_at) : undefined,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { success: false, error: 'Invalid JSON body' });
  }

  const action = String(body?.action || '').trim();
  const apiKey = String(body?.apiKey || '').trim();
  if (!action) return json(400, { success: false, error: 'Chybí action.' });
  if (!apiKey) return json(400, { success: false, error: 'Chybí EverArt API klíč.' });

  try {
    if (action === 'models') {
      const models = await listModels(apiKey);
      return json(200, { success: true, models, count: models.length });
    }

    if (action === 'createModel') {
      const model = await createModel(apiKey, body);
      return json(200, { success: true, model });
    }

    if (action === 'generateStart') {
      const results = await generateStart(apiKey, body);
      return json(200, { success: true, results });
    }

    if (action === 'generationStatus') {
      const status = await generationStatus(apiKey, body);
      return json(200, { success: true, ...status });
    }

    return json(400, { success: false, error: 'Unsupported action' });
  } catch (error) {
    return json(500, {
      success: false,
      error: String(error?.message || 'EverArt function failed'),
    });
  }
};
