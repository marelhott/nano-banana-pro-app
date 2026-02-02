export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { token, version, input } = (req.body || {}) as {
    token?: string;
    version?: string;
    input?: unknown;
  };

  if (!token) {
    res.status(400).json({ error: 'Missing Replicate token' });
    return;
  }
  if (!version) {
    res.status(400).json({ error: 'Missing Replicate model/version' });
    return;
  }

  const upstream = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({ version, input: input || {} }),
  });

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
  res.send(text);
}
