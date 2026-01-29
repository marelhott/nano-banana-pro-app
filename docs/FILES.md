# Code Map & Architecture

## Repository Structure

```
nano-banana-pro-app/
├── App.tsx                  # Main app component (2520 lines)
├── index.tsx                # React entry point
├── index.html               # HTML template
├── types.ts                 # TypeScript interfaces
├── vite.config.ts           # Build config
├── package.json             # Dependencies
├── components/              # UI components (21 files)
├── services/                # AI provider integrations (5 files)
├── utils/                   # Helper functions (15 files)
├── public/                  # Static assets
├── dist/                    # Build output
└── docs/                    # This documentation
```

---

## Entry Points

### 1. index.html
- Loads React app
- Includes favicon, meta tags
- Mounts to `<div id="root">`

### 2. index.tsx
```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

### 3. App.tsx
**The Monolith**: All business logic, state, and UI composition  
**Lines**: 2520  
**Key Functions**: 45+

---

## Component Hierarchy

### Top-Level Components (rendered in App.tsx)

```
App
├── PinAuth (if not authenticated)
└── Main Application (if authenticated)
    ├── Header
    ├── Sidebar
    │   ├── ProviderSelector
    │   ├── ApiKeyModal (conditional)
    │   ├── SavedPromptsDropdown
    │   ├── PromptTemplatesModal (conditional)
    │   ├── CollectionsModal (conditional)
    │   ├── JsonPromptEditor (conditional)
    │   ├── ImageUpload (reference)
    │   ├── ImageUpload (style)
    │   └── Buttons (Generate, 3 Variants)
    ├── Main Panel
    │   ├── Generated Images Grid
    │   ├── LoadingProgress (per image)
    │   ├── QuickActionsMenu (on right-click)
    │   ├── ImageComparisonModal (conditional)
    │   └── PromptRemixModal (conditional)
    ├── ImageGalleryPanel (floating, conditional)
    │   ├── Tabs (Vygenerované, Referenční, Stylové)
    │   └── Image grid with multi-select
    ├── SettingsModal (conditional)
    ├── StyleSeedHelpModal (conditional)
    └── Toast (conditional)
