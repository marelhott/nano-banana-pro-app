# Product & Behavior Specification
**Version**: eb6efd9 (Last Func

tional Baseline)  
**App**: Mulen Nano - AI Image Generation Platform

## Core Purpose
Multi-provider AI image generation application that supports Gemini (Nano Banana Pro), ChatGPT, and Grok APIs. Users can generate images from text prompts with reference/style images, manage collections, and maintain a persistent gallery via Supabase.

## Main Screens

### 1. PIN Authentication Screen
- **Purpose**: User authentication via numeric PIN
- **Behavior**:
  - User enters 4-digit PIN
  - Creates Supabase user if doesn't exist
  - Stores `userId` and `pin` in localStorage
  - On success: loads main app interface
  - Auto-remembers PIN for returning users

### 2. Main Application Screen
**Layout**: Sidebar (left) + Main results panel (right) + Floating gallery panel

**Sidebar Components**:
- Provider selector (Gemini/ChatGPT/Grok)
- API key modal trigger (if no key)
- Prompt textarea with auto-resize
- JSON Context upload button
- Prompt mode toggle (Simple/Template/Collections)
- Template/Collections modal triggers
- Saved prompts dropdown
- Enhance/Undo/Redo prompt buttons
- Image count selector (1-5 images)
- Resolution selector (1K/2K/4K)
- Aspect ratio selector (11 options)
- Reference images upload section
- Style images upload section
- Generate/3 Variants buttons

**Main Panel**:
- Generated images grid
- Loading progress indicators per image
- Quick actions menu (right-click)
- Image edit modal
- Comparison modal

**Floating Gallery Panel** (toggleable):
- Tabs: Vygenerované / Referenční / Stylové
- Multi-select with checkboxes
- Bulk download as ZIP
- Delete operations

## Features & Sub-Features

### A. Image Generation

#### A1. Single Generation
**Trigger**: Click "GENEROVAT OBRÁZEK" button  
**Preconditions**: 
- Valid API key for selected provider
- Non-empty prompt (min 1 char after trim)

**Behavior**:
1. Validates inputs
2. Creates placeholder image objects with status='loading'
3. Calls AI provider API sequentially (delay between calls to avoid rate limit)
4. For each image:
   - Shows LoadingProgress component
   - On success: updates status='success', sets url
   - On error: updates status='error', sets error message
   - Auto-saves to Supabase gallery
5. Reference/style images auto-saved to gallery (once per batch)

**API Call Structure** (Gemini example):
```typescript
await generateImage({
  prompt: fullPrompt,
  referenceImages: state.sourceImages,
  styleImages: state.styleImages,
  resolution: state.resolution,
  aspectRatio: state.aspectRatio,
  styleCode: Math.floor(Math.random() * 1000000)
})
```

**Constraints**:
- Max 14 generated images visible at once (older images removed)
- Sequential generation with small delay (~100ms)
- Rate limiting handled by provider services

#### A2. 3 Variants Generation
**Trigger**: Click "3 VARIANTY" button  
**Behavior**:
1. Takes current prompt
2. Generates 3 sophisticated AI interpretations:
   - Variant 1: PhotoRealistic approach
   - Variant 2: Artistic interpretation
   - Variant 3: Technical/precise approach
3. Uses Gemini to enhance each prompt variation
4. Generates 3 images sequentially with different style codes
5. Each image tagged with `variantInfo` metadata

**Variant Structure**:
```typescript
variantInfo: {
  isVariant: true,
  variantNumber: 1|2|3,
  variant: "PhotoRealistic" | "Artistic" | "Technical",
  approach: "detailed description...",
  originalPrompt: "user's simple prompt"
}
```

#### A3. Batch Processing  
**Trigger**: Auto-detection when multiple reference images (≥2) uploaded  
**Behavior**:
- Processes each reference image sequentially
- Uses each as primary reference with same prompt
- Shows batch progress indicator
- Results appear in main panel

### B. Prompt Management

#### B1. Enhance Prompt
**Trigger**: Click wand icon next to prompt textarea  
**Preconditions**: 
- Non-empty prompt
- Gemini API key available
- Not already enhancing

**Behavior**:
1. Calls `enhancePromptWithAI(prompt, apiKey)`
2. Uses Gemini to expand/improve prompt
3. Replaces prompt textarea content
4. Adds to prompt history

**Loading State**: Button shows loading spinner, disabled during operation

#### B2. Prompt History (Undo/Redo)
**Storage**: In-memory PromptHistory class (max 50 items)  
**Actions**:
- **Undo**: Reverts to previous prompt in history
- **Redo**: Moves forward in history

