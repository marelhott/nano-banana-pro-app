/**
 * Aspect Ratio Mapping — normalizace poměru stran pro všechny providery.
 * Každý provider podporuje jen určité rozměry.
 * Tato utilita mapuje požadovaný poměr na nejbližší podporovaný.
 */

export interface AspectRatioMapping {
  width: number;
  height: number;
  label: string;
  exact: boolean; // true = přesná shoda, false = aproximace
}

// Gemini podporuje aspect ratio přímo jako string
const GEMINI_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '5:4', '4:5', '9:16', '16:9', '21:9'];

// ChatGPT/DALL-E podporuje jen 3 pevné velikosti
const CHATGPT_SIZES: Record<string, { width: number; height: number }> = {
  '1024x1024': { width: 1024, height: 1024 },
  '1024x1536': { width: 1024, height: 1536 },
  '1536x1024': { width: 1536, height: 1024 },
};

// Grok nemá aspect ratio parametr, jen generuje čtverce
const GROK_SIZE = { width: 1024, height: 1024 };

// Replicate (FLUX) podporuje aspect ratio jako string
const REPLICATE_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '9:21', '21:9'];

function ratioToFloat(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return 1;
  return w / h;
}

function findClosestRatio(target: number, available: string[]): { ratio: string; exact: boolean } {
  let closest = available[0];
  let minDiff = Infinity;
  let exact = false;

  for (const r of available) {
    const val = ratioToFloat(r);
    const diff = Math.abs(val - target);
    if (diff < 0.01) {
      return { ratio: r, exact: true };
    }
    if (diff < minDiff) {
      minDiff = diff;
      closest = r;
    }
  }

  return { ratio: closest, exact };
}

export type ProviderType = 'gemini' | 'chatgpt' | 'grok' | 'replicate';

export interface MappedAspectRatio {
  value: string; // Hodnota pro API
  original: string; // Původní požadavek
  exact: boolean; // Přesná shoda?
  warning?: string; // Upozornění pro uživatele
}

export function mapAspectRatio(ratio: string, provider: ProviderType): MappedAspectRatio {
  if (!ratio || ratio === 'Original') {
    return { value: ratio, original: ratio, exact: true };
  }

  switch (provider) {
    case 'gemini': {
      if (GEMINI_RATIOS.includes(ratio)) {
        return { value: ratio, original: ratio, exact: true };
      }
      const target = ratioToFloat(ratio);
      const { ratio: closest, exact } = findClosestRatio(target, GEMINI_RATIOS);
      return {
        value: closest,
        original: ratio,
        exact,
        warning: exact ? undefined : `Gemini nepodporuje ${ratio}, použit nejbližší ${closest}`,
      };
    }

    case 'chatgpt': {
      const target = ratioToFloat(ratio);
      // Mapovat na 3 dostupné velikosti
      if (target > 1.2) {
        // Landscape
        return {
          value: '1536x1024',
          original: ratio,
          exact: ratio === '3:2',
          warning: ratio !== '3:2' ? `DALL-E mapuje ${ratio} na 1536×1024 (≈3:2)` : undefined,
        };
      } else if (target < 0.83) {
        // Portrait
        return {
          value: '1024x1536',
          original: ratio,
          exact: ratio === '2:3',
          warning: ratio !== '2:3' ? `DALL-E mapuje ${ratio} na 1024×1536 (≈2:3)` : undefined,
        };
      } else {
        // Square
        return {
          value: '1024x1024',
          original: ratio,
          exact: ratio === '1:1',
          warning: ratio !== '1:1' ? `DALL-E mapuje ${ratio} na 1024×1024 (1:1)` : undefined,
        };
      }
    }

    case 'grok': {
      // Grok nemá aspect ratio
      return {
        value: '1024x1024',
        original: ratio,
        exact: ratio === '1:1',
        warning: ratio !== '1:1' ? `Grok nepodporuje poměr stran — výstup bude čtvercový (1:1)` : undefined,
      };
    }

    case 'replicate': {
      if (REPLICATE_RATIOS.includes(ratio)) {
        return { value: ratio, original: ratio, exact: true };
      }
      const target = ratioToFloat(ratio);
      const { ratio: closest, exact } = findClosestRatio(target, REPLICATE_RATIOS);
      return {
        value: closest,
        original: ratio,
        exact,
        warning: exact ? undefined : `FLUX mapuje ${ratio} na nejbližší ${closest}`,
      };
    }

    default:
      return { value: ratio, original: ratio, exact: true };
  }
}

/**
 * Vrátí rozměry v px pro daný poměr a rozlišení.
 */
export function getPixelDimensions(ratio: string, resolution: string): { width: number; height: number } {
  const baseSize = resolution === '4K' ? 4096 : resolution === '2K' ? 2048 : 1024;

  if (!ratio || ratio === 'Original' || ratio === '1:1') {
    return { width: baseSize, height: baseSize };
  }

  const [rw, rh] = ratio.split(':').map(Number);
  if (!rw || !rh) return { width: baseSize, height: baseSize };

  const aspect = rw / rh;
  if (aspect >= 1) {
    return { width: baseSize, height: Math.round(baseSize / aspect) };
  } else {
    return { width: Math.round(baseSize * aspect), height: baseSize };
  }
}
