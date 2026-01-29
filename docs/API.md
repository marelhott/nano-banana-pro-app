# API Contract Documentation

## External APIs

### 1. Google Gemini API (Nano Banana Pro)

**Base URL**: `https://generativelanguage.googleapis.com/`

#### A. Image Generation
**Endpoint**: `/v1beta/models/gemini-stable-2-flash-exp:generateContent`  
**Method**: POST  
**Headers**:
```json
{
  "Content-Type": "application/json",
  "x-goog-api-key": "{GEMINI_API_KEY}"
}
```

**Request Payload**:
```json
{
  "contents": [{
    "parts": [
      { "text": "{prompt}" },
      {
        "inlineData": {
          "mimeType": "image/jpeg",
          "data": "{base64Image}"
        }
      }
    ]
  }],
  "generationConfig": {
    "responseMimeType": "image/png"
  }
}
```

**Response** (Success 200):
```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "inlineData": {
          "mimeType": "image/png",
          "data": "{base64ImageData}"
        }
      }]
    },
    "groundingMetadata": { ... }
  }]
}
```

**Response** (Error 429 - Rate Limit):
```json
{
  "error": {
    "code": 429,
    "message": "Resource has been exhausted",
    "status": "RESOURCE_EXHAUSTED"
  }
}
```

**Error Handling**:
- 401: Invalid API key → Prompt user to re-enter
- 429: Rate limit → Show error, suggest retry later
- 500: Server error → Show generic error
- Network error → Retry logic (none implemented)

#### B. Prompt Enhancement
**Endpoint**: Same as image generation but text-only  
**Method**: POST  
**Request**:
```json
{
  "contents": [{
    "parts": [{
      "text": "Enhance this image generation prompt to be more detailed and vivid: {userPrompt}"
    }]
  }]
}
```

**Response**:
```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "text": "{enhancedPrompt}"
      }]
    }
  }]
}
```

---

### 2. OpenAI ChatGPT API

**Base URL**: `https://api.openai.com/v1`

#### A. Image Generation (DALL-E)
**Endpoint**: `/images/generations`  
**Method**: POST  
**Headers**:
```json
{
  "Authorization": "Bearer {OPENAI_API_KEY}",
  "Content-Type": "application/json"
}
```

**Request**:
```json
{
  "model": "dall-e-3",
  "prompt": "{prompt}",
  "n": 1,
  "size": "1024x1024",
  "quality": "standard",
  "response_format": "url"
}
```

**Response**:
```json
{
  "created": 1234567890,
  "data": [{
    "url": "https://...image.png"
  }]
}
```

#### B. Chat/Text Generation
**Endpoint**: `/chat/completions`  
**Method**: POST  
**Request**:
```json
{
  "model": "gpt-4",
  "messages": [{
    "role": "user",
    "content": "{prompt}"
  }],
  "max_tokens": 500
}
```

**Response**:
```json
{
  "choices": [{
    "message": {
      "content": "{responseText}"
    }
  }],
  "usage": {
    "total_tokens": 123
  }
}
```

**Error Response**:
```json
{
  "error": {
    "message": "Invalid API key",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

---

### 3. Grok API (X.AI)

**Base URL**: `https://api.x.ai/v1`

#### A. Image Generation
**Endpoint**: `/images/generations`  
**Method**: POST  
**Headers**:
```json
{
  "Authorization": "Bearer {GROK_API_KEY}",
  "Content-Type": "application/json"
}
```

**Request**: Similar to OpenAI format
```json
{
  "prompt": "{prompt}",
  "model": "grok-vision-beta",
  "n": 1
}
```

**Response**:
```json
{
  "data": [{
    "url": "https://...image.png"
  }]
}
```

---

## Internal API (Supabase)

### Supabase Configuration
**URL**: `process.env.VITE_SUPABASE_URL`  
**Anon Key**: `process.env.VITE_SUPABASE_ANON_KEY`

### Database Tables

