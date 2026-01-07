import { GoogleGenAI, Modality } from "@google/genai";
import {
  AIProvider,
  AIProviderType,
  ImageInput,
  GenerateImageResult
} from './aiProvider';

/**
 * Gemini AI Provider Implementation
 * Uses Google's Gemini API for image generation and editing
 */
export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  getName(): string {
    return 'Gemini (Nano Banana Pro)';
  }

  getType(): AIProviderType {
    return AIProviderType.GEMINI;
  }

  async enhancePrompt(shortPrompt: string): Promise<string> {
    try {
      const enhancementInstruction = `You are a professional prompt engineer. Take the following short image generation prompt and expand it into a detailed, vivid description that will produce better AI-generated images.

Add specific details about:
- Visual style and aesthetics
- Lighting and atmosphere
- Colors and textures
- Composition and perspective
- Quality descriptors (highly detailed, professional, etc.)

Keep the core idea but make it more descriptive and specific. Return ONLY the enhanced prompt, nothing else.

Short prompt: "${shortPrompt}"

Enhanced prompt:`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: {
          parts: [{ text: enhancementInstruction }],
        },
      });

      const enhancedPrompt = response.text?.trim() || shortPrompt;

      console.log('[Gemini] Original prompt:', shortPrompt);
      console.log('[Gemini] Enhanced prompt:', enhancedPrompt);

      return enhancedPrompt;
    } catch (error: any) {
      console.error('[Gemini] Prompt enhancement error:', error);
      return shortPrompt;
    }
  }

  /**
   * Generate text using Gemini with optional system instruction
   * Used for JSON prompt enrichment
   */
  async generateText(prompt: string, systemInstruction?: string): Promise<string> {
    try {
      const config: any = {
        model: 'gemini-2.0-flash-exp',
        contents: {
          parts: [{ text: prompt }],
        },
      };

      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }

      const response = await this.ai.models.generateContent(config);
      return response.text?.trim() || '';
    } catch (error: any) {
      console.error('[Gemini] Text generation error:', error);
      throw error;
    }
  }

  /**
   * Analyze image using Gemini Vision and extract JSON prompt structure
   * Used for Reference Image Analysis (Phase 3)
   */
  async analyzeImageForJson(imageDataUrl: string): Promise<string> {
    try {
      const base64Data = imageDataUrl.split(',')[1];
      const mimeType = imageDataUrl.split(';')[0].split(':')[1];

      const systemInstruction = `You are an expert image analyst. Analyze this image and extract a detailed JSON structure describing it.

Use this exact structure:
{
  "subject": {
    "main": "primary subject description",
    "details": ["detail 1", "detail 2"],
    "pose_or_action": "what is happening"
  },
  "environment": {
    "location": "setting",
    "atmosphere": "mood",
    "time_of_day": "lighting time"
  },
  "lighting": {
    "type": "natural|studio|dramatic|ambient",
    "direction": "light source direction",
    "quality": "soft|hard|diffused",
    "color_temperature": "warm|cool|neutral"
  },
  "camera": {
    "angle": "eye_level|high_angle|low_angle|birds_eye",
    "focal_length": "estimate in mm (24mm, 35mm, 50mm, 85mm, or 200mm)",
    "depth_of_field": "shallow|deep",
    "composition": "composition rule"
  },
  "aesthetic": {
    "medium": "photograph|painting|illustration|3d_render",
    "style": "artistic style",
    "color_palette": "dominant colors",
    "mood": "overall feeling"
  },
  "technical": {
    "quality": "quality description",
    "resolution_hint": "detail level"
  }
}

Be specific and detailed. Output ONLY valid JSON, no markdown code blocks, no additional text.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            },
            {
              text: 'Analyze this image and provide a detailed JSON structure following the template provided.'
            }
          ]
        },
        config: {
          systemInstruction: systemInstruction
        }
      });

      let jsonText = response.text?.trim() || '';

      // Clean markdown if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Validate JSON
      JSON.parse(jsonText);

      console.log('[Gemini Vision] Analysis complete:', jsonText);
      return jsonText;
    } catch (error: any) {
      console.error('[Gemini Vision] Analysis error:', error);
      throw error;
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
      console.log('[Gemini] Generating image with API key:', this.apiKey.substring(0, 10) + '...');

      const parts: any[] = [];

      // Add all image parts
      images.forEach((img) => {
        const base64Data = img.data.split(',')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: img.mimeType,
          },
        });
      });

      // Add text prompt
      parts.push({
        text: prompt,
      });

      const config: any = {
        responseModalities: [Modality.IMAGE],
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_ONLY_HIGH'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_ONLY_HIGH'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_ONLY_HIGH'
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_ONLY_HIGH'
          }
        ]
      };

      if (useGrounding) {
        config.tools = [{ googleSearch: {} }];
      }

      const imageConfig: any = {};
      if (resolution) {
        imageConfig.imageSize = resolution;
      }
      if (aspectRatio && aspectRatio !== 'Original') {
        imageConfig.aspectRatio = aspectRatio;
      }

      if (Object.keys(imageConfig).length > 0) {
        config.imageConfig = imageConfig;
      }

      const modelName = 'gemini-3-pro-image-preview';
      console.log('[Gemini] Requesting model:', modelName, 'with config:', config);

      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: {
          parts: parts,
        },
        config: config,
      });

      console.log('[Gemini] API Response metadata:', {
        modelUsed: modelName,
        hasCandidates: !!response.candidates,
        candidateCount: response.candidates?.length,
        finishReason: response.candidates?.[0]?.finishReason,
        safetyRatings: response.candidates?.[0]?.safetyRatings,
      });

      const generatedPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

      if (generatedPart && generatedPart.inlineData && generatedPart.inlineData.data) {
        const imageBytes = generatedPart.inlineData.data;
        const imageSizeKB = Math.round(imageBytes.length * 0.75 / 1024);
        console.log(`[Gemini] Generated image size: ~${imageSizeKB} KB`);

        return {
          imageBase64: `data:image/jpeg;base64,${imageBytes}`,
          groundingMetadata
        };
      } else {
        throw new Error("No image data returned from the model.");
      }
    } catch (error: any) {
      console.error("[Gemini] API Error:", error);
      if (error?.message?.includes("Requested entity was not found")) {
        throw new Error("API_KEY_NOT_FOUND");
      }
      if (error instanceof Error) {
        throw new Error(`Failed to generate image: ${error.message}`);
      }
      throw new Error("An unexpected error occurred while communicating with Gemini AI.");
    }
  }
}

// Legacy function - uses default provider or creates new one
let defaultProvider: GeminiProvider | null = null;

export const enhancePromptWithAI = async (shortPrompt: string): Promise<string> => {
  if (!defaultProvider) {
    defaultProvider = new GeminiProvider(process.env.API_KEY || '');
  }
  return defaultProvider.enhancePrompt(shortPrompt);
};

export const editImageWithGemini = async (
  images: ImageInput[],
  prompt: string,
  resolution?: string,
  aspectRatio?: string,
  useGrounding: boolean = false
): Promise<GenerateImageResult> => {
  if (!defaultProvider) {
    defaultProvider = new GeminiProvider(process.env.API_KEY || '');
  }
  return defaultProvider.generateImage(images, prompt, resolution, aspectRatio, useGrounding);
};