**State**:
- Buttons disabled when at history boundaries
- History survives session (not persisted to localStorage)

#### B3. Saved Prompts
**Storage**: `localStorage` key: `'nanoBanana_savedPrompts'`  
**Format**: 
```json
[{
  "id": "uuid",
  "name": "My Prompt",
  "prompt": "text...",
  "category": "optional",
  "timestamp": 1234567890
}]
```

**Default Prompts** (if empty):
- "A serene landscape..."
- "A futuristic cityscape..."
- (+ 5 more defaults)

**Actions**:
- Load prompt: replaces textarea
- Save current: opens save dialog with auto-suggested name
- Delete: removes from list
- Edit: modify name/prompt in-place

#### B4. JSON Context Upload
**Trigger**: Click JSON icon, select .json file  
**Behavior**:
1. Reads file as text
2. Parses JSON
3. Validates structure (must have `prompt` field)
4. Sets `prompt` from JSON
5. Optionally sets `numberOfImages`, `resolution`, `aspectRatio`
6. Shows success toast

**Error Handling**:
- Invalid JSON → Toast error "Invalid JSON format"
- Missing prompt → Uses empty string, shows warning

#### B5. Templates & Collections
**Templates**: Predefined category-based prompt templates  
**Collections**: User-created image collections  

**Storage**:
- Collections: `localStorage` key: `'nanoBanana_collections'`
- Templates: Hardcoded in codebase

**Template Categories**:
- Landscape, Portrait, Abstract, Architecture, Fantasy, etc.

**Collection Actions**:
- Create new collection
- Add images to collection (from generated gallery)
- Remove images from collection
- Delete collection
- View collection images

### C. Image Management

#### C1. Image Editing (Inline)
**Trigger**: Click on generated image → opens edit modal  
**Features**:
- Edit prompt → regenerate with same reference/style
- Add inline reference images (drag/drop or upload)
- Remove inline references
- Version history (undo/redo edits)

**Version History**:
```typescript
versions: [{ url, prompt, timestamp}],
currentVersionIndex: number
```

**Actions**:
- Undo: Go to previous version
- Redo: Go to next version
- Each edit creates new version

#### C2. Quick Actions Menu
**Trigger**: Right-click on generated image  
**Options**:
1. **Použít jako referenci**: Adds image to reference images panel
2. **Remixovat**: Opens PromptRemixModal for variations
3. **Srovnat**: Opens comparison modal (if multiple images)
4. **Stáhnout**: Downloads image
5. **Smazat**: Deletes from view (not from Supabase)

#### C3. Gallery Management
**Tabs**:
1. **Vygenerované**: All generated images (from Supabase)
2. **Referenční**: Reference images uploaded
3. **Stylové**: Style images uploaded

**Multi-Select**:
- Checkbox appears on hover
- Select multiple images
- Toolbar shows: "Stáhnout (X)" button
- Downloads as ZIP with metadata.json

**Delete**:
- Individual: Click X icon
- Batch: Not yet implemented

**Load from Gallery**:
- Click image → loads as reference/style depending on tab
- Drag to reference/style panel (future feature)

### D. API/Provider Management

#### D1. Provider Selection
**Options**: Gemini (Nano Banana Pro) | ChatGPT | Grok  
**Behavior**:
- Switches active AI provider
- Checks for API key → shows modal if missing
- Each provider has separate API key storage

#### D2. API Key Management
**Storage**: Environment variables / Settings  
**Modal Behavior**:
- Input field for API key
- Save → stores in provider settings
- Test connection (future feature)
- Shows current usage (if ApiUsageTracker active)

**Validation**:
- Non-empty key required
- No format validation (provider-specific)

#### D3. API Usage Tracking
**Storage**: `localStorage` key: `'nanoBanana_apiUsage'`  
**Tracked Metrics**:
- Total requests
- Successful/failed requests
- Tokens used (if available)
- Cost tracking (future)

**Display**: ApiUsagePanel component (in settings/header)

## Input Validations & Constraints

### Prompt
- **Min**: 0 characters (empty allowed but generates generic)
- **Max**: No hard limit (AI provider may truncate)
- **Trim**: Yes, leading/trailing whitespace removed
- **Sanitization**: None (raw input sent to AI)

### Image Uploads
**Accepted Formats**: `image/png`, `image/jpeg`, `image/webp`, `image/heic`, `image/heif`  
**Max Size**: No client-side limit (Supabase may enforce)  
**Max Count**:
- Reference images: No hard limit (UI shows first N)
- Style images: No hard limit

