import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getBaseHeaders } from "../serviceHeaders";
import { PROJECT_NAME } from "../../config";
import { LOCAL_STORAGE_KEY_WORKSPACE_ROOT, LOCAL_STORAGE_KEY_USERNAME } from "../../constants";

describe("serviceHeaders", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it("should return basic headers when window is undefined (SSR context)", () => {
    // Simulate non-browser environment by temporarily removing global window
    // @ts-expect-error - overriding global window for testing environment simulation
    delete global.window;

    const retrievedHeaders = getBaseHeaders();

    expect(retrievedHeaders).toEqual({
      "Content-Type": "application/json",
      "x-project": PROJECT_NAME,
    });
  });

  it("should include workspace and username headers in browser context when present in localStorage", () => {
    localStorage.setItem(LOCAL_STORAGE_KEY_WORKSPACE_ROOT, "/home/rodrigo/development");
    localStorage.setItem(LOCAL_STORAGE_KEY_USERNAME, "rodrigo");

    const retrievedHeaders = getBaseHeaders();

    expect(retrievedHeaders).toEqual({
      "Content-Type": "application/json",
      "x-project": PROJECT_NAME,
      "x-workspace-root": "/home/rodrigo/development",
      "x-username": "rodrigo",
    });
  });

  it("should omit workspace and username headers when they do not exist in localStorage", () => {
    const retrievedHeaders = getBaseHeaders();

    expect(retrievedHeaders).toEqual({
      "Content-Type": "application/json",
      "x-project": PROJECT_NAME,
    });
  });
});
