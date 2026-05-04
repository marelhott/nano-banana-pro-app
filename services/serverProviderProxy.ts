import { AIProviderType, GenerateImageResult, ImageInput } from './aiProvider';

type ServerProviderAction =
  | 'enhancePrompt'
  | 'generateImage'
  | 'generate3PromptVariants'
  | 'analyzeImageForJson'
  | 'analyzeStyleTransfer';

type ServerProviderRequest = {
  provider: AIProviderType;
  action: ServerProviderAction;
  apiKey?: string;
  images?: ImageInput[];
  prompt?: string;
  shortPrompt?: string;
  imageDataUrl?: string;
  referenceDataUrl?: string;
  styleDataUrl?: string;
  resolution?: string;
  aspectRatio?: string;
  useGrounding?: boolean;
  options?: { agenticVision?: boolean; mediaResolution?: string };
};

async function callServerProvider<T>(payload: ServerProviderRequest): Promise<T> {
  const response = await fetch('/api/provider-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || response.statusText || 'Server provider request failed.');
  }
  return data.result as T;
}

export const serverProviderProxy = {
  enhancePrompt(provider: AIProviderType, shortPrompt: string, apiKey?: string): Promise<string> {
    return callServerProvider<string>({ provider, action: 'enhancePrompt', shortPrompt, apiKey });
  },

  generateImage(params: {
    provider: AIProviderType;
    images: ImageInput[];
    prompt: string;
    resolution?: string;
    aspectRatio?: string;
    useGrounding?: boolean;
    apiKey?: string;
  }): Promise<GenerateImageResult> {
    return callServerProvider<GenerateImageResult>({ action: 'generateImage', ...params });
  },

  generate3PromptVariants(prompt: string, apiKey?: string): Promise<Array<{ variant: string; approach: string; prompt: string }>> {
    return callServerProvider<Array<{ variant: string; approach: string; prompt: string }>>({
      provider: AIProviderType.GEMINI,
      action: 'generate3PromptVariants',
      prompt,
      apiKey,
    });
  },

  analyzeImageForJson(imageDataUrl: string, apiKey?: string): Promise<string> {
    return callServerProvider<string>({
      provider: AIProviderType.GEMINI,
      action: 'analyzeImageForJson',
      imageDataUrl,
      apiKey,
    });
  },

  analyzeStyleTransfer(
    referenceDataUrl: string,
    styleDataUrl: string,
    apiKey?: string,
    options?: { agenticVision?: boolean; mediaResolution?: string }
  ): Promise<{ recommendedStrength: number; styleDescription: string; negativePrompt: string }> {
    return callServerProvider<{ recommendedStrength: number; styleDescription: string; negativePrompt: string }>({
      provider: AIProviderType.GEMINI,
      action: 'analyzeStyleTransfer',
      referenceDataUrl,
      styleDataUrl,
      apiKey,
      options,
    });
  },
};
