import {
    AIProvider,
    AIProviderType,
    ImageInput,
    GenerateImageResult
} from './aiProvider';

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
        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'grok-4.1-fast',
                    messages: [{
                        role: 'user',
                        content: `You are a professional prompt engineer. Take the following short image generation prompt and expand it into a detailed, vivid description. Add specific details about visual style, lighting, colors, textures, and composition. Return ONLY the enhanced prompt.\n\nShort prompt: "${shortPrompt}"\n\nEnhanced prompt:`
                    }],
                    temperature: 0.4
                })
            });

            if (!response.ok) {
                throw new Error(`Grok API error: ${response.statusText}`);
            }

            const data = await response.json();
            const enhancedPrompt = data.choices?.[0]?.message?.content?.trim() || shortPrompt;

            console.log('[Grok] Original prompt:', shortPrompt);
            console.log('[Grok] Enhanced prompt:', enhancedPrompt);

            return enhancedPrompt;
        } catch (error: any) {
            console.error('[Grok] Prompt enhancement error:', error);
            return shortPrompt;
        }
    }

    async generateImage(
        images: ImageInput[],
        prompt: string,
        resolution?: string,
        aspectRatio?: string,
        useGrounding: boolean = false
    ): Promise<GenerateImageResult> {
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
                    n: 1, // Number of images (1-10 supported)
                    response_format: 'b64_json' // Get base64 directly
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('[Grok] API Error Response:', errorData);
                throw new Error(`Grok API error: ${response.statusText}`);
            }

            const data = await response.json();

            // Grok returns image in b64_json format
            const imageB64 = data.data?.[0]?.b64_json;

            if (!imageB64) {
                throw new Error('No image data returned from Grok API');
            }

            console.log('[Grok] Image generated successfully');

            return {
                imageBase64: `data:image/png;base64,${imageB64}`
            };
        } catch (error: any) {
            console.error('[Grok] API Error:', error);
            if (error instanceof Error) {
                throw new Error(`Failed to generate image with Grok: ${error.message}`);
            }
            throw new Error('An unexpected error occurred while communicating with Grok AI.');
        }
    }
}
