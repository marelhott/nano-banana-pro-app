/**
 * Prompt Templates - šablony s proměnnými
 */

export interface PromptTemplate {
  id: string;
  name: string;
  template: string; // Šablona s proměnnými jako [VARIABLE_NAME]
  variables: string[]; // Seznam proměnných v šabloně
  category?: string;
  createdAt: number;
}

const STORAGE_KEY = 'nanoBanana_promptTemplates';

// Výchozí šablony
const DEFAULT_TEMPLATES: Omit<PromptTemplate, 'id' | 'createdAt'>[] = [
  {
    name: 'Základní scéna',
    template: '[SUBJECT] v [STYLE] stylu, [TIME_OF_DAY] osvětlení',
    variables: ['SUBJECT', 'STYLE', 'TIME_OF_DAY'],
    category: 'Obecné',
  },
  {
    name: 'Portrét',
    template: 'Portrét [PERSON], [EMOTION] výraz, [BACKGROUND] pozadí, [LIGHTING] světlo',
    variables: ['PERSON', 'EMOTION', 'BACKGROUND', 'LIGHTING'],
    category: 'Portréty',
  },
  {
    name: 'Krajina',
    template: '[LOCATION] krajina, [SEASON] sezóna, [WEATHER] počasí, [ATMOSPHERE] atmosféra',
    variables: ['LOCATION', 'SEASON', 'WEATHER', 'ATMOSPHERE'],
    category: 'Krajiny',
  },
  {
    name: 'Produkt',
    template: '[PRODUCT] na [SURFACE], [ANGLE] úhel, [LIGHTING] osvětlení, [MOOD] nálada',
    variables: ['PRODUCT', 'SURFACE', 'ANGLE', 'LIGHTING', 'MOOD'],
    category: 'Produkty',
  },
  {
    name: 'Interiér',
    template: '[ROOM_TYPE] místnost, [DESIGN_STYLE] styl, [COLOR_SCHEME] barevné schéma, [FURNITURE] nábytek',
    variables: ['ROOM_TYPE', 'DESIGN_STYLE', 'COLOR_SCHEME', 'FURNITURE'],
    category: 'Interiéry',
  },
  {
    name: 'Umělecké dílo',
    template: '[ART_STYLE] umění zobrazující [SUBJECT], [TECHNIQUE] technika, [COLOR_PALETTE] paleta',
    variables: ['ART_STYLE', 'SUBJECT', 'TECHNIQUE', 'COLOR_PALETTE'],
    category: 'Umění',
  },
];

export class PromptTemplates {
  /**
   * Načíst všechny šablony
   */
  static getAll(): PromptTemplate[] {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      // Pokud nejsou žádné uložené šablony, vytvořit výchozí
      return this.initializeDefaults();
    }

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse templates:', error);
      return this.initializeDefaults();
    }
  }

  /**
   * Inicializovat výchozí šablony
   */
  private static initializeDefaults(): PromptTemplate[] {
    const templates = DEFAULT_TEMPLATES.map((t, index) => ({
      ...t,
      id: `template_default_${index}`,
      createdAt: Date.now(),
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    return templates;
  }

  /**
   * Vytvořit novou šablonu
   */
  static create(name: string, template: string, category?: string): PromptTemplate {
    const templates = this.getAll();

    // Extrahovat proměnné ze šablony
    const variables = this.extractVariables(template);

    const newTemplate: PromptTemplate = {
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      template,
      variables,
      category,
      createdAt: Date.now(),
    };

    templates.push(newTemplate);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));

    return newTemplate;
  }

  /**
   * Smazat šablonu
   */
  static delete(id: string): void {
    const templates = this.getAll().filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  }

  /**
   * Extrahovat proměnné ze šablony (včetně variantních skupin a podmíněných proměnných)
   */
  static extractVariables(template: string): string[] {
    const vars = new Set<string>();

    // Standardní [VAR]
    const simpleRegex = /\[([A-Z_]+)\]/g;
    let match;
    while ((match = simpleRegex.exec(template)) !== null) {
      vars.add(match[1]);
    }

    // Variantní skupiny [VAR: opt1|opt2]
    const groupRegex = /\[([A-Z_]+):\s*[^\]]+\]/g;
    while ((match = groupRegex.exec(template)) !== null) {
      vars.add(match[1]);
    }

    // Podmíněné {if VAR=...}
    const condRegex = /\{if\s+([A-Z_]+)/g;
    while ((match = condRegex.exec(template)) !== null) {
      vars.add(match[1]);
    }

    return Array.from(vars);
  }

  /**
   * Naplnit šablonu hodnotami — podporuje podmíněné bloky a variantní skupiny.
   *
   * Podmíněné bloky: {if VARIABLE=value}text{/if}
   * Negace: {if VARIABLE!=value}text{/if}
   * Variantní skupiny: [WEATHER: sunny|cloudy|rainy] — uživatel vybere jednu z možností
   */
  static fillTemplate(template: string, values: Record<string, string>): string {
    let result = template;

    // 1. Zpracovat podmíněné bloky: {if VAR=val}...{/if} a {if VAR!=val}...{/if}
    result = result.replace(/\{if\s+([A-Z_]+)\s*(!=|=)\s*([^}]+)\}([\s\S]*?)\{\/if\}/g,
      (_match, varName, operator, condValue, content) => {
        const actualValue = values[varName] || '';
        const condMet = operator === '='
          ? actualValue.toLowerCase() === condValue.trim().toLowerCase()
          : actualValue.toLowerCase() !== condValue.trim().toLowerCase();
        return condMet ? content : '';
      }
    );

    // 2. Zpracovat variantní skupiny: [VAR: opt1|opt2|opt3]
    // Tyto se substituují normálně — hodnota by měla být jedna z nabízených variant
    result = result.replace(/\[([A-Z_]+):\s*([^\]]+)\]/g,
      (_match, varName, _options) => {
        return values[varName] || '';
      }
    );

    // 3. Standardní substituce [VAR]
    Object.entries(values).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\[${key}\\]`, 'g'), value);
    });

    // 4. Vyčistit prázdné řádky a nadbytečné mezery
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

    return result;
  }

  /**
   * Extrahovat variantní skupiny ze šablony.
   * Vrací Record<variableName, string[]> pro zobrazení selectoru.
   */
  static extractVariantGroups(template: string): Record<string, string[]> {
    const groups: Record<string, string[]> = {};
    const regex = /\[([A-Z_]+):\s*([^\]]+)\]/g;
    let match;
    while ((match = regex.exec(template)) !== null) {
      const varName = match[1];
      const options = match[2].split('|').map(o => o.trim()).filter(o => o.length > 0);
      if (options.length > 0) {
        groups[varName] = options;
      }
    }
    return groups;
  }

  /**
   * Extrahovat podmíněné proměnné ze šablony.
   */
  static extractConditionalVariables(template: string): string[] {
    const vars = new Set<string>();
    const regex = /\{if\s+([A-Z_]+)/g;
    let match;
    while ((match = regex.exec(template)) !== null) {
      vars.add(match[1]);
    }
    return Array.from(vars);
  }

  /**
   * Získat kategorii šablon
   */
  static getCategories(): string[] {
    const templates = this.getAll();
    const categories = new Set(templates.map(t => t.category).filter(Boolean) as string[]);
    return Array.from(categories);
  }
}
