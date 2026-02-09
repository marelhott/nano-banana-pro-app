/**
 * Style Strength — modifikace promptu podle síly stylu.
 * Převádí číslo 0-100 na kvalifikátor v promptu.
 */

export interface StyleStrengthConfig {
  strength: number; // 0-100
  weights?: Record<string, number>; // id obrázku → váha (0-100)
}

/**
 * Vrátí textový kvalifikátor síly stylu pro prompt.
 */
export function getStyleQualifier(strength: number): string {
  if (strength <= 10) return 'with only the faintest, barely noticeable hint of';
  if (strength <= 25) return 'with a subtle, gentle influence of';
  if (strength <= 40) return 'lightly inspired by';
  if (strength <= 60) return 'in the style of';
  if (strength <= 75) return 'strongly adopting the style of';
  if (strength <= 90) return 'heavily transformed into the style of';
  return 'completely reimagined in the exact style of';
}

/**
 * Vytvoří prompt instrukci pro sílu stylu.
 */
export function buildStyleStrengthInstruction(
  strength: number,
  styleDescription?: string
): string {
  const qualifier = getStyleQualifier(strength);

  if (styleDescription) {
    return `[STYLE STRENGTH: ${strength}%] Apply the style reference ${qualifier} the provided style image(s). Style characteristics: ${styleDescription}. ${strength < 30 ? 'Prioritize preserving the original content and only subtly incorporate style elements.' : strength > 70 ? 'Allow the style to significantly transform the visual output, even at the expense of strict content fidelity.' : 'Balance style application with content preservation.'}`;
  }

  return `[STYLE STRENGTH: ${strength}%] Apply the style reference ${qualifier} the provided style image(s). ${strength < 30 ? 'Keep the original content mostly intact.' : strength > 70 ? 'Let the style dominate the output.' : 'Balance style with content.'}`;
}

/**
 * Vytvoří prompt instrukci pro váhový mix více stylů.
 */
export function buildStyleWeightsInstruction(
  weights: Record<string, number>,
  imageCount: number
): string {
  const entries = Object.entries(weights);
  if (entries.length === 0 || imageCount <= 1) return '';

  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  if (totalWeight === 0) return '';

  const normalized = entries.map(([id, w], idx) => ({
    index: idx + 1,
    weight: Math.round((w / totalWeight) * 100),
  }));

  const parts = normalized.map(({ index, weight }) => `style image ${index}: ${weight}%`);

  return `[STYLE MIX] Blend the style references with the following proportions: ${parts.join(', ')}. Combine their visual qualities accordingly — dominant styles should have more influence on the final aesthetic.`;
}
