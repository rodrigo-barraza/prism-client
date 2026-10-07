import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Every request to prism-service carries the signed-in user's token, which
// the token manager fetches from /api/prism-token. Tests run as a user whose
// token is always in hand; the manager's own tests unmock it.
vi.mock("@/services/prismTokenManager", async (importOriginal) => {
  const { TEST_PRISM_TOKEN } = await import("./prismTokenStub");
  return {
    ...(await importOriginal<typeof import("@/services/prismTokenManager")>()),
    currentPrismToken: () => TEST_PRISM_TOKEN,
    requestPrismToken: async () => TEST_PRISM_TOKEN,
    renewPrismToken: async () => TEST_PRISM_TOKEN,
  };
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Server-side tests (route handlers, the proxy) run in the node environment,
// which has no window.
const hasWindow = typeof window !== "undefined";

// Global window mocks
if (hasWindow) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

class MockStorage implements Storage {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] !== undefined ? this.store[key] : null;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] !== undefined ? keys[index] : null;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
}

const mockLocalStorage = new MockStorage();

Object.defineProperty(global, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});
if (hasWindow) {
  Object.defineProperty(window, "localStorage", {
    value: mockLocalStorage,
    writable: true,
  });
}
