import { describe, expect, it } from 'vitest';
import { buildSimpleLinkPrompt, composeGenerationPrompt } from './promptComposition';

describe('buildSimpleLinkPrompt', () => {
  it('pro style mód obsahuje správný úvod i dodatečné instrukce', () => {
    const prompt = buildSimpleLinkPrompt('style', 'drž barevnost jemnou', 1, 2, 0);
    expect(prompt).toContain('[LINK MODE: STYLE]');
    expect(prompt).toContain('Additional instructions');
    expect(prompt).toContain('drž barevnost jemnou');
  });
});

describe('composeGenerationPrompt', () => {
  it('použije sourcePrompt, když je hlavní prompt prázdný', () => {
    const result = composeGenerationPrompt({
      prompt: '',
      promptMode: 'simple',
      advancedVariant: 'C',
      faceIdentityMode: false,
      simpleLinkMode: null,
      jsonContext: null,
      sourceImageCount: 1,
      styleImageCount: 0,
      assetImageCount: 0,
      sourcePrompt: 'náhradní prompt',
    });

    expect(result.basePrompt).toBe('náhradní prompt');
    expect(result.enhancedPrompt).toBe('náhradní prompt');
  });

  it('připojí JSON kontext do base promptu', () => {
    const result = composeGenerationPrompt({
      prompt: 'hlavní prompt',
      promptMode: 'simple',
      advancedVariant: 'C',
      faceIdentityMode: false,
      simpleLinkMode: null,
      jsonContext: { fileName: 'test.json', content: { mood: 'soft' } },
      sourceImageCount: 1,
      styleImageCount: 0,
      assetImageCount: 0,
    });

    expect(result.basePrompt).toContain('test.json');
    expect(result.basePrompt).toContain('"mood": "soft"');
  });
});
