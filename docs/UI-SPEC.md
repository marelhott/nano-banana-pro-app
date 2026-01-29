# UI Structure & Visual Blueprint

**PURPOSE**: This document captures EVERY visible UI element, layout rule, spacing, alignment, and component nesting so that the UI can be rebuilt WITHOUT screenshots.

---

## SCREEN 1: PIN AUTHENTICATION

**When**: User not authenticated (no userId in localStorage)  
**Component**: `<PinAuth />`

### Layout
- **Container**: Full viewport height, centered  
- **Width**: Constrained card/modal, centered on screen  
- **Background**: Light/neutral

### Elements (Top to Bottom)
1. **Logo/Title Area**
   - App branding/name
   - Centered

2. **PIN Input**
   - 4-digit numeric input
   - Input type: text or password
   - Centered
   - Focus state visible

3. **Submit Button**
   - Text: Action text (e.g., "Přihlásit" or "Pokračovat")
   - Full width within card
   - Below PIN input

### Behavior
- On submit: creates/finds Supabase user
- Success → stores userId + pin in localStorage → loads main app
- Error → shows toast notification

---

## SCREEN 2: MAIN APPLICATION

**When**: User authenticated  
**Layout Type**: Two-column (desktop) / Single column stack (mobile)

### Global Container
```
<div className="flex h-screen overflow-hidden bg-white text-ink font-sans">
  └─ Sidebar (left, resizable, 280-400px, hidden on mobile)
  └─ Resize Handle (1px wide, col-resize cursor)
  └─ Main Content Area (flex-1, scrollable)
</div>
```

**Colors**:
- Background: White (`bg-white`)
- Text: Ink (dark green/black: `text-ink`)
- Accent: Monstera green (`monstera-*`)
- Selection: `monstera-200`

---

## ELEMENT TREE: LEFT SIDEBAR (Desktop)

**Container**:
- Width: Resizable 280px-400px (default: ~320px)
- Min-width: 280px
- Max-width: 400px
- Background: `bg-paper` (off-white texture)
- Border-right: 1px `monstera-200`
- Shadow: subtle `shadow-sm`
- Hidden on `< lg` breakpoint

### SIDEBAR STRUCTURE (Top to Bottom):

#### 1. HEADER COMPONENT
- Fixed at top
- Contains: App title + settings icon
- Settings icon: Click → opens SettingsModal
- Border-bottom: `monstera-200`

#### 2. SCROLLABLE CONTENT AREA
**Class**: `flex-1 overflow-y-auto custom-scrollbar p-4`

##### A. PROVIDER SELECTOR
**Component**: `<ProviderSelector />`  
**Position**: Top of scrollable area, mb-2

**Visual**:
- Dropdown or button group
- Shows: Gemini / ChatGPT / Grok
- Selected provider highlighted
- Icon per provider (optional)

##### B. PRIMARY ACTION BUTTONS

###### Button 1: "GENEROVAT"
**Position**: First button (pt-1)  
**Sizing**: Full width (`w-full`)  
**Padding**: `py-2 px-4`  
**Typography**:
- Font-weight: 900 (black)  
- Font-size: 12px  
- Uppercase: yes  
- Tracking: 0.2em (very wide letter-spacing)

**Colors** (Dynamic based on state):
- Default: Gradient `from-monstera-300 to-monstera-400`
- Hover: `from-ink to-monstera-900`, text white
- Clicked variant (isGenerateClicked): Gradient `from-blue-400 to-blue-500`
- Disabled: opacity-20, grayscale

**Border**: 2px `border-ink`  
**Shadow**: `shadow-[5px_5px_0_rgba(13,33,23,1)]` (brutalist offset shadow)  
**Active State**: Shadow removed, translate X+0.5px Y+0.5px (pressed effect)

**Text Logic**:
- If generating: "Generuji"
- If multiple source images: "Generovat (N)" where N = sourceImages.length
- Else: "Generovat"

###### Button 2: "✨ 3 VARIANTY"
**Position**: Below  "GENEROVAT" (pt-1)  
**Sizing**: Full width  
**Padding**: `py-2 px-4`  
**Typography**:
- Font-weight: 900  
- Font-size: 11px  
- Uppercase: yes  
- Tracking: 0.15em

**Colors**:
- Gradient: `from-purple-500 to-pink-600`
- Hover: `from-purple-600 to-pink-700`
- Text: White  
- Disabled: opacity-20, grayscale

**Border**: 2px `border-purple-600`  
**Shadow**: `shadow-[4px_4px_0_rgba(147,51,234,0.5)]` (purple offset)  
**Active**: Same pressed effect

**Content**:
- Icon: Sparkle SVG (w-4 h-4)
- Text: "✨ 3 Varianty" (or "Generuji varianty..." when generating)
- Flexbox: `items-center justify-center gap-2`

##### C. POČET OBRÁZKŮ (Image Count Selector)

**Section Wrapper**: `space-y-0.5`  
**Label**: 
- Text: "Počet obrázků"
- Size: 8px
- Color: `monstera-600`
- Font-weight: bold
- Uppercase: yes
- Tracking: widest
- Padding-x: 1

**Selector Visual**:
- Container: Flex row, gap-0.5
- Background: `monstera-50`
- Padding: 0.5 (tight padding around buttons)
- Border: 1px `monstera-200`
- Rounded: md

**Buttons (1-5)**:
- Layout: 5 equal-width buttons (`flex-1`)
- Height: 5 (h-5) - VERY COMPACT
- Rounded: yes
- Font-weight: bold
- Font-size: 9px

**Active Button**:
- Background: white
- Text: `text-ink`
- Shadow: sm
- Border: 1px `monstera-300`

**Inactive Buttons**:
- Text: `monstera-500`
- Hover: `text-ink`, `bg-white/50`

**Behavior**: Clicking sets `state.numberOfImages` to that value

##### D. ZADÁNÍ (PROMPT) SECTION

**Section Wrapper**: `space-y-1`

###### Header Row
**Layout**: Flex, justify-between, px-1

**Left Side**:
- Label: "Zadání (Prompt)"
- Size: 10px
- Font-weight: black (900)
- Color: `monstera-800`
- Uppercase: yes
- Tracking: widest

