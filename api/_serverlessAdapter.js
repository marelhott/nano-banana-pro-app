export function createServerlessAdapter(handler) {
  return async function serverlessHandler(req, res) {
    const headers = {};
    for (const [key, value] of Object.entries(req.headers || {})) {
      headers[key] = Array.isArray(value) ? value.join(',') : String(value || '');
    }

    const event = {
      httpMethod: req.method,
      headers,
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
      queryStringParameters: req.query || {},
      path: req.url,
    };

    const response = await handler(event);
    res.status(response.statusCode || 200);
    for (const [key, value] of Object.entries(response.headers || {})) {
      res.setHeader(key, value);
    }
    res.send(response.body || '');
  };
}