#### Table: `images`
**Columns**:
```sql
id: uuid PRIMARY KEY
user_id: uuid REFERENCES users(id)
url: text
prompt: text
resolution: text
aspect_ratio: text
style_code: integer
created_at: timestamp
metadata: jsonb
```

**Insert Image**:
```typescript
const { data, error } = await supabase
  .from('images')
  .insert({
    user_id: userId,
    url: imageUrl,
    prompt: prompt,
    resolution: resolution,
    aspect_ratio: aspectRatio,
    style_code: styleCode,
    metadata: { variantInfo, versions }
  })
```

**Query Images**:
```typescript
const { data, error } = await supabase
  .from('images')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
```

**Delete Image**:
```typescript
const { error } = await supabase
  .from('images')
  .delete()
  .eq('id', imageId)
```

#### Table: `reference_images`
**Columns**:
```sql
id: uuid PRIMARY KEY
user_id: uuid
url: text
created_at: timestamp
```

**Same CRUD operations as images table**

#### Table: `style_images`
**Columns**: Identical to reference_images  
**Purpose**: Store style/reference images separately

### Storage Bucket: `generated-images`

**Upload Image**:
```typescript
const { data, error} = await supabase.storage
  .from('generated-images')
  .upload(`${userId}/${imageId}.png`, blob, {
    contentType: 'image/png',
    upsert: true
  })
```

**Get Public URL**:
```typescript
const { data } = supabase.storage
  .from('generated-images')
  .getPublicUrl(`${userId}/${imageId}.png`)

// Returns: { publicUrl: "https://..." }
```

**Download Image**:
```typescript
const { data, error } = await supabase.storage
  .from('generated-images')
  .download(`${userId}/${imageId}.png`)
```

**Delete Image**:
```typescript
const { error } = await supabase.storage
  .from('generated-images')
  .remove([`${userId}/${imageId}.png`])
```

### Authentication

**Create/Find User**:
```typescript
async function supabaseAuth(pin: string) {
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('pin', pin)
    .single()

  if (users) return users.id

  // Create new user
  const { data: newUser } = await supabase
    .from('users')
    .insert({ pin })
    .select('id')
    .single()

  return newUser.id
}
```

**Session**: No JWT/session management (relies on userId in localStorage)

---

## Response Handling

### Success Flow
1. Parse JSON response
2. Extract image data (base64 or URL)
3. Convert base64 to data URL if needed
4. Update state with success
5. Upload to Supabase
6. Show image in UI

### Error Flow
1. Catch fetch/network errors
2. Parse error response if available
3. Extract error.message
4. Set image.status = 'error'
5. Set image.error = message
6. Display error in UI
7. Log to console (no external logging)

### Timeout Behavior
- **No timeout implemented** - requests wait indefinitely
- Large images may hang
- No abort controller used

### Retry Logic
- **No automatic retry**
- User must manually click generate again
- Rate limit errors suggest waiting

### Status Codes
| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 401 | Unauthorized | Prompt for API key |
| 403 | Forbidden | Show error |
| 429 | Rate limit | Show "try again later" |
| 500 | Server error | Show generic error |
| 503 | Service unavailable | Show "service down" |

---

## API Usage Tracking

**Storage**: localStorage key `'nanoBanana_apiUsage'`
**Format**:
```json
{
  "gemini": {
    "totalRequests": 45,
    "successfulRequests": 42,
    "failedRequests": 3,
    "totalTokens": 12000,
    "lastUpdated": 1234567890
  },
  "chatgpt": { ... },
  "grok": { ... }
}
```

**Update on Each Request**:
```typescript
ApiUsageTracker.track({
  provider: 'gemini',
  success: true,
  tokens: 250
})
```

**Display**: ApiUsagePanel component shows stats per provider

---

## Polling / WebSockets
**Not Implemented** - All operations are request/response only

## Caching
**Not Implemented** - No response caching, every request hits API fresh