**Right Side** (Flex row, gap-2):
1. **Šablony Button** (Templates)
   - Padding: `px-2 py-1`
   - Size: 8px
   - Font-weight: black
   - Uppercase: yes
   - Tracking: widest
   - Background: `monstera-100`
   - Hover: `monstera-200`
   - Color: `monstera-700`
   - Icon: Document SVG (w-3 h-3)
   - Click → opens TemplatesModal

2. **Remix Button**
   - Same styling as Šablony
   - Icon: Arrows SVG (w-3 h-3)
   - Disabled if: `promptHistory.getAll().length === 0`
   - Click → opens RemixModal

3. **Saved Prompts Dropdown**
   - Component: `<SavedPromptsDropdown />`
   - Icon button style

4. **Hint Text**
   - Text: "↵ spustit"
   - Size: 8px
   - Font-weight: bold
   - Color: `monstera-400`
   - Uppercase: yes
   - Tracking: widest

###### Mode Switcher (Tabs)
**Layout**: Flex row, gap-1, mb-2

**Tab 1: "Jednoduchý Režim"**
- Flex-1 (equal width)
- Padding: `px-3 py-1.5`
- Size: 9px
- Font-weight: black
- Uppercase: yes
- Tracking: wider

**Active State** (`promptMode === 'simple'`):
- Background: `monstera-500`
- Text: white
- Shadow: sm

**Inactive State**:
- Background: `monstera-50`
- Text: `monstera-700`
- Hover: `monstera-100`

**Tab 2: "Interpretační Režim"**
- Same styling, toggle-exclusive with Tab 1

**Behavior**: Sets `promptMode` state to 'simple' or 'advanced'

###### Prompt Textarea
**Sizing**:
- Width: Full (`w-full`)
- Min-height: 140px
- Max-height: 300px
- Resize: none (fixed by user, overflow scrolls)

**Colors**:
- Background: white
- Border: 1px `monstera-200`
- Focus border: `monstera-400`
- Placeholder: `monstera-300`

**Typography**:
- Size: 13px
- Font-weight: medium
- Leading: relaxed

**Placeholder Text** (Dynamic):
- Simple mode: "Popište obrázek..."
- Advanced mode: "Popište obrázek přirozeně. Vyberte variantu níže pro určení stylu interpretace..."

**Other**:
- Rounded: md
- Padding: 3 (p-3)
- Shadow: inner
- Overflow-y: auto
- Custom scrollbar styling

**Keyboard**: On Enter → triggers handleKeyDown (may submit)

###### JSON Context Upload
**Layout**: Flex row, items-center, justify-between, mt-2 mb-2

**Left Side**:
1. **Hidden File Input**
   - ID: "json-upload"
   - Accept: ".json"
   - `className="hidden"`

2. **Label (styled as button)**
   - htmlFor: "json-upload"
   - Size: 10px
   - Font-weight: bold
   - Color: `monstera-600`
   - Background: `monstera-50`
   - Border: 1px `monstera-200`
   - Padding: `px-2 py-1.5`
   - Rounded: yes
   - Cursor: pointer
   - Hover: `bg-monstera-100`, `border-monstera-300`
   - Shadow: sm
   - Icon: Document SVG (w-3 h-3)
   - Text: "Připojit JSON Kontext" (or "Změnit JSON" if already attached)

**Right Side** (Conditional, if jsonContext exists):
- **Badge**:
  - Background: `blue-50`
  - Border: 1px `blue-100`
  - Padding: `px-2 py-1`
  - Rounded: yes
  - Flex: items-center, gap-1.5
  - Animate: fadeIn

- **Filename Display**:
  - Size: 9px
  - Color: `blue-700`
  - Font-weight: medium
  - Truncate: yes
  - Max-width: 150px

- **Remove Button** (X icon):
  - Color: `blue-400`
  - Hover: `blue-600`
  - Icon: X SVG (w-3 h-3)
  - Click → sets jsonContext to null

###### ADVANCED MODE CONTROLS (Conditional: `promptMode === 'advanced'`)

**Container**: `mt-2 space-y-2 animate-fadeIn`

**1. Variant Selector**
**Layout**: Grid, 3 columns, gap-1.5

**Variant Cards** (A, B, C):
Each variant button has IDENTICAL structure:
- **Button Container**:
  - Flex-col, items-center, p-2
  - Rounded-md
  - Border: 1px
  - Transition: all
  - Text-align: center
  - Group: yes (for tooltip)
  - Position: relative

- **Active State** (`advancedVariant === v.id`):
  - Background: `monstera-50`
  - Border: `monstera-500`
  - Ring: 1px `monstera-500`, opacity-50

- **Inactive State**:
  - Background: white
  - Border: `monstera-200`
  - Hover: border `monstera-300`, bg `monstera-50/50`

- **Top Text** (Label):
  - Size: 9px
  - Font-weight: black
  - Uppercase: yes
  - Tracking: wider
  - Margin-bottom: 0.5
  - Color: `monstera-800` (active) or `monstera-600` (inactive)
  - Examples: "VARIANTA A", "VARIANTA B", "VARIANTA C"

- **Bottom Text** (Subtitle):
  - Size: 8px
  - Color: `monstera-500`
  - Font-weight: medium
  - Examples: "Autenticita", "Vylepšení", "Vyvážené"

- **Tooltip** (on hover):
  - Position: Absolute, bottom-full, left 1/2, transform -translate-x-1/2, mb-2
  - Visibility: invisible → visible on group-hover
  - Width: 48 (w-48)
  - Padding: 2 (p-2)
  - Background: `ink/90` (semi-transparent dark)
  - Backdrop-blur: sm
  - Text: white
  - Size: 9px
  - Rounded: md
  - Shadow: xl
  - Z-index: 50
  - Pointer-events: none
  - Text-align: left
  - Leading: relaxed
  - Content: Detailed description per variant
  - Arrow: Positioned at top-full, border-triangle pointing down

**Variant Descriptions**:
- **A - Autenticita**: "Maximální autenticita (Priorita reality). Přirozené, nedokonalé, věrohodné."
- **B - Vylepšení**: "Maximální vylepšení (Idealizované). Vybroušené, filmové, prémiové."
- **C - Vyvážené**: "Vyvážený realismus (Přirozené + Estetické). Neutrální výchozí."

**2. Face Identity Toggle**
**Layout**: Label (acts as entire toggle container), flex items-center gap-3, p-2, rounded-md, border, cursor-pointer

**Active State** (`faceIdentityMode === true`):
- Background: `amber-50`
- Border: `amber-300`