```

---

## Components Directory

### Authentication
**PinAuth.tsx** (6KB)
- Purpose: PIN-based user authentication
- Props: `onAuth: (userId: string) => void`
- State: PIN input, loading, error
- Supabase: Creates/finds user by PIN

### Header
**Header.tsx** (2KB)
- Purpose: App title bar with settings icon
- Features: Settings modal trigger, API usage panel link

### Modals
**ApiKeyModal.tsx** (2KB)
- Purpose: API key input/validation
- Props: `isOpen, onClose, onSave, provider`
- Features: Save API key to provider settings

**CollectionsModal.tsx** (14KB)
- Purpose: Manage image collections
- Features: Create, delete, view collections
- Data: localStorage `'nanoBanana_collections'`

**GalleryModal.tsx** (19KB)
- Purpose: Full-screen gallery view (legacy/alternate to panel)
- Features: Image grid, download, delete
- Data: Supabase images

**ImageComparisonModal.tsx** (14KB)
- Purpose: Side-by-side image comparison
- Props: `images: GeneratedImage[], onClose`
- Features: Slider to compare, show metadata

**JsonPromptEditor.tsx** (21KB)
- Purpose: Visual JSON config editor
- Features: Form-based JSON creation, validation
- Output: Sets state.prompt + config from JSON

**PromptRemixModal.tsx** (10KB)
- Purpose: AI-powered prompt variations
- Features: Generate prompt alternatives with AI
- API: Uses Gemini to create variations

**PromptTemplatesModal.tsx** (10KB)
- Purpose: Browse/select pre-made templates
- Data: Hardcoded templates in code
- Categories: Landscape, Portrait, Abstract, etc.

**SettingsModal.tsx** (12KB)
- Purpose: App settings and provider config
- Features: API keys, preferences
- Storage: Provider-specific settings

**StyleSeedHelpModal.tsx** (3KB)
- Purpose: Help text for style seed feature
- Display: Informational only

### UI Components
**ImageUpload.tsx** (4KB)
- Purpose: Drag-drop or click to upload images
- Props: `onUpload: (files: File[]) => void, label, accept`
- Features: File validation, preview thumbnails

**ImageLibrary.tsx** (7KB)
- Purpose: Display uploaded reference/style images
- Props: `images: SourceImage[], onRemove`
- Features: Grid display, delete button per image

**ImageGalleryPanel.tsx** (25KB)
- Purpose: Floating gallery panel with tabs
- Features: Multi-select, bulk download, tab switching
- Data: Supabase images + local references

**LoadingProgress.tsx** (4KB)
- Purpose: Loading indicator with optional progress
- Props: `message?: string, progress?: number`
- Display: Spinner + text

**LoadingSpinner.tsx** (1KB)
- Purpose: Simple CSS spinner component

**Toast.tsx** (3KB)
- Purpose: Notification toast (success/error)
- Props: `message: string, type: 'success'|'error', onClose`
- Auto-dismiss: 3000ms

**QuickActionsMenu.tsx** (3KB)
- Purpose: Context menu on right-click
- Props: `actions: QuickAction[], position: {x,y}, onClose`
- Features: Configurable action list

**ProviderSelector.tsx** (7KB)
- Purpose: Dropdown to select AI provider
- Options: Gemini, ChatGPT, Grok
- State: Updates selectedProvider

**SavedPromptsDropdown.tsx** (13KB)
- Purpose: Manage and load saved prompts
- Features: Load, save, edit, delete prompts
- Data: localStorage `'nanoBanana_savedPrompts'`

**ApiUsagePanel.tsx** (5KB)
- Purpose: Display API usage stats
- Data: localStorage `'nanoBanana_apiUsage'`
- Display: Per-provider metrics

---

## Services Directory

All services follow a similar pattern:
- Export class implementing `AIProvider` interface
- Methods: `generateText()`, `generateImage()`, etc.
- Error handling with try/catch
- Return standardized response format

### aiProvider.ts (4KB)
**Interface Definition**:
```typescript
export interface AIProvider {
  name: string
  generateText(prompt: string): Promise<string>
  generateImage(config: ImageConfig): Promise<ImageResult>
  analyzeImage?(imageUrl: string, prompt: string): Promise<string>
}
```

### geminiService.ts (15KB)
**Class**: `GeminiService implements AIProvider`  
**Model**: `gemini-stable-2-flash-exp`  
**Features**:
- Text generation
- Image generation with reference images
- Prompt enhancement
- Grounding metadata parsing

**Key Methods**:
- `generateImage()`: Main image generation
- `generateText()`: Text/prompt generation
- `enhancePrompt()`: AI-powered prompt improvement

### chatgptService.ts (6KB)
**Class**: `ChatGPTService implements AIProvider`  
**Models**: GPT-4 (text), DALL-E-3 (images)  
**Features**:
- Text generation with chat completions
- Image generation via DALL-E
- Vision analysis (base64 image input)

### grokService.ts (4KB)
**Class**: `GrokService implements AIProvider`  
**Model**: `grok-vision-beta`  
**Features**:
- Text generation
- Image generation
- Similar API to ChatGPT

### providerFactory.ts (3KB)
**Purpose**: Factory pattern for provider instantiation  
**Function**: `getProvider(name: string, apiKey: string): AIProvider`  
**Returns**: Instance of selected provider class

---

## Utils Directory

### Database/Storage Utils
**imageDatabase.ts** (8KB)
- Supabase CRUD for generated images
- Functions: `save()`, `getAll()`, `delete()`, `update()`

**galleryDB.ts** (6KB)
- Supabase CRUD for gallery images
- Functions: `loadImages()`, `saveImage()`, `deleteImage()`

**supabaseClient.ts** (3KB)
- Supabase client initialization
- Auth helper: `supabaseAuth(pin: string)`

**supabaseStorage.ts** (4KB)
- Blob upload/download helpers
- Functions: `uploadImage()`, `downloadImage()`, `deleteImage()`

**collectionsDB.ts** (4KB)
- localStorage CRUD for collections
- Functions: `loadCollections()`, `saveCollection()`, `deleteCollection()`

**savedPrompts.ts** (2KB)
- localStorage CRUD for saved prompts
- Default prompts initialization

**dataBackup.ts** (4KB)
- Auto-backup to localStorage
- Functions: `createBackup()`, `restoreBackup()`

**apiUsageTracking.ts** (3KB)
- API usage metrics tracking
- Functions: `track()`, `getUsage()`, `reset()`

### Prompt Processing Utils
**languageSupport.ts** (4KB)
- Language detection
- Prompt quality enhancement
- Suggestion generation

**promptInterpretation.ts** (10KB)
- Parse complex prompts
- Extract entities, modifiers, style hints
- Generate structured prompt data

**promptTemplates.ts** (4KB)
- Predefined template library
- Categories: Landscape, Portrait, etc.
- Template expansion logic

**promptHistory.ts** (2KB)
- In-memory undo/redo for prompts
- Max 50 items

**jsonPrompting.ts** (5KB)
- JSON-based prompt schema
- Validation and parsing
- Convert JSON to text prompt

### Image Processing Utils
**styleGenerator.ts** (8KB)
- Generate random style codes
- Style seed interpretation
- Aesthetic parameter generation

**stringUtils.ts** (500B)
- String manipulation helpers
- Truncate, sanitize

---

## Data Flow Architecture

### Image Generation Flow
```
User Input (App.tsx)
  ↓
