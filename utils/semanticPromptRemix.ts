/**
 * Sémantický Prompt Remix — rozkládá prompt na kategorie (subjekt, prostředí, styl, atmosféra, technické)
 * a umožňuje míchání po kategoriích mezi dvěma prompty.
 */

export interface PromptCategories {
  subject: string;
  environment: string;
  style: string;
  lighting: string;
  mood: string;
  technical: string;
  other: string;
}

// Klíčová slova pro detekci kategorií
const SUBJECT_KEYWORDS = [
  'portrait', 'portrét', 'person', 'osoba', 'man', 'muž', 'woman', 'žena', 'child', 'dítě',
  'cat', 'kočka', 'dog', 'pes', 'animal', 'zvíře', 'car', 'auto', 'building', 'budova',
  'flower', 'květina', 'tree', 'strom', 'robot', 'dragon', 'drak', 'warrior', 'válečník',
  'face', 'obličej', 'figure', 'postava', 'character', 'creature',
];

const ENVIRONMENT_KEYWORDS = [
  'in', 'at', 'on', 'background', 'pozadí', 'scene', 'scéna', 'setting', 'prostředí',
  'forest', 'les', 'city', 'město', 'ocean', 'oceán', 'mountain', 'hora', 'desert', 'poušť',
  'room', 'místnost', 'garden', 'zahrada', 'space', 'vesmír', 'underwater', 'pod vodou',
  'street', 'ulice', 'park', 'beach', 'pláž', 'cave', 'jeskyně', 'castle', 'hrad',
  'interior', 'interiér', 'exterior', 'exteriér', 'landscape', 'krajina',
];

const STYLE_KEYWORDS = [
  'style', 'styl', 'painting', 'malba', 'photograph', 'fotografie', 'illustration', 'ilustrace',
  'watercolor', 'akvarel', 'oil painting', 'olejomalba', 'digital art', 'anime', 'manga',
  'realistic', 'realistický', 'abstract', 'abstraktní', 'surreal', 'surrealistický',
  'minimalist', 'minimalistický', 'art deco', 'art nouveau', 'baroque', 'barokní',
  'impressionist', 'impresionistický', 'cubist', 'kubistický', 'pop art',
  'render', '3d', 'concept art', 'pixel art', 'vector', 'sketch', 'skica',
];

const LIGHTING_KEYWORDS = [
  'light', 'světlo', 'lighting', 'osvětlení', 'shadow', 'stín', 'dark', 'tmavý',
  'bright', 'jasný', 'golden hour', 'sunset', 'západ slunce', 'sunrise', 'východ slunce',
  'dramatic', 'dramatický', 'soft', 'měkký', 'harsh', 'tvrdý', 'backlit', 'protisvětlo',
  'neon', 'candlelight', 'moonlight', 'měsíční', 'sunlight', 'sluneční',
  'studio lighting', 'rim light', 'ambient', 'volumetric',
];

const MOOD_KEYWORDS = [
  'mood', 'nálada', 'atmosphere', 'atmosféra', 'feeling', 'pocit',
  'mysterious', 'tajemný', 'serene', 'klidný', 'vibrant', 'živý', 'melancholy', 'melancholický',
  'epic', 'epický', 'cozy', 'útulný', 'eerie', 'děsivý', 'romantic', 'romantický',
  'peaceful', 'poklidný', 'chaotic', 'chaotický', 'dreamy', 'snový', 'nostalgic', 'nostalgický',
  'energetic', 'energický', 'calm', 'warm', 'teplý', 'cold', 'studený',
];

const TECHNICAL_KEYWORDS = [
  'resolution', 'rozlišení', '4k', '8k', 'hd', 'detailed', 'detailní', 'sharp', 'ostrý',
  'bokeh', 'depth of field', 'hloubka ostrosti', 'wide angle', 'široký úhel',
  'macro', 'makro', 'telephoto', 'fisheye', 'panoramic', 'panoramatický',
  'high quality', 'profesionální', 'professional', 'masterpiece', 'award winning',
  'ultra detailed', 'photorealistic', 'fotorealistický', 'cinematic', 'filmový',
  'f/1.4', 'f/2.8', '35mm', '50mm', '85mm', 'lens',
];

