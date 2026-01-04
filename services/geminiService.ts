
import { GoogleGenAI, Modality } from "@google/genai";

export interface ImageInput {
  data: string; // base64 string with data URI prefix
  mimeType: string;
}

export interface GenerateImageResult {
  imageBase64: string;
  groundingMetadata?: any;
}

/**
 * Vylepšit prompt pomocí AI
 * Vezme krátký prompt a rozšíří ho o detaily
 */
export const enhancePromptWithAI = async (shortPrompt: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: {
        parts: [{ text: enhancementInstruction }],
      },
    });

    const enhancedPrompt = response.text?.trim() || shortPrompt;

    console.log('Original prompt:', shortPrompt);
    console.log('Enhanced prompt:', enhancedPrompt);

    return enhancedPrompt;
  } catch (error: any) {
    console.error('Prompt enhancement error:', error);
    // V případě chyby vrátit původní prompt
    return shortPrompt;
  }
};

/**
 * Edits or transforms images based on a text prompt using Gemini.
 * DŮLEŽITÉ: První obrázek v poli images je obrázek k editaci.
 * Další obrázky (pokud jsou) slouží jako reference/kontext/inspirace pro úpravu.
 */
export const editImageWithGemini = async (
  images: ImageInput[],
  prompt: string,
  resolution?: string,
  aspectRatio?: string,
  useGrounding: boolean = false
): Promise<GenerateImageResult> => {
  try {
    // Create instance inside function to use the most up-to-date API key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Debug: Log API key prefix to verify which key is being used
    const keyPrefix = process.env.API_KEY?.substring(0, 10) || 'undefined';
    console.log('Using API key starting with:', keyPrefix);

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
      // Nastavení safety filters na méně restriktivní úroveň
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
    console.log('Requesting model:', modelName, 'with config:', config);

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: parts,
      },
      config: config,
    });

    // Debug: Log response metadata
    console.log('API Response metadata:', {
      modelUsed: modelName,
      hasCandidates: !!response.candidates,
      candidateCount: response.candidates?.length,
      finishReason: response.candidates?.[0]?.finishReason,
      safetyRatings: response.candidates?.[0]?.safetyRatings,
      citationMetadata: response.candidates?.[0]?.citationMetadata,
      usageMetadata: response.usageMetadata,
    });

    const generatedPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    if (generatedPart && generatedPart.inlineData && generatedPart.inlineData.data) {
      const imageBytes = generatedPart.inlineData.data;
      const imageSizeKB = Math.round(imageBytes.length * 0.75 / 1024); // Approximate KB from base64
      console.log(`Generated image size: ~${imageSizeKB} KB`);

      return {
        imageBase64: `data:image/jpeg;base64,${imageBytes}`,
        groundingMetadata
      };
    } else {
      throw new Error("No image data returned from the model.");
    }
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Handle the specific error case for missing API key/project
    if (error?.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_NOT_FOUND");
    }
    if (error instanceof Error) {
      throw new Error(`Failed to generate image: ${error.message}`);
    }
    throw new Error("An unexpected error occurred while communicating with the AI.");
  }
};
