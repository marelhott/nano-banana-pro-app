const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

exports.handler = async () => {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const r2PublicModelsBaseUrl = (process.env.R2_PUBLIC_MODELS_BASE_URL || '').trim();
  const r2PublicLorasBaseUrl = (process.env.R2_PUBLIC_LORAS_BASE_URL || '').trim();

  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      supabaseUrl,
      supabaseAnonKey,
      r2PublicModelsBaseUrl,
      r2PublicLorasBaseUrl,
    }),
  };
};
