import type { HeadSwapHairSource } from '../services/aiProvider';
import type { HeadSwapMode } from '../services/headSwapService';

type HeadSwapPromptParams = {
  mode: HeadSwapMode;
  hairSource: HeadSwapHairSource;
};

function getHairPriorityText(hairSource: HeadSwapHairSource): string {
  if (hairSource === 'user') {
    return 'Preserve the source person hairline, hairstyle, hair color, hair density, hair volume, flyaway hairs, sideburns, baby hairs, and ears as faithfully as possible.';
  }

  return 'Preserve the target scene hair silhouette and edge integration when needed for realism, but keep the source identity, facial structure, and visible head traits dominant.';
}

export function buildHeadSwapIdentityLockPrompt(params: HeadSwapPromptParams): string {
  const subjectText = params.mode === 'head' ? 'entire visible head' : 'entire visible face and as much of the head as needed';

  return [
    `Task: Replace the ${subjectText} of the person in the target image with the identity from the source reference image.`,
    '',
    'Inputs:',
    'Image 1 is the target image. Keep its body, pose, camera framing, clothing, hands, background, and scene composition unchanged.',
    'Image 2 is the source identity reference. Use it as the only identity source for the replacement.',
    '',
    'Primary identity rule:',
    'Use the source reference as the ONLY facial and head identity source.',
    'Preserve exact facial geometry, skull shape, forehead, hairline, hairstyle, eyebrows, eyelids, eyes, nose, nostrils, cheeks, lips, teeth if visible, jawline, chin, ears, skin tone, skin texture, pores, wrinkles, freckles, facial hair, makeup level, and age cues.',
    getHairPriorityText(params.hairSource),
    '',
    'Blend rule:',
    'Integrate the replacement naturally into the target photo so it matches the target body pose, neck connection, camera angle, lens perspective, lighting direction, color temperature, depth of field, motion blur, compression, and grain.',
    '',
    'Hard constraints:',
    'Do not invent a new face.',
    'Do not beautify or stylize.',
    'Do not smooth skin.',
    'Do not change age, ethnicity, sex traits, head shape, hair style, hair color, facial proportions, or likeness.',
    'Do not retain any facial features from the original target person.',
    'Do not alter the target body, clothing, hands, accessories, background, or composition except what is strictly necessary around the neck and hair boundary for seamless compositing.',
    '',
    'Quality target:',
    'Create a photorealistic, seamless, identity-preserving result that looks like a real photograph, not an AI edit.',
    '',
    'Negative constraints:',
    'No mixed identity, no generic face, no target-face remnants, no wrong hairline, no wrong ears, no wrong jaw, no plastic skin, no glamour retouch, no duplicate face, no warped neck, no distorted glasses, and no broken teeth.',
  ].join('\n');
}
