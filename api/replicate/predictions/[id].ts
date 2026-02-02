export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const token = req.headers?.['x-replicate-token'];
  const id = req.query?.id;
  if (!token) {
    res.status(400).json({ error: 'Missing Replicate token' });
    return;
  }
  if (!id) {
    res.status(400).json({ error: 'Missing prediction id' });
    return;
  }

  const upstream = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
  res.send(text);
}