**File Reading**:
- Reads as Data URL for display
- Sends as base64 to AI provider
- Auto-compression for large images (via canvas, quality=0.8)

### Resolution
**Options**: 1K (~1024px) | 2K (~2048px) | 4K (~4096px)  
**Default**: 2K  
**Behavior**: Sent as string to AI provider

### Aspect Ratio
**Options**: Original, 1:1, 2:3, 3:2, 3:4, 4:3, 5:4, 4:5, 9:16, 16:9, 21:9  
**Default**: Original  
**Behavior**: Calculated dimensions sent to provider

### Number of Images
**Range**: 1-5  
**Default**: 1  
**Constraint**: Max 14 total visible in results panel (FIFO removal)

## Error Messages & Handling

### API Errors
**No API Key**:
- Message: "No API key found for {provider}. Please add one in settings."
- Action: Opens ApiKeyModal

**Rate Limit**:
- Message: "Rate limit exceeded. Please try again in a few moments."
- Status: Sets image.status='error', error=message

**Network Error**:
- Message: "Failed to generate image: {error.message}"
- Retry: User can regenerate manually

**Invalid Response**:
- Message: "Invalid response from AI provider"
- Fallback: Shows error state in image slot

### Upload Errors
**Invalid File Type**:
- Message: "Unsupported file type. Please upload PNG, JPEG, or WebP."
- Toast: Red, 3000ms duration

**File Read Error**:
- Message: "Failed to read file: {error.message}"
- Toast: Red

### Supabase Errors
**Save Failed**:
- Message: "Failed to save to gallery: {error.message}"
- Behavior: Image still shows in local view, not in gallery tab

**Load Failed**:
- Message: "Failed to load gallery images"
- Behavior: Empty gallery panel

## Loading States

### Generation Loading
**Component**: LoadingProgress per image  
**Display**:
- Animated spinner
- Text: "Generování..." / "Načítání..." / "Zpracování..."
- Progress percentage (if batch)

### Modal Loading
- API key validation: Spinner on save button
- Gallery load: Skeleton loaders in grid

### Empty States
**No Generated Images**: "Zatím žádné vygenerované obrázky. Zadejte prompt a klikněte na Generovat."  
**No Gallery Images**: "Žádné obrázky v galerii"  
**No Reference Images**: Shows upload button only

## Authentication & Session

### PIN Auth
**Storage**:
- `localStorage.userId`: Supabase user ID
- `localStorage.pin`: User's PIN (plain text - security risk in prod)

**Flow**:
1. Check localStorage for existing userId
2. If exists: auto-login
3. If not: show PIN input
4. On submit: `supabaseAuth(pin)` → creates/finds user
5. Store userId + pin
6. Load app

**Session**: Persists until localStorage cleared

### Supabase
**Client**: Initialized with env vars
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Tables**:
- `prompts`: (unused in current version)
- `images`: Generated images
- `reference_images`: Uploaded references
- `style_images`: Uploaded style images

## Storage Architecture

### localStorage Keys
| Key | Format | Purpose |
|-----|--------|---------|
| `nanoBanana_savedPrompts` | JSON array | Saved prompt templates |
| `nanoBanana_collections` | JSON object | User image collections |
| `nanoBanana_apiUsage` | JSON object | API usage metrics |
| `nanoBanana_autoBackup` | JSON object | Auto-backup of prompts |
| `userId` | string | Supabase user ID |
| `pin` | string | User PIN (plain text) |

### Supabase Storage
**Bucket**: `generated-images` (public)  
**Path Pattern**: `{userId}/{imageId}.png`  
**Metadata**: Stored in database tables

## KNOWN LIMITATIONS / BUGS

1. **Security**: PIN stored in plain text in localStorage
2. **API Keys**: Stored in clear text (should use secure storage)
3. **No Auth Token Refresh**: Supabase session may expire
4. **No Rate Limiting UI**: User not warned before hitting limits
5. **Image Compression**: Hardcoded quality=0.8, no user control
6. **Max Images**: FIFO removal at 14 may surprise users
7. **No Undo for Deletes**: Deleted images can't be recovered
8. **Gallery Pagination**: Loads ALL images (performance issue at scale)
9. **No Image Size Validation**: Large uploads may fail silently
10. **Prompt History**: Not persisted, lost on page reload
11. **Template Categories**: Hardcoded, can't add custom categories
12. **Multi-Provider**: Can't use multiple providers simultaneously
13. **Batch Progress**: Shows overall progress, not per-image detail
14. **JSON Context**: Minimal validation, can crash on malformed JSON

**PRESERVE THESE IN REDESIGN** unless explicitly addressed.
