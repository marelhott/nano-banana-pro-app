/**
 * JSON Prompting Utility
 * Converts simple text prompts into structured JSON for better image generation control
 */

const SYSTEM_INSTRUCTION = `You are a professional image prompt engineer. Convert the user's simple description into a detailed JSON structure for image generation.

Use this structure:
{
  "subject": {
    "main": "primary subject description",
    "details": ["specific detail 1", "detail 2"],
    "pose_or_action": "what subject is doing"
  },
  "environment": {
    "location": "setting description",
    "atmosphere": "mood and feeling",
    "time_of_day": "lighting period"
  },
  "lighting": {
    "type": "natural|studio|dramatic|ambient",
    "direction": "light source position",
    "quality": "soft|hard|diffused",
    "color_temperature": "warm|cool|neutral"
  },
  "camera": {
    "angle": "eye_level|high_angle|low_angle|birds_eye",
    "focal_length": "24mm|35mm|50mm|85mm|200mm",
    "depth_of_field": "shallow|deep",
    "composition": "rule of thirds|centered|etc"
  },
  "aesthetic": {
    "medium": "photograph|painting|illustration|3d_render",
    "style": "specific artistic style",
    "color_palette": "color description",
    "mood": "overall feeling"
  },
  "technical": {
    "quality": "high detail photorealistic",
    "resolution_hint": "8k ultra detailed"
  }
}

Be specific and detailed. If the user mentions specific details, preserve them exactly.
Output ONLY valid JSON, no markdown code blocks, no additional text.`;

export async function enrichPromptWithJSON(
    userPrompt: string,
    generateText: (prompt: string, systemInstruction: string) => Promise<string>
): Promise<string> {
    try {
        let jsonPrompt = await generateText(userPrompt, SYSTEM_INSTRUCTION);

        // Clean up markdown code blocks if present
        jsonPrompt = jsonPrompt.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Validate it's actual JSON
        JSON.parse(jsonPrompt);

        return jsonPrompt;
    } catch (error) {
        console.error('[JSON Mode] Enrichment failed:', error);
        throw error;
    }
}

export function formatJsonPromptForImage(jsonString: string): string {
    try {
        const json = JSON.parse(jsonString);
        const parts: string[] = [];

        // Subject
        if (json.subject) {
            if (json.subject.main) {
                parts.push(json.subject.main);
            }
            if (json.subject.details && json.subject.details.length > 0) {
                parts.push(json.subject.details.join(', '));
            }
            if (json.subject.pose_or_action) {
                parts.push(json.subject.pose_or_action);
            }
        }

        // Environment
        if (json.environment) {
            if (json.environment.location) {
                parts.push(`in ${json.environment.location}`);
            }
            if (json.environment.atmosphere) {
                parts.push(`${json.environment.atmosphere} atmosphere`);
            }
            if (json.environment.time_of_day) {
                parts.push(`${json.environment.time_of_day} lighting`);
            }
        }

        // Lighting details
        if (json.lighting) {
            const lightParts: string[] = [];
            if (json.lighting.type) lightParts.push(json.lighting.type);
            if (json.lighting.quality) lightParts.push(`${json.lighting.quality} light`);
            if (json.lighting.direction) lightParts.push(`from ${json.lighting.direction}`);
            if (json.lighting.color_temperature) lightParts.push(`${json.lighting.color_temperature} tones`);
            if (lightParts.length > 0) {
                parts.push(lightParts.join(' '));
            }
        }

        // Camera settings
        if (json.camera) {
            const camParts: string[] = [];
            if (json.camera.focal_length) camParts.push(`${json.camera.focal_length} lens`);
            if (json.camera.angle) camParts.push(`${json.camera.angle} angle`);
            if (json.camera.depth_of_field) camParts.push(`${json.camera.depth_of_field} depth of field`);
            if (json.camera.composition) camParts.push(`${json.camera.composition} composition`);
            if (camParts.length > 0) {
                parts.push(`photographed with ${camParts.join(', ')}`);
            }
        }

        // Aesthetic
        if (json.aesthetic) {
            if (json.aesthetic.medium) {
                parts.push(`${json.aesthetic.medium} style`);
            }
            if (json.aesthetic.style) {
                parts.push(json.aesthetic.style);
            }
            if (json.aesthetic.color_palette) {
                parts.push(`${json.aesthetic.color_palette} colors`);
            }
            if (json.aesthetic.mood) {
                parts.push(`${json.aesthetic.mood} mood`);
            }
        }

        // Technical quality
        if (json.technical) {
            if (json.technical.quality) {
                parts.push(json.technical.quality);
            }
            if (json.technical.resolution_hint) {
                parts.push(json.technical.resolution_hint);
            }
        }

        return parts.filter(p => p && p.trim()).join(', ');
    } catch (error) {
        console.error('[JSON Mode] Format failed:', error);
        // Fallback to original
        return jsonString;
    }
}
