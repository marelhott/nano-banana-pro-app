const crypto = require('crypto');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(statusCode, payload) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

function env(name) {
  const v = String(process.env[name] || '').trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function parseAllowedBuckets() {
  const raw = String(process.env.R2_ALLOWED_BUCKETS || 'loras,models').trim();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function toAmzDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function toDateStamp(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function hmac(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

function sha256Hex(msg) {
  return crypto.createHash('sha256').update(msg, 'utf8').digest('hex');
}

function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(params) {
  const keys = Object.keys(params).sort();
  return keys
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(String(params[k]))}`)
    .join('&');
}

function getSigningKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function presignUrl({ method, host, canonicalUri, accessKeyId, secretAccessKey, region, expires }) {
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = toDateStamp(now);
  const algorithm = 'AWS4-HMAC-SHA256';
  const service = 's3';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const query = {
    'X-Amz-Algorithm': algorithm,
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = canonicalQuery(query);
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const stringToSign = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const finalQuery = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return `https://${host}${canonicalUri}?${finalQuery}`;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const op = String(body.op || '').toLowerCase();
    const key = String(body.key || '').replace(/^\/+/, '').trim();
    const bucketOverride = String(body.bucket || '').trim();
    const expires = Math.max(60, Math.min(7 * 24 * 3600, Number(body.expires || 3600)));
    if (!op || (op !== 'get' && op !== 'put')) return json(400, { error: 'Invalid op (get|put)' });
    if (!key) return json(400, { error: 'Missing key' });

    const accountId = env('R2_ACCOUNT_ID');
    const accessKeyId = env('R2_ACCESS_KEY_ID');
    const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
    const allowedBuckets = parseAllowedBuckets();
    const defaultBucket = String(process.env.R2_BUCKET || 'loras').trim();
    const bucket = bucketOverride || defaultBucket;
    if (!allowedBuckets.has(bucket)) {
      return json(400, {
        error: 'Bucket not allowed',
        allowed: Array.from(allowedBuckets),
      });
    }
    const region = 'auto';
    const host = `${accountId}.r2.cloudflarestorage.com`;

    const canonicalUri = `/${encodeRfc3986(bucket)}/${key.split('/').map(encodeRfc3986).join('/')}`;
    const method = op === 'put' ? 'PUT' : 'GET';
    const signedUrl = presignUrl({ method, host, canonicalUri, accessKeyId, secretAccessKey, region, expires });

    // This is the unsigned path-style URL. It may or may not be publicly readable depending on bucket settings.
    const objectUrl = `https://${host}/${bucket}/${key}`;

    return json(200, { signedUrl, objectUrl, bucket, key, expires });
  } catch (err) {
    return json(500, { error: 'r2 presign failed', detail: String(err?.message || err) });
  }
};
