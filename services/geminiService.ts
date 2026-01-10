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
   * Generate 3 sophisticated prompt variants from a simple prompt
   * Each variant uses a different approach while maintaining the same core content
   */
  async generate3PromptVariants(simplePrompt: string): Promise<Array<{ variant: string; approach: string; prompt: string }>> {
    try {
      const systemInstruction = `Jsi expert na vytváření AI promptů pro generování obrázků.

Tvůj úkol: Vezmi jednoduchý prompt a vytvoř 3 RŮZNÉ sofistikované verze.

## KRITICKÉ: FORMÁT VÝSTUPU
Vypiš POUZE validní JSON pole s touto strukturou:
[
  {
    "variant": "Fotorealistický",
    "approach": "Profesionální fotografický styl",
    "prompt": "detailní fotografický prompt v češtině..."
  },
  {
    "variant": "Umělecký",
    "approach": "Umělecké a kompoziční zaměření",  
    "prompt": "umělecký prompt v češtině..."
  },
  {
    "variant": "Technický",
    "approach": "Technická kvalita a rendering",
    "prompt": "technicky detailní prompt v češtině..."
  }
]

## PRAVIDLA PRO VARIANTY

Varianta 1 - FOTOREALISTICKÝ:
- Přidej detaily fotoaparátu (ohnisková vzdálenost, clona, ISO)
- Specifikuj osvětlení (zlatá hodina, studio, přirozené světlo)
- Zahrň fotografická kompoziční pravidla
- Přidej reference na kamery/filmy
- Použij profesionální fotografickou terminologii
- PROMPT PIŠ V ČEŠTINĚ

Varianta 2 - UMĚLECKÝ:
- Specifikuj umělecké médium (olejomalba, akvarel, konceptuální umění, ilustrace)
- Definuj kompozici a rámování
- Přidej náladu a atmosféru
- Zahrň barevnou paletu a estetický styl
- Reference na umělecké směry (impresionismus, surrealismus, atd.)
- PROMPT PIŠ V ČEŠTINĚ

Varianta 3 - TECHNICKÝ:
- Zaměř se na kvalitu renderu (4K, 8K, vysoce detailní, ostrý zaostření)
- Přidej technické specifikace
- Zahrň popisovače úrovně detailů
- Specifikuj náznaky renderovacího enginu (Unreal Engine, Octane, atd.)
- Použij profesionální CGI/VFX terminologii
- PROMPT PIŠ V ČEŠTINĚ

## PRAVIDLA
1. Všechny 3 varianty MUSÍ mít stejný hlavní obsah/předmět
2. Každá varianta používá ODLIŠNÝ přístup
3. Buď specifický a detailní (100-200 slov každý)
4. Zachovej původní záměr
5. VŠECHNY PROMPTY V ČEŠTINĚ
6. ŽÁDNÁ vysvětlení, ŽÁDNÝ markdown, POUZE JSON pole

## PŘÍKLAD

Jednoduchý prompt: "kočka sedící na okenním parapetu"

Výstup:
[
  {
    "variant": "Fotorealistický",
    "approach": "Profesionální fotografie",
    "prompt": "Nadýchaná oranžová pruhovaná kočka graciézně sedící na dřevěném parapetu osvětleném sluncem, zachycená fotoaparátem Canon EOS R5 s objektivem 85mm f/1.4 vytvářejícím malou hloubku ostrosti při f/2.0. Měkké ranní sluneční světlo pronikající skrz krajkové záclony vytváří jemné obrysové osvětlení na kočičí srsti. Snímek z úrovně očí kočky, rozostřené pozadí pokojových rostlin. Profesionální fotografování domácích mazlíčků, teplá teplota barev 5500K, vysoce detailní textura srsti, fotorealistické, rozlišení 8K, oceněná kompozice."
  },
  {
    "variant": "Umělecký",
    "approach": "Impresionistický malířský styl",
    "prompt": "Elegantní zrzavá kočka posazená na ošuntělém okenním parapetu, vykreslená v měkkém impresionistickém malířském stylu připomínajícím Pierra Bonnarda. Volné tahy štětcem zachycují skvrnitě rozptýlené sluneční světlo tančící po kočičí srsti. Teplá zlatá a jantarová barevná paleta s nádechem krémové a pálené sieny. Snová atmosféra s jemnými stíny, umělecká kompozice podle pravidla třetin. Olejomalba na plátně, romantická a klidná nálada, intimní domácí scéna, viditelné tahy štětcem, malířská kvalita."
  },
  {
    "variant": "Technický",
    "approach": "Vysoce věrný 3D render",
    "prompt": "Fotorealistický 3D render oranžové pruhované kočky sedící na dřevěném okenním parapetu, vytvořený v Unreal Engine 5 s povoleným ray tracingem. Vysoce detailní simulace srsti s viditelnými jednotlivými chlupy pomocí XGen, fyzikálně přesné osvětlení pomocí HDRI environment mapy. Rozlišení 4K, ostření po celé ploše, subsurface scattering na uších prosvítlých světlem z okna. Hyperrealistické materiály na texturách dřevěných žil a látek, kvalita octane renderu, profesionální úroveň detailů archviz, path-traced globální osvětlení."
  }
]

## CHECKLIST PŘED VÝSTUPEM
✓ Všechny 3 varianty mají stejný hlavní předmět
✓ Každá varianta používá odlišnou terminologii (foto/umění/tech)
✓ Každý prompt je 100-200 slov
✓ Výstup je validní JSON pole
✓ Žádné markdown bloky kódu
✓ Žádná vysvětlení
✓ VŠECHNY PROMPTY V ČEŠTINĚ

Uživatelův jednoduchý prompt: "${simplePrompt}"

VYPIŠ POUZE JSON POLE:`;

      console.log('[Gemini 3 Variants] Generating variants for:', simplePrompt);

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
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
