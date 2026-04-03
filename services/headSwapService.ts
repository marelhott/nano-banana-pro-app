import type { HeadSwapHairSource, HeadSwapSettings, HeadSwapGender, ProviderSettings } from './aiProvider';
import { AIProviderType } from './aiProvider';
import { fetchAsDataUrl } from '../utils/fetchUtils';
import { runReplicatePrediction } from './replicateService';
import { runFalModelQueued } from './falService';

const REPLICATE_EASEL_MODEL = 'easel/advanced-face-swap';
const FAL_EASEL_ENDPOINT = 'easel-ai/advanced-face-swap';

type SelfHostedFallbackId = 'facefusion' | 'reface';

export type HeadSwapMode = 'face' | 'head';

export interface HeadSwapRequest {
  sourceImage: string;
  targetImage: string;
  mode?: HeadSwapMode;
  hairSource?: HeadSwapHairSource;
  sourceGender?: HeadSwapGender;
  secondarySourceImage?: string;
  secondarySourceGender?: HeadSwapGender;
  useUpscale?: boolean;
  useDetailer?: boolean;
  timeoutMs?: number;
}

export interface HeadSwapResult {
  imageBase64: string;
  provider: 'fal-easel' | 'replicate-easel' | SelfHostedFallbackId;
  attemptedProviders: Array<'fal-easel' | 'replicate-easel' | SelfHostedFallbackId>;
}

type SelfHostedFallbackRequest = {
  sourceImage: string;
  targetImage: string;
  mode: HeadSwapMode;
  hairSource: HeadSwapHairSource;
  sourceGender: HeadSwapGender;
  secondarySourceImage?: string;
  secondarySourceGender: HeadSwapGender;
};

function getDefaultHeadSwapSettings(settings: ProviderSettings): HeadSwapSettings {
  return {
    preferredPrimary: 'fal-easel',
    hairSource: 'target',
    sourceGender: 'default',
    secondarySourceGender: 'default',
    useUpscale: true,
    useDetailer: false,
    facefusionEndpoint: '',
    refaceEndpoint: '',
    ...(settings.headSwap || {}),
  };
}

function normalizeEndpoint(value?: string): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

async function normalizeImageOutput(value: unknown, errorMessage: string): Promise<string> {
  if (typeof value === 'string' && value.startsWith('data:')) {
    return value;
  }

  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    return fetchAsDataUrl(value, { errorMessage });
  }

  throw new Error(errorMessage);
}

async function runReplicateEaselHeadSwap(params: {
  token: string;
  request: HeadSwapRequest;
  settings: HeadSwapSettings;
}): Promise<string> {
  const hairSource = params.request.hairSource || params.settings.hairSource;
  const sourceGender = params.request.sourceGender || params.settings.sourceGender;
  const secondarySourceGender = params.request.secondarySourceGender || params.settings.secondarySourceGender;
  const useUpscale = params.request.useUpscale ?? params.settings.useUpscale;
  const useDetailer = params.request.useDetailer ?? params.settings.useDetailer;

  const prediction = await runReplicatePrediction({
    token: params.token,
    model: REPLICATE_EASEL_MODEL,
    input: {
      target_image: params.request.targetImage,
      swap_image: params.request.sourceImage,
      swap_image_b: params.request.secondarySourceImage || undefined,
      // Replicate versions have used `user_desc*`; keep legacy aliases too for compatibility.
      user_desc: sourceGender === 'default' ? undefined : sourceGender,
      user_desc_b: secondarySourceGender === 'default' ? undefined : secondarySourceGender,
      user_gender: sourceGender === 'default' ? undefined : sourceGender,
      user_b_gender: secondarySourceGender === 'default' ? undefined : secondarySourceGender,
      hair_source: hairSource,
      upscale: useUpscale,
      detailer: useDetailer,
    },
    timeoutMs: params.request.timeoutMs ?? 180_000,
  });

  if (prediction.status !== 'succeeded') {
    throw new Error(prediction.error || 'Replicate head swap selhal.');
  }

  const output = prediction.output;
  const imageUrl = Array.isArray(output) ? output[0] : output;
  return normalizeImageOutput(imageUrl, 'Replicate Easel nevrátil validní výstupní obrázek.');
}

async function runFalEaselHeadSwap(params: {
  request: HeadSwapRequest;
  settings: HeadSwapSettings;
}): Promise<string> {
  const hairSource = params.request.hairSource || params.settings.hairSource;
  const sourceGender = params.request.sourceGender || params.settings.sourceGender;
  const secondarySourceGender = params.request.secondarySourceGender || params.settings.secondarySourceGender;
  const useUpscale = params.request.useUpscale ?? params.settings.useUpscale;
  const useDetailer = params.request.useDetailer ?? params.settings.useDetailer;

  const result = await runFalModelQueued({
    endpointId: FAL_EASEL_ENDPOINT,
    input: {
      target_image_url: params.request.targetImage,
      swap_image_url: params.request.sourceImage,
      swap_image_b_url: params.request.secondarySourceImage || undefined,
      user_desc: sourceGender === 'default' ? undefined : sourceGender,
      user_desc_b: secondarySourceGender === 'default' ? undefined : secondarySourceGender,
      hair_source: hairSource,
      upscale: useUpscale,
      detailer: useDetailer,
    },
    maxWaitMs: params.request.timeoutMs ?? 180_000,
  });

  const image = result.images[0];
  if (!image) {
    throw new Error('fal Easel nevrátil žádný výstupní obrázek.');
  }

  return image;
}

