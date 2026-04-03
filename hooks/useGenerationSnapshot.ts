import { useCallback } from 'react';
import type { AppState } from '../types';
import type { ProviderSettings } from '../services/aiProvider';
import { AIProviderType } from '../services/aiProvider';
import type { NanoBananaImageModel } from '../constants/timings';

export type GenerationQueueSnapshot = {
  state: AppState;
  providerSettings: ProviderSettings;
  selectedProvider: AIProviderType;
  nanoBananaImageModel: NanoBananaImageModel;
  promptMode: 'simple' | 'advanced';
  advancedVariant: 'A' | 'B' | 'C';
  faceIdentityMode: boolean;
  simpleLinkMode: 'style' | 'merge' | 'object' | null;
  useGrounding: boolean;
  jsonContext: { fileName: string; content: any } | null;
  styleStrength: number;
  styleWeights: Record<string, number>;
  styleAnalysisCache: { description: string; strength: number } | null;
};

type UseGenerationSnapshotParams = {
  state: AppState;
  providerSettings: ProviderSettings;
  selectedProvider: AIProviderType;
  nanoBananaImageModel: NanoBananaImageModel;
  promptMode: 'simple' | 'advanced';
  advancedVariant: 'A' | 'B' | 'C';
  faceIdentityMode: boolean;
  simpleLinkMode: 'style' | 'merge' | 'object' | null;
  useGrounding: boolean;
  jsonContext: { fileName: string; content: any } | null;
  styleStrength: number;
  styleWeights: Record<string, number>;
  styleAnalysisCache: { description: string; strength: number } | null;
};

export function useGenerationSnapshot(params: UseGenerationSnapshotParams) {
  return useCallback((): GenerationQueueSnapshot => ({
    state: {
      ...params.state,
      sourceImages: params.state.sourceImages.map((img) => ({ ...img })),
      styleImages: params.state.styleImages.map((img) => ({ ...img })),
      assetImages: params.state.assetImages.map((img) => ({ ...img })),
      generatedImages: [],
      styleWeights: { ...(params.state.styleWeights || {}) },
    },
    providerSettings: {
      ...params.providerSettings,
      fal: params.providerSettings.fal ? { ...params.providerSettings.fal } : undefined,
      a1111: params.providerSettings.a1111 ? { ...params.providerSettings.a1111 } : undefined,
    },
    selectedProvider: params.selectedProvider,
    nanoBananaImageModel: params.nanoBananaImageModel,
    promptMode: params.promptMode,
    advancedVariant: params.advancedVariant,
    faceIdentityMode: params.faceIdentityMode,
    simpleLinkMode: params.simpleLinkMode,
    useGrounding: params.useGrounding,
    jsonContext: params.jsonContext
      ? { fileName: params.jsonContext.fileName, content: params.jsonContext.content }
      : null,
    styleStrength: params.styleStrength,
    styleWeights: { ...params.styleWeights },
    styleAnalysisCache: params.styleAnalysisCache ? { ...params.styleAnalysisCache } : null,
  }), [
    params,
  ]);
}
