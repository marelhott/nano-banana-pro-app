import type { HeadSwapGender, HeadSwapHairSource, ProviderSettings } from './aiProvider';
import { AIProviderType } from './aiProvider';
import { ProviderFactory } from './providerFactory';
import { createReferenceStyleComposite } from '../utils/imagePanelComposite';
import {
  buildHeadSwapPrompt,
  getHeadSwapModelLabel,
  getHeadSwapProviderId,
  type HeadSwapPromptModel,
} from '../utils/headSwapPrompt';

export type HeadSwapMode = 'face' | 'head';
export type HeadSwapModelChoice = 'gemini' | 'openai' | 'both';
export type HeadSwapPromptProviderId = 'gemini-identity-edit' | 'openai-identity-edit';

export interface HeadSwapRequest {
  sourceImage: string;
  targetImage: string;
  mode?: HeadSwapMode;
  hairSource?: HeadSwapHairSource;
  selectedModels?: HeadSwapModelChoice;
  outputCount?: number;
  sourceGender?: HeadSwapGender;
}

export interface HeadSwapOutput {
  provider: HeadSwapPromptProviderId;
  label: string;
  imageBase64: string;
  batchIndex: number;
  modelId?: string;
}

export interface HeadSwapResult {
  outputs: HeadSwapOutput[];
  attemptedProviders: HeadSwapPromptProviderId[];
}

export interface HeadSwapProgress {
  stage: 'composing' | 'running' | 'completed';
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeLabel?: string;
}

function dataUrlToImageInput(dataUrl: string) {
  const mimeType = dataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/png';
  return {
    data: dataUrl,
    mimeType,
  };
}

function normalizeOutputCount(count?: number): number {
  const parsed = Math.max(1, Math.min(3, Math.round(count || 1)));
  return Number.isFinite(parsed) ? parsed : 1;
}

function resolveModels(choice?: HeadSwapModelChoice): HeadSwapPromptModel[] {
  if (choice === 'openai') return ['openai'];
  if (choice === 'both') return ['gemini', 'openai'];
  return ['gemini'];
}

async function runSinglePromptSwap(params: {
  providerType: AIProviderType;
  promptModel: HeadSwapPromptModel;
  compositeInput: { data: string; mimeType: string };
  mode: HeadSwapMode;
  hairSource: HeadSwapHairSource;
  batchIndex: number;
  sourceGender?: HeadSwapGender;
}): Promise<HeadSwapOutput> {
  const provider = ProviderFactory.createProvider(params.providerType, '');
  const prompt = buildHeadSwapPrompt({
    model: params.promptModel,
    mode: params.mode,
    hairSource: params.hairSource,
    batchIndex: params.batchIndex,
    sourceGender: params.sourceGender,
  });

  const result = await provider.generateImage(
    [params.compositeInput],
    prompt,
    'match',
    'Original',
    false
  );

  return {
    provider: getHeadSwapProviderId(params.promptModel),
    label: `${getHeadSwapModelLabel(params.promptModel)} • ${params.batchIndex + 1}`,
    imageBase64: result.imageBase64,
    batchIndex: params.batchIndex,
    modelId: result.modelId,
  };
}

export async function runHeadSwap(params: {
  request: HeadSwapRequest;
  settings: ProviderSettings;
  onOutput?: (output: HeadSwapOutput) => void;
  onProgress?: (progress: HeadSwapProgress) => void;
}): Promise<HeadSwapResult> {
  const mode = params.request.mode || 'head';
  const hairSource = params.request.hairSource || params.settings.headSwap?.hairSource || 'target';
  const outputCount = normalizeOutputCount(params.request.outputCount);
  const models = resolveModels(params.request.selectedModels);
  const totalJobs = models.length * outputCount;
  let completedJobs = 0;
  let failedJobs = 0;

  params.onProgress?.({
    stage: 'composing',
    totalJobs,
    completedJobs,
    failedJobs,
  });

  const compositeInput = await createReferenceStyleComposite({
    referenceImages: [dataUrlToImageInput(params.request.targetImage)],
    styleImages: [dataUrlToImageInput(params.request.sourceImage)],
    size: 768,
    outputMimeType: 'image/jpeg',
    outputQuality: 0.82,
  });

  const jobs = models.flatMap((model) =>
    Array.from({ length: outputCount }, (_, batchIndex) => {
      const providerType = model === 'gemini' ? AIProviderType.GEMINI : AIProviderType.CHATGPT;
      const activeLabel = `${getHeadSwapModelLabel(model)} • ${batchIndex + 1}/${outputCount}`;

      params.onProgress?.({
        stage: 'running',
        totalJobs,
        completedJobs,
        failedJobs,
        activeLabel,
      });

      return runSinglePromptSwap({
        providerType,
        promptModel: model,
        compositeInput,
        mode,
        hairSource,
        batchIndex,
        sourceGender: params.request.sourceGender,
      }).then((output) => {
        completedJobs += 1;
        params.onOutput?.(output);
        params.onProgress?.({
          stage: completedJobs + failedJobs >= totalJobs ? 'completed' : 'running',
          totalJobs,
          completedJobs,
          failedJobs,
          activeLabel,
        });
        return output;
      }).catch((error) => {
        failedJobs += 1;
        params.onProgress?.({
          stage: completedJobs + failedJobs >= totalJobs ? 'completed' : 'running',
          totalJobs,
          completedJobs,
          failedJobs,
          activeLabel,
        });
        throw error;
      });
    })
  );

  const settled = await Promise.allSettled(jobs);
  const outputs = settled
    .filter((item): item is PromiseFulfilledResult<HeadSwapOutput> => item.status === 'fulfilled')
    .map((item) => item.value);

  if (outputs.length === 0) {
    const failures = settled
      .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
      .map((item) => item.reason?.message || 'unknown error');
    throw new Error(`Face/head swap selhal: ${failures.join(' | ')}`);
  }

  return {
    outputs,
    attemptedProviders: models.map(getHeadSwapProviderId),
  };
}
