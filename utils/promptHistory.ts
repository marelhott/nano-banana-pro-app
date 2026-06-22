/**
 * Prompt History — in-session undo/redo + persistent kontextový log (localStorage)
 */

const CONTEXT_LOG_KEY = 'nanoBanana_promptContextLog';
const MAX_CONTEXT_ENTRIES = 50;

export interface PromptContextEntry {
  id: string;
  prompt: string;
  provider?: string;
  resolution?: string;
  timestamp: number;
  imageUrls?: string[];
}

// Přidat záznam do kontextového logu (uložen do localStorage)
export function addPromptContextEntry(entry: Omit<PromptContextEntry, 'id'>): void {
  try {
    const raw = localStorage.getItem(CONTEXT_LOG_KEY);
    const log: PromptContextEntry[] = raw ? JSON.parse(raw) : [];
    const newEntry: PromptContextEntry = { ...entry, id: `phx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
    const updated = [newEntry, ...log].slice(0, MAX_CONTEXT_ENTRIES);
    localStorage.setItem(CONTEXT_LOG_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function getPromptContextLog(): PromptContextEntry[] {
  try {
    const raw = localStorage.getItem(CONTEXT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearPromptContextLog(): void {
  localStorage.removeItem(CONTEXT_LOG_KEY);
}

// In-session undo/redo
export class PromptHistory {
  private history: string[] = [];
  private currentIndex: number = -1;
  private maxHistory: number = 20;

  add(prompt: string): void {
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }
    if (this.history[this.history.length - 1] !== prompt) {
      this.history.push(prompt);
      if (this.history.length > this.maxHistory) this.history.shift();
      this.currentIndex = this.history.length - 1;
    }
  }

  undo(): string | null {
    if (this.canUndo()) { this.currentIndex--; return this.history[this.currentIndex]; }
    return null;
  }

  redo(): string | null {
    if (this.canRedo()) { this.currentIndex++; return this.history[this.currentIndex]; }
    return null;
  }

  canUndo(): boolean { return this.currentIndex > 0; }
  canRedo(): boolean { return this.currentIndex < this.history.length - 1; }
  getCurrent(): string | null { return this.history[this.currentIndex] || null; }
  clear(): void { this.history = []; this.currentIndex = -1; }
  getAll(): string[] { return [...this.history]; }
}
