import {
    AIProvider,
    AIProviderType,
    ImageInput,
    GenerateImageResult
} from './aiProvider';
import { serverProviderProxy } from './serverProviderProxy';

/**
 * Grok AI Provider Implementation
 * Uses xAI's Grok API for image generation
 */
export class GrokProvider implements AIProvider {
    private apiKey: string;
    private baseUrl = 'https://api.x.ai/v1';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    getName(): string {
        return 'Grok (xAI)';
    }

    getType(): AIProviderType {
        return AIProviderType.GROK;
    }

    async enhancePrompt(shortPrompt: string): Promise<string> {
        if (!this.apiKey.trim()) {
            return serverProviderProxy.enhancePrompt(AIProviderType.GROK, shortPrompt);
        }

        try {
            const enhancedPrompt = await this.callEnhancePromptWithFallback(shortPrompt);

            console.log('[Grok] Original prompt:', shortPrompt);
            console.log('[Grok] Enhanced prompt:', enhancedPrompt);

            return enhancedPrompt;
        } catch (error: any) {
            console.error('[Grok] Prompt enhancement error:', error);
            return shortPrompt;
        }
    }

    private async callEnhancePromptWithFallback(shortPrompt: string): Promise<string> {
        const models = ['grok-4', 'grok-4-fast', 'grok-4-fast-non-reasoning', 'grok-3-mini-fast', 'grok-3-mini', 'grok-2-1212'];
        let lastError = 'Grok API error';

        for (const model of models) {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [{
                        role: 'user',
                        content: `You are a professional prompt engineer. Take the following short image generation prompt and expand it into a detailed, vivid description. Add specific details about visual style, lighting, colors, textures, and composition. Return ONLY the enhanced prompt.\n\nShort prompt: "${shortPrompt}"\n\nEnhanced prompt:`
                    }],
                    stream: false
                })
            });

            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                return data.choices?.[0]?.message?.content?.trim() || shortPrompt;
            }
            lastError = data?.error?.message || data?.message || response.statusText || lastError;
        }

        throw new Error(lastError);
    }

    async generateImage(
        images: ImageInput[],
        prompt: string,
        resolution?: string,
        aspectRatio?: string,
        useGrounding: boolean = false
    ): Promise<GenerateImageResult> {
        if (!this.apiKey.trim()) {
            return serverProviderProxy.generateImage({
                provider: AIProviderType.GROK,
                images,
                prompt,
                resolution,
                aspectRatio,
                useGrounding,
            });
        }

        try {
            console.log('[Grok] Generating image with grok-imagine-image...');

            // Grok uses a text-to-image endpoint
            const response = await fetch(`${this.baseUrl}/images/generations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'grok-imagine-image',
                    prompt,
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('[Grok] API Error Response:', errorData);
                throw new Error(`Grok API error: ${response.statusText}`);
            }

            const data = await response.json();

            const imageB64 = data.data?.[0]?.b64_json || data.data?.[0]?.b64;
            const imageUrl = data.data?.[0]?.url;

            if (!imageB64 && !imageUrl) {
                throw new Error('No image data returned from Grok API');
            }

            console.log('[Grok] Image generated successfully');

            return {
                imageBase64: imageB64 ? `data:image/png;base64,${imageB64}` : await this.fetchImageAsDataUrl(imageUrl)
            };
        } catch (error: any) {
            console.error('[Grok] API Error:', error);
            if (error instanceof Error) {
                throw new Error(`Failed to generate image with Grok: ${error.message}`);
            }
            throw new Error('An unexpected error occurred while communicating with Grok AI.');
        }
    }

    private async fetchImageAsDataUrl(url: string): Promise<string> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch Grok image: ${response.statusText}`);
        }

        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') resolve(reader.result);
                else reject(new Error('Failed to convert Grok image to data URL'));
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}
