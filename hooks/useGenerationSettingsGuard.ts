import { useCallback } from 'react';
import { AIProviderType } from '../services/aiProvider';
import type { NanoBananaImageModel } from '../constants/timings';

type UseGenerationSettingsGuardParams = {
  isGenerating: boolean;
  queuedGenerationCount: number;
  selectedProvider: AIProviderType;
  nanoBananaImageModel: NanoBananaImageModel;
  onProviderChange: (provider: AIProviderType) => void;
  onModelChange: (model: NanoBananaImageModel) => void;
};

export function useGenerationSettingsGuard(params: UseGenerationSettingsGuardParams) {
  const confirmGenerationSettingsChange = useCallback((): boolean => {
    if (!params.isGenerating && params.queuedGenerationCount === 0) return true;
    return window.confirm(
      'Generování právě běží nebo čeká ve frontě. Opravdu chceš změnit provider nebo model? Nové nastavení se projeví až pro další běh.'
    );
  }, [params]);

  const handleProviderChange = useCallback((provider: AIProviderType) => {
    if (provider === params.selectedProvider) return;
    if (!confirmGenerationSettingsChange()) return;
    params.onProviderChange(provider);
  }, [confirmGenerationSettingsChange, params]);

  const handleNanoBananaModelChange = useCallback((model: NanoBananaImageModel) => {
    if (model === params.nanoBananaImageModel) return;
    if (!confirmGenerationSettingsChange()) return;
    params.onModelChange(model);
  }, [confirmGenerationSettingsChange, params]);

  return {
    handleProviderChange,
    handleNanoBananaModelChange,
  };
}
