# User Flows

## Flow 1: First-Time User - Generate Image

**Given**: User opens app for first time  
**When**: User wants to generate an image

**Steps**:
1. App loads PIN auth screen
2. User enters 4-digit PIN (e.g., "1234")
3. System creates Supabase user, stores userId + pin in localStorage
4. Main app loads
5. System prompts for API key (Gemini selected by default)
6. User clicks settings icon → opens SettingsModal
7. User enters Gemini API key, clicks Save
8. User types prompt: "a serene mountain landscape"
9. User clicks "GENEROVAT OBRÁZEK"
10. Loading indicator appears
11. Image generates and displays in results panel
12. Image auto-saves to Supabase gallery

**Expected Result**: Image successfully generated and visible

**Branches**:
- Invalid PIN format → Error toast
- API key invalid → Generation fails with error message
- Network error → Retry or error state

---

## Flow 2: Returning User - Load and Use Saved Prompt

**Given**: User has previously authenticated and saved prompts  
**When**:  User returns to app

**Steps**:
1. App loads, finds userId in localStorage
2. Auto-logs in (skips PIN screen)
3. Main app loads with previous state
4. User clicks "Uložené prompty" dropdown
5. Dropdown shows list of saved prompts
6. User clicks "Futuristic cityscape"
7. Prompt textarea fills with saved text
8. User adjusts resolution to 4K
9. User clicks "GENEROVAT OBRÁZEK"
10. Image generates at 4K resolution

**Expected Result**: Saved prompt loaded and used successfully

**Branches**:
- localStorage cleared → Shows PIN screen
- No saved prompts → Dropdown shows defaults only

---

## Flow 3: Generate 3 Variants

**Given**: User is authenticated with valid API key  
**When**: User wants to explore prompt interpretations

**Steps**:
1. User types simple prompt: "robot"
2. User clicks "3 VARIANTY" button
3. System generates 3 AI interpretations:
   - Variant 1: PhotoRealistic robot
   - Variant 2: Artistic/stylized robot
   - Variant 3: Technical diagram robot
4. Each uses Gemini to enhance sub-prompt
5. 3 images generate sequentially
6. Each image tagged with variantInfo

**Expected Result**: 3 different interpretations of "robot" displayed

**Branches**:
- Empty prompt → Uses generic/fallback
- API rate limit → Shows staggered generation

---

## Flow 4: Upload Reference Image and Generate

**Given**: User wants to modify an existing image  
**When**: User uploads reference

**Steps**:
1. User clicks "+" in "Referenční Obrázky" section
2. File picker opens
3. User selects local image (portrait.jpg)
4. Image uploads, thumbnail appears in reference panel
5. User types prompt: "make this person smile"
6. User clicks "GENEROVAT OBRÁZEK"
7. System sends prompt + reference image to AI
8. Generated image shows modified portrait

**Expected Result**: Reference image successfully used in generation

**Branches**:
- Invalid file type → Error toast
- Multiple references → All sent to AI
- Large file → Auto-compresses before send

---

## Flow 5: Edit Generated Image (Inline Edit)

**Given**: User has generated images  
**When**: User wants to modify a result

**Steps**:
1. User clicks on generated image in results panel
2. ImageComparisonModal opens (or edit modal - check code)
3. User clicks "Edit" button
4. Prompt field becomes editable
5. User changes prompt to "add sunset lighting"
6. User clicks "Regenerate" or submit
7. New version generates with same reference/style
8. Image.versions array updated
9. New version displays, old version in history

**Expected Result**: Edited version created, undo/redo available

**Branches**:
- User clicks Undo → Reverts to previous version
- User clicks Redo → Goes forward in history
- Multiple edits → Version chain maintained

---

## Flow 6: Save Image to Collection

**Given**: User has generated images and wants to organize  
**When**: User creates/uses collection

**Steps**:
1. User clicks "Kolekce" button in toolbar
2. CollectionsModal opens
3. User clicks "Vytvořit kolekci"
4. User enters name: "Landscapes"
5. Collection created
6. User closes modal
7. User right-clicks generated image
8. Selects "Přidat do kolekce"
9. Selects "Landscapes" from list
10. Image.collectionIds updated

**Expected Result**: Image added to collection, visible in Collections view

**Branches**:
- No collections exist → Show create prompt
- Image already in collection → Skip or show message

---

## Flow 7: Batch Download from Gallery

**Given**: User has many images in gallery  
**When**: User wants to download multiple

**Steps**:
1. User opens Gallery panel (floating right panel)
2. User switches to "Vygenerované" tab
3. Hovers over images → Checkboxes appear
4. User selects 5 images
5. Toolbar appears: "Stáhnout (5)"
6. User clicks download button
7. System creates ZIP with:
   - image1.png, image2.png, ...
   - metadata.json (prompts, timestamps)
