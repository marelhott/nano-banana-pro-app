const { createClient } = require('@supabase/supabase-js');

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

function getPublicUrl(supabase, path) {
  if (!path) return null;
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  const url = String(process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !serviceRoleKey) {
    return json(200, { success: false, saved: [], generated: [] });
  }

  try {
    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [savedRes, generatedRes] = await Promise.all([
      supabase.from('saved_images').select('*').order('created_at', { ascending: false }),
      supabase.from('generated_images').select('*').order('created_at', { ascending: false }),
    ]);

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
    }));

    return json(200, { success: true, saved, generated });
  } catch (error) {
    return json(200, {
      success: false,
      saved: [],
      generated: [],
      error: String(error?.message || error || 'Failed to load image library'),
    });
  }
};
