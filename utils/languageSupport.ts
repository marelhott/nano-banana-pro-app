/**
 * Multi-language support - detekce jazyka a volitelný překlad
 */

/**
 * Jednoduchá detekce jazyka na základě znaků
 */
export function detectLanguage(text: string): 'cs' | 'en' | 'other' {
  if (!text || text.trim().length === 0) return 'en';

  // České specifické znaky
  const czechChars = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

  // Česká stop slova
  const czechStopWords = /\b(je|jsou|byl|byla|bylo|jsem|jsi|není|pro|jako|ale|nebo|když|pokud|který|která|které|můj|tvůj|jeho|její|náš|váš|jejich)\b/i;

  if (czechChars.test(text) || czechStopWords.test(text)) {
    return 'cs';
  }

  return 'en';
}

/**
 * Jednoduchý překlad běžných frází (pro prompt enhancement)
 * Pro plnohodnotný překlad by bylo lepší použít API
 */
const BASIC_TRANSLATIONS: Record<string, string> = {
  // Základní pojmy
  'obrázek': 'image',
  'obraz': 'painting',
  'fotografie': 'photograph',
  'krajina': 'landscape',
  'portrét': 'portrait',
  'město': 'city',
  'les': 'forest',
  'moře': 'sea',
  'hory': 'mountains',
  'nebe': 'sky',
  'slunce': 'sun',
  'měsíc': 'moon',
  'hvězdy': 'stars',

  // Styly
  'moderní': 'modern',
  'klasický': 'classic',
  'abstraktní': 'abstract',
  'realistický': 'realistic',
  'malovaný': 'painted',
  'kreslený': 'drawn',

  // Atmosféra
  'tajemný': 'mysterious',
  'světlý': 'bright',
  'tmavý': 'dark',
  'barevný': 'colorful',
  'černobílý': 'black and white',

  // Čas dne
  'ráno': 'morning',
  'poledne': 'noon',
  'odpoledne': 'afternoon',
  'večer': 'evening',
  'noc': 'night',
  'svítání': 'dawn',
  'soumrak': 'dusk',

  // Roční období
  'jaro': 'spring',
  'léto': 'summer',
  'podzim': 'autumn',
  'zima': 'winter',

  // Počasí
  'slunečno': 'sunny',
  'deštivo': 'rainy',
  'mlha': 'fog',
  'sníh': 'snow',
  'bouře': 'storm',

  // Emoce
  'šťastný': 'happy',
  'smutný': 'sad',
  'klidný': 'calm',
  'dramatický': 'dramatic',
  'energický': 'energetic',

  // Kvalita
  'vysoká kvalita': 'high quality',
  'detailní': 'detailed',
  'ostré': 'sharp',
  'profesionální': 'professional',
  'umělecké': 'artistic',
};

/**
 * Základní překlad textu
 * Pozor: Toto je velmi zjednodušený překlad, pro lepší výsledky by bylo lepší použít API
 */
export function simpleTranslate(text: string): string {
  let translated = text.toLowerCase();

  // Nahradit známé fráze
  Object.entries(BASIC_TRANSLATIONS).forEach(([czech, english]) => {
    const regex = new RegExp(`\\b${czech}\\b`, 'gi');
    translated = translated.replace(regex, english);
  });

  return translated;
}

/**
 * Získat návrh, jak vylepšit prompt pro lepší výsledky
 */
export function getPromptSuggestion(prompt: string, language: 'cs' | 'en' | 'other'): string | null {
  if (language === 'cs') {
    return 'Tip: Gemini API často lépe rozumí anglickým promptům. Zvažte překlad pro lepší výsledky.';
  }

  return null;
}

/**
 * Vylepšit prompt přidáním kvalitativních frází
 */
export function enhancePromptQuality(prompt: string, language: 'cs' | 'en' | 'other'): string {
  // Pokud prompt už obsahuje kvalitativní popisky, neměnit ho
  const hasQualityTerms = /\b(high quality|detailed|professional|4k|8k|hd|masterpiece|artistic|highly detailed)\b/i.test(prompt);

  if (hasQualityTerms) {
    return prompt;
  }

  // Přidat kvalitativní frázi na konec
  const qualityPhrase = language === 'cs'
    ? ', vysoká kvalita, detailní'
    : ', high quality, detailed';

  return prompt + qualityPhrase;
}
