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

function getServerApiKey(provider) {
  switch (provider) {
    case "gemini":
      return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    case "chatgpt":
    case "openai":
      return String(process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY || "").trim();
    case "grok":
      return String(process.env.GROK_API_KEY || process.env.XAI_API_KEY || "").trim();
    case "replicate":
      return String(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || "").trim();
    case "fal":
    case "flux_pro":
      return String(process.env.FAL_KEY || "").trim();
    default:
      return "";
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
    case "fal":
    case "flux_pro":
      // fal doesn't have a simple unauthenticated "models list" endpoint.
      // We call the generation endpoint with an intentionally invalid payload:
      // - If the key is invalid, we expect 401/403
      // - If the key is valid, we expect 400/422 quickly (payload validation)
      return requestWithTimeout("https://fal.run/fal-ai/lora/image-to-image", {
        method: "POST",
        headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
  const apiKey = String(body.apiKey || "").trim() || getServerApiKey(provider);

  if (!provider || !apiKey) {
    return json(400, { success: false, error: "Missing provider API key on client and server" });
  }

  const response = await testProviderKey(provider, apiKey);
  if (!response) {
    return json(400, { success: false, error: "Unsupported provider" });
  }

  // Special-case fal: 400/422 is "ok" (it means auth passed but payload is invalid).
  if (provider === "fal" || provider === "flux_pro") {
    if (response.status === 401 || response.status === 403) {
      return json(response.status, { success: false, error: "Unauthorized" });
    }
    return json(200, { success: true });
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
