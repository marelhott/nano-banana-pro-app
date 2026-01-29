# State & Data Model Documentation

## Global State Architecture

### State Management: React useState (No Redux/Zustand)
All state is managed via React `useState` hooks in the root `App` component. State is passed down via props to children.

### Core State Container: App Component

The main `App` component holds all application state:

```typescript
// App.tsx state declarations
const [state, setState] = useState<AppState>({
  sourceImages: [],
  styleImages: [],
  generatedImages: [],
  prompt: '',
  aspectRatio: 'Original',
  resolution: '2K',
  error: null,
  numberOfImages: 1
})

// Additional state atoms
const [apiKey, setApiKey] = useState<string>('')
const [selectedProvider, setSelectedProvider] = useState<'gemini'|'chatgpt'|'grok'>('gemini')
const [isGenerating, setIsGenerating] = useState<boolean>(false)
const [toast, setToast] = useState<{message: string, type: 'success'|'error'}|null>(null)
const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(true)
const [isGalleryVisible, setIsGalleryVisible] = useState<boolean>(false)
const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([])
const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([])
const [collections, setCollections] = useState<Collection[]>([])
const [userId, setUserId] = useState<string>('')
const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
```

---

## State Atoms & Their Evolution

### 1. `state.sourceImages: SourceImage[]`
**Purpose**: Reference images to be modified/used in generation

**Structure**:
```typescript
interface SourceImage {
  id: string           // UUID
  url: string          // Data URL or Supabase URL
  file: File           // Original File object
  prompt?: string      // Optional prompt from gallery
}
```

**Lifecycle**:
- **Created**: User uploads file or pastes from clipboard
- **Updated**: Never (immutable)
- **Deleted**: User clicks X icon → filtered out
- **Persisted**: Uploaded to Supabase `reference_images` table during generation

### 2. `state.styleImages: SourceImage[]`
**Purpose**: Style reference images (affect generation aesthetics)

**Structure**: Identical to SourceImage  
**Lifecycle**: Same as sourceImages  
**Persistence**: Supabase `style_images` table

### 3. `state.generatedImages: GeneratedImage[]`
**Purpose**: Results of image generation operations

**Structure**:
```typescript
interface GeneratedImage {
  id: string
  url?: string
  prompt: string
  timestamp: number
  status: 'loading' | 'success' | 'error' | 'idle'
  error?: string
  groundingMetadata?: any
  resolution?: string
  aspectRatio?: string
  styleCode?: number
  versions?: ImageVersion[]
  currentVersionIndex?: number
  isEditing?: boolean
  isVideo?: boolean
  duration?: number
  variantInfo?: {
    isVariant: boolean
    variantNumber: number
    variant: string
    approach: string
    originalPrompt: string
  }
  selected?: boolean
  collectionIds?: string[]
}
```

**State Transitions**:
```
idle → loading (on generate)
loading → success (on API success)
loading → error (on API failure)
success → loading (on regenerate/edit)
```

**Lifecycle**:
1. **Created**: User clicks generate → placeholder with status='loading'
2. **Updated**: API response → status='success', url set
3. **Edited**: User edits → new version added to `versions[]`
4. **Deleted**: User clicks delete → removed from array
5. **Persisted**: Auto-saved to Supabase `images` table on success

### 4. `state.prompt: string`
**Purpose**: Current text prompt for generation

**Lifecycle**:
- **Set**: User types, loads saved prompt, selects template, enhances
- **Cleared**: User clears textarea (rare)
- **History**: Tracked separately in PromptHistory (not in state)

**Constraints**: No max length, trimmed before send

### 5. `state.numberOfImages: number`
**Range**: 1-5  
**Default**: 1  
**Purpose**: How

 many images to generate simultaneously

### 6. `state.aspectRatio: string`
**Options**: 'Original', '1:1', '2:3', '3:2', '3:4', '4:3', '5:4', '4:5', '9:16', '16:9', '21:9'  
**Default**: 'Original'  
**Purpose**: Controls generated image dimensions

### 7. `state.resolution: string`
**Options**: '1K', '2K', '4K'  
**Default**: '2K'  
**Purpose**: Target resolution for generation

### 8. `state.error: string | null`
**Purpose**: Global error messages (upload errors, etc.)  
**Display**: Toast notification  
**Cleared**: After toast timeout (3000ms)

---

## Derived/Computed Values

### Image Grid Max Count
```typescript
const MAX_IMAGES = 14
const visibleImages = state.generatedImages.slice(-MAX_IMAGES)
```
**Rule**: Only last 14 images shown, older images removed via FIFO

### Can Generate
```typescript
const canGenerate = !isGenerating && state.prompt.trim().length > 0 && apiKey
```
**Dependencies**: 
- Not already generating
- Non-empty prompt
- Valid API key for selected provider

### Active Image Count
```typescript
const selectedCount = state.generatedImages.filter(img => img.selected).length
```
**Used**: Batch download UI

---

## External State (Utilities)

### PromptHistory (in-memory)
**File**: `utils/promptHistory.ts`  
**Storage**: Class instance, not persisted

