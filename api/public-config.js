const json = (res, status, body) => {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.json(body);
};

export default function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  json(res, 200, {
    supabaseUrl: String(process.env.VITE_SUPABASE_URL || '').trim(),
    supabaseAnonKey: String(process.env.VITE_SUPABASE_ANON_KEY || '').trim(),
    r2PublicModelsBaseUrl: String(process.env.R2_PUBLIC_MODELS_BASE_URL || '').trim(),
    r2PublicLorasBaseUrl: String(process.env.R2_PUBLIC_LORAS_BASE_URL || '').trim(),
  });
}
