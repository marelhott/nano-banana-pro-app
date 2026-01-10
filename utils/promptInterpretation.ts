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

const FACE_IDENTITY_INSTRUCTION = `FACE IDENTITY PRESERVATION - ABSOLUTE PRIORITY:
- Preserve facial identity with maximum fidelity
- Identity similarity is more important than expression, mood, lighting, or style
- Maintain core facial structure:
  - Bone structure
  - Eye spacing and shape
  - Nose proportions
  - Mouth shape and placement
  - Jawline and skull geometry
- Do NOT beautify, idealize, or correct facial features
- Do NOT morph the face toward generic attractiveness
- Expression may change, but facial proportions must remain consistent
- Lighting, styling, and environment must adapt to the face — never the opposite
- If a conflict arises between aesthetics and identity, identity ALWAYS wins
- The generated face must be recognizably the same person at first glance`;

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
