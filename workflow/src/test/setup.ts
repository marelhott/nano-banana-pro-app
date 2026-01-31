import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Mock ResizeObserver for React Flow tests
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = ResizeObserverMock;

// Mock DOMMatrixReadOnly for React Flow
class DOMMatrixReadOnlyMock {
  m22: number = 1;
  constructor() {
    this.m22 = 1;
  }
}

global.DOMMatrixReadOnly = DOMMatrixReadOnlyMock as unknown as typeof DOMMatrixReadOnly;

const createStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size;
    },
  };
};

if (typeof globalThis.localStorage === "undefined" || typeof (globalThis.localStorage as any).getItem !== "function") {
  vi.stubGlobal("localStorage", createStorageMock());
}

if (typeof globalThis.sessionStorage === "undefined" || typeof (globalThis.sessionStorage as any).getItem !== "function") {
  vi.stubGlobal("sessionStorage", createStorageMock());
}

// Cleanup after each test to ensure DOM is reset
afterEach(() => {
  cleanup();
});
