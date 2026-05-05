import { AIProvider, AIProviderType, ImageInput, GenerateImageResult } from './aiProvider';
import { runFalModelQueued } from './falService';

function mapAspectRatioToFal(aspectRatio?: string): string {
    if (!aspectRatio) return 'square_hd';
    if (aspectRatio === '1:1') return 'square_hd';
    if (aspectRatio === '16:9') return 'landscape_16_9';
    if (aspectRatio === '9:16') return 'portrait_16_9';
    if (aspectRatio === '4:3') return 'landscape_4_3';
    if (aspectRatio === '3:4') return 'portrait_4_3';
    if (aspectRatio === '3:2') return 'landscape_4_3';
    if (aspectRatio === '2:3') return 'portrait_4_3';
    if (aspectRatio === '5:4') return 'landscape_4_3';
    if (aspectRatio === '4:5') return 'portrait_4_3';
    return 'square_hd';
}

export class FluxProProvider implements AIProvider {
    constructor(private apiKey: string = '') {}

    getName(): string { return 'FLUX Pro 1.1 Ultra (fal.ai)'; }
    getType(): AIProviderType { return AIProviderType.FLUX_PRO; }

    async enhancePrompt(shortPrompt: string): Promise<string> {
        return shortPrompt;
    }

    async generateImage(
        images: ImageInput[],
        prompt: string,
        _resolution?: string,
        aspectRatio?: string,
    ): Promise<GenerateImageResult> {
        const input: Record<string, any> = {
            prompt,
            aspect_ratio: mapAspectRatioToFal(aspectRatio),
            output_format: 'jpeg',
            num_images: 1,
            safety_tolerance: 5,
            enable_safety_checker: false,
            raw: false,
        };

        // Pass first image as reference if available (img2img).
        if (images.length > 0 && images[0].data.startsWith('data:')) {
            input.image_url = images[0].data;
            input.image_prompt_strength = 0.1;
        }

        const result = await runFalModelQueued({
            endpointId: 'fal-ai/flux-pro/v1.1-ultra',
            input,
            apiKey: this.apiKey,
        });

        if (!result.images || result.images.length === 0) {
            throw new Error('FLUX Pro nevrátil žádné obrázky');
        }

        return {
            imageBase64: result.images[0],
            modelId: 'flux-pro-v1.1-ultra',
        };
    }
}
