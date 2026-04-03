import { applyAdvancedInterpretation } from './promptInterpretation';
import { buildStyleStrengthInstruction, buildStyleWeightsInstruction } from './styleStrength';

export function buildSimpleLinkPrompt(
  mode: 'style' | 'merge' | 'object',
  extra: string,
  referenceImageCount: number,
  styleImageCount: number,
  assetImageCount: number
) {
  const header = `
[LINK MODE: ${mode.toUpperCase()}]
Images order: first ${referenceImageCount} input image(s), then ${styleImageCount} style image(s), then ${assetImageCount} proprietary asset image(s).
`;

  if (mode === 'style') {
    return `${header}
Apply the visual style, composition, lighting, color grading, lens feel, and overall mood from the style image(s) to the input image(s), while preserving the identity and content of the input subject(s). Do NOT transfer objects/content from style; transfer only aesthetic and photographic/artistic treatment.

${extra ? `Additional instructions:
${extra}
` : ''}`.trim();
  }

  if (mode === 'merge') {
    return `${header}
Create a cohesive merge of input and style images. You may blend both aesthetic and content elements to produce a unified result that feels intentional, natural, and high quality. Use the style image(s) as a compositional template when helpful, but preserve the identity of subjects from the input image(s).

${extra ? `Additional instructions:
${extra}
` : ''}`.trim();
  }

  return `${header}
Transfer the dominant object/element from the style image(s) onto the input image(s) in a realistic way. Keep the input scene intact and place/replace the matching region with the style object (e.g., decorative wall), with correct perspective, lighting, scale, and shadows.

${extra ? `Additional instructions:
${extra}
` : ''}`.trim();
}

type ComposeGenerationPromptParams = {
  prompt: string;
  promptMode: 'simple' | 'advanced';
  advancedVariant: 'A' | 'B' | 'C';
  faceIdentityMode: boolean;
  simpleLinkMode: 'style' | 'merge' | 'object' | null;
  jsonContext: { fileName: string; content: any } | null;
  sourceImageCount: number;
  styleImageCount: number;
  assetImageCount: number;
  sourcePrompt?: string;
  multiRefMode?: 'batch' | 'together';
  styleStrength?: number;
  styleWeights?: Record<string, number>;
  styleAnalysisCache?: { description: string; strength: number } | null;
};

export function composeGenerationPrompt(params: ComposeGenerationPromptParams) {
  let basePrompt = params.prompt;
  let extraPrompt = basePrompt;

  if (!extraPrompt.trim() && params.sourcePrompt) {
    extraPrompt = params.sourcePrompt;
  }

  if (params.promptMode === 'simple' && params.simpleLinkMode) {
    basePrompt = buildSimpleLinkPrompt(
      params.simpleLinkMode,
      extraPrompt,
      params.sourceImageCount,
      params.styleImageCount,
      params.assetImageCount
    );
  } else {
    basePrompt = extraPrompt;
  }

  if (params.jsonContext) {
    basePrompt += `\n\n[DODATEČNÝ KONTEXT Z JSON SOUBORU (${params.jsonContext.fileName})]\n`;
    basePrompt += JSON.stringify(params.jsonContext.content, null, 2);
    basePrompt += '\n\n[INSTRUKCE K JSONU: Použij tato data jako dodatečný kontext, parametry nebo nastavení pro generování obrazu. Mají vysokou prioritu.]';
  }

  if (params.promptMode === 'advanced') {
    basePrompt = applyAdvancedInterpretation(basePrompt, params.advancedVariant, params.faceIdentityMode);
  } else if (params.faceIdentityMode) {
    basePrompt = applyAdvancedInterpretation(basePrompt, 'C', true);
    basePrompt += '\n\n[VARIATION REQUIREMENT: Create a unique and visually distinct interpretation. Vary pose, angle, clothing, environment, lighting, mood, and context significantly. Make each image tell a different story while keeping the same recognizable face.]';
  }

  let enhancedPrompt = basePrompt;
  if (params.styleImageCount > 0) {
    enhancedPrompt = `${basePrompt}\n\n[Technická instrukce: První ${params.sourceImageCount} obrázek${params.sourceImageCount > 1 ? 'y' : ''} ${params.sourceImageCount > 1 ? 'jsou' : 'je'} vstupní obsah k úpravě. Následující ${params.styleImageCount} obrázek${params.styleImageCount > 1 ? 'y' : ''} ${params.styleImageCount > 1 ? 'jsou' : 'je'} stylová reference - použij jejich vizuální styl, estetiku a umělecký přístup pro úpravu vstupního obsahu.]`;

    if (params.sourceImageCount > 1 && params.multiRefMode !== 'batch') {
      enhancedPrompt += '\n\n[KOMPOZICE & OBSAH: Vytvoř jednu výslednou scénu, která kombinuje obsah ze všech vstupních obrázků. Použij stylové obrázky také jako kompoziční šablonu (rozvržení, póza, framing) pro výslednou scénu. Zachovej maximálně obličejovou podobnost osob ze vstupů a zachovej jejich klíčové objekty/rekvizity.]';
    }

    const styleStrengthVal = params.styleStrength ?? 50;
    const cachedDesc = params.styleAnalysisCache?.description;
    enhancedPrompt += `\n\n${buildStyleStrengthInstruction(styleStrengthVal, cachedDesc || undefined)}`;

    if (params.styleImageCount > 1 && params.styleWeights && Object.keys(params.styleWeights).length > 0) {
      const weightsInstruction = buildStyleWeightsInstruction(params.styleWeights, params.styleImageCount);
      if (weightsInstruction) {
        enhancedPrompt += `\n\n${weightsInstruction}`;
      }
    }
  }

  if (params.assetImageCount > 0) {
    enhancedPrompt += `\n\n[PROPRIETÁRNÍ ASSET REFERENCE: Po stylových referencích následuje ${params.assetImageCount} obrázek${params.assetImageCount > 1 ? 'y' : ''} proprietárních prvků (např. logo, klobouk, boty, produkt). Tyto assety NEBER jako styl. Použij je pouze jako obsahové/reference prvky pro přesný vzhled, tvar a umístění ve scéně.]`;
  }

  return {
    basePrompt,
    enhancedPrompt,
  };
}
