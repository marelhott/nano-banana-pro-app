const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

exports.handler = async () => {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      supabaseUrl,
      supabaseAnonKey,
    }),
  };
};

