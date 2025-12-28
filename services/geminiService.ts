
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
 * Edits or transforms images based on a text prompt using Gemini.
 * Supports multiple reference images.
 */
export const editImageWithGemini = async (
  images: ImageInput[],
  prompt: string,
  resolution?: string,
  aspectRatio?: string,
  useGrounding: boolean = false
): Promise<GenerateImageResult> => {
  try {
    // Get API key from AI Studio environment or environment variable
    // @ts-ignore
    const apiKey = typeof window !== 'undefined' && window.aistudio?.getSelectedApiKey
      // @ts-ignore
      ? await window.aistudio.getSelectedApiKey()
      : process.env.API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("API_KEY_NOT_FOUND");
    }

    // Create instance inside function to use the most up-to-date API key
    const ai = new GoogleGenAI({ apiKey });
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

    // Logování před odesláním requestu
    const modelName = 'gemini-exp-1206';
    console.log('Sending request to Gemini:', {
      model: modelName,
      numberOfImages: images.length,
      promptLength: prompt.length,
      resolution,
      aspectRatio,
      config,
      firstImageSize: images[0]?.data?.length || 0,
    });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: parts,
      },
      config: config,
    });

    // Detailní logování odpovědi pro debugging
    console.log('Gemini API Response:', {
      hasCandidates: !!response.candidates,
      candidatesLength: response.candidates?.length,
      firstCandidate: response.candidates?.[0],
      promptFeedback: response.promptFeedback,
      fullResponse: response,
    });

    // Kontrola, zda je odpověď blokovaná
    if (response.promptFeedback?.blockReason) {
      const blockReasonDetail = response.promptFeedback.blockReasonMessage ||
                                JSON.stringify(response.promptFeedback);
      console.error('Request blocked:', {
        blockReason: response.promptFeedback.blockReason,
        blockReasonMessage: response.promptFeedback.blockReasonMessage,
        safetyRatings: response.promptFeedback.safetyRatings,
        fullPromptFeedback: response.promptFeedback,
      });
      throw new Error(`Request blocked: ${response.promptFeedback.blockReason}. Details: ${blockReasonDetail}`);
    }

    const generatedPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    if (generatedPart && generatedPart.inlineData && generatedPart.inlineData.data) {
      const imageBytes = generatedPart.inlineData.data;
      return {
        imageBase64: `data:image/jpeg;base64,${imageBytes}`,
        groundingMetadata
      };
    } else {
      // Detailnější chybová hláška
      const finishReason = response.candidates?.[0]?.finishReason;
      console.error('No image data in response. Finish reason:', finishReason);
      throw new Error(`No image data returned from the model. Reason: ${finishReason || 'unknown'}`);
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
