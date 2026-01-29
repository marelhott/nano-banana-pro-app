# Executable Test Plan

## Test Suite 1: Authentication

### TC-AUTH-001: First-Time PIN Creation
**Preconditions**: localStorage cleared (no userId)  
**Steps**:
1. Open app
2. Enter PIN: "1234"
3. Click submit

**Expected**:
- Supabase creates new user with pin="1234"
- localStorage.userId set
- localStorage.pin set to "1234"
- Main app loads
- No errors displayed

**Notes**: Check Supabase `users` table for new record

---

### TC-AUTH-002: Returning User Auto-Login
**Preconditions**: userId and pin exist in localStorage  
**Steps**:
1. Open app

**Expected**:
- PIN screen skipped
- App loads directly to main interface
- userId read from localStorage
- Gallery loads user's images

---

### TC-AUTH-003: Invalid PIN Format
**Preconditions**: No userId in localStorage  
**Steps**:
1. Open app
2. Enter PIN: "abc" (non-numeric)
3. Click submit

**Expected**:
- Error toast: "PIN must be 4 digits"
- OR: Allow but create user with that PIN (check implementation)

**Notes**: Verify actual validation behavior

---

## Test Suite 2: Image Generation

### TC-GEN-001: Basic Single Image Generation
**Preconditions**: Authenticated, Gemini API key set  
**Steps**:
1. Enter prompt: "a red apple"
2. Ensure numberOfImages = 1
3. Click "GENEROVAT OBRÁZEK"

**Expected**:
- Loading indicator appears
- After ~5-10s, image appears
- Image shows red apple (or similar)
- Image saved to Supabase `images` table
- Image visible in Gallery panel "Vygenerované" tab

---

### TC-GEN-002: Multiple Images (3)
**Preconditions**: Authenticated, API key set  
**Steps**:
1. Set numberOfImages to 3
2. Enter prompt: "mountain landscape"
3. Click generate

**Expected**:
- 3 loading placeholders appear
-3 images generate sequentially (~15-30s total)
- All 3 show mountain landscapes (variations)
- All saved to Supabase
- Results panel shows 3 images

---

### TC-GEN-003: Generation with Reference Image
**Preconditions**: Authenticated, API key set  
**Steps**:
1. Upload reference image (portrait photo)
2. Enter prompt: "make this person smile"
3. Click generate

**Expected**:
- Reference image sent to AI
- Generated image modifies original
- Smile added/enhanced in result
- Reference image auto-saved to `reference_images` table

---

### TC-GEN-004: Generation with Style Image
**Preconditions**: Authenticated, API key set  
**Steps**:
1. Upload style image (watercolor painting)
2. Enter prompt: "cat sitting"
3. Click generate

**Expected**:
- Style applied to generation
- Result has watercolor aesthetic
- Style image saved to `style_images` table

---

### TC-GEN-005: 3 Variants Feature
**Preconditions**: Authenticated, Gemini key set  
**Steps**:
1. Enter prompt: "robot"
2. Click "3 VARIANTY"

**Expected**:
- System generates 3 interpretations:
  - Variant 1: PhotoRealistic
  - Variant 2: Artistic
  - Variant 3: Technical
- Each has different prompt via AI enhancement
- Each image has `variantInfo` metadata
- Total ~30-45s generation time

---

### TC-GEN-006: Empty Prompt Handling
**Preconditions**: Authenticated  
**Steps**:
1. Leave prompt empty
2. Click generate

**Expected**:
- Button disabled (canGenerate = false)
- OR: Generates generic/abstract image
- No error thrown

**Notes**: Verify actual behavior

---

### TC-GEN-007: API Rate Limit Error
**Preconditions**: API quota exhausted  
**Steps**:
1. Generate image (should hit rate limit)

**Expected**:
- Error message: "Rate limit exceeded"
- Image status = 'error'
- Error displayed in image slot
- User can retry later

---