**Inactive State**:
- Background: white
- Border: `monstera-200`
- Hover: border `monstera-300`

**Toggle Switch** (native checkbox styled):
- Hidden checkbox input (`sr-only peer`)
- Custom div styled as switch:
  - Width: 8 (w-8)
  - Height: 4 (h-4)
  - Rounded: full
  - Background: `amber-500` (on) or `monstera-200` (off)
  - Inner circle (::after):
    - Position: absolute
    - Top: 2px, left: 2px
    - Background: white
    - Border: `gray-300`
    - Rounded: full
    - Height: 3 (h-3)
    - Width: 3 (w-3)
    - Transition: all
    - Translate-x: full when checked

**Text Content**:
- **Primary Label**:
  - Size: 9px
  - Font-weight: black
  - Uppercase: yes
  - Tracking: wider
  - Color: `amber-800` (on) or `monstera-600` (off)
  - Text: "Zachování Identity Tváře"

- **Secondary Label**:
  - Size: 8px
  - Color: `monstera-500`
  - Text: "Upřednostnit věrnost tváře před estetikou"

###### Prompt Action Buttons
**Layout**: Flex row, items-center, gap-1.5

**1. "✨ Vylepšit prompt" (Enhance)**
- Flex-1 (takes available space)
- Padding: `px-2 py-1.5`
- Size: 9px
- Font-weight: black
- Uppercase: yes
- Tracking: widest
- Background: Gradient `from-blue-400 to-blue-500`
- Hover: `from-blue-500 to-blue-600`
- Text: white
- Rounded: yes
- Transition: all
- Disabled: opacity-50, grayscale
- Disable when: `!state.prompt.trim() || isEnhancingPrompt`
- Content: "Vylepšuji..." (loading) or "✨ Vylepšit prompt"
- Display: Flex, items-center, justify-center

**2. Undo Button "↶"**
- Padding: `px-2 py-1.5`
- Size: 9px
- Font-weight: black
- Uppercase: yes
- Background: `monstera-100`
- Hover: `monstera-200`
- Text: `monstera-700`
- Rounded: yes
- Transition: all
- Disabled: opacity-30
- Disable when: `!promptHistory.canUndo()`
- Content: "↶" (arrow symbol)

**3. Redo Button "↷"**
- Identical styling to Undo
- Content: "↷" (arrow symbol)
- Disable when: `!promptHistory.canRedo()`

##### E. REFERENČNÍ OBRÁZKY (Reference Images Section)

**Section Wrapper**: `space-y-1.5 mt-4`

###### Header
**Layout**: Flex, justify-between, px-1

**Left**: Label "Referenční obrázky"
- Size: 10px
- Font-weight: black
- Color: `monstera-800`
- Uppercase: yes
- Tracking: widest

**Right** (Conditional, if `isGenerating`):
- Text: "● Generuji..."
- Size: 8px
- Font-weight: black
- Color: `monstera-500`
- Uppercase: yes
- Tracking: widest
- Animation: pulse

###### Image Grid
**Container**:
- Layout: Grid, 4 columns (`grid-cols-4`)
- Gap: 1 (gap-1)
- Padding: 1 (p-1)
- Rounded: md
- Transition: all
- Border: 2px (dynamic based on drag state)

**Drag States**:
- Default: `border-transparent`
- Drag Over: `bg-monstera-100`, `border-dashed border-monstera-400`, `ring-2 ring-monstera-200`

**Image Tile** (for each sourceImage):
- **Container**:
  - Position: relative
  - Group: yes
  - Aspect-ratio: square (1:1)
  - Rounded: md
  - Overflow: hidden
  - Border: 1px `monstera-200`
  - Background: `monstera-50`
  - Shadow: sm
  - Transition: all
  - Hover: border `monstera-300`

- **Image Element**:
  - Width: full
  - Height: full
  - Object-fit: cover
  - Transition: all, duration-500
  - If generating: blur-sm, scale-105
  - Else: blur-0, scale-100

- **Overlay (when generating)**:
  - Position: absolute, inset-0
  - Background: `white/20`
  - Pointer-events: none

- **Delete Button Overlay**:
  - Position: absolute, inset-0
  - Background: `ink/60` (dark semi-transparent)
  - Transition: all
  - Flex: items-center, justify-center
  - Opacity: 0
  - Group-hover: opacity-100 (unless generating)
  - If generating: `opacity-0 pointer-events-none`

- **Delete Button**:
  - Background: white
  - Text: `ink`
  - Padding: 1 (p-1)
  - Rounded: md
  - Shadow: xl
  - Icon: X SVG (w-3 h-3, stroke-width 3)
  - Click → removes from `state.sourceImages`

**Upload Button** (Conditional: `sourceImages.length < MAX_IMAGES`):
- Component: `<ImageUpload compact={true} />`
- Takes one grid cell
- Shows "+" icon and label

**Empty State Drag Indicator** (Conditional: `dragOverTarget === 'reference' && sourceImages.length === 0`):
- **Container**:
  - Col-span: 4 (full width)
  - Flex-col, items-center, justify-center
  - Padding-y: 6 (py-6)
  - Text-align: center

- **Icon**: SVG arrows (w-10 h-10), color `monstera-400`, mb-2
- **Text**: "Přetáhněte sem obrázek"
  - Size: xs (12px)
  - Font-weight: bold
  - Color: `monstera-600`

##### F. DIVIDER (Between Reference and Style)

**Layout**: Relative flex, items-center, py-4

**Structure**:
- Left border line: flex-grow, border-t, `monstera-200`
- Center text: "Stylová reference"
  - Flex-shrink, mx-3
  - Size: 8px
  - Font-weight: bold
  - Color: `monstera-400`
  - Uppercase: yes
  - Tracking: widest
- Right border line: flex-grow, border-t, `monstera-200`

##### G. STYLOVÉ OBRÁZKY (Style Images Section)

**Section Wrapper**: `space-y-1.5`

###### Header
**Layout**: Flex, justify-between, px-1

**Left Side** (Flex, items-center, gap-2):
1. Label: "Stylové obrázky" (same styling as Referenční label)
2. **Info Icon with Tooltip**:
   - Group: relative
   - Icon: Info circle SVG (w-3 h-3), color `monstera-400`, cursor help
   - Tooltip (on hover):
     - Visibility: invisible → group-hover:visible
     - Position: absolute, left-0, top-5
     - Z-index: 50
     - Width: 56 (w-56)
     - Padding: 2 (p-2)
     - Background: `ink` (solid dark)
     - Text: white
     - Size: 9px
     - Rounded: md
     - Shadow: xl
     - Content: "Tyto obrázky definují vizuální styl pro generování. AI použije jejich estetiku a umělecký přístup."

