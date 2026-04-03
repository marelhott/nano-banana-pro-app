import { AIProviderType } from '../services/aiProvider';

export type NanoBananaImageModel = 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview';

const GEMINI_FLASH_INTER_REQUEST_DELAY_MS = 250;
const GEMINI_PRO_INTER_REQUEST_DELAY_MS = 450;
const CHAT_PROVIDER_INTER_REQUEST_DELAY_MS = 200;
const DEFAULT_INTER_REQUEST_DELAY_MS = 150;
const GEMINI_RETRY_BASE_BACKOFF_MS = 12_000;
const DEFAULT_RETRY_BASE_BACKOFF_MS = 6_000;

export function getInterRequestDelayMs(
  provider: AIProviderType,
  imageModel: NanoBananaImageModel,
  imageIndex: number
): number {
  if (imageIndex <= 0) return 0;

  if (provider === AIProviderType.GEMINI) {
    return imageModel === 'gemini-3-pro-image-preview'
      ? GEMINI_PRO_INTER_REQUEST_DELAY_MS
      : GEMINI_FLASH_INTER_REQUEST_DELAY_MS;
  }

  if (provider === AIProviderType.CHATGPT || provider === AIProviderType.GROK) {
    return CHAT_PROVIDER_INTER_REQUEST_DELAY_MS;
  }

  return DEFAULT_INTER_REQUEST_DELAY_MS;
}

export function getRetryBackoffMs(provider: AIProviderType, retryCount: number): number {
  const baseDelay = provider === AIProviderType.GEMINI
    ? GEMINI_RETRY_BASE_BACKOFF_MS
    : DEFAULT_RETRY_BASE_BACKOFF_MS;

  return baseDelay * Math.pow(2, retryCount - 1);
}
