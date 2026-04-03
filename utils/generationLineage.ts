import type { LineageEntry, SourceImage } from '../types';

export function buildGenerationLineage(params: {
  sourceImages: SourceImage[];
  styleImages: SourceImage[];
  assetImages: SourceImage[];
}): LineageEntry {
  return {
    sourceImageIds: params.sourceImages.map((img) => img.id),
    styleImageIds: params.styleImages.map((img) => img.id),
    sourceImageUrls: params.sourceImages.map((img) => img.url),
    styleImageUrls: params.styleImages.map((img) => img.url),
    assetImageIds: params.assetImages.map((img) => img.id),
    assetImageUrls: params.assetImages.map((img) => img.url),
  };
}