/**
 * Parsuje prompt na sémantické kategorie.
 */
export function parsePromptToCategories(prompt: string): PromptCategories {
  const result: PromptCategories = {
    subject: '',
    environment: '',
    style: '',
    lighting: '',
    mood: '',
    technical: '',
    other: '',
  };

  // Rozdělit na části — oddělené čárkou, tečkou, středníkem nebo novým řádkem
  const parts = prompt.split(/[,;.\n]+/).map(p => p.trim()).filter(p => p.length > 0);

  for (const part of parts) {
    const lower = part.toLowerCase();

    if (TECHNICAL_KEYWORDS.some(kw => lower.includes(kw))) {
      result.technical += (result.technical ? ', ' : '') + part;
    } else if (LIGHTING_KEYWORDS.some(kw => lower.includes(kw))) {
      result.lighting += (result.lighting ? ', ' : '') + part;
    } else if (MOOD_KEYWORDS.some(kw => lower.includes(kw))) {
      result.mood += (result.mood ? ', ' : '') + part;
    } else if (STYLE_KEYWORDS.some(kw => lower.includes(kw))) {
      result.style += (result.style ? ', ' : '') + part;
    } else if (ENVIRONMENT_KEYWORDS.some(kw => lower.includes(kw))) {
      result.environment += (result.environment ? ', ' : '') + part;
    } else if (SUBJECT_KEYWORDS.some(kw => lower.includes(kw))) {
      result.subject += (result.subject ? ', ' : '') + part;
    } else {
      // Pokud se nehodí nikam, dát do subject (pokud je prázdný) nebo other
      if (!result.subject) {
        result.subject = part;
      } else {
        result.other += (result.other ? ', ' : '') + part;
      }
    }
  }

  return result;
}

/**
 * Složí kategorie zpět do promptu.
 */
export function categoriesToPrompt(categories: PromptCategories): string {
  const parts = [
    categories.subject,
    categories.environment,
    categories.style,
    categories.lighting,
    categories.mood,
    categories.technical,
    categories.other,
  ].filter(p => p.trim().length > 0);

  return parts.join(', ');
}

/**
 * Sémantický remix — vezme části z promptu A a části z promptu B.
 */
export function semanticRemix(
  promptA: string,
  promptB: string,
  mix: Partial<Record<keyof PromptCategories, 'A' | 'B'>>
): string {
  const catA = parsePromptToCategories(promptA);
  const catB = parsePromptToCategories(promptB);

  const result: PromptCategories = {
    subject: (mix.subject === 'B' ? catB.subject : catA.subject) || catA.subject,
    environment: (mix.environment === 'B' ? catB.environment : catA.environment) || catA.environment,
    style: (mix.style === 'B' ? catB.style : catA.style) || catA.style,
    lighting: (mix.lighting === 'B' ? catB.lighting : catA.lighting) || catA.lighting,
    mood: (mix.mood === 'B' ? catB.mood : catA.mood) || catA.mood,
    technical: (mix.technical === 'B' ? catB.technical : catA.technical) || catA.technical,
    other: (mix.other === 'B' ? catB.other : catA.other) || catA.other,
  };

  return categoriesToPrompt(result);
}

/**
 * Vrátí seznam neprázdných kategorií z promptu.
 */
export function getFilledCategories(prompt: string): (keyof PromptCategories)[] {
  const cat = parsePromptToCategories(prompt);
  return (Object.keys(cat) as (keyof PromptCategories)[]).filter(k => cat[k].trim().length > 0);
}

export const CATEGORY_LABELS: Record<keyof PromptCategories, string> = {
  subject: 'Subjekt',
  environment: 'Prostředí',
  style: 'Styl',
  lighting: 'Osvětlení',
  mood: 'Nálada',
  technical: 'Technické',
  other: 'Ostatní',
};