### TC-GEN-008: Max 14 Images FIFO
**Preconditions**: Authenticated  
**Steps**:
1. Generate 15 images sequentially

**Expected**:
- First image removed from display
- Only last 14 visible in results panel
- Older images still in Supabase gallery

---

### TC-GEN-009: Resolution Selection
**Preconditions**: Authenticated  
**Steps**:
1. Set resolution to "4K"
2. Generate image

**Expected**:
- Image generated at ~4096px
- Larger file size than 1K/2K
- Resolution metadata saved

---

### TC-GEN-010: Aspect Ratio Selection
**Preconditions**: Authenticated  
**Steps**:
1. Set aspect ratio to "16:9"
2. Generate image

**Expected**:
- Image dimensions match 16:9 ratio
- Width > height (landscape)
- Aspect ratio saved in metadata

---

## Test Suite 3: Prompt Management

### TC-PROMPT-001: Enhance Prompt
**Preconditions**: Gemini API key set  
**Steps**:
1. Enter prompt: "cat"
2. Click enhance (wand icon)

**Expected**:
- Loading indicator on button
- API call to Gemini
- Prompt replaced with enhanced version (50+ words)
- Enhanced prompt added to history

---

### TC-PROMPT-002: Undo Prompt
**Preconditions**: Prompt history has 2+ items  
**Steps**:
1. Enter "prompt 1"
2. Change to "prompt 2"
3. Click Undo

**Expected**:
- Prompt reverts to "prompt 1"
- Undo button disabled if at start
- Redo button enabled

---

### TC-PROMPT-003: Redo Prompt
**Preconditions**: Just performed undo  
**Steps**:
1. Click Redo

**Expected**:
- Prompt moves forward in history
- Redo disabled if at end
- Undo enabled

---

### TC-PROMPT-004: Save Prompt
**Preconditions**: Non-empty prompt  
**Steps**:
1. Enter prompt: "beautiful sunset"
2. Click "Uložené prompty" dropdown
3. Click "Uložit aktuální"
4. Enter name: "My Sunset"
5. Save

**Expected**:
- Prompt saved to localStorage
- Appears in saved prompts list
- Timestamp recorded
- UUID generated

---

### TC-PROMPT-005: Load Saved Prompt
**Preconditions**: Saved prompts exist  
**Steps**:
1. Click "Uložené prompty"
2. Select "Futuristic City"

**Expected**:
- Prompt textarea fills with saved text
- Dropdown closes
- Prompt ready for generation

---

### TC-PROMPT-006: Delete Saved Prompt
**Preconditions**: Saved prompts exist  
**Steps**:
1. Open saved prompts
2. Click delete icon on "Old Prompt"

**Expected**:
- Prompt removed from list
- localStorage updated
- No confirmation dialog (per spec)

---

### TC-PROMPT-007: JSON Context Upload
**Preconditions**: Have config.json file:
```json
{
  "prompt": "test prompt",
  "numberOfImages": 3,
  "resolution": "4K"
}
```
**Steps**:
1. Click JSON icon
2. Select config.json
3. Upload

**Expected**:
- Prompt set to "test prompt"
- numberOfImages set to 3
- resolution set to "4K"
- Success toast appears

---

### TC-PROMPT-008: Invalid JSON Upload
**Preconditions**: Have invalid.json (malformed)  
**Steps**:
1. Upload invalid.json

**Expected**:
- Error toast: "Invalid JSON format"
- State unchanged

---

### TC-PROMPT-009: Template Selection
**Preconditions**: Authenticated  
**Steps**:
1. Click "Šablony"
2. Select "Landscape" category
3. Click "Mountain Vista" template

**Expected**:
- Modal closes
- Prompt fills with template text
- Ready for generation

---

### TC-PROMPT-010: Prompt History Lost on Refresh
**Preconditions**: Prompt history has items  
**Steps**:
1. Change prompt 3 times
2. Undo once
3. Refresh page (F5)
4. Try to undo

