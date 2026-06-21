import { describe, it, expect, beforeEach } from "vitest";
import StorageService from "../src/services/StorageService";

const STORAGE_PREFIX = "prism";

function makeNamespacedKey(key: string): string {
  return `${STORAGE_PREFIX}:${key}`;
}

describe("StorageService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should namespace keys with prism prefix on set and get", () => {
    StorageService.set("theme", "dark");
    expect(localStorage.getItem(makeNamespacedKey("theme"))).toBe(JSON.stringify("dark"));

    const retrievedValue = StorageService.get<string>("theme");
    expect(retrievedValue).toBe("dark");
  });

  it("should handle serialization and deserialization of complex objects", () => {
    const complexData = {
      username: "rodrigo",
      settings: {
        notificationsEnabled: true,
        historyLimit: 50,
      },
    };

    StorageService.set("profile", complexData);
    const retrievedValue = StorageService.get<typeof complexData>("profile");
    expect(retrievedValue).toEqual(complexData);
  });

  it("should return fallback when key does not exist", () => {
    const defaultSettings = { theme: "light" };
    const retrievedValue = StorageService.get(
      "non-existent-key",
      defaultSettings,
    );
    expect(retrievedValue).toEqual(defaultSettings);
  });

  it("should return fallback if storage contains invalid JSON", () => {
    localStorage.setItem(makeNamespacedKey("broken"), "{invalid json");
    const retrievedValue = StorageService.get("broken", "default-value");
    expect(retrievedValue).toBe("default-value");
  });

  it("should remove key successfully", () => {
    StorageService.set("temporary-data", "remove-me");
    expect(StorageService.get("temporary-data")).toBe("remove-me");

    StorageService.remove("temporary-data");
    expect(StorageService.get("temporary-data")).toBeNull();
  });

  it("should clear only prism namespaced keys", () => {
    localStorage.setItem("other-namespace:key", "keep-me");
    StorageService.set("session-token", "jwt-token");
    StorageService.set("layout", "grid");

    StorageService.clear();

    expect(localStorage.getItem("other-namespace:key")).toBe("keep-me");
    expect(StorageService.get("session-token")).toBeNull();
    expect(StorageService.get("layout")).toBeNull();
  });

  it("should round-trip boolean values correctly", () => {
    StorageService.set("feature-flag", true);
    expect(StorageService.get<boolean>("feature-flag")).toBe(true);

    StorageService.set("feature-flag", false);
    expect(StorageService.get<boolean>("feature-flag")).toBe(false);
  });

  it("should round-trip numeric values correctly including zero", () => {
    StorageService.set("counter", 0);
    expect(StorageService.get<number>("counter")).toBe(0);

    StorageService.set("counter", 42);
    expect(StorageService.get<number>("counter")).toBe(42);
  });

  it("should round-trip array values correctly", () => {
    const recentModels = ["gemini-3.5-flash", "claude-sonnet-4", "gpt-5.4"];
    StorageService.set("recent-models", recentModels);
    expect(StorageService.get<string[]>("recent-models")).toEqual(recentModels);
  });
});
