import type { HeadSwapHairSource } from '../services/aiProvider';
import type { HeadSwapMode, HeadSwapPromptProviderId } from '../services/headSwapService';

export type HeadSwapPromptModel = 'gemini' | 'openai';

type HeadSwapPromptParams = {
  model: HeadSwapPromptModel;
  mode: HeadSwapMode;
  hairSource: HeadSwapHairSource;
  batchIndex: number;
};

function getHairRule(hairSource: HeadSwapHairSource): string {
  if (hairSource === 'user') {
    return 'Hair priority: preserve the source person hairline, hairstyle, color, density, baby hairs, sideburns, and ears whenever they are visible.';
  }

  return 'Hair priority: preserve the target scene silhouette and edge integration only where needed, but keep the source identity dominant.';
}

function getSwapScope(mode: HeadSwapMode): string {
  return mode === 'head'
    ? 'Replace the entire visible head of the person in the target image.'
    : 'Replace the visible face and only the minimum surrounding head area needed for a believable swap.';
}

function getVariationRule(batchIndex: number): string {
  if (batchIndex === 0) return 'Variation target: make the cleanest, safest, most identity-faithful version.';
  if (batchIndex === 1) return 'Variation target: keep the same identity but try a slightly cleaner blend around hairline, ears, and neck seam.';
  return 'Variation target: keep the same identity but try a slightly stronger realism pass in texture, pores, and lighting coherence.';
}

export function getHeadSwapModelLabel(model: HeadSwapPromptModel): string {
  return model === 'gemini' ? 'Gemini Nano Banana' : 'GPT Image 2';
}

export function getHeadSwapProviderId(model: HeadSwapPromptModel): HeadSwapPromptProviderId {
  return model === 'gemini' ? 'gemini-identity-edit' : 'openai-identity-edit';
}

export function buildHeadSwapPrompt(params: HeadSwapPromptParams): string {
  const modelSpecificRule =
    params.model === 'gemini'
      ? 'Optimize for a believable preview-quality edit with stable identity and minimal unintended repainting.'
      : 'Optimize for a polished final-quality edit with photorealistic blending and strong skin and eye detail, without changing identity.';

  return [
    'You are performing a precise identity-preserving face/head swap from a target-first reference composite.',
    '',
    'Composite input layout:',
    'Main large image = target image. Keep its body, pose, clothing, framing, background, composition, and scene intact.',
    'Small top-right inset = source identity. Use this inset as the only identity source for the swap.',
    '',
    getSwapScope(params.mode),
    '',
    'Identity lock:',
    'Preserve the source identity exactly: facial geometry, skull shape, forehead, hairline, hairstyle, eyebrows, eyes, nose, cheeks, lips, jawline, chin, ears, skin tone, texture, age cues, facial hair, and likeness.',
    getHairRule(params.hairSource),
    '',
    'Blend rule:',
    'Match the target body pose, neck connection, camera angle, lens perspective, lighting direction, color temperature, depth of field, grain, compression, and motion blur.',
    '',
    'Hard constraints:',
    'Do not invent a new face.',
    'Do not stylize, beautify, de-age, re-light the whole photo, smooth skin, or change ethnicity.',
    'Do not keep any facial features from the original target person.',
    'Do not alter body, hands, accessories, clothing, or background outside the minimum swap boundary.',
    'Do not output a split-screen, collage, before/after, contact sheet, diptych, inset, or any second image.',
    'Do not reproduce the reference inset in the final output.',
    '',
    modelSpecificRule,
    getVariationRule(params.batchIndex),
    '',
    'Output requirement:',
    'Return one single full-frame realistic swapped photo of the target scene only, with no layout elements or reference panels visible.',
  ].join('\n');
}
