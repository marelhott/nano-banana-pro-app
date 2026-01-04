/**
 * Prompt History - sledování historie promptů pro undo/redo
 */

export class PromptHistory {
  private history: string[] = [];
  private currentIndex: number = -1;
  private maxHistory: number = 20;

  /**
   * Přidat nový prompt do historie
   */
  add(prompt: string): void {
    // Pokud jsme uprostřed historie a přidáváme nový prompt,
    // smažeme všechno za aktuální pozicí
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Přidat nový prompt pouze pokud se liší od posledního
    if (this.history[this.history.length - 1] !== prompt) {
      this.history.push(prompt);

      // Omezit velikost historie
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }

      this.currentIndex = this.history.length - 1;
    }
  }

  /**
   * Undo - vrátit se na předchozí prompt
   */
  undo(): string | null {
    if (this.canUndo()) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return null;
  }

  /**
   * Redo - vrátit se na následující prompt
   */
  redo(): string | null {
    if (this.canRedo()) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
    return null;
  }

  /**
   * Zjistit, zda je možné použít undo
   */
  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Zjistit, zda je možné použít redo
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Získat aktuální prompt
   */
  getCurrent(): string | null {
    return this.history[this.currentIndex] || null;
  }

  /**
   * Vymazat historii
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Získat celou historii (pro debug)
   */
  getAll(): string[] {
    return [...this.history];
  }
}