###### Image Grid
**IDENTICAL STRUCTURE TO REFERENCE IMAGES**:
- Grid: 4 columns
- Same tile styling
- Same drag/drop states
- Same delete overlay
- Uses `state.styleImages` instead of `sourceImages`
- Drag target: 'style' instead of 'reference'
- Empty state text: "Přetáhněte sem obrázek"

##### H. API USAGE PANEL
- Component: `<ApiUsagePanel compact={true} />`
- Displays usage statistics
- Compact mode for sidebar

##### I. COLLECTIONS BUTTON

**Sizing**: Full width (`w-full`)  
**Layout**: Flex, items-center, justify-center, gap-2  
**Padding**: `px-4 py-3`  
**Background**: Gradient `from-monstera-100 to-monstera-200`  
**Hover**: `from-monstera-200 to-monstera-300`  
**Text**: `ink`, font-black, size 10px, uppercase, tracking widest  
**Rounded**: md  
**Border**: 1px `monstera-300`  
**Transition**: all

**Content**:
- Icon: Collection box SVG (w-4 h-4)
- Text: "Kolekce"

**Click**: Opens CollectionsModal

---

## ELEMENT TREE: MAIN CONTENT AREA (Right Side)

**Container**: `flex-1 h-full overflow-y-auto custom-scrollbar bg-white relative flex flex-col min-w-0`

### MOBILE HEADER (Conditional: `< lg` breakpoint)
- Shows Header component
- Sticky toolbar with prompt preview + buttons

### DESKTOP CONTENT STRUCTURE

#### 1. HEADER BAR (hidden on mobile)
**Layout**: Flex, flex-col md:flex-row, md:items-end, justify-between, gap-4, px-1

**Left Side**:
- Flex, items-center, gap-2
- Decorator: `w-1.5 h-4 bg-ink rounded-full`
- Title: "GALERIE"
  - Size: 11px
  - Font-weight: 900
  - Uppercase: yes
  - Tracking: 0.3em
  - Color: `ink`

**Right Side** (Conditional: `state.generatedImages.length > 0`):
- **"Exportovat vše" Button**:
  - Flex, items-center, gap-2
  - Padding: `px-4 py-2`
  - Background: white
  - Text: `ink`, font-black, size 9px, uppercase, tracking widest
  - Rounded: md
  - Border: 1px `monstera-200`
  - Hover: border `ink`
  - Shadow: sm
  - Transition: all
  - Active: scale-95
  - Disabled when: `downloadingAll === true`
  - Icon: Download SVG (w-3 h-3) or Spinner (when downloading)
  - Text: "Balím..." (downloading) or "Exportovat vše"

#### 2. SELECTION TOOLBAR (Conditional: `selectedGeneratedImages.size > 0`)

**Container**:
- Background: `monstera-100`
- Padding: `px-4 py-3`
- Border-bottom: `monstera-300`

**Layout**: Flex, items-center, justify-between

**Left Side**:
- Text: "✓ Vybráno: {count}"
- Size: sm
- Font-weight: bold
- Color: `ink`

**Right Side** (Flex, gap-2):
1. **"Zrušit" Button**:
   - Padding: `px-3 py-1.5`
   - Size: xs
   - Font-weight: bold
   - Color: `monstera-600`
   - Hover: color `ink`
   - Transition: colors
   - Click → clears selection

2. **"Stáhnout (N)" Button**:
   - Padding: `px-4 py-2`
   - Background: `monstera-400`
   - Hover: `monstera-500`
   - Text: `ink`, font-black, size xs, uppercase, tracking widest
   - Rounded: md
   - Transition: all
   - Border: 1px `ink`
   - Shadow: sm
   - Text: "Stáhnout ({selectedGeneratedImages.size})"
   - Click → downloads selected as ZIP

#### 3. GENERATED IMAGES GRID

**Empty State** (Conditional: `state.generatedImages.length === 0`):
- **Container**:
  - Padding-y: 20 (mobile) or 40 (desktop)
  - Flex-col, items-center, justify-center
  - Space-y: 6

- **Icon Container**:
  - Width: 16, height: 16
  - Background: `monstera-50`
  - Rounded: md
  - Flex, items-center, justify-center
  - Grayscale: yes
  - Opacity: 20
  - Border: 1px `monstera-200`
  - Shadow: inner
  - Content: Emoji "🍌" (text-3xl)

- **Text**:
  - Text-align: center
  - Space-y: 2
  - "Zatím žádné vygenerované obrázky"
    - Size: lg
    - Font-weight: bold
    - Color: `ink`
    - Block display

**Grid (Conditional: `state.generatedImages.length > 0`)**:
- **Container**:
  - Display: Grid
  - Gap: 4 (mobile) or 6 (desktop)
  - Columns: Dynamic (`repeat(${gridCols}, minmax(0, 1fr))`)
    - gridCols calculated based on viewport width
    - Responsive: 1 col (mobile) → 2 cols → 3 cols → 4 cols (wide desktop)

**Image Card** (article element, for each generated image):

##### Card Container
- Group: yes
- Display: Flex-col
- Background: white
- Border: 1px `monstera-200`
- Rounded: md
- Overflow: hidden
- Shadow: sm
- Hover: shadow-lg
- Transition: all
- Animation: fadeIn
- On right-click: opens context menu (if `image.status === 'success'`)

##### Image Display Area
- **Container**:
  - Position: relative
  - Background: `monstera-50`
  - Cursor: zoom-in
  - If loading or error: `aspect-square`
  - Dynamic aspect ratio based on image.aspectRatio (if loading in single-column)
  - Click → opens image in modal (`setSelectedImage(image)`)

##### Checkbox (Conditional: `image.status === 'success'`)
- Position: absolute, top-2, left-2, z-10
- Native checkbox input
- Width: 5, height: 5
- Cursor: pointer
- Accent: `monstera-400`
- Checked: `selectedGeneratedImages.has(image.id)`
- Click (stopPropagation to prevent modal open)

##### Loading State (Conditional: `image.status === 'loading'`)
- Position: absolute, inset-0
- Flex, items-center, justify-center
- Background: `white/40`
- Content: `<LoadingSpinner />` component

