export type AdvancedVariant = 'A' | 'B' | 'C';

const VARIANT_INSTRUCTIONS = {
    A: `VARIANT A - CANDID EVERYDAY MOMENT:
Create an unplanned, spontaneous snapshot from real life.

CONTEXT PRESERVATION (CRITICAL):
- Maintain the CORE THEME and ACTIVITY from the reference image
- If reference shows music → keep music activity in variant
- If reference shows winter setting → keep similar season/climate
- If reference shows work → keep work-related context
- If reference shows collaboration → keep collaborative element
- VARY the specific location and execution details, NOT the fundamental context

Examples of CORRECT context preservation:
- Reference: Winter cabin + music → Variant: Outdoor snowy setting + music, or cozy indoor corner + music
- Reference: Summer cafe + laptop → Variant: Park bench + laptop, or library + laptop
- Reference: Studio recording → Variant: Home music setup, or rehearsal space

Examples of INCORRECT (avoid these):
- Reference: Winter cabin + music → Variant: Summer cafe (WRONG: changed season AND lost music)
- Reference: Office work → Variant: Beach vacation (WRONG: completely different context)

MANDATORY CHANGES from reference (while preserving context):
- Different specific location within same general context (if indoor cabin → different indoor space OR outdoor in same climate)
- Different angle or framing of same activity
- Different time of day (morning vs afternoon vs evening light quality)
- Slightly different execution of same activity (if playing guitar → different pose/position with guitar)
- Natural, unposed body language and expression

STYLE REQUIREMENTS:
- Imperfect composition (slightly off-center, natural framing, not studio-perfect)
- Natural lighting ONLY (sunlight, window light, ambient indoor light - NO studio lights)
- Authentic environment (real places people actually visit)
- Candid expression (genuine emotion, not posed smile or serious portrait face)
- Include environmental context appropriate to the theme
- Slightly imperfect focus or framing (feels like real snapshot)

AVOID: Completely changing the context, season, or core activity`,

    B: `VARIANT B - EDITORIAL PORTRAIT:
Create a high-end magazine-quality portrait with professional production value.

CONTEXT PRESERVATION (CRITICAL):
- Maintain the CORE IDENTITY and ROLE from reference
- If reference shows musician → keep music-related editorial context
- If reference shows professional → keep professional/work context
- If reference shows creative → keep creative context
- Elevate the PRODUCTION QUALITY and AESTHETIC, NOT change the person's role or activity type

MANDATORY CHANGES from reference (while preserving context):
- Professional studio OR carefully curated artistic location
- Intentional, directed pose (not casual or candid)
- Controlled, dramatic lighting setup (multiple light sources)
- Styled, coordinated outfit (fashionable, intentional wardrobe choice)
- Clean, minimal background OR intentionally artistic backdrop
- Confident, editorial expression (not everyday casual)

STYLE REQUIREMENTS:
- Perfect composition (rule of thirds, leading lines, intentional framing)
- Professional lighting (key light + fill light + rim/hair light OR dramatic single source)
- Shallow depth of field (beautifully blurred background, subject in sharp focus)
- Premium aesthetic (Vogue, GQ, National Geographic, high-end editorial style)
- Polished, confident expression (editorial model energy)
- Color grading (warm golden tones OR cool cinematic tones, intentional palette)

TECHNICAL SPECS:
- Shot with professional camera feel (85mm portrait lens aesthetic)
- Studio lighting OR golden hour outdoor with reflectors
- High contrast and clarity, professional post-processing
- Magazine cover or spread quality

CONCRETE EXAMPLES:
- Fashion editorial in minimalist urban setting, dramatic side lighting
- Corporate executive portrait in modern office, confident pose
- Artist in their studio surrounded by work, intentional composition
- Musician with instrument, dramatic lighting, editorial mood
- Creative professional in architectural space, high-end aesthetic

AVOID: Casual snapshots, messy backgrounds, flat lighting, everyday clothing`,

    C: `VARIANT C - PROFESSIONAL LIFESTYLE:
Create a polished but believable real-world work scenario.

CONTEXT PRESERVATION (CRITICAL):
- Maintain the PROFESSION and ACTIVITY TYPE from reference
- If reference shows creative work → keep creative work context
- If reference shows collaboration → keep collaborative setting
- If reference shows music/art → keep that creative domain
- Professionalize and organize the SETTING, NOT change the fundamental work type

MANDATORY CHANGES from reference (while preserving context):
- Professional or creative work environment (office, studio, workspace, co-working space)
- Active engagement with work task and tools (NOT just posing)
- Props relevant to activity MUST be visible and IN USE (laptop, notebook, tablet, tools, etc.)
- Business casual or smart casual attire (professional but not overly formal)
- Well-lit, organized, clean workspace (not messy, not sterile)

STYLE REQUIREMENTS:
- Natural but flattering light (large window light + ambient, OR soft overhead + desk lamp)
- Organized, professional environment (clean desk, intentional decor, not cluttered)
- Person ACTIVELY doing something (typing on laptop, writing notes, sketching, creating)
- Authentic but aesthetically pleasing (LinkedIn profile quality)
- Include relevant objects in frame (technology, books, creative tools, coffee, plants)
- Professional but approachable expression (focused on work, slight smile okay)

CRITICAL REQUIREMENTS:
- Person must be USING tools/objects, not just sitting near them
- Laptop/notebook/tools must be OPEN and VISIBLE in frame
- Hands must be engaged with work (on keyboard, holding pen, etc.)
- Environment must look like real workspace (not empty studio)

CONCRETE EXAMPLES:
- Designer working at desk with laptop and sketches, typing or drawing
- Writer with open notebook and coffee, pen in hand, natural light from window
- Consultant in modern office, laptop open, taking notes during video call
- Creative professional with tablet and stylus, actively designing
- Entrepreneur in co-working space, laptop and phone visible, working

AVOID: Empty desks, closed laptops, just posing without activity, overly staged setups`
};

