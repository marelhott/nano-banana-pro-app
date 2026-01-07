import {
    AIProvider,
    AIProviderType,
    ImageInput,
    GenerateImageResult
} from './aiProvider';

/**
 * Grok AI Provider Implementation
 * Uses xAI's Grok API for image generation
 * Note: Grok API may have different capabilities than Gemini
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
                    model: 'grok-beta',
                    messages: [{
                        role: 'user',
                        content: `You are a professional prompt engineer. Take the following short image generation prompt and expand it into a detailed, vivid description. Add specific details about visual style, lighting, colors, textures, and composition. Return ONLY the enhanced prompt.\n\nShort prompt: "${shortPrompt}"\n\nEnhanced prompt:`
                    }],
                    temperature: 0.7
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
            console.log('[Grok] Generating image with Grok API...');

            // Note: Grok's image generation API may be different
            // This is a placeholder implementation that needs to be updated
            // based on actual Grok image generation API documentation

            // For now, we'll use Grok to enhance the prompt and indicate limitation
            console.warn('[Grok] Direct image generation API not yet implemented. Using text completion only.');

            throw new Error('Grok image generation is not yet available. Please use Gemini or ChatGPT for image generation.');
        } catch (error: any) {
            console.error('[Grok] API Error:', error);
            if (error instanceof Error) {
                throw new Error(`Failed to generate image with Grok: ${error.message}`);
            }
            throw new Error('An unexpected error occurred while communicating with Grok AI.');
        }
    }
}
