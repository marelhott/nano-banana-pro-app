import { describe, expect, it } from 'vitest';
import { getPixelDimensions, mapAspectRatio } from './aspectRatioMapping';

describe('mapAspectRatio', () => {
  it('ponechá přesně podporovaný Gemini poměr', () => {
    expect(mapAspectRatio('16:9', 'gemini')).toEqual({
      value: '16:9',
      original: '16:9',
      exact: true,
    });
  });

  it('mapuje nepodporovaný DALL-E portrait na nejbližší velikost', () => {
    const result = mapAspectRatio('9:16', 'chatgpt');
    expect(result.value).toBe('1024x1536');
    expect(result.exact).toBe(false);
    expect(result.warning).toContain('DALL-E mapuje');
  });
});

describe('getPixelDimensions', () => {
  it('počítá landscape rozměry pro 2K', () => {
    expect(getPixelDimensions('16:9', '2K')).toEqual({
      width: 2048,
      height: 1152,
    });
  });
});