##### Success State (Conditional: `image.url && status != loading`)
- **Image Element**:
  - Width: full
  - Height: auto
  - Blur: if `image.isEditing` → blur-sm scale-105, else blur-0 scale-100
  - Transition: all, duration-500
  - Decoding: sync
  - Image-rendering: `-webkit-optimize-contrast`

- **Editing Overlay** (Conditional: `image.isEditing`):
  - Position: absolute, inset-0
  - Flex, items-center, justify-center
  - Background: `white/20`
  - Pointer-events: none
  - Inner badge:
    - Background: `white/90`
    - Backdrop-blur: sm
    - Padding: `px-6 py-3`
    - Rounded: lg
    - Shadow: 2xl
    - Border: 2px `monstera-400`
    - Text: "● Upravuji..."
      - Size: 11px
      - Font-weight: black
      - Color: `monstera-700`
      - Uppercase: yes
      - Tracking: widest
      - Animation: pulse

##### Error State (Conditional: `image.status === 'error'`)
- **Container**:
  - Position: absolute, inset-0
  - Flex-col, items-center, justify-center
  - Padding: 6 (p-6)
  - Text-align: center

- **Icon**:
  - Width: 10, height: 10
  - Background: `red-500`
  - Text: white
  - Rounded: md
  - Flex, items-center, justify-center
  - Margin-bottom: 4
  - Shadow: lg
  - Content: X SVG (w-5 h-5, stroke-width 3)

- **Title**: "CHYBA"
  - Color: `red-700`
  - Font-weight: 900
  - Uppercase: yes
  - Size: 9px
  - Margin-bottom: 2
  - Tracking: 0.2em

- **Error Message**:
  - Size: 8px
  - Font-weight: bold
  - Color: `red-500`
  - Leading: relaxed
  - Max-width: 150px
  - Text: `image.error`

##### Card Footer (Metadata + Actions)
**Container**:
- Padding: `px-3 py-2.5`
- Flex-col, gap-2
- Border-top: 1px `monstera-200`
- Background: white

###### Top Row (Prompt + Quick Actions)
**Layout**: Flex, items-center, gap-3

**Left - Prompt Text**:
- Flex-1
- Size: 11px
- Font-weight: bold
- Color: `ink`
- Leading: snug
- Line-clamp: 1 (truncates with ellipsis)
- Title attribute: full prompt (for tooltip)
- Text: `image.prompt`

**Right - Action Buttons** (Flex, gap-1, shrink-0):

1. **Copy Prompt Button**:
   - Padding: 2 (p-2)
   - Color: `monstera-400`
   - Hover: `text-ink`, `bg-monstera-100`
   - Rounded: md
   - Transition: all
   - Border: transparent
   - Hover border: `monstera-200`
   - Icon: Copy SVG (w-4 h-4, stroke-width 2.5)
   - Click → `navigator.clipboard.writeText(image.prompt)`
   - Stop propagation

2. **Repopulate/Use Settings Button**:
   - Same styling as Copy
   - Icon: Clipboard list SVG (w-4 h-4, stroke-width 2.5)
   - Title: "Použít nastavení"
   - Click → `handleRepopulate(image)` (loads prompt, resolution, aspect ratio from this image)

3. **Download Button** (Conditional: `image.url` exists):
   - Same styling as Copy
   - Element: `<a>` tag with download attribute
   - href: `image.url`
   - download: `{image.id}{slugified-prompt}.jpg`
   - Icon: Download SVG (w-4 h-4, stroke-width 2.5)
   - Title: "Stáhnout"

4. **Delete Button**:
   - Padding: 2 (p-2)
   - Color: `red-400`
   - Hover: `text-red-600`, `bg-red-50`
   - Rounded: md
   - Transition: all
   - Border: transparent
   - Hover border: `red-200`
   - Icon: Trash SVG (w-4 h-4, stroke-width 2.5)
   - Title: "Smazat obrázek"
   - Click → `handleDeleteImage(image.id)`

###### Grounding Metadata Links (Conditional: `image.groundingMetadata?.groundingChunks` exists)
**Container**:
- Flex-wrap, gap-1.5, mt-1

**Each Link** (for each chunk with web.uri):
- Element: `<a>` tag
- href: `chunk.web.uri`
- target: "_blank"
- rel: "noopener noreferrer"
- Size: 8px
- Font-weight: black
- Uppercase: yes
- Tracking: widest
- Padding: `px-2 py-0.5`
- Background: `monstera-50`
- Text: `monstera-600`
- Hover: `bg-monstera-200`, `text-ink`
- Rounded: yes
- Border: 1px `monstera-200`
- Transition: all
- Truncate: yes
- Max-width: full
- Title: `chunk.web.title || chunk.web.uri`
- Text content: Domain extracted from URI

###### Inline Edit Section (Conditional: `image.status === 'success' && image.url`)
**Container**:
- Margin-top: 3, padding-top: 3
- Border-top: 1px `monstera-100`
- Space-y: 2.5

**Subsection: "Upravit prompt"**
- Space-y: 2
- Flex, items-start, gap-2
- Flex-1, space-y-1.5

**Header Row** (Flex, items-center, justify-between, px-1):

**Left - Label**:
- Size: 9px
- Font-weight: black
- Color: `monstera-700`
- Uppercase: yes
- Tracking: wider
- Flex, items-center, gap-1.5
- Icon: Edit SVG (w-3 h-3)
- Text: "Upravit prompt"

**Right - Add Images Toggle Button**:
- Flex, items-center, gap-1
- Padding: `px-2 py-1`
- Size: 8px
- Font-weight: bold
- Uppercase: yes
- Tracking: wider
- Rounded: yes
- Transition: all
- Active state (if `showReferenceUpload[image.id]`):
  - Background: `monstera-400`
  - Text: `ink`
  - Border: 1px `ink`
- Inactive state:
  - Background: `monstera-100`
  - Text: `monstera-600`
  - Hover: `monstera-200`
  - Border: 1px `monstera-200`
- Icon: Image SVG (w-3 h-3)
- Text: "Obrázky" (active) or "+ Obrázky" (inactive)
- Title: "Přidat referenční obrázky"
- Click → toggles `showReferenceUpload` for this image

**Edit Textarea**:
- Value: `editPrompts[image.id] || ''`
- Similar styling to main prompt textarea
- Min-height: 80px
- On change: updates `editPrompts[image.id]`

