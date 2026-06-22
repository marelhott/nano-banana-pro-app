/**
 * API Usage Tracking — per-provider sledování využití API a odhadované náklady
 */

const STORAGE_KEY = 'nanoBanana_apiUsage_v2';
const MONTHLY_LIMIT_KEY = 'nanoBanana_apiUsageLimit';
const DEFAULT_MONTHLY_LIMIT_CZK = 500;

export type TrackedProvider = 'gemini' | 'grok' | 'openai' | 'replicate' | 'fal' | 'a1111' | 'unknown';

export interface ProviderUsage {
  images: number;
  estimatedCostCZK: number;
}

export interface ApiUsageData {
  month: string;
  totalImages: number;
  estimatedCostCZK: number;
  byProvider: Record<TrackedProvider, ProviderUsage>;
  history: {
    timestamp: number;
    imagesGenerated: number;
    resolution: string;
    provider: TrackedProvider;
    costCZK: number;
  }[];
}

// Ceny za 1 obrázek v Kč podle providera a rozlišení
const PRICE_TABLE: Record<TrackedProvider, Record<string, number>> = {
  gemini:    { '1K': 0.4, '2K': 1.2, '4K': 2.5 },
  grok:      { '1K': 0.6, '2K': 1.8, '4K': 3.5 },
  openai:    { '1K': 1.0, '2K': 2.5, '4K': 5.0 },
  replicate: { '1K': 0.8, '2K': 2.0, '4K': 4.0 },
  fal:       { '1K': 0.5, '2K': 1.5, '4K': 3.0 },
  a1111:     { '1K': 0.1, '2K': 0.2, '4K': 0.4 },
  unknown:   { '1K': 0.5, '2K': 1.5, '4K': 3.0 },
};

export class ApiUsageTracker {
  private static getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  static getUsageData(): ApiUsageData {
    const currentMonth = this.getCurrentMonth();
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data: ApiUsageData = JSON.parse(stored);
        if (data.month !== currentMonth) return this.createNewMonthData();
        if (!data.byProvider) data.byProvider = this.emptyByProvider();
        return data;
      } catch {
        return this.createNewMonthData();
      }
    }
    return this.createNewMonthData();
  }

  private static emptyByProvider(): Record<TrackedProvider, ProviderUsage> {
    return {
      gemini: { images: 0, estimatedCostCZK: 0 },
      grok: { images: 0, estimatedCostCZK: 0 },
      openai: { images: 0, estimatedCostCZK: 0 },
      replicate: { images: 0, estimatedCostCZK: 0 },
      fal: { images: 0, estimatedCostCZK: 0 },
      a1111: { images: 0, estimatedCostCZK: 0 },
      unknown: { images: 0, estimatedCostCZK: 0 },
    };
  }

  private static createNewMonthData(): ApiUsageData {
    return {
      month: this.getCurrentMonth(),
      totalImages: 0,
      estimatedCostCZK: 0,
      byProvider: this.emptyByProvider(),
      history: [],
    };
  }

  static trackImageGeneration(resolution: string = '2K', count: number = 1, provider: TrackedProvider = 'unknown'): void {
    const data = this.getUsageData();
    const pricePerImage = PRICE_TABLE[provider]?.[resolution] ?? PRICE_TABLE.unknown[resolution] ?? 1.5;
    const cost = pricePerImage * count;

    data.totalImages += count;
    data.estimatedCostCZK += cost;
    if (!data.byProvider[provider]) data.byProvider[provider] = { images: 0, estimatedCostCZK: 0 };
    data.byProvider[provider].images += count;
    data.byProvider[provider].estimatedCostCZK += cost;
    data.history.push({ timestamp: Date.now(), imagesGenerated: count, resolution, provider, costCZK: cost });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    // Alert při překročení 80 % limitu
    const limit = this.getMonthlyLimit();
    if (limit > 0 && data.estimatedCostCZK >= limit * 0.8 && data.estimatedCostCZK - cost < limit * 0.8) {
      console.warn(`[ApiUsage] Překročeno 80 % měsíčního limitu (${limit} Kč).`);
    }
  }

  static getMonthlyLimit(): number {
    const stored = localStorage.getItem(MONTHLY_LIMIT_KEY);
    return stored ? Number(stored) : DEFAULT_MONTHLY_LIMIT_CZK;
  }

  static setMonthlyLimit(limitCZK: number): void {
    localStorage.setItem(MONTHLY_LIMIT_KEY, String(limitCZK));
  }

  static getStats() {
    const data = this.getUsageData();
    const limit = this.getMonthlyLimit();
    const resolutionCounts: Record<string, number> = {};
    data.history.forEach(e => {
      resolutionCounts[e.resolution] = (resolutionCounts[e.resolution] || 0) + e.imagesGenerated;
    });
    const mostUsedResolution = Object.entries(resolutionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    return {
      totalImages: data.totalImages,
      estimatedCostCZK: Math.round(data.estimatedCostCZK * 100) / 100,
      averageCostPerImage: data.totalImages > 0 ? Math.round((data.estimatedCostCZK / data.totalImages) * 100) / 100 : 0,
      mostUsedResolution,
      byProvider: data.byProvider,
      monthlyLimit: limit,
      limitUsedPercent: limit > 0 ? Math.round((data.estimatedCostCZK / limit) * 100) : 0,
    };
  }

  static reset(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.createNewMonthData()));
  }
}