8. Browser downloads ZIP file

**Expected Result**: ZIP file contains selected images + metadata

**Branches**:
- No images selected → Button disabled
- Large selection → May take time, show progress

---

## Flow 8: Enhance Prompt with AI

**Given**: User has basic prompt  
**When**: User wants AI to improve it

**Steps**:
1. User types: "cat"
2. User clicks wand icon (enhance button)
3. System validates: prompt not empty, Gemini key exists
4. Button shows loading spinner
5. System calls Gemini enhance API
6. Enhanced prompt returned: "A majestic cat with piercing eyes, sitting regally on a velvet cushion, soft lighting..."
7. Textarea updates with enhanced text
8. Enhanced prompt added to history

**Expected Result**: Prompt significantly expanded/improved

**Branches**:
- No Gemini key → Error message
- Empty prompt → Button disabled
- AI returns error → Toast with error message

---

## Flow 9: Use Template

**Given**: User wants quick start with categories  
**When**: User selects template

**Steps**:
1. User clicks "Šablony" button
2. PromptTemplatesModal opens
3. User clicks "Landscape" category
4. List of landscape templates appears
5. User clicks "Mountain vista at sunrise"
6. Modal closes
7. Prompt textarea fills with template text
8. User optionally modifies
9. User generates

**Expected Result**: Template loaded, ready for generation

---

## Flow 10: Handle API Error

**Given**: User generating image  
**When**: API returns error

**Steps**:
1. User clicks generate
2. Loading starts
3. API call fails (network/rate limit/auth error)
4. System catches error
5. Image.status set to 'error'
6. Image.error set to error message
7. Error displayed in image slot
8. User sees: "Failed to generate: Rate limit exceeded"

**Expected Result**: Clear error message, user can retry

**Branches**:
- Retry button available → User can regenerate
- Persistent error → User checks API key/network

---

## Flow 11: Paste Image from Clipboard

**Given**: User has image in clipboard  
**When**: User wants quick upload

**Steps**:
1. User copies image (Cmd+C from another app)
2. User focuses prompt textarea or app window
3. User pastes (Cmd+V)
4. handlePaste event fires
5. System reads clipboard image data
6. Creates new SourceImage object
7. Adds to state.sourceImages (reference panel)
8. Thumbnail appears in reference section

**Expected Result**: Clipboard image loaded as reference

**Branches**:
- Clipboard has text → Ignored, no action
- Clipboard has multiple items → Uses first image

---

## Flow 12: Quick Action - Repopulate

**Given**: User wants to regenerate with same settings  
**When**: User right-clicks image

**Steps**:
1. User right-clicks generated image
2. QuickActions menu appears
3. User clicks "Použít jako základ" (or similar)
4. handleRepopulate(image) called
5. System loads:
   - image.prompt → prompt textarea
   - image.resolution → resolution selector
   - image.aspectRatio → aspect selector
   - (reference/style preserved if exist)
6. User can now regenerate with same params

**Expected Result**: All generation params restored from image

---

## Flow 13: Compare Images

**Given**: Multiple images generated  
**When**: User wants side-by-side comparison

**Steps**:
1. User right-clicks first image
2. Selects "Srovnat"
3. System finds all generated images
4. ImageComparisonModal opens
5. Shows slider between images
6. User drags slider to compare
7. Details shown: prompts, resolutions, etc.

**Expected Result**: Visual comparison of generated images

---

## Flow 14: JSON Context Import

**Given**: User has structured prompt data  
**When**: User imports JSON file

**Steps**:
1. User clicks JSON icon in toolbar
2. File picker opens (accept=".json")
3. User selects prompt_config.json
4. System reads file, parses JSON
5. Validates structure (must have "prompt" field)
6. Sets state from JSON:
   - prompt
   - numberOfImages (if present)
   - resolution (if present)
   - aspectRatio (if present)
7. Success toast appears

**Expected Result**: Config loaded from JSON

**Branches**:
- Invalid JSON → Error toast: "Invalid JSON format"
- Missing prompt → Warning, uses empty string
- Extra fields → Ignored

---

## Flow 15: Session Persistence

**Given**: User has been working  
**When**: User closes and reopens app

**Steps**:
1. User generates images, uses app
2. User closes browser tab
3. User reopens app URL
4. localStorage checked for userId
5. Auto-login (PIN remembered)
6. Gallery loads from Supabase
7. Prompt history LOST (in-memory only)
8. Saved prompts RESTORED (localStorage)
9. Collections RESTORED (localStorage)
10. Previous generated images NOT in results (lost)

**Expected Result**: User state partially restored

**What's Preserved**:
- Authentication (userId, PIN)
- Saved prompts
- Collections
- Gallery (from Supabase)
- API usage stats

**What's Lost**:
- Current results panel images
- Prompt history (undo/redo)
- Reference/style images in sidebar
