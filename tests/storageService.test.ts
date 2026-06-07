import { describe, it, expect, beforeEach } from "vitest";
import StorageService from "../src/services/StorageService";

describe("StorageService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should namespace keys with prism prefix on set and get", () => {
    StorageService.set("theme", "dark");
    expect(localStorage.getItem("prism:theme")).toBe(JSON.stringify("dark"));

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
    localStorage.setItem("prism:broken", "{invalid json");
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
});