**Expected**:
- History cleared
- Undo button disabled
- This is expected behavior (not persisted)

---

## Test Suite 4: Image Editing

### TC-EDIT-001: Edit Generated Image
**Preconditions**: 1+ generated image exists  
**Steps**:
1. Click on generated image
2. Edit modal opens
3. Change prompt to "add sunset"
4. Click regenerate

**Expected**:
- New version generates
- Added to `versions[]` array
- `currentVersionIndex` updated
- Old version preserved

---

### TC-EDIT-002: Undo Image Edit
**Preconditions**: Image has 2+ versions  
**Steps**:
1. Click undo on edited image

**Expected**:
- Reverts to previous version
- `currentVersionIndex` decremented
- URL changes to old image
- Prompt shows old text

---

### TC-EDIT-003: Redo Image Edit
**Preconditions**: Just performed image undo  
**Steps**:
1. Click redo on image

**Expected**:
- Moves to next version
- Index incremented
- Shows newer edit

---

### TC-EDIT-004: Multiple Edit Chain
**Preconditions**: Generated image  
**Steps**:
1. Edit prompt 5 times (5 regenerations)
2. Undo 3 times
3. Redo 2 times

**Expected**:
- 5 versions in array
- Correct version displayed at each step
- Undo/redo buttons enable/disable correctly

---

### TC-EDIT-005: Add Inline Reference
**Preconditions**: Image in edit mode  
**Steps**:
1. Drag image into inline reference zone
2. Regenerate

**Expected**:
- Inline reference attached to that image only
- Not added to global references
- Used in that specific regeneration

---

## Test Suite 5: Gallery Management

### TC-GALLERY-001: Load Gallery on App Open
**Preconditions**: User has 10 images in Supabase  
**Steps**:
1. Open app

**Expected**:
- Gallery panel shows 10 images
- Loaded from `images` table
- Most recent first (descending timestamp)

---

### TC-GALLERY-002: Multi-Select Images
**Preconditions**: Gallery has 5+ images  
**Steps**:
1. Open gallery panel
2. Hover over image → checkbox appears
3. Check 3 images

**Expected**:
- Checkbox selects image
- `selected: true` on those images
- Toolbar shows "Stáhnout (3)"

---

### TC-GALLERY-003: Bulk Download ZIP
**Preconditions**: 3 images selected  
**Steps**:
1. Click "Stáhnout (3)"

**Expected**:
- ZIP file downloads
- Contains: image1.png, image2.png, image3.png, metadata.json
- metadata.json has prompts, timestamps
- Browser triggers download

---

### TC-GALLERY-004: Delete from Gallery
**Preconditions**: Image in gallery  
**Steps**:
1. Hover over image
2. Click X icon
3. (Confirm if dialog appears)

**Expected**:
- Image removed from view
- Deleted from Supabase `images` table
- No undo available (permanent)

---

### TC-GALLERY-005: Switch Gallery Tabs
**Preconditions**: Images in all 3 categories  
**Steps**:
1. Open gallery
2. Click "Vygenerované" tab
3. Click "Referenční" tab
4. Click "Stylové" tab

**Expected**:
- Each tab shows correct images
- Vygenerované: generated results
- Referenční: uploaded references
- Stylové: uploaded style images

---

### TC-GALLERY-006: Load Reference from Gallery
**Preconditions**: Reference image in gallery  
**Steps**:
1. Go to "Referenční" tab
2. Click image

**Expected**:
- Image loads into reference panel (sidebar)
- Ready for use in next generation

---

## Test Suite 6: Collections

### TC-COLL-001: Create Collection
**Preconditions**: Authenticated  
**Steps**:
1. Click "Kolekce"
2. Click "Vytvořit kolekci"
3. Enter name: "Landscapes"
4. Save

**Expected**:
- Collection created
- Saved to localStorage `'nanoBanana_collections'`
- UUID assigned
- Appears in collections list

---

