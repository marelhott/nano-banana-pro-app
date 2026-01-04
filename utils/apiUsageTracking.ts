/**
 * API Usage Tracking - sledování využití API a odhadované náklady
 */

const STORAGE_KEY = 'nanoBanana_apiUsage';

export interface ApiUsageData {
  month: string; // Format: YYYY-MM
  totalImages: number;
  estimatedCostCZK: number;
  history: {
    timestamp: number;
    imagesGenerated: number;
    resolution: string;
  }[];
}

// Odhad ceny za 1 obrázek v Kč (může se lišit podle skutečných cen Gemini API)
const PRICE_PER_IMAGE_CZK: Record<string, number> = {
  '1K': 0.5,
  '2K': 1.5,
  '4K': 3.0,
};

export class ApiUsageTracker {
  /**
   * Získat aktuální měsíc ve formátu YYYY-MM
   */
  private static getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Načíst usage data pro aktuální měsíc
   */
  static getUsageData(): ApiUsageData {
    const currentMonth = this.getCurrentMonth();
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      try {
        const data: ApiUsageData = JSON.parse(stored);

        // Pokud je to jiný měsíc, resetuj data
        if (data.month !== currentMonth) {
          return this.createNewMonthData();
        }

        return data;
      } catch (error) {
        console.error('Failed to parse API usage data:', error);
        return this.createNewMonthData();
      }
    }

    return this.createNewMonthData();
  }

  /**
   * Vytvořit nová data pro nový měsíc
   */
  private static createNewMonthData(): ApiUsageData {
    return {
      month: this.getCurrentMonth(),
      totalImages: 0,
      estimatedCostCZK: 0,
      history: [],
    };
  }

  /**
   * Zaznamenat vygenerování obrázku
   */
  static trackImageGeneration(resolution: string = '2K', count: number = 1): void {
    const data = this.getUsageData();

    const cost = (PRICE_PER_IMAGE_CZK[resolution] || 1.5) * count;

    data.totalImages += count;
    data.estimatedCostCZK += cost;
    data.history.push({
      timestamp: Date.now(),
      imagesGenerated: count,
      resolution,
    });

    // Uložit zpět
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /**
   * Získat statistiky pro zobrazení
   */
  static getStats(): {
    totalImages: number;
    estimatedCostCZK: number;
    averageCostPerImage: number;
    mostUsedResolution: string;
  } {
    const data = this.getUsageData();

    const averageCostPerImage = data.totalImages > 0
      ? data.estimatedCostCZK / data.totalImages
      : 0;

    // Najít nejpoužívanější rozlišení
    const resolutionCounts: Record<string, number> = {};
    data.history.forEach(entry => {
      resolutionCounts[entry.resolution] = (resolutionCounts[entry.resolution] || 0) + entry.imagesGenerated;
    });

    const mostUsedResolution = Object.entries(resolutionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return {
      totalImages: data.totalImages,
      estimatedCostCZK: Math.round(data.estimatedCostCZK * 100) / 100,
      averageCostPerImage: Math.round(averageCostPerImage * 100) / 100,
      mostUsedResolution,
    };
  }

  /**
   * Resetovat statistiky (pro nový měsíc nebo na žádost uživatele)
   */
  static reset(): void {
    const newData = this.createNewMonthData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
  }
}