**Regenerate Button** (below textarea):
- Full width or flex-1
- Similar styling to main "GENEROVAT" button
- Text: "Regenerovat obrázek"
- Click → regenerates image with new prompt + inline references

**Inline Reference Images Grid** (Conditional: `showReferenceUpload[image.id]`):
- Grid, columns auto-fit
- Similar structure to main reference grid
- Stores in `inlineEditStates[image.id].referenceImages`

---

## MODALS & OVERLAYS

### MODAL 1: SETTINGS MODAL
**Component**: `<SettingsModal />`  
**Trigger**: Click settings icon in header

**Layout**:
- Centered overlay modal
- Background backdrop: semi-transparent dark
- Modal container: white, rounded, shadow-2xl
- Max-width: constrained (e.g., 600px)
- Padding: adequate internal spacing

**Header**:
- Title: Settings or equivalent
- Close button (X icon, top-right)

**Content Sections** (vertical stack):
1. **Provider Settings** (per provider: Gemini, ChatGPT, Grok)
   - API key input fields
   - Save buttons
   - Test connection (if implemented)

2. **Preferences** (if any):
   - Application settings
   - Defaults

**Footer**:
- Action buttons (Save, Cancel)

### MODAL 2: COLLECTIONS MODAL
**Component**: `<CollectionsModal />`  
**Trigger**: Click "Kolekce" button in sidebar

**Layout**:
- Full-screen or large centered modal
- Header with title + close button

**Content** (two-column or list):

**Left Side - Collections List**:
- List of user collections
- Each collection item shows:
  - Collection name
  - Thumbnail or image count
  - Click → shows collection images in right panel

**Actions**:
- "Vytvořit kolekci" button (prominent)
- Delete icon per collection

**Right Side - Collection Images**:
- Grid of images in selected collection
- Each image tile:
  - Thumbnail
  - Remove from collection button (X icon overlay)
- Empty state if no collection selected or collection empty

**Footer**:
- Close or action buttons

### MODAL 3: PROMPT TEMPLATES MODAL
**Component**: `<PromptTemplatesModal />`  
**Trigger**: Click "Šablony" button in prompt section

**Layout**:
- Large centered modal
- Backdrop: dark semi-transparent

**Header**:
- Title: "ŠABLONY PROMPTŮ"
- Close button (X icon)

**Content** (two-panel):

**Left Panel - Categories**:
- Vertical list of categories:
  - OBECNÉ
  - PORTRÉTY
  - KRAJINY
  - PRODUKTY
  - INTERIÉRY
  - UMĚNÍ
- Active category highlighted
- Click category → shows templates in right panel

**Right Panel - Templates Grid**:
- Card grid of templates
- Each template card shows:
  - Template name/title
  - Preview text snippet (truncated)
  - Placeholder variables (if any, e.g., `{subject}`)
  - Click → inserts template into prompt field

**Empty State** (right panel, no category selected):
- Icon or illustration
- Text: "Vyberte kategorii vlevo" or similar

**Footer**:
- Close button

### MODAL 4: SAVED PROMPTS MODAL (or Dropdown component)
**Component**: `<SavedPromptsDropdown />` (may be dropdown, not full modal)  
**Trigger**: Click saved prompts icon in prompt header

**Layout (if dropdown)**:
- Dropdown panel from icon
- Max-height with scroll
- Border, shadow

**Content**:
- **Header**:
  - "ULOŽENÉ PROMPTY" title
  - Close button or dismiss on click-outside

- **Prompt Cards** (vertical list):
  - Each card shows:
    - **Title/Name** (user-given name)
    - **Category Badge** (if assigned, e.g., "Krajiny", "Portréty")
      - Small pill/badge
      - Color-coded per category
    - **Preview Snippet** (first ~50-100 chars of prompt, truncated with ellipsis)
    - **Actions**:
      - Load button or click entire card → loads prompt into textarea
      - Delete icon (X) → removes from saved prompts
      - Edit icon (pencil) → inline edit or opens edit dialog

- **Footer**:
  - "ULOŽIT AKTUÁLNÍ PROMPT" button (prominent)
    - Click → opens save dialog
    - Dialog shows:
      - Name input (auto-suggested from first words of prompt)
      - Category dropdown (optional)
      - Save / Cancel buttons

**Empty State** (no saved prompts):
- Icon or illustration
- Text: "Žádné uložené prompty. Uložte si svůj první prompt pomocí tlačítka níže."
- "ULOŽIT AKTUÁLNÍ PROMPT" button visible

### MODAL 5: REMIX PROMPTS MODAL
**Component**: `<PromptRemixModal />`  
**Trigger**: Click "Remix" button in prompt header

**Layout**:
- Large centered modal
- Backdrop: dark semi-transparent

**Header**:
- Title: "REMIX PROMPTŮ"
- Close button

**Content** (two-column):

**Left Column - Source Prompts**:
- Title: "Historie promptů" or "Zdrojové prompty"
- List of previous prompts from history
- Each prompt item:
  - Truncated text
  - Checkbox or selection indicator
  - Click → adds to "selected parts" in right column
  - Can select multiple parts

**Right Column - Selected Parts / Result**:
- Title: "Vybrané části" or "Výsledek"
- Shows parts user has selected from left
- **Reordering**:
  - Drag handles per item (if reorderable)
  - Up/down arrows
  - Order affects final combined prompt
- "Smazat" icon per part to remove from selection

**Empty State** (right column, nothing selected):
- Icon
  - Text: "Vyberte části z historie vlevo a zkombinujte je"

**Footer**:
- **"Použít remixovaný prompt" button**:
  - Click → combines selected parts
  - Inserts into main prompt textarea
  - Closes modal
- **Cancel button**

**Behavior**:
- User can pick fragments from prompt history
- Combine them in custom order
- Result placed in prompt field

### MODAL 6: IMAGE COMPARISON MODAL (or expanded view)
**Component**: `<ImageComparisonModal />`  
**Trigger**: Right-click image → "Srovnat" OR click image to expand

**Layout**:
- Full-screen modal or large overlay
- Backdrop: dark

**Header**:
- Title: Image comparison or image title
- Close button (X, top-right)

**Content**:
- **Image Display**:
  - Large image view
  - If comparison: side-by-side or slider
  - Slider handle to drag between two images
  - Smooth transition between images