### TC-COLL-002: Add Image to Collection
**Preconditions**: Collection exists, generated image exists  
**Steps**:
1. Right-click image
2. Select "Přidat do kolekce"
3. Choose "Landscapes"

**Expected**:
- Image ID added to collection.imageIds[]
- localStorage updated
- Image has `collectionIds: ['landscape-id']`

---

### TC-COLL-003: View Collection
**Preconditions**: Collection with 3 images  
**Steps**:
1. Open collections
2. Click "Landscapes"

**Expected**:
- Shows 3 images in that collection
- Grid display
- Can view/download individual images

---

### TC-COLL-004: Remove Image from Collection
**Preconditions**: Image in collection  
**Steps**:
1. Open collection
2. Click remove icon on image

**Expected**:
- Image ID removed from collection.imageIds
- Image still exists in gallery
- localStorage updated

---

### TC-COLL-005: Delete Collection
**Preconditions**: Collection exists  
**Steps**:
1. Open collections
2. Click delete on "Old Collection"
3. (Confirm if dialog)

**Expected**:
- Collection deleted from localStorage
- Images NOT deleted (still in gallery)
- collectionIds updated on images

---

## Test Suite 7: Quick Actions

### TC-QA-001: Use as Reference
**Preconditions**: Generated image exists  
**Steps**:
1. Right-click image
2. Select "Použít jako referenci"

**Expected**:
- Image added to sidebar reference panel
- Available for next generation
- Appears in reference images list

---

### TC-QA-002: Remix Prompt
**Preconditions**: Generated image exists  
**Steps**:
1. Right-click image
2. Select "Remixovat"

**Expected**:
- PromptRemixModal opens
- Shows original prompt
- Generates AI variations
- User can select variation

---

### TC-QA-003: Compare Images
**Preconditions**: 2+ generated images  
**Steps**:
1. Right-click first image
2. Select "Srovnat"

**Expected**:
- ImageComparisonModal opens
- Shows side-by-side comparison
- Slider to switch between images
- Metadata displayed (prompts, etc.)

---

### TC-QA-004: Download Single Image
**Preconditions**: Generated image exists  
**Steps**:
1. Right-click image
2. Select "Stáhnout"

**Expected**:
- Browser downloads PNG file
- Filename: image-{id}.png or similar
- Image data intact

---

### TC-QA-005: Delete Image
**Preconditions**: Generated image in results  
**Steps**:
1. Right-click image
2. Select "Smazat"

**Expected**:
- Image removed from results panel
- NOT deleted from Supabase (local only)
- No confirmation dialog

---

## Test Suite 8: Provider Management

### TC-PROV-001: Switch Provider
**Preconditions**: Gemini selected, ChatGPT key set  
**Steps**:
1. Click provider dropdown
2. Select "ChatGPT"

**Expected**:
- selectedProvider = 'chatgpt'
- Next generation uses ChatGPT API
- UI updates to show ChatGPT

---

### TC-PROV-002: Missing API Key
**Preconditions**: No API key for Grok  
**Steps**:
1. Switch to Grok
2. Try to generate

**Expected**:
- Error: "No API key for Grok"
- ApiKeyModal opens
- User prompted to enter key

---

### TC-PROV-003: Save API Key
**Preconditions**: ApiKeyModal open  
**Steps**:
1. Enter key: "test-key-123"
2. Click Save

**Expected**:
- Key saved to settings
- Modal closes
- Generation now works with that key

---

### TC-PROV-004: API Usage Stats
**Preconditions**: Made 10 requests to Gemini  
**Steps**:
1. Open settings/usage panel

**Expected**:
- Shows totalRequests: 10
- successfulRequests: count
- failedRequests: count
- Per-provider breakdown

---

## Test Suite 9: Error Handling

### TC-ERR-001: Network Offline
**Preconditions**: Disconnect internet  
**Steps**:
1. Generate image

**Expected**:
- Error: "Network error" or "Failed to fetch"
- Image status = 'error'
- User can retry when online

