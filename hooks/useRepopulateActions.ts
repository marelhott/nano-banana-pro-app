import { useCallback } from 'react';
import { AIProviderType } from '../services/aiProvider';
import type { GalleryImage } from '../utils/galleryDB';
import type { AppState, GeneratedImage, GenerationRecipe } from '../types';

type UseRepopulateActionsParams = {
  isMobile: boolean;
  setPromptMode: (value: 'simple' | 'advanced') => void;
  setAdvancedVariant: (value: 'A' | 'B' | 'C') => void;
  setFaceIdentityMode: (value: boolean) => void;
  setUseGrounding: (value: boolean) => void;
  setSelectedProvider: (value: AIProviderType) => void;
  setJsonContext: (value: { fileName: string; content: any } | null) => void;
  setIsMobileMenuOpen: (value: boolean) => void;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
};

export function useRepopulateActions(params: UseRepopulateActionsParams) {
  const applyRecipe = useCallback((recipe: GenerationRecipe, autoGenerate: boolean) => {
    params.setPromptMode(recipe.promptMode || 'simple');
    if (recipe.advancedVariant) {
      params.setAdvancedVariant(recipe.advancedVariant);
    }
    params.setFaceIdentityMode(!!recipe.faceIdentityMode);
    params.setUseGrounding(!!recipe.useGrounding);
    if (recipe.provider && Object.values(AIProviderType).includes(recipe.provider as AIProviderType)) {
      params.setSelectedProvider(recipe.provider as AIProviderType);
    }

    params.setJsonContext(null);
    params.setState(prev => ({
      ...prev,
      prompt: recipe.prompt ?? prev.prompt,
      aspectRatio: recipe.aspectRatio || prev.aspectRatio,
      resolution: recipe.resolution || prev.resolution,
      shouldAutoGenerate: autoGenerate,
    }));

    if (params.isMobile) {
      params.setIsMobileMenuOpen(true);
    }
  }, [params]);

  const handleRepopulate = useCallback((image: GeneratedImage) => {
    if (image.recipe) {
      applyRecipe(image.recipe, true);
      return;
    }

    params.setState(prev => ({
      ...prev,
      prompt: image.prompt,
      aspectRatio: image.aspectRatio || 'Original',
      resolution: image.resolution || '2K',
      shouldAutoGenerate: true,
    }));

    if (params.isMobile) {
      params.setIsMobileMenuOpen(true);
    }
  }, [applyRecipe, params]);

  const handleRepopulateFromGallery = useCallback((image: GalleryImage) => {
    const recipe = image.params as GenerationRecipe | undefined;
    if (recipe) {
      applyRecipe(recipe, true);
      return;
    }

    params.setState(prev => ({
      ...prev,
      prompt: image.prompt,
      aspectRatio: image.aspectRatio || 'Original',
      resolution: image.resolution || '2K',
      shouldAutoGenerate: true,
    }));

    if (params.isMobile) {
      params.setIsMobileMenuOpen(true);
    }
  }, [applyRecipe, params]);

  return {
    applyRecipe,
    handleRepopulate,
    handleRepopulateFromGallery,
  };
}