**Interface**:
```typescript
class PromptHistory {
  private history: string[] = []
  private currentIndex: number = -1
  private maxSize: number = 50

  add(prompt: string): void
  undo(): string | null
  redo(): string | null
  canUndo(): boolean
  canRedo(): boolean
}
```

**Lifecycle**: Created on app load, destroyed on refresh

### SavedPrompts (localStorage)
**File**: `utils/savedPrompts.ts`  
**Key**: `'nanoBanana_savedPrompts'`

**Interface**:
```typescript
interface SavedPrompt {
  id: string
  name: string
  prompt: string
  category?: string
  timestamp: number
}

function loadSavedPrompts(): SavedPrompt[]
function saveSavedPrompts(prompts: SavedPrompt[]): void
function addSavedPrompt(prompt: SavedPrompt): void
function deleteSavedPrompt(id: string): void
```

**Default Prompts** (if empty):
```typescript
const DEFAULT_PROMPTS = [
  { id: '1', name: 'Serene Landscape', prompt: 'A serene landscape...' },
  { id: '2', name: 'Futuristic City', prompt: 'A futuristic cityscape...' },
  // ... 5 more
]
```

### Collections (localStorage)
**File**: `utils/collectionsDB.ts`  
**Key**: `'nanoBanana_collections'`

**Interface**:
```typescript
interface Collection {
  id: string
  name: string
  description?: string
  imageIds: string[] // IDs of images in collection
  createdAt: number
  updatedAt: number
}

function loadCollections(): Collection[]
function saveCollection(collection: Collection): void
function deleteCollection(id: string): void
function addImageToCollection(collectionId: string, imageId: string): void
function removeImageFromCollection(collectionId: string, imageId: string): void
```

### API Usage Tracking (localStorage)
**File**: `utils/apiUsageTracking.ts`  
**Key**: `'nanoBanana_apiUsage'`

**Interface**:
```typescript
interface UsageData {
  [provider: string]: {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    totalTokens: number
    lastUpdated: number
  }
}

class ApiUsageTracker {
  static track(data: { provider: string, success: boolean, tokens?: number }): void
  static getUsage(provider: string): UsageData[provider]
  static reset(provider: string): void
}
```

### Auto Backup (localStorage)
**File**: `utils/dataBackup.ts`  
**Key**: `'nanoBanana_autoBackup'`

**Purpose**: Secondary backup of savedPrompts  
**Frequency**: Every time savedPrompts changes  
**Restore**: Manual or on corrupted main data

---

## Supabase State (Persistent)

### Gallery Images (Database)
**Table**: `images`  
**Query**:
```typescript
const { data } = await supabase
  .from('images')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
```

**State Sync**:
- **On App Load**: Queries all user images → `setGalleryImages(data)`
- **On Generate**: Inserts new image → appends to galleryImages
- **On Delete**: Deletes from DB → filters from galleryImages

### Reference Images (Database)
**Table**: `reference_images`  
**Sync**: Uploaded during generation, loaded in gallery panel

### Style Images (Database)
**Table**: `style_images`  
**Sync**: Same as reference images

---

## State Update Patterns

### Immutable Updates
All state updates use spread operators to maintain immutability:

```typescript
// Add image
setState(prev => ({
  ...prev,
  generatedImages: [...prev.generatedImages, newImage]
}))

// Update image status
setState(prev => ({
  ...prev,
  generatedImages: prev.generatedImages.map(img =>
    img.id === imageId ? { ...img, status: 'success', url: newUrl } : img
  )
}))

// Remove image
setState(prev => ({
  ...prev,
  generatedImages: prev.generatedImages.filter(img => img.id !== imageId)
}))
```

### Batch Updates
Multiple state changes in single setState call:

```typescript
setState(prev => ({
  ...prev,
  prompt: newPrompt,
  numberOfImages: 3,
  aspectRatio: '16:9'
}))
```

### Async State Updates
State updated after async operations:

```typescript
const result = await generateImage(prompt)
setState(prev => ({
  ...prev,
  generatedImages: prev.generatedImages.map(img =>
    img.id === result.id ? { ...img, url: result.url, status: 'success' } : img
  )
}))
```

---

## State Persistence Summary

| State | Storage | Lifecycle |
|-------|---------|-----------|
| `prompt` | None | Session only |
| `sourceImages` | Supabase (on generate) | Session + DB |
| `styleImages` | Supabase (on generate) | Session + DB |
| `generatedImages` | Supabase (auto-save) | Session + DB |
| `savedPrompts` | localStorage | Persistent |
| `collections` | localStorage | Persistent |
| `apiUsage` | localStorage | Persistent |
| `promptHistory` | None | Session only |
| `userId` | localStorage | Persistent |
| `pin` | localStorage | Persistent |
| `apiKey` | Settings/Provider | Persistent (unclear) |
| `selectedProvider` | None | Session only |

---

## State Initialization

**On App Mount**:
1. Check localStorage for `userId`
2. If found: auto-authenticate, load user data
3. Load savedPrompts from localStorage
4. Load collections from localStorage
5. Load API usage stats from localStorage
6. Query Supabase for gallery images
7. Initialize PromptHistory (empty)
8. Set default provider to 'gemini'

**On Refresh**:
- All session-only state lost
- Persistent state restored from localStorage/Supabase