---

### TC-ERR-002: Invalid Image File Upload
**Preconditions**: Have .txt file  
**Steps**:
1. Try to upload .txt as reference

**Expected**:
- Error toast: "Unsupported file type"
- File not added to references
- No crash

---

### TC-ERR-003: Large File Upload
**Preconditions**: Have 50MB image  
**Steps**:
1. Upload image

**Expected**:
- Auto-compresses via canvas
- OR: Error if too large
- No silent failure

---

### TC-ERR-004: Supabase Connection Failure
**Preconditions**: Invalid Supabase URL  
**Steps**:
1. Load app
2. Try to save image

**Expected**:
- Error logged
- Image shows locally
- Not in gallery
- Toast: "Failed to save to gallery"

---

### TC-ERR-005: Malformed API Response
**Preconditions**: Mock bad API response  
**Steps**:
1. Generate image (API returns invalid JSON)

**Expected**:
- Error caught
- Image status = 'error'
- Error message: "Invalid response"

---

## Test Suite 10: Session Persistence

### TC-SESS-001: Refresh Preserves Auth
**Preconditions**: Authenticated  
**Steps**:
1. Refresh page (F5)

**Expected**:
- userId loaded from localStorage
- Auto-login succeeds
- No PIN screen

---

### TC-SESS-002: Refresh Loses Prompt History
**Preconditions**: Prompt history has items  
**Steps**:
1. Make 3 prompt changes
2. Refresh

**Expected**:
- History cleared
- Undo/redo disabled
- This is expected behavior

---

### TC-SESS-003: Saved Prompts Persist
**Preconditions**: Saved 3 prompts  
**Steps**:
1. Close browser
2. Reopen app

**Expected**:
- All 3 prompts still in dropdown
- Loaded from localStorage

---

### TC-SESS-004: Collections Persist
**Preconditions**: Created 2 collections  
**Steps**:
1. Close browser
2. Reopen

**Expected**:
- Collections still exist
- Images still associated
- Loaded from localStorage

---

### TC-SESS-005: Results Panel Cleared
**Preconditions**: 5 images in results  
**Steps**:
1. Refresh page

**Expected**:
- Results panel empty
- Must regenerate or load from gallery
- Session-only, not persisted

---

## Test Suite 11: Edge Cases

### TC-EDGE-001: Paste Image from Clipboard
**Preconditions**: Image in clipboard  
**Steps**:
1. Copy image (Cmd+C)
2. Focus app
3. Paste (Cmd+V)

**Expected**:
- Image appears in reference panel
- handlePaste event fires
- Image ready for use

---

### TC-EDGE-002: Generate with No References
**Preconditions**: No reference/style images  
**Steps**:
1. Enter prompt: "tree"
2. Generate

**Expected**:
- Image generates normally
- No reference needed (text-only)

---

### TC-EDGE-003: Many Saved Prompts (50+)
**Preconditions**: 50 saved prompts  
**Steps**:
1. Open dropdown

**Expected**:
- All 50 display (or scroll)
- No performance issues
- All loadable

---

### TC-EDGE-004: Special Characters in Prompt
**Preconditions**: Authenticated  
**Steps**:
1. Enter prompt: "cat & dog, 100% realistic!"
2. Generate

**Expected**:
- Prompt sent as-is
- No sanitization
- AI interprets special chars

---

### TC-EDGE-005: Concurrent Generations
**Preconditions**: Authenticated  
**Steps**:
1. Set numberOfImages to 5
2. Click generate
3. Immediately click generate again

**Expected**:
- First batch continues
- Second click ignored (button disabled while generating)
- isGenerating prevents duplicate requests

---

**END OF TEST CASES**

Total test cases: 75+  
Coverage: All major features and edge cases  
Execution: Manual (no automation framework)

**Test Completion Criteria**:
- All PASS → Redesign matches baseline behavior
- Any FAIL → Regression, must fix before release
