const JSON_HEADERS = {
  "Content-Type": "application/json",
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

async function requestWithTimeout(url, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function testProviderKey(provider, apiKey) {
  switch (provider) {
    case "gemini": {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      return requestWithTimeout(endpoint, { method: "GET" });
    }
    case "chatgpt":
      return requestWithTimeout("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    case "grok":
      return requestWithTimeout("https://api.x.ai/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    case "replicate":
      return requestWithTimeout("https://api.replicate.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    default:
      return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { success: false, error: "Invalid JSON body" });
  }

  const provider = String(body.provider || "").toLowerCase();
  const apiKey = String(body.apiKey || "").trim();

  if (!provider || !apiKey) {
    return json(400, { success: false, error: "Missing provider or API key" });
  }

  const response = await testProviderKey(provider, apiKey);
  if (!response) {
    return json(400, { success: false, error: "Unsupported provider" });
  }

  if (!response.ok) {
    let detail = response.statusText || `HTTP ${response.status}`;
    try {
      const data = await response.json();
      detail = data?.error?.message || data?.detail || detail;
    } catch {
      // Keep fallback detail.
    }
    return json(response.status, { success: false, error: detail });
  }

  return json(200, { success: true });
};
