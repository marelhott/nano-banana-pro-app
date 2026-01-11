export type AdvancedVariant = 'A' | 'B' | 'C';

const VARIANT_INSTRUCTIONS = {
    A: `MAXIMUM AUTHENTICITY (REALITY-FIRST):
- Absolute priority on realism and credibility
- Naturally captured, not stylized
- No exaggeration, idealization, or cinematic drama
- Lighting: accidental or naturally occurring
- Composition: imperfect but believable
- For interiors: subtle, random everyday objects, no minimalism
- For people: natural skin texture, no beauty enhancement, realistic proportions
- Goal: the image should feel like an unplanned real photograph from everyday life`,

    B: `MAXIMUM ENHANCEMENT (IDEALIZED / HIGH-END):
- Visually perfected, aspirational image
- Use top-tier photographic logic: best lenses, optimal angles, intentional composition
- Lighting: controlled, flattering, and technically excellent
- Visual clarity, depth, contrast, and polish are prioritized
- Inspiration may draw from renowned photographers and high-end editorial photography
- Subjects should appear at their visual best (without becoming artificial)
- The result should feel premium, cinematic, and visually impressive`,

    C: `BALANCED REALISM (NATURAL + AESTHETIC):
- Maintain overall credibility and realism
- Allow gentle enhancement in lighting, framing, and clarity
- Avoid extremes: no raw randomness, no excessive perfection
- The image should feel like a well-shot real photo, not a stylized artwork
- Suitable as a neutral default between authenticity and visual appeal`
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
