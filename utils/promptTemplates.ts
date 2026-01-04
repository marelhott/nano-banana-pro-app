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
   * Extrahovat proměnné ze šablony
   */
  static extractVariables(template: string): string[] {
    const regex = /\[([A-Z_]+)\]/g;
    const matches = template.match(regex);

    if (!matches) return [];

    return [...new Set(matches.map(m => m.slice(1, -1)))];
  }

  /**
   * Naplnit šablonu hodnotami
   */
  static fillTemplate(template: string, values: Record<string, string>): string {
    let result = template;

    Object.entries(values).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\[${key}\\]`, 'g'), value);
    });

    return result;
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
