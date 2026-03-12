const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

exports.handler = async (event) => ({
  statusCode: 404,
  headers: JSON_HEADERS,
  body: JSON.stringify({
    error: 'Not found',
    path: event?.path || '',
  }),
});
