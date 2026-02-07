const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

function extractReplicateToken(event, bodyToken) {
  const headerToken =
    event.headers?.['x-replicate-token'] ||
    event.headers?.['X-Replicate-Token'] ||
    event.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
    event.headers?.Authorization?.replace(/^Bearer\s+/i, '');

  return headerToken || bodyToken || null;
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

exports.handler = async (event) => {
  try {
    const method = event.httpMethod || 'GET';
    const path = event.path || '';

    if (method === 'POST') {
      let body = {};
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: 'Invalid JSON body' });
      }

      const { token: bodyToken, version, input } = body;
      const token = extractReplicateToken(event, bodyToken);

      if (!token || typeof token !== 'string') {
        return json(400, { error: 'Missing Replicate token' });
      }
      if (!version || typeof version !== 'string') {
        return json(400, { error: 'Missing Replicate model/version' });
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
      return {
        statusCode: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
        },
        body: text,
      };
    }

    if (method === 'GET') {
      const token = extractReplicateToken(event);
      if (!token) {
        return json(400, { error: 'Missing Replicate token' });
      }

      const match = path.match(/\/api\/replicate\/predictions\/([^/?#]+)/);
      const predictionId = decodeURIComponent(match?.[1] || '');
      if (!predictionId) {
        return json(400, { error: 'Missing prediction id' });
      }

      const upstream = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const text = await upstream.text();
      return {
        statusCode: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
        },
        body: text,
      };
    }

    return json(405, { error: 'Method not allowed' });
  } catch {
    return json(500, { error: 'Replicate proxy failed' });
  }
};
