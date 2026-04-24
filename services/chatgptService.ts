import {
    AIProvider,
    AIProviderType,
    ImageInput,
    GenerateImageResult
} from './aiProvider';

/**
 * ChatGPT / OpenAI provider implementation
 * Uses OpenAI chat + image APIs for prompt enhancement and image generation/editing.
 */
export class ChatGPTProvider implements AIProvider {
    private static readonly PROMPT_MODEL = 'gpt-5.2-chat-latest';
    private static readonly IMAGE_MODELS = ['gpt-image-2', 'chatgpt-image-latest', 'gpt-image-1.5'] as const;
    private apiKey: string;
    private baseUrl = 'https://api.openai.com/v1';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    getName(): string {
        return 'ChatGPT (OpenAI)';
    }

    getType(): AIProviderType {
        return AIProviderType.CHATGPT;
    }

    private shouldFallbackToOlderImageModel(message: string): boolean {
        const normalized = message.toLowerCase();
        return (
            normalized.includes('must be verified') ||
            normalized.includes('organization must be verified') ||
            normalized.includes('model_not_found') ||
            normalized.includes('does not exist') ||
            normalized.includes('not available') ||
            normalized.includes('access') ||
            normalized.includes('permission') ||
            normalized.includes('unsupported_model')
        );
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
                    model: ChatGPTProvider.PROMPT_MODEL,
                    messages: [{
                        role: 'user',
                        content: `You are a professional prompt engineer. Take the following short image generation prompt and expand it into a detailed, vivid description that will produce better AI-generated images.

Add specific details about:
- Visual style and aesthetics
- Lighting and atmosphere
- Colors and textures
- Composition and perspective
- Quality descriptors (highly detailed, professional, etc.)

Keep the core idea but make it more descriptive and specific. Return ONLY the enhanced prompt, nothing else.

Short prompt: "${shortPrompt}"

Enhanced prompt:`
                    }],
                    temperature: 0.4,
                    max_tokens: 350
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.statusText}`);
            }

            const data = await response.json();
            const enhancedPrompt = data.choices?.[0]?.message?.content?.trim() || shortPrompt;

            console.log('[ChatGPT] Original prompt:', shortPrompt);
            console.log('[ChatGPT] Enhanced prompt:', enhancedPrompt);

            return enhancedPrompt;
        } catch (error: any) {
            console.error('[ChatGPT] Prompt enhancement error:', error);
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
            const mapSize = (): string => {
                if (aspectRatio === '9:16' || aspectRatio === '2:3' || aspectRatio === '4:5') return '1024x1536';
                if (aspectRatio === '16:9' || aspectRatio === '3:2' || aspectRatio === '5:4') return '1536x1024';
                return '1024x1024';
            };

            const size = mapSize();
            const hasInputImage = images.length > 0;
            const url = `${this.baseUrl}/images/${hasInputImage ? 'edits' : 'generations'}`;
            const first = images[0];

            for (let index = 0; index < ChatGPTProvider.IMAGE_MODELS.length; index++) {
                const imageModel = ChatGPTProvider.IMAGE_MODELS[index];
                const isLastModel = index === ChatGPTProvider.IMAGE_MODELS.length - 1;

                console.log('[ChatGPT] Generating image with OpenAI image model...', imageModel);

                const response = await fetch(url, hasInputImage
                    ? {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`
                        },
                        body: (() => {
                            const form = new FormData();
                            form.set('model', imageModel);
                            form.set('prompt', prompt);
                            form.set('n', '1');
                            form.set('size', size);
                            form.set('quality', 'high');

                            const [header, b64] = first.data.split(',');
                            const mime = first.mimeType || header.split(';')[0].split(':')[1] || 'image/png';
                            const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                            const blob = new Blob([bin], { type: mime });
                            form.set('image', blob, `input.${mime.split('/')[1] || 'png'}`);
                            return form;
                        })()
                    }
                    : {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiKey}`
                        },
                        body: JSON.stringify({
                            model: imageModel,
                            prompt,
                            n: 1,
                            size,
                            quality: 'high'
                        })
                    }
                );

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const message = errorData?.error?.message || response.statusText || 'Unknown OpenAI API error';
                    const shouldFallback = !isLastModel && this.shouldFallbackToOlderImageModel(message);
                    if (shouldFallback) {
                        console.warn(`[ChatGPT] Model ${imageModel} unavailable, falling back to ${ChatGPTProvider.IMAGE_MODELS[index + 1]}`, message);
                        continue;
                    }
                    throw new Error(`OpenAI API error: ${message}`);
                }

                const data = await response.json();
                const imageB64 = data.data?.[0]?.b64_json || data.data?.[0]?.b64;

                if (!imageB64) {
                    throw new Error('No image data returned from OpenAI image API');
                }

                console.log('[ChatGPT] Image generated successfully with model:', imageModel);

                return {
                    imageBase64: `data:image/png;base64,${imageB64}`,
                    groundingMetadata: undefined,
                    modelId: imageModel
                };
            }
            throw new Error('OpenAI image generation failed for all configured fallback models.');
        } catch (error: any) {
            console.error('[ChatGPT] API Error:', error);
            if (error instanceof Error) {
                throw new Error(`Failed to generate image with OpenAI: ${error.message}`);
            }
            throw new Error('An unexpected error occurred while communicating with OpenAI.');
        }
    }
}
