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
      const enhancementInstruction = `Jsi profesionální prompt engineer. Vezmi následující krátký prompt pro generování obrázků a rozšiř ho do detailního, živého popisu, který vytvoří lepší AI-generované obrázky.

Přidej konkrétní detaily o:
- Vizuálním stylu a estetice
- Osvětlení a atmosféře
- Barvách a texturách
- Kompozici a perspektivě
- Deskriptorech kvality (vysoce detailní, profesionální, atd.)

Zachovej hlavní nápad, ale udělej ho popisnějším a konkrétnějším. Vrať POUZE vylepšený prompt v češtině, nic jiného.

Krátký prompt: "${shortPrompt}"

Vylepšený prompt:`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
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
   * Generate 3 sophisticated prompt variants from a simple prompt
   * Each variant uses a different approach while maintaining the same core content
   */
  async generate3PromptVariants(simplePrompt: string): Promise<Array<{ variant: string; approach: string; prompt: string }>> {
    try {
      const systemInstruction = `Jsi expert na vytváření variant promptů pro AI generování obrázů.

ÚKOL: Vezmi základní prompt a vytvoř 3 VARIACE s různými přístupy.

## KRITICKÉ PRAVIDLO
✓ Všechny 3 varianty musí vycházet ze STEJNÉHO základního tématu
✓ Každá varianta mění PERSPEKTIVU, NÁLADU nebo DETAIL
✓ Změny musí být MALÉ ale znatelné
✓ Zachovej původní záměr

## FORMÁT VÝSTUPU
[
  {"variant": "Variace 1", "approach": "popis změny", "prompt": "..."},
  {"variant": "Variace 2", "approach": "popis změny", "prompt": "..."},
  {"variant": "Variace 3", "approach": "popis změny", "prompt": "..."}
]

## PŘÍKLAD
Vstup: "pes běžící v parku"
[
  {"variant": "Variace 1", "approach": "Detail v pohybu", "prompt": "Zlatý retrívr běžící po zelené trávě, zachycený z nízkého úhlu při rychlém běhu, kapky vody odlétající ze srsti"},
  {"variant": "Variace 2", "approach": "Široký záběr", "prompt": "Pes běžící kolem rybníka v klidném parku za slunečného dne, okolní lidé se procházejí po cestičkách"},
  {"variant": "Variace 3", "approach": "Dramatické osvětlení", "prompt": "Pes běžící parkem při západu slunce, dramatické oranžové nebe, silueta psa zvýrazněná proti světlu"}
]

Uživatelův prompt: "${simplePrompt}"

VYPIŠ POUZE JSON POLE:`;

      console.log('[Gemini 3 Variants] Generating variants for:', simplePrompt);

      const response = await this.ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: systemInstruction }],
        },
        config: {
          temperature: 0.7, // Balanced creativity
          maxOutputTokens: 4096, // Enough for 3 detailed prompts
        },
      });

      let jsonText = response.text?.trim() || '';

      // Clean markdown if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      console.log('[Gemini 3 Variants] Raw response:', jsonText.substring(0, 200) + '...');

      // Parse JSON
      const variants = JSON.parse(jsonText);

      // Validate structure
      if (!Array.isArray(variants) || variants.length !== 3) {
        throw new Error('Invalid response: expected array of 3 variants');
      }

      for (const v of variants) {
        if (!v.variant || !v.approach || !v.prompt) {
          throw new Error('Invalid variant structure: missing required fields');
        }
      }

      console.log('[Gemini 3 Variants] Successfully generated variants:', variants.map(v => v.variant).join(', '));

      return variants;
    } catch (error: any) {
      console.error('[Gemini 3 Variants] Error:', error);

      // Fallback: return simple variants in Czech
      console.log('[Gemini 3 Variants] Using fallback variants (Czech)');
      return [
        {
          variant: 'Fotorealistický',
          approach: 'Profesionální fotografie',
          prompt: `${simplePrompt}, profesionální fotografie, vysoce detailní, rozlišení 8K, fotorealistické`
        },
        {
          variant: 'Umělecký',
          approach: 'Umělecké ztvárnění',
          prompt: `${simplePrompt}, umělecký malířský styl, živé barvy, krásná kompozice`
        },
        {
          variant: 'Technický',
          approach: 'Technická kvalita',
          prompt: `${simplePrompt}, ultra detailní, rozlišení 4K, ostré zaostření, profesionální kvalita renderu`
        }
      ];
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
        model: 'gemini-3-pro-image-preview',
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

  async generateVideo(
    images: ImageInput[],
    prompt: string,
    duration: number = 8
  ): Promise<GenerateVideoResult> {
    try {
      console.log('[Gemini Veo] Generating video...');
      console.log('[Gemini Veo] Prompt:', prompt, 'Duration:', duration, 'Images:', images.length);

      const parts: any[] = [];

      // Add images if provided (image-to-video mode)
      if (images.length > 0) {
        console.log('[Gemini Veo] Using image-to-video mode');
        for (const image of images) {
          const base64Data = image.data.split(',')[1];
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: image.mimeType
            }
          });
        }
      }

      // Add text prompt
      parts.push({ text: prompt });

      // Call Veo API 
      const response = await this.ai.models.generateContent({
        model: 'veo-3.1-generate-001',
        contents: { parts },
        config: {
          videoDuration: `${duration}s`,
          aspectRatio: '16:9'
        } as any
      });

      console.log('[Gemini Veo] Response received');

      // Extract video URL
      const videoUrl = (response as any).videoUrl ||
        (response as any).candidates?.[0]?.content?.parts?.[0]?.videoUrl;

      if (!videoUrl) {
        console.error('[Gemini Veo] No video URL in response');
        throw new Error('No video URL returned from Veo API');
      }

      console.log('[Gemini Veo] Video generated:', videoUrl);

      return {
        videoUrl: videoUrl,
        duration: duration
      };
    } catch (error: any) {
      console.error('[Gemini Veo] Error:', error);
      throw new Error(`Failed to generate video: ${error.message}`);
    }
  }

  async generateImage(
    images: ImageInput[],
    prompt: string,
    resolution: string = '1024x1024',
    aspectRatio: string = '1:1',
    useGrounding: boolean = false
  ): Promise<GenerateImageResult> {
    try {
      console.log('[Gemini] Generating image with prompt:', prompt);

      const parts: any[] = [];

      // Add all image parts
      images.forEach((img) => {
        const base64Data = img.data.split(',')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: img.mimeType
          }
        });
      });

      // Add text prompt
      parts.push({ text: prompt });

      // Config logic
      const config: any = {
        responseModalities: ["IMAGE"],
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

      // Add image config if needed
      const imageConfig: any = {};
      if (aspectRatio && aspectRatio !== 'Original') {
        // rough map or pass directly
        imageConfig.aspectRatio = aspectRatio;
      }
      if (Object.keys(imageConfig).length > 0) {
        config.imageConfig = imageConfig;
      }

      // STRICTLY REQUESTED MODEL
      const modelName = 'gemini-3-pro-image-preview';
      console.log('[Gemini] Requesting model:', modelName);

      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: {
          parts: parts,
        },
        config: config,
      });

      console.log('[Gemini] Response received');

      // The response structure for multimodal models returning images can vary.
      // We check for inline data in the candidates.
      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;

      if (finishReason === 'SAFETY') {
        throw new Error('Generování zablokováno bezpečnostním filtrem (Safety).');
      }

      // Attempt to find image part
      const generatedPart = candidate?.content?.parts?.find((p: any) => p.inlineData);

      if (generatedPart?.inlineData?.data) {
        const imageBytes = generatedPart.inlineData.data;
        return {
          imageBase64: `data:image/jpeg;base64,${imageBytes}`,
          images: [{ url: `data:image/jpeg;base64,${imageBytes}` }]
        };
      }

      // Fallback: check executable code or other outputs if model differs
      throw new Error("Model nevrátil žádná data obrázku. Zkuste upravit prompt.");

    } catch (error: any) {
      console.error('[Gemini] Image generation error:', error);
      throw error;
    }
  }

  // Legacy function - uses default provider or creates new one
  // Helper to get API key from storage if not provided
  const getStoredApiKey = () => {
    try {
      const settings = localStorage.getItem('providerSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        return parsed.GEMINI?.apiKey || '';
      }
    } catch (e) {
      return '';
    }
    return '';
  };

  export const enhancePromptWithAI = async (shortPrompt: string, apiKey?: string): Promise<string> => {
    const keyToUse = apiKey || getStoredApiKey() || process.env.API_KEY || '';

    if (!keyToUse) {
      throw new Error('API Key missing. Please configure it in settings.');
    }

    // Always create a fresh provider to ensure correct key usage
    const tempProvider = new GeminiProvider(keyToUse);
    return tempProvider.enhancePrompt(shortPrompt);
  };

let defaultProvider: GeminiProvider | null = null;

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
