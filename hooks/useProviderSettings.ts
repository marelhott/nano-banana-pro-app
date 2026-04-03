import { useEffect, useMemo, useState } from 'react';
import { AIProviderType, ProviderSettings } from '../services/aiProvider';
import type { NanoBananaImageModel } from '../constants/timings';

const PROVIDER_SETTINGS_STORAGE_KEY = 'providerSettings';
const SELECTED_PROVIDER_STORAGE_KEY = 'selectedProvider';
const NANO_BANANA_IMAGE_MODEL_STORAGE_KEY = 'nanoBananaImageModel';

function getDefaultProviderSettings(): ProviderSettings {
  return {
    [AIProviderType.GEMINI]: { apiKey: '', enabled: true },
    [AIProviderType.CHATGPT]: { apiKey: '', enabled: false },
    [AIProviderType.GROK]: { apiKey: '', enabled: false },
    [AIProviderType.REPLICATE]: { apiKey: '', enabled: false },
    fal: { apiKey: '', enabled: false },
    headSwap: {
      preferredPrimary: 'fal-easel',
      hairSource: 'target',
      sourceGender: 'default',
      secondarySourceGender: 'default',
      useUpscale: true,
      useDetailer: false,
      facefusionEndpoint: '',
      refaceEndpoint: '',
    },
  };
}

export function useProviderSettings() {
  const defaultProviderSettings = useMemo(() => getDefaultProviderSettings(), []);
  const [selectedProvider, setSelectedProvider] = useState<AIProviderType>(AIProviderType.GEMINI);
  const [nanoBananaImageModel, setNanoBananaImageModel] = useState<NanoBananaImageModel>('gemini-3.1-flash-image-preview');
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(defaultProviderSettings);

  useEffect(() => {
    try {
      const rawSettings = localStorage.getItem(PROVIDER_SETTINGS_STORAGE_KEY);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings) as Record<string, unknown>;
        setProviderSettings({
          [AIProviderType.GEMINI]: (parsed?.[AIProviderType.GEMINI] as ProviderSettings[AIProviderType.GEMINI]) || defaultProviderSettings[AIProviderType.GEMINI],
          [AIProviderType.CHATGPT]: (parsed?.[AIProviderType.CHATGPT] as ProviderSettings[AIProviderType.CHATGPT]) || defaultProviderSettings[AIProviderType.CHATGPT],
          [AIProviderType.GROK]: (parsed?.[AIProviderType.GROK] as ProviderSettings[AIProviderType.GROK]) || defaultProviderSettings[AIProviderType.GROK],
          [AIProviderType.REPLICATE]: (parsed?.[AIProviderType.REPLICATE] as ProviderSettings[AIProviderType.REPLICATE]) || defaultProviderSettings[AIProviderType.REPLICATE],
          fal: (parsed?.fal as ProviderSettings['fal']) || defaultProviderSettings.fal,
          a1111: parsed?.a1111 as ProviderSettings['a1111'] | undefined,
          headSwap: {
            ...defaultProviderSettings.headSwap,
            ...(parsed?.headSwap as ProviderSettings['headSwap'] | undefined),
          },
        });
      }
    } catch (error) {
      console.warn('Failed to load provider settings from localStorage:', error);
    }

    const savedProvider = localStorage.getItem(SELECTED_PROVIDER_STORAGE_KEY);
    if (savedProvider && Object.values(AIProviderType).includes(savedProvider as AIProviderType)) {
      setSelectedProvider(savedProvider as AIProviderType);
    }

    const savedNanoBananaModel = localStorage.getItem(NANO_BANANA_IMAGE_MODEL_STORAGE_KEY);
    if (savedNanoBananaModel === 'gemini-3.1-flash-image-preview' || savedNanoBananaModel === 'gemini-3-pro-image-preview') {
      setNanoBananaImageModel(savedNanoBananaModel);
    }
  }, [defaultProviderSettings]);

  useEffect(() => {
    localStorage.setItem(SELECTED_PROVIDER_STORAGE_KEY, selectedProvider);
  }, [selectedProvider]);

  useEffect(() => {
    localStorage.setItem(NANO_BANANA_IMAGE_MODEL_STORAGE_KEY, nanoBananaImageModel);
  }, [nanoBananaImageModel]);

  return {
    defaultProviderSettings,
    providerSettings,
    selectedProvider,
    nanoBananaImageModel,
    setProviderSettings,
    setSelectedProvider,
    setNanoBananaImageModel,
  };
}