- **Metadata Panel** (sidebar or below):
  - Prompt text
  - Resolution
  - Aspect ratio
  - Timestamp
  - Any other metadata (grounding sources, etc.)

**Navigation** (if multiple images):
- Previous / Next arrows
- Thumbnail strip at bottom

**Actions**:
- Download button
- Delete button
- Copy prompt button

**Footer**:
- Action buttons or close

### MODAL 7: API KEY MODAL
**Component**: `<ApiKeyModal />`  
**Trigger**: No API key detected, or from settings

**Layout**:
- Centered modal
- Backdrop: dark semi-transparent

**Header**:
- Title: "API Key Required" or "Zadejte API klíč"
- Subtitle: Instructions or provider name

**Content**:
- **Input Field**:
  - Label: "API Key"
  - Input type: text or password
  - Placeholder: "pk-..."
  - Validation feedback (if invalid format)

- **Helper Text**:
  - Link to get API key (if applicable)
  - Security note (e.g., "Klíč je uložen lokálně")

**Footer**:
- **Save / Submit button**:
  - Prominent
  - Disabled until valid key entered
  - Text: "Uložit" or "Pokračovat"
- **Cancel button** (if dismissible)

---

## RESPONSIVE BEHAVIOR

### Desktop (≥ lg breakpoint, ~1024px+)
- **Sidebar**: Visible on left, resizable 280-400px
- **Main content**: Flex-1, fills remaining space
- **Image grid**: 3-4 columns depending on width
- **Provider selector**: In sidebar, always visible

### Tablet (md breakpoint, ~768-1023px)
- **Sidebar**: Hidden (collapses)
- **Main content**: Full width
- **Mobile toolbar**: Sticky top bar appears with:
  - Prompt preview (truncated)
  - Gallery button
  - Settings button
  - Generate button
- **Image grid**: 2-3 columns

### Mobile (< md breakpoint, ~< 768px)
- **Sidebar**: Hidden
- **Mobile Menu** (full-screen overlay when opened):
  - Trigger: Click settings or prompt preview in toolbar
  - Shows: All sidebar controls (scrollable)
  - Fixed bottom bar: "Generovat" button (full width)
  - Close button (X) top-right
- **Image grid**: 1-2 columns
- **All modals**: Full-screen takeover

---

## GRID COLUMN LOGIC (Generated Images)

**gridCols** calculation (pseudocode from App.tsx):
```
if (viewport >= 1400px) gridCols = 4
else if (viewport >= 1024px) gridCols = 3
else if (viewport >= 640px) gridCols = 2
else gridCols = 1
```

**Grid CSS**: `grid-template-columns: repeat(${gridCols}, minmax(0, 1fr))`

**Image Tiles**:
- Aspect ratio: Preserved via natural image dimensions
- Object-fit: Variable (some parts use object-cover for thumbnails)
- Loading placeholders: aspect-square
- **CRITICAL**: Images are NOT cropped to uniform tiles in main grid (they display at natural aspect ratio, height auto)

**Reference/Style Image Grids in Sidebar**:
- **Fixed aspect-square tiles** (1:1 ratio enforced)
- Object-fit: cover (CROPPING applied)
- 4 columns (`grid-cols-4`)
- Gap: 1 (4px)

---

## COLOR PALETTE (CSS Variables)

**Primary Colors**:
- `--color-ink`: #0D2117 or similar (dark green-black)
- `--color-paper`: #FDFCF9 or similar (off-white, slightly warm)
- `--color-monstera-*`: Shades of muted green
  - monstera-50: Very light green
  - monstera-100: Light green
  - monstera-200: Light-medium green
  - monstera-300: Medium green
  - monstera-400: Accent green (button backgrounds)
  - monstera-500: Darker green
  - monstera-600: Text green
  - monstera-700: Darker text green
  - monstera-800: Near-black green
  - monstera-900: Darkest green

**Accent Colors**:
- Blue gradient: `from-blue-400 to-blue-500` (enhance button, variants)
- Purple-pink gradient: `from-purple-500 to-pink-600` (3 Variants button)
- Amber: `amber-50`, `amber-300`, `amber-500`, `amber-800` (face identity toggle)

**Semantic Colors**:
- Red: `red-400/500/600/700` (errors, delete)
- White: Pure white backgrounds
- Black: As needed (usually ink is used instead)

---

## TYPOGRAPHY HIERARCHY

**Font Family**: Sans-serif (likely system font stack or custom)

**Sizes** (from smallest to largest):
- 8px: Smallest labels, badges, tracking-widest text
- 9px: Small buttons, action text, tooltips
- 10px: Section labels, compact buttons
- 11px: Image card prompt text, some headers
- 12px: Primary action button text
- 13px: Prompt textarea, body text
- Larger: Headers, titles (varies)

**Font Weights**:
- medium: 500 (body text, textareas)
- bold: 700 (labels, some buttons)
- black: 900 (PRIMARY ACTION BUTTONS, section titles)

**Uppercase + Tracking**:
- ALL primary action buttons: uppercase + tracking-widest or tracking-[0.2em]
- Section labels: uppercase + tracking-widest
- Creates strong visual hierarchy

---

## SPACING SYSTEM (Tailwind Scale)

**Common Patterns**:
- `space-y-0.5`: Very tight vertical spacing (2px)
- `space-y-1`: Tight (4px)
- `space-y-1.5`: 6px
- `space-y-2`: 8px
- `gap-1` / `gap-1.5` / `gap-2`: Grid/flex gaps
- `p-1` / `p-2` / `p-3` / `p-4`: Padding (4px, 8px, 12px, 16px)
- `px-*` / `py-*`: Horizontal/vertical padding
- `mt-*` / `mb-*`: Margin top/bottom
- Compact UI: Lots of 0.5, 1, 1.5, 2 values (tight spacing)

---

## SHADOWS & EFFECTS

**Brutalist Shadows (on buttons)**:
- `shadow-[5px_5px_0_rgba(13,33,23,1)]`: Hard offset shadow (no blur)
- `shadow-[4px_4px_0_rgba(147,51,234,0.5)]`: Purple variant
- Active state: `shadow-none` + `translate-x-0.5 translate-y-0.5` (pressed effect)

**Standard Shadows**:
- `shadow-sm`: Subtle elevation
- `shadow-md` / `shadow-lg` / `shadow-xl`: Increasing elevation
- `shadow-2xl`: Large modals, overlays
- `shadow-inner`: Inset (textarea)

