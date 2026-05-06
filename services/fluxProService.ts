import { AIProvider, AIProviderType, ImageInput, GenerateImageResult } from './aiProvider';
import { runFalModelQueued } from './falService';

function mapAspectRatioToFal(aspectRatio?: string): string {
    if (!aspectRatio || aspectRatio === 'Original') return '1:1';
    if (aspectRatio === '1:1') return '1:1';
    if (aspectRatio === '16:9') return '16:9';
    if (aspectRatio === '9:16') return '9:16';
    if (aspectRatio === '4:3') return '4:3';
    if (aspectRatio === '3:4') return '3:4';
    if (aspectRatio === '3:2') return '3:2';
    if (aspectRatio === '2:3') return '2:3';
    if (aspectRatio === '5:4') return '5:4';
    if (aspectRatio === '4:5') return '4:5';
    if (aspectRatio === '21:9') return '21:9';
    return '1:1';
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