async function runSelfHostedFallback(params: {
  endpoint: string;
  provider: SelfHostedFallbackId;
  request: SelfHostedFallbackRequest;
}): Promise<string> {
  const response = await fetch(params.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params.request),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.error || payload?.message || response.statusText || `HTTP ${response.status}`;
    throw new Error(`${params.provider} fallback selhal: ${detail}`);
  }

  const output =
    payload?.imageBase64 ||
    payload?.image ||
    payload?.output ||
    payload?.result?.imageBase64 ||
    payload?.result?.image ||
    payload?.result?.output;

  return normalizeImageOutput(output, `${params.provider} fallback nevrátil validní výstupní obrázek.`);
}

export async function runHeadSwap(params: {
  request: HeadSwapRequest;
  settings: ProviderSettings;
}): Promise<HeadSwapResult> {
  const headSwapSettings = getDefaultHeadSwapSettings(params.settings);
  const attemptedProviders: HeadSwapResult['attemptedProviders'] = [];
  const failureMessages: string[] = [];
  const mode = params.request.mode || 'head';
  const fallbackRequest: SelfHostedFallbackRequest = {
    sourceImage: params.request.sourceImage,
    targetImage: params.request.targetImage,
    mode,
    hairSource: params.request.hairSource || headSwapSettings.hairSource,
    sourceGender: params.request.sourceGender || headSwapSettings.sourceGender,
    secondarySourceImage: params.request.secondarySourceImage,
    secondarySourceGender: params.request.secondarySourceGender || headSwapSettings.secondarySourceGender,
  };

  const falKey = String(params.settings.fal?.apiKey || '').trim();
  const replicateToken = String(params.settings[AIProviderType.REPLICATE]?.apiKey || '').trim();

  if (headSwapSettings.preferredPrimary === 'fal-easel' && falKey) {
    attemptedProviders.push('fal-easel');
    try {
      const imageBase64 = await runFalEaselHeadSwap({
        request: params.request,
        settings: headSwapSettings,
      });
      return {
        imageBase64,
        provider: 'fal-easel',
        attemptedProviders,
      };
    } catch (error: any) {
      failureMessages.push(`fal Easel: ${error?.message || 'neznámá chyba'}`);
      console.warn('[HeadSwap] fal Easel failed, trying fallbacks:', error);
    }
  }

  if (replicateToken) {
    attemptedProviders.push('replicate-easel');
    try {
      const imageBase64 = await runReplicateEaselHeadSwap({
        token: replicateToken,
        request: params.request,
        settings: headSwapSettings,
      });
      return {
        imageBase64,
        provider: 'replicate-easel',
        attemptedProviders,
      };
    } catch (error: any) {
      failureMessages.push(`Replicate Easel: ${error?.message || 'neznámá chyba'}`);
      console.warn('[HeadSwap] Replicate Easel failed, trying fallbacks:', error);
    }
  }

  const facefusionEndpoint = normalizeEndpoint(headSwapSettings.facefusionEndpoint);
  if (facefusionEndpoint) {
    attemptedProviders.push('facefusion');
    try {
      const imageBase64 = await runSelfHostedFallback({
        endpoint: facefusionEndpoint,
        provider: 'facefusion',
        request: fallbackRequest,
      });
      return {
        imageBase64,
        provider: 'facefusion',
        attemptedProviders,
      };
    } catch (error: any) {
      failureMessages.push(`FaceFusion: ${error?.message || 'neznámá chyba'}`);
      console.warn('[HeadSwap] FaceFusion fallback failed:', error);
    }
  }

  const refaceEndpoint = normalizeEndpoint(headSwapSettings.refaceEndpoint);
  if (refaceEndpoint) {
    attemptedProviders.push('reface');
    try {
      const imageBase64 = await runSelfHostedFallback({
        endpoint: refaceEndpoint,
        provider: 'reface',
        request: fallbackRequest,
      });
      return {
        imageBase64,
        provider: 'reface',
        attemptedProviders,
      };
    } catch (error: any) {
      failureMessages.push(`REFace: ${error?.message || 'neznámá chyba'}`);
      console.warn('[HeadSwap] REFace fallback failed:', error);
    }
  }

  if (!falKey && !replicateToken && !facefusionEndpoint && !refaceEndpoint) {
    throw new Error('Head swap není nakonfigurovaný. Přidej fal.ai nebo Replicate API klíč, případně self-hosted fallback endpoint.');
  }

  const detail = failureMessages.filter(Boolean).join(' | ');
  throw new Error(detail ? `Head swap selhal. ${detail}` : 'Head swap selhal na všech dostupných providerech.');
}
