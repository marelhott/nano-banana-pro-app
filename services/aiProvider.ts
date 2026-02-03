/**
 * AI Provider Abstraction Layer
 * Unified interface for multiple AI image generation providers
 */

export enum AIProviderType {
    GEMINI = 'gemini',
    GROK = 'grok',
    CHATGPT = 'chatgpt',
    REPLICATE = 'replicate'
}

export interface ImageInput {
    data: string; // base64 string with data URI prefix
    mimeType: string;
}

export interface GenerateImageResult {
    imageBase64: string;
    groundingMetadata?: any;
}

export interface ProviderConfig {
    apiKey: string;
    enabled: boolean;
}

export interface ProviderSettings {
    [AIProviderType.GEMINI]?: ProviderConfig;
    [AIProviderType.GROK]?: ProviderConfig;
    [AIProviderType.CHATGPT]?: ProviderConfig;
    [AIProviderType.REPLICATE]?: ProviderConfig;
}

/**
 * Abstract interface that all AI providers must implement
 */
export interface AIProvider {
    /**
     * Generate or edit an image based on input images and text prompt
     * @param images - Array of input images (first is main image to edit)
     * @param prompt - Text description of desired changes
     * @param resolution - Target resolution (e.g., "1K", "2K", "4K")
     * @param aspectRatio - Target aspect ratio (e.g., "1:1", "16:9")
     * @param useGrounding - Whether to use grounding/search for better results
     * @returns Generated image as base64 with optional metadata
     */
    generateImage(
        images: ImageInput[],
        prompt: string,
        resolution?: string,
        aspectRatio?: string,
        useGrounding?: boolean
    ): Promise<GenerateImageResult>;

    /**
     * Enhance a short prompt into a more detailed description
     * @param shortPrompt - Brief description from user
     * @returns Enhanced, detailed prompt
     */
    enhancePrompt(shortPrompt: string): Promise<string>;

    /**
     * Get the provider's display name
     */
    getName(): string;

    /**
     * Get the provider's type
     */
    getType(): AIProviderType;
}

export interface ProviderMetadata {
    type: AIProviderType;
    name: string;
    icon: string; // Emoji or icon name
    requiresApiKey: boolean;
    supportsGrounding: boolean;
    maxImages: number;
}

export const PROVIDER_METADATA: Record<AIProviderType, ProviderMetadata> = {
    [AIProviderType.GEMINI]: {
        type: AIProviderType.GEMINI,
        name: 'Gemini (Nano Banana Pro)',
        icon: 'gemini',
        requiresApiKey: true,
        supportsGrounding: true,
        maxImages: 10
    },
    [AIProviderType.GROK]: {
        type: AIProviderType.GROK,
        name: 'Grok (xAI)',
        icon: 'grok',
        requiresApiKey: true,
        supportsGrounding: false,
        maxImages: 1
    },
    [AIProviderType.CHATGPT]: {
        type: AIProviderType.CHATGPT,
        name: 'ChatGPT (OpenAI)',
        icon: 'chatgpt',
        requiresApiKey: true,
        supportsGrounding: false,
        maxImages: 1
    },
    [AIProviderType.REPLICATE]: {
        type: AIProviderType.REPLICATE,
        name: 'FLUX (Replicate)',
        icon: 'replicate',
        requiresApiKey: true,
        supportsGrounding: false,
        maxImages: 2
    }
};
