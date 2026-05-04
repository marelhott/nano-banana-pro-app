const { createClient } = require('@supabase/supabase-js');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const STORAGE_LOOKBACK_DAYS = 14;
const STORAGE_LIST_PAGE_SIZE = 100;
const ROOT_LIST_PAGE_SIZE = 25;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function getPublicUrl(supabase, path) {
  if (!path) return null;
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
}

function coerceTimestamp(value) {
  const ts = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
}

function extractFolder(path = '') {
  const parts = String(path).split('/').filter(Boolean);
  return parts[1] || '';
}

function buildSavedFallbackRecord(supabase, item, path) {
  const timestamp = coerceTimestamp(item.updated_at || item.created_at || item.last_accessed_at);
  return {
    id: `storage-saved:${path}`,
    url: getPublicUrl(supabase, path),
    fileName: item.name || path.split('/').pop() || 'image.jpg',
    fileType: 'image/jpeg',
    fileSize: Number(item.metadata?.size || item.metadata?.contentLength || 0),
    timestamp,
    category: 'reference',
    userId: path.split('/')[0] || null,
    storagePath: path,
    source: 'storage-fallback',
  };
}

function buildGeneratedFallbackRecord(supabase, item, path) {
  const timestamp = coerceTimestamp(item.updated_at || item.created_at || item.last_accessed_at);
  return {
    id: `storage-generated:${path}`,
    url: getPublicUrl(supabase, path),
    prompt: item.name || path.split('/').pop() || 'Recovered image',
    timestamp,
    resolution: undefined,
    aspectRatio: undefined,
    thumbnail: undefined,
    params: { recoveredFrom: 'storage-fallback' },
    userId: path.split('/')[0] || null,
    storagePath: path,
    source: 'storage-fallback',
  };
}

async function listAllStorageObjects(supabase, prefix) {
  const all = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from('images').list(prefix, {
      limit: STORAGE_LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'updated_at', order: 'desc' },
    });

    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;

    all.push(...data);
    if (data.length < STORAGE_LIST_PAGE_SIZE) break;
    offset += data.length;
  }

  return all;
}

async function loadStorageFallbackLibrary(supabase, candidateRoots) {
  const uniqueRoots = Array.from(new Set((candidateRoots || []).map((value) => String(value || '').trim()).filter(Boolean)));
  let roots = uniqueRoots;

  if (roots.length === 0) {
    const { data: listedRoots, error: rootsError } = await supabase.storage.from('images').list('', {
      limit: ROOT_LIST_PAGE_SIZE,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (rootsError) throw rootsError;
    roots = (listedRoots || []).map((root) => String(root?.name || '').trim()).filter(Boolean);
  }

  const cutoff = Date.now() - STORAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const saved = [];
  const generated = [];

  for (const root of roots || []) {
    const userRoot = String(root || '').replace(/^\/+|\/+$/g, '');
    if (!userRoot) continue;

    for (const folder of ['saved', 'generated']) {
      const objects = await listAllStorageObjects(supabase, `${userRoot}/${folder}`);
      for (const item of objects) {
        if (!item?.name) continue;
        if (!item.id && !item.updated_at && !item.created_at) continue;
        const fullPath = `${userRoot}/${folder}/${item.name}`;
        if (extractFolder(fullPath) !== folder) continue;
        if (fullPath.includes('/thumb') || fullPath.includes('/thumbnail')) continue;

        const timestamp = coerceTimestamp(item.updated_at || item.created_at || item.last_accessed_at);
        if (timestamp && timestamp < cutoff) continue;

        if (folder === 'saved') {
          saved.push(buildSavedFallbackRecord(supabase, item, fullPath));
        } else {
          generated.push(buildGeneratedFallbackRecord(supabase, item, fullPath));
        }
      }
    }
  }

  return { saved, generated };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  const url = String(process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const appUserId = String(event.headers['x-app-user-id'] || event.headers['X-App-User-Id'] || '').trim();
  const authUserId = String(event.headers['x-auth-user-id'] || event.headers['X-Auth-User-Id'] || '').trim();
  const candidateRoots = [appUserId, authUserId].filter(Boolean);

  if (!url || !serviceRoleKey) {
    return json(200, { success: false, saved: [], generated: [] });
  }

  try {
    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let savedQuery = supabase.from('saved_images').select('*').order('created_at', { ascending: false }).limit(500);
    let generatedQuery = supabase.from('generated_images').select('*').order('created_at', { ascending: false }).limit(500);

    if (appUserId) {
      savedQuery = savedQuery.eq('user_id', appUserId);
      generatedQuery = generatedQuery.eq('user_id', appUserId);
    }

    const [savedRes, generatedRes] = await Promise.all([savedQuery, generatedQuery]);

    if (savedRes.error) throw savedRes.error;
    if (generatedRes.error) throw generatedRes.error;

    const saved = (savedRes.data || []).map((row) => ({
      id: row.id,
      url: getPublicUrl(supabase, row.storage_path),
      fileName: row.file_name,
      fileType: 'image/jpeg',
      fileSize: row.file_size || 0,
      timestamp: new Date(row.created_at).getTime(),
      category: row.category,
      userId: row.user_id,
      storagePath: row.storage_path,
    }));

    const generated = (generatedRes.data || []).map((row) => ({
      id: row.id,
      url: getPublicUrl(supabase, row.storage_path),
      prompt: row.prompt,
      timestamp: new Date(row.created_at).getTime(),
      resolution: row.resolution,
      aspectRatio: row.aspect_ratio,
      thumbnail: row.thumbnail_path ? getPublicUrl(supabase, row.thumbnail_path) : undefined,
      params: row.params || undefined,
      userId: row.user_id,
      storagePath: row.storage_path,
    }));

    const fallback = await loadStorageFallbackLibrary(supabase, candidateRoots);
    const savedByPath = new Map(saved.map((item) => [item.storagePath, item]));
    const generatedByPath = new Map(generated.map((item) => [item.storagePath, item]));

    for (const item of fallback.saved) {
      if (!savedByPath.has(item.storagePath)) {
        savedByPath.set(item.storagePath, item);
      }
    }

    for (const item of fallback.generated) {
      if (!generatedByPath.has(item.storagePath)) {
        generatedByPath.set(item.storagePath, item);
      }
    }

    return json(200, {
      success: true,
      saved: Array.from(savedByPath.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
      generated: Array.from(generatedByPath.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    });
  } catch (error) {
    return json(200, {
      success: false,
      saved: [],
      generated: [],
      error: String(error?.message || error || 'Failed to load image library'),
    });
  }
};
