const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

const getProviderKey = (provider, bodyKey) => {
  const explicit = String(bodyKey || '').trim();
  if (explicit) return explicit;

  if (provider === 'gemini') {
    return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  }
  if (provider === 'chatgpt') {
    return String(process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY || '').trim();
  }
  if (provider === 'grok') {
    return String(process.env.GROK_API_KEY || process.env.XAI_API_KEY || '').trim();
  }
  if (provider === 'replicate') {
    return String(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '').trim();
  }
  return '';
};

const dataUrlToBlob = (dataUrl) => {
  const [header, b64] = String(dataUrl || '').split(',');
  const mime = header?.match(/^data:([^;]+)/)?.[1] || 'image/png';
  const bytes = Buffer.from(b64 || '', 'base64');
  return new Blob([bytes], { type: mime });
};

const geminiModels = {
  image: 'gemini-3.1-flash-image-preview',
  imageAlt: 'gemini-3-pro-image-preview',
  imageFallback: 'gemini-2.5-flash-image',
  text: 'gemini-3-flash-preview',
};

async function callGemini(model, body, apiKey) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || response.statusText || 'Gemini API error');
  }
  return data;
}

const extractGeminiText = (data) => {
  const parts = (data?.candidates || []).flatMap((candidate) => candidate?.content?.parts || []);
  return parts.map((part) => part?.text || '').join('').trim();
};

const extractGeminiImage = (data) => {
  const parts = (data?.candidates || []).flatMap((candidate) => candidate?.content?.parts || []);
  const imagePart = parts.find((part) => part?.inlineData?.data);
  if (!imagePart?.inlineData?.data) return null;
  const mime = imagePart.inlineData.mimeType || 'image/jpeg';
  return `data:${mime};base64,${imagePart.inlineData.data}`;
};