const FACE_IDENTITY_INSTRUCTION = `FACE IDENTITY PRESERVATION WITH CREATIVE VARIATION:

PRESERVE (Core Facial Identity):
- Facial bone structure and skull geometry
- Eye shape, spacing, and color
- Nose proportions and shape
- Mouth shape and lip proportions
- Jawline and chin structure
- Distinctive facial features (moles, scars, unique characteristics)
- Overall facial proportions and symmetry
- Skin tone and complexion (general characteristics)

ACTIVELY VARY (Everything Else):
- Pose and camera angle (front view, side profile, 3/4 angle, looking away, tilted head, etc.)
- Facial expression and emotion (happy, serious, contemplative, surprised, laughing, etc.)
- Clothing style and outfit (casual, formal, sporty, artistic, vintage, modern, etc.)
- Hairstyle and grooming (different styles while keeping hair color/texture recognizable)
- Environment and background (indoor, outdoor, studio, nature, urban, workplace, home, etc.)
- Lighting setup (natural sunlight, dramatic shadows, soft diffused, golden hour, studio, etc.)
- Activity or context (working, relaxing, performing, traveling, exercising, creating, etc.)
- Color palette and mood (warm tones, cool tones, vibrant, muted, monochrome, etc.)
- Time of day and season (morning, evening, summer, winter, etc.)
- Props and accessories (glasses, hats, jewelry, tools, instruments, etc.)

CRITICAL RULES:
1. The face MUST be recognizably the same person across all variants
2. BUT the overall image SHOULD be creatively different from other variants
3. Prioritize MAXIMUM DIVERSITY in composition, setting, mood, and context
4. Don't be conservative - embrace bold changes in everything except facial identity
5. Think: "Same person, completely different moment/context/story"
6. Each variant should tell a different visual story about the same person

VARIATION EXAMPLES:
- Variant A: Professional headshot in office, serious expression, business attire, neutral background
- Variant B: Outdoor candid, genuine smile, casual clothes, natural sunlight, park setting
- Variant C: Artistic portrait, contemplative mood, creative outfit, dramatic side lighting, studio

The goal is to create visually distinct images that clearly show the same person in different contexts.`;

/**
 * Applies sophisticated interpretation instructions to a user prompt based on the selected variant.
 * 
 * @param userPrompt The original user prompt
 * @param variant The selected interpretation variant (A, B, or C)
 * @param faceIdentityMode Whether face identity preservation is enabled
 * @returns The enriched prompt with internal instructions
 */
export function applyAdvancedInterpretation(
    userPrompt: string,
    variant: AdvancedVariant,
    faceIdentityMode: boolean
): string {
    // If no variant is selected (shouldn't happen in advanced mode), return prompt as-is
    if (!variant) return userPrompt;

    const parts = [userPrompt.trim()];

    // Add variant instruction
    if (VARIANT_INSTRUCTIONS[variant]) {
        parts.push(`\n\n[INTERPRETATION INSTRUCTION - VARIANT ${variant}]`);
        parts.push(VARIANT_INSTRUCTIONS[variant]);
    }

    // Add face identity override if enabled
    if (faceIdentityMode) {
        parts.push('\n\n[OVERRIDE - FACE IDENTITY PRESERVATION]');
        parts.push(FACE_IDENTITY_INSTRUCTION);
    }

    return parts.join('\n');
}
