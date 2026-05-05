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
    providers: {
      gemini: Boolean(String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim()),
      chatgpt: Boolean(String(process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY || '').trim()),
      grok: Boolean(String(process.env.GROK_API_KEY || process.env.XAI_API_KEY || '').trim()),
      replicate: Boolean(String(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '').trim()),
      fal: Boolean(String(process.env.FAL_KEY || '').trim()),
      fluxPro: Boolean(String(process.env.FAL_KEY || '').trim()),
    },
  });
}
