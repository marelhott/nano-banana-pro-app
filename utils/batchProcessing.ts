import type { GeneratedImage, SourceImage } from '../types';
import { buildSimpleLinkPrompt } from './promptComposition';

export type BatchProcessImage = Pick<SourceImage, 'id' | 'url'> & {
  file?: File;
  fileType?: string;
};

export const BATCH_PARALLEL_SIZE = 5;

export function chunkBatchImages(images: BatchProcessImage[], chunkSize: number = BATCH_PARALLEL_SIZE): BatchProcessImage[][] {
  const chunks: BatchProcessImage[][] = [];

  for (let index = 0; index < images.length; index += chunkSize) {
    chunks.push(images.slice(index, index + chunkSize));
  }

  return chunks;
}

export function createBatchLoadingImages(params: {
  images: BatchProcessImage[];
  prompt: string;
  resolution: string;
  aspectRatio: string;
  createdAt?: number;
}): GeneratedImage[] {
  const createdAt = params.createdAt ?? Date.now();

  return params.images.map((_, index) => ({
    id: `batch_${createdAt}_${index}`,
    prompt: params.prompt,
    timestamp: createdAt + index,
    status: 'loading',
    resolution: params.resolution,
    aspectRatio: params.aspectRatio,
  }));
}

export function getBatchEffectivePrompt(params: {
  prompt: string;
  promptMode: 'simple' | 'advanced';
  simpleLinkMode: 'style' | 'merge' | 'object' | null;
  styleImageCount: number;
  assetImageCount: number;
}): string {
  if (
    params.promptMode === 'simple' &&
    params.simpleLinkMode &&
    params.styleImageCount > 0
  ) {
    return buildSimpleLinkPrompt(
      params.simpleLinkMode,
      params.prompt.trim(),
      1,
      params.styleImageCount,
      params.assetImageCount
    );
  }

  return params.prompt;
}

export function combineBatchInputImages<T>(params: {
  sourceImagesData: T[];
  styleImagesData: T[];
  assetImagesData: T[];
}): T[] {
  return params.styleImagesData.length > 0
    ? [...params.sourceImagesData, ...params.styleImagesData, ...params.assetImagesData]
    : [...params.sourceImagesData, ...params.assetImagesData];
}
