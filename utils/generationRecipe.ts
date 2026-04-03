import { AIProviderType } from '../services/aiProvider';
import type { GenerationRecipe, LineageEntry } from '../types';

type BaseRecipeParams = {
  provider: AIProviderType;
  operation: GenerationRecipe['operation'];
  prompt: string;
  effectivePrompt?: string;
  useGrounding?: boolean;
  promptMode: 'simple' | 'advanced';
  advancedVariant?: 'A' | 'B' | 'C';
  faceIdentityMode?: boolean;
  jsonContextFileName?: string;
  resolution?: string;
  aspectRatio?: string;
  sourceImageCount: number;
  styleImageCount: number;
  assetImageCount?: number;
  createdAt?: number;
};

function buildBaseRecipe(params: BaseRecipeParams): GenerationRecipe {
  return {
    provider: params.provider,
    operation: params.operation,
    prompt: params.prompt,
    effectivePrompt: params.effectivePrompt,
    useGrounding: params.useGrounding,
    promptMode: params.promptMode,
    advancedVariant: params.promptMode === 'advanced' ? params.advancedVariant : undefined,
    faceIdentityMode: params.faceIdentityMode,
    jsonContextFileName: params.jsonContextFileName,
    resolution: params.resolution,
    aspectRatio: params.aspectRatio,
    sourceImageCount: params.sourceImageCount,
    styleImageCount: params.styleImageCount,
    assetImageCount: params.assetImageCount,
    createdAt: params.createdAt ?? Date.now(),
  };
}

export function buildVariantRecipe(params: Omit<BaseRecipeParams, 'operation' | 'provider' | 'effectivePrompt'>): GenerationRecipe {
  return buildBaseRecipe({
    ...params,
    provider: AIProviderType.GEMINI,
    operation: 'variant',
    effectivePrompt: params.prompt,
  });
}

export function buildThreeAiRecipe(params: Omit<BaseRecipeParams, 'operation' | 'effectivePrompt'>): GenerationRecipe {
  return buildBaseRecipe({
    ...params,
    operation: '3ai',
    effectivePrompt: params.prompt,
  });
}

export function buildGenerateRecipe(
  params: Omit<BaseRecipeParams, 'operation'> & {
    styleStrength?: number;
    styleAnalysis?: GenerationRecipe['styleAnalysis'];
    lineage?: LineageEntry;
    styleWeights?: Record<string, number>;
  }
): GenerationRecipe {
  return {
    ...buildBaseRecipe({
      ...params,
      operation: 'generate',
    }),
    styleStrength: params.styleStrength,
    styleAnalysis: params.styleAnalysis,
    lineage: params.lineage,
    styleWeights: params.styleWeights,
  };
}

export function buildBatchRecipe(params: Omit<BaseRecipeParams, 'operation'>): GenerationRecipe {
  return buildBaseRecipe({
    ...params,
    operation: 'batch',
  });
}

export function buildEditRecipe(params: Omit<BaseRecipeParams, 'operation' | 'provider' | 'effectivePrompt' | 'assetImageCount'>): GenerationRecipe {
  return buildBaseRecipe({
    ...params,
    provider: AIProviderType.GEMINI,
    operation: 'edit',
    effectivePrompt: params.prompt,
  });
}