**Blur Effects**:
- `blur-sm`: Applied to images when generating or editing
- `backdrop-blur-sm`: Modal backgrounds, overlays

**Transitions**:
- Most elements: `transition-all` (smooth all properties)
- Specific: `transition-colors` (color-only transitions)
- Durations: Usually default (150-200ms) or `duration-500` for images

---

## ANIMATIONS

**CSS Animations**:
- `animate-fadeIn`: Custom fade-in (opacity 0 → 1)
- `animate-pulse`: Pulsing effect (generating status, editing badge)
- `animate-spin`: Spinner rotation

**Usage**:
- Generated images: `animate-fadeIn` on card container
- Loading spinners: `animate-spin`
- Status indicators: `animate-pulse`
- Mode switches: `animate-fadeIn` on conditional content

---

## BORDER RADIUS

**Rounded Corners**:
- `rounded`: Default (~4px)
- `rounded-md`: Medium (~6px)
- `rounded-lg`: Large (~8px)
- `rounded-full`: Pill shape (buttons, toggles, decorators)

**Usage**:
- Most containers, buttons: `rounded-md`
- Toggle switches: `rounded-full`
- Icons, decorators: `rounded-full`
- Modals: `rounded-lg` or `rounded-xl`

---

## INTERACTION STATES

**Hover**:
- Buttons: Background color shift, border color change
- Links: Color change, background highlight
- Images: Border color intensifies, delete overlay appears

**Active/Pressed**:
- Buttons with brutalist shadows: Remove shadow, translate slightly
- Scale: Some buttons use `active:scale-95`

**Focus**:
- Inputs/textareas: Border color changes (e.g., `monstera-200` → `monstera-400`)
- Outline: Usually `outline-none` with custom focus styles

**Disabled**:
- Opacity: 20-50% reduction
- Grayscale: Filter applied
- Cursor: `cursor-not-allowed`
- Pointer-events may be disabled

**Loading**:
- Spinner replaces content
- Text changes (e.g., "Generovat" → "Generuji")
- Disabled state active

---

## ICON USAGE

**All icons**: Heroicons SVG (stroke-based)  
**Common sizes**: w-3 h-3, w-4 h-4, w-5 h-5  
**Stroke-width**: Usually 2 or 2.5 (bold icons)

**Icon Locations**:
- Buttons: Left of text, gap-1 or gap-2
- Action buttons: Icon only, hovertooltips
- Info tooltips: Icon with hover explanation

---

## Z-INDEX LAYERS

**Stacking Order** (approximate):
- Base content: z-0
- Sidebar: z-20
- Resize handle: z-30
- Sticky mobile toolbar: z-40
- Tooltips: z-50
- Modals backdrop: z-40-50
- Modal content: z-50-60
- Toasts: z-60+

---

## SPECIFIC UI QUIRKS TO PRESERVE

1. **Brutalist Button Shadows**: Hard-edged offset shadows with pressed effect (NO blur)
2. **Resizable Sidebar**: Drag handle between sidebar and main content (1px wide)
3. **Compact Number Selector**: Height 5 (20px) buttons for image count
4. **Reference/Style Grids**: ALWAYS 4 columns, aspect-square tiles, object-cover
5. **Main Image Grid**: Dynamic columns, natural aspect ratios (NOT cropped/uniform tiles)
6. **Prompt Textarea**: Min 140px, max 300px, resizes with content (overflow-y auto)
7. **Mode Tabs**: Toggle-exclusive, full width, equal sizing
8. **Variant Tooltips**: Shown on hover, absolutely positioned, dark background
9. **Face Identity Toggle**: Custom styled checkbox (hidden native input + styled div)
10. **JSON Context Badge**: Shows filename, remove button inline
11. **Grounding Links**: Extracted domain names, small pills below image
12. **Selection Toolbar**: Only appears when `selectedGeneratedImages.size > 0`
13. **Empty States**: Centered icon + text, specific messages per section
14. **Drag-Drop Indicators**: Visual feedback (border, background change) when dragging over
15. **Inline Edit**: Per-image edit section with collapsible reference images
16. **Right-Click Context Menu**: Opens for successful images

---

## KEYBOARD SHORTCUTS

**Enter in Prompt Textarea**: Triggers generation (via `handleKeyDown`)  
**Cmd/Ctrl+V in App**: Paste image from clipboard (may be implemented via `handlePaste`)

---

## ACCESSIBILITY NOTES

**Screen Reader**:
- `sr-only` class: Hides native checkbox for face toggle but keeps accessible
- Label associations: Proper `htmlFor` on file upload labels

**Keyboard Navigation**:
- Buttons: All focusable, native button elements
- Inputs: Standard tab order
- Modals: Should trap focus (implementation varies)

**ARIA**:
- Not extensively used in provided code (basic HTML semantics)
- Consider adding ARIA labels for icon-only buttons in redesign

---

## CRITICAL LAYOUT RULES FOR REDESIGN

**MUST PRESERVE**:
1. **Two-column desktop layout**: Sidebar (280-400px resizable) + Main content
2. **Sidebar scrolls independently**: Header fixed, content scrollable
3. **Main content scrolls independently**: Full viewport height
4. **Mobile collapses sidebar**: Full-screen overlay menu instead
5. **Image count selector**: Horizontal 1-5 buttons, compact (h-5)
6. **Mode tabs**: Two equal-width tabs, toggle-exclusive
7. **Reference/style grids**: 4 columns, aspect-square, object-cover
8. **Main image grid**: Responsive columns (1→2→3→4), natural aspect ratios
9. **Selection toolbar**: Conditional render, full-width banner
10. **Empty states**: Centered, with specific messages
11. **Brutalist button aesthetics**: Hard shadows, pressed effect
12. **Prompt actions row**: Enhance (flex-1) + Undo + Redo (compact)
13. **JSON context**: Inline badge when present, hide file input
14. **Variant tooltips**: Hover-triggered, absolute positioning
15. **Face identity toggle**: Custom styled switch
16. **Inline edit sections**: Per-image, collapsible reference upload
17. **Grounding links**: Small pills, flex-wrap
18. **Provider selector**: At top of sidebar controls

---

**END OF UI SPECIFICATION**

This document captures all visible UI elements, layout rules, component nesting, sizing, spacing, colors, typography, interactions, and structural patterns found in the functional baseline (on the `main` branch at the last known working commit). Any redesign MUST consult this document to preserve functional equivalence.