async function enhanceGemini(shortPrompt, apiKey) {
  const instruction = `Jsi profesionální prompt engineer. Vezmi následující krátký prompt pro generování obrázků a rozšiř ho do detailního, živého popisu. Vrať POUZE vylepšený prompt v češtině, nic jiného.\n\nKrátký prompt: "${shortPrompt}"\n\nVylepšený prompt:`;
  const data = await callGemini(geminiModels.text, {
    contents: [{ parts: [{ text: instruction }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
  }, apiKey);
  return extractGeminiText(data) || shortPrompt;
}

async function generateGeminiImage(payload, apiKey) {
  const parts = [];
  for (const image of payload.images || []) {
    const [, b64] = String(image.data || '').split(',');
    parts.push({ inlineData: { data: b64 || '', mimeType: image.mimeType || 'image/png' } });
  }
  parts.push({ text: payload.prompt || '' });

  const generationConfig = {
    responseModalities: ['IMAGE'],
  };
  const request = {
    contents: [{ parts }],
    generationConfig,
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  if (payload.useGrounding) request.tools = [{ googleSearch: {} }];
  if (payload.aspectRatio && payload.aspectRatio !== 'Original') {
    generationConfig.imageConfig = { aspectRatio: payload.aspectRatio };
  }

  const candidates = [geminiModels.image, geminiModels.imageAlt, geminiModels.imageFallback];
  let lastError;
  for (const model of candidates) {
    try {
      const data = await callGemini(model, request, apiKey);
      const imageBase64 = extractGeminiImage(data);
      if (imageBase64) {
        const groundingChunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const groundingMetadata = Array.isArray(groundingChunks)
          ? groundingChunks.map((c) => c?.web ? ({ url: c.web.uri, title: c.web.title }) : null).filter(Boolean)
          : undefined;
        return { imageBase64, groundingMetadata, modelId: model };
      }
      const text = extractGeminiText(data);
      throw new Error(text ? `Model nevrátil obrázek. Odpověď: ${text}` : 'Model nevrátil obrázek.');
    } catch (error) {
      lastError = error;
      const msg = String(error?.message || '').toLowerCase();
      if (msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable') || msg.includes('high demand')) {
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('Gemini image generation failed.');
}

async function generateGeminiVariants(prompt, apiKey) {
  const instruction = `Jsi expert na vytváření variant promptů pro AI generování obrázků. Vytvoř 3 malé, ale znatelné variace stejného tématu. Vrať POUZE JSON pole ve formátu [{"variant":"...","approach":"...","prompt":"..."}].\n\nUživatelův prompt: "${prompt}"`;
  const data = await callGemini(geminiModels.text, {
    contents: [{ parts: [{ text: instruction }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  }, apiKey);
  const text = extractGeminiText(data).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(text);
}

async function analyzeImageForJson(imageDataUrl, apiKey) {
  const [header, b64] = String(imageDataUrl || '').split(',');
  const mimeType = header?.match(/^data:([^;]+)/)?.[1] || 'image/png';
  const instruction = `Analyze this image and output ONLY valid JSON describing subject, environment, lighting, camera, aesthetic, and technical quality.`;
  const data = await callGemini(geminiModels.image, {
    contents: [{
      parts: [
        { inlineData: { data: b64 || '', mimeType } },
        { text: instruction },
      ],
    }],
  }, apiKey);
  return extractGeminiText(data).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
}

async function analyzeStyleTransfer(payload, apiKey) {
  const [, refB64] = String(payload.referenceDataUrl || '').split(',');
  const [, styleB64] = String(payload.styleDataUrl || '').split(',');
  const refMime = String(payload.referenceDataUrl || '').match(/^data:([^;]+)/)?.[1] || 'image/png';
  const styleMime = String(payload.styleDataUrl || '').match(/^data:([^;]+)/)?.[1] || 'image/png';
  const instruction = `Compare image A (content reference) and image B (style reference). Return ONLY JSON: {"recommendedStrength": number 0-100, "styleDescription": string, "negativePrompt": string}.`;
  const data = await callGemini(geminiModels.image, {
    contents: [{
      parts: [
        { inlineData: { data: refB64 || '', mimeType: refMime } },
        { inlineData: { data: styleB64 || '', mimeType: styleMime } },
        { text: instruction },
      ],
    }],
  }, apiKey);
  const text = extractGeminiText(data).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(text);
}

async function enhanceOpenAI(shortPrompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-5.2-chat-latest',
      messages: [{ role: 'user', content: `Expand this image prompt. Return only the enhanced prompt:\n\n${shortPrompt}` }],
      max_completion_tokens: 350,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || response.statusText || 'OpenAI API error');
  return data?.choices?.[0]?.message?.content?.trim() || shortPrompt;
}

function shouldFallbackOpenAI(message) {
  const normalized = String(message || '').toLowerCase();
  return ['must be verified', 'organization must be verified', 'model_not_found', 'does not exist', 'not available', 'access', 'permission', 'unsupported_model'].some((part) => normalized.includes(part));
}

async function generateOpenAIImage(payload, apiKey) {
  const models = ['gpt-image-2', 'chatgpt-image-latest', 'gpt-image-1.5'];
  const size = ['9:16', '2:3', '4:5'].includes(payload.aspectRatio)
    ? '1024x1536'
    : ['16:9', '3:2', '5:4'].includes(payload.aspectRatio)
      ? '1536x1024'
      : '1024x1024';
  const hasInputImage = Array.isArray(payload.images) && payload.images.length > 0;
  const url = `https://api.openai.com/v1/images/${hasInputImage ? 'edits' : 'generations'}`;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const request = hasInputImage
      ? (() => {
          const form = new FormData();
          form.set('model', model);
          form.set('prompt', payload.prompt || '');
          form.set('n', '1');
          form.set('size', size);
          form.set('quality', 'high');
          const first = payload.images[0];
          const blob = dataUrlToBlob(first.data);
          const ext = (first.mimeType || blob.type || 'image/png').split('/')[1] || 'png';
          form.set('image', blob, `input.${ext}`);
          return { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form };
        })()
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, prompt: payload.prompt || '', n: 1, size, quality: 'high' }),
        };
    const response = await fetch(url, request);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || response.statusText || 'OpenAI API error';
      if (i < models.length - 1 && shouldFallbackOpenAI(message)) continue;
      throw new Error(message);
    }
    const imageB64 = data?.data?.[0]?.b64_json || data?.data?.[0]?.b64;
    if (!imageB64) throw new Error('No image data returned from OpenAI image API');
    return { imageBase64: `data:image/png;base64,${imageB64}`, modelId: model };
  }
  throw new Error('OpenAI image generation failed for all fallback models.');
}

async function enhanceGrok(shortPrompt, apiKey) {
  const models = ['grok-4', 'grok-4-fast', 'grok-4-fast-non-reasoning', 'grok-3-mini-fast', 'grok-3-mini', 'grok-2-1212'];
  let lastError = 'Grok API error';

  for (const model of models) {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: `Expand this image prompt. Return only the enhanced prompt:\n\n${shortPrompt}` }],
        stream: false,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      return data?.choices?.[0]?.message?.content?.trim() || shortPrompt;
    }
    lastError = data?.error?.message || data?.message || response.statusText || lastError;
  }

  throw new Error(lastError);
}

async function fetchImageAsDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch Grok image: ${response.statusText}`);
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const bytes = Buffer.from(await response.arrayBuffer()).toString('base64');
  return `data:${contentType};base64,${bytes}`;
}

async function generateGrokImage(payload, apiKey) {
  const response = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'grok-imagine-image',
      prompt: payload.prompt || '',
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || response.statusText || 'Grok API error');
  const imageB64 = data?.data?.[0]?.b64_json || data?.data?.[0]?.b64;
  const imageUrl = data?.data?.[0]?.url;
  if (imageB64) return { imageBase64: `data:image/png;base64,${imageB64}`, modelId: 'grok-imagine-image' };
  if (imageUrl) return { imageBase64: await fetchImageAsDataUrl(imageUrl), modelId: 'grok-imagine-image' };
  throw new Error('No image data returned from Grok API');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const provider = String(body.provider || '');
    const action = String(body.action || '');
    const apiKey = getProviderKey(provider, body.apiKey);

    if (!apiKey) {
      return json(500, {
        success: false,
        error: `Server API key missing for ${provider}. Nastav Netlify env klíč pro tohoto providera.`,
      });
    }

    let result;
    if (provider === 'gemini') {
      if (action === 'enhancePrompt') result = await enhanceGemini(body.shortPrompt || body.prompt || '', apiKey);
      else if (action === 'generateImage') result = await generateGeminiImage(body, apiKey);
      else if (action === 'generate3PromptVariants') result = await generateGeminiVariants(body.prompt || '', apiKey);
      else if (action === 'analyzeImageForJson') result = await analyzeImageForJson(body.imageDataUrl, apiKey);
      else if (action === 'analyzeStyleTransfer') result = await analyzeStyleTransfer(body, apiKey);
      else throw new Error(`Unsupported Gemini action: ${action}`);
    } else if (provider === 'chatgpt') {
      if (action === 'enhancePrompt') result = await enhanceOpenAI(body.shortPrompt || body.prompt || '', apiKey);
      else if (action === 'generateImage') result = await generateOpenAIImage(body, apiKey);
      else throw new Error(`Unsupported OpenAI action: ${action}`);
    } else if (provider === 'grok') {
      if (action === 'enhancePrompt') result = await enhanceGrok(body.shortPrompt || body.prompt || '', apiKey);
      else if (action === 'generateImage') result = await generateGrokImage(body, apiKey);
      else throw new Error(`Unsupported Grok action: ${action}`);
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    return json(200, { success: true, result });
  } catch (error) {
    return json(500, { success: false, error: error?.message || 'Provider generation failed' });
  }
};