handleGenerate()
  ↓
Validate inputs (prompt, API key)
  ↓
Create placeholder images (status='loading')
  ↓
setState(generatedImages)
  ↓
Loop: for each numberOfImages
  ↓
providerFactory.getProvider(selectedProvider)
  ↓
provider.generateImage({ prompt, references, style, resolution })
  ↓
[API Call via services/]
  ↓
Response → base64 or URL
  ↓
Convert to Data URL
  ↓
Update image (status='success', url=dataUrl)
  ↓
setState(generatedImages) [update]
  ↓
supabaseStorage.uploadImage(dataUrl)
  ↓
imageDatabase.save(metadata)
  ↓
Done
```

### Gallery Load Flow
```
App Mount
  ↓
useEffect(() => { loadGallery() })
  ↓
galleryDB.loadImages(userId)
  ↓
Supabase.from('images').select('*')
  ↓
setGalleryImages(data)
  ↓
ImageGalleryPanel renders
```

### State Update Flow
```
User Action (e.g., click button)
  ↓
Event Handler (e.g., handleGenerate)
  ↓
Business Logic
  ↓
setState(prevState => ({
  ...prevState,
  [key]: newValue
}))
  ↓
React Re-renders
  ↓
Components receive new props
  ↓
UI Updates
```

---

## Non-Obvious Implementation Details

### 1. Sequential Image Generation
**Why**: Avoid API rate limits  
**How**: `for` loop with `await`, small delay between requests

```typescript
for (let i = 0; i < numberOfImages; i++) {
  await generateSingleImage()
  await new Promise(r => setTimeout(r, 100)) // 100ms delay
}
```

### 2. FIFO Image Removal
**Why**: Prevent memory bloat  
**How**: Only last 14 images kept in state

```typescript
if (generatedImages.length > MAX_IMAGES) {
  setState(prev => ({
    ...prev,
    generatedImages: prev.generatedImages.slice(-MAX_IMAGES)
  }))
}
```

### 3. Base64 Image Compression
**Why**: Reduce payload size  
**How**: Canvas API with quality=0.8

```typescript
const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')
// ... draw image ...
const compressed = canvas.toDataURL('image/jpeg', 0.8)
```

### 4. PIN as Primary Auth
**Why**: Simple user identification  
**Security Risk**: PIN stored in plain text  
**Production**: Should use proper auth (JWT, OAuth)

### 5. Auto-Save to Supabase
**When**: Every successful generation  
**Fire-and-forget**: Doesn't block UI  
**Error handling**: Silent failure (image shows locally, not in gallery)

### 6. Variant Generation Logic
**Uses AI recursively**: Gemini enhances user prompt 3 different ways  
**Each variant gets unique styleCode**: Ensures visual diversity  
**Metadata preserved**: variantInfo attached to each image

---

## Build Configuration

### vite.config.ts
```typescript
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000
  }
})
```

### Environment Variables
**Required**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY` (runtime, not build-time)

---

## Critical Files for Redesign

**DO NOT LOSE LOGIC FROM**:
1. `App.tsx` → handleGenerate, handleGenerate3Variants, handleEditImage
2. `services/geminiService.ts` → Image generation API calls
3. `utils/imageDatabase.ts` → Supabase persistence
4. `utils/promptHistory.ts` → Undo/redo mechanism
5. `components/ImageGalleryPanel.tsx` → Multi-select + ZIP download

**CAN SAFELY REPLACE**:
- All CSS/styling
- Component markup (JSX)
- Layout structure

**PRESERVE BEHAVIOR**:
- All state management patterns
- API call sequences
- Error handling
- Data persistence
