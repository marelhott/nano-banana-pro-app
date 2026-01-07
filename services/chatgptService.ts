import {
    AIProvider,
    AIProviderType,
    ImageInput,
    GenerateImageResult
} from './aiProvider';

/**
 * ChatGPT (DALL·E 3) Provider Implementation
 * Uses OpenAI's DALL·E 3 API for image generation
 */
export class ChatGPTProvider implements AIProvider {
    private apiKey: string;
    private baseUrl = 'https://api.openai.com/v1';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    getName(): string {
        return 'DALL·E 3 (OpenAI)';
    }

    getType(): AIProviderType {
        return AIProviderType.CHATGPT;
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
                    model: 'gpt-4',
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
                    temperature: 0.7,
                    max_tokens: 200
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
            console.log('[ChatGPT] Generating image with DALL·E 3...');

            // DALL·E 3 doesn't support image editing in the same way as Gemini
            // It generates from text prompts. If images are provided, we'll describe them first.
            let finalPrompt = prompt;

            if (images.length > 0) {
                // Use GPT-4 Vision to describe the input image first
                const firstImage = images[0];
                const visionResponse = await fetch(`${this.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4-vision-preview',
                        messages: [{
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: `Describe this image in detail, then apply this transformation: ${prompt}`
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: firstImage.data
                                    }
                                }
                            ]
                        }],
                        max_tokens: 300
                    })
                });

                if (visionResponse.ok) {
                    const visionData = await visionResponse.json();
                    finalPrompt = visionData.choices?.[0]?.message?.content || prompt;
                }
            }

            // Map resolution to DALL·E 3 sizes
            let size = '1024x1024'; // default
            if (resolution === '4K' || aspectRatio === '16:9') {
                size = '1792x1024';
            } else if (aspectRatio === '9:16') {
                size = '1024x1792';
            }

            // Generate image with DALL·E 3
            const response = await fetch(`${this.baseUrl}/images/generations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'dall-e-3',
                    prompt: finalPrompt,
                    n: 1,
                    size: size,
                    quality: 'hd',
                    response_format: 'b64_json'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const imageB64 = data.data?.[0]?.b64_json;

            if (!imageB64) {
                throw new Error('No image data returned from DALL·E 3');
            }

            console.log('[ChatGPT] Image generated successfully');

            return {
                imageBase64: `data:image/png;base64,${imageB64}`,
                groundingMetadata: undefined
            };
        } catch (error: any) {
            console.error('[ChatGPT] API Error:', error);
            if (error instanceof Error) {
                throw new Error(`Failed to generate image with DALL·E 3: ${error.message}`);
            }
            throw new Error('An unexpected error occurred while communicating with OpenAI.');
        }
    }
}
