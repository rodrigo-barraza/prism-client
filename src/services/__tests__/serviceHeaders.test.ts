import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getBaseHeaders } from "../serviceHeaders";
import { PROJECT_NAME } from "../../config";
import { LOCAL_STORAGE_KEY_ACTIVE_PROFILE, LOCAL_STORAGE_KEY_WORKSPACE_ROOT } from "../../constants";
import { TEST_PRISM_TOKEN } from "../../../tests/prismTokenStub";

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

  it("carries the signed-in user's Prism token, and the workspace and profile from localStorage", () => {
    localStorage.setItem(LOCAL_STORAGE_KEY_WORKSPACE_ROOT, "/home/rodrigo/development");
    localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_PROFILE, "work");

    const retrievedHeaders = getBaseHeaders();

    expect(retrievedHeaders).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_PRISM_TOKEN}`,
      "x-project": PROJECT_NAME,
      "x-workspace-root": "/home/rodrigo/development",
      "x-profile-id": "work",
    });
  });

  it("never claims a username: the token says who the user is", () => {
    // What once set the old header must not bring it back.
    localStorage.setItem("prism:username", "rodrigo");

    const retrievedHeaders = getBaseHeaders();

    expect(retrievedHeaders).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_PRISM_TOKEN}`,
      "x-project": PROJECT_NAME,
    });
    expect(Object.keys(retrievedHeaders).map((name) => name.toLowerCase())).not.toContain(
      "x-username",
    );
  });
});
