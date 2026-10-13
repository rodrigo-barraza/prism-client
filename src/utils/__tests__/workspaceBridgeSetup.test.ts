import { describe, it, expect } from "vitest";
import { workspaceBackendExample, workspaceEnvFileExample } from "../workspaceBridgeSetup";

describe("workspaceBridgeSetup", () => {
  describe("workspaceBackendExample", () => {
    it("is tools-service's public domain over wss on a public domain", () => {
      expect(
        workspaceBackendExample({
          hostname: "prism.rod.dev",
          isPublicDomain: true,
          toolsServicePublicUrl: "https://api.tools.rod.dev",
        }),
      ).toBe("wss://api.tools.rod.dev");
    });

    it("drops a trailing slash so the bridge's /ws/agent append stays clean", () => {
      expect(
        workspaceBackendExample({
          hostname: "prism.rod.dev",
          isPublicDomain: true,
          toolsServicePublicUrl: "https://api.tools.rod.dev/",
        }),
      ).toBe("wss://api.tools.rod.dev");
    });

    it("is the page's host and tools-service's port on the LAN or in dev", () => {
      expect(
        workspaceBackendExample({ hostname: "192.168.86.2", isPublicDomain: false }),
      ).toBe("ws://192.168.86.2:5590");
      expect(workspaceBackendExample({ hostname: "localhost", isPublicDomain: false })).toBe(
        "ws://localhost:5590",
      );
    });

    it("falls back to the page's host when the build carries no public URL", () => {
      expect(workspaceBackendExample({ hostname: "prism.rod.dev", isPublicDomain: true })).toBe(
        "ws://prism.rod.dev:5590",
      );
    });
  });

  describe("workspaceEnvFileExample", () => {
    it("carries the backend, the roots and the secret dev:local needs", () => {
      expect(workspaceEnvFileExample("wss://api.tools.rod.dev", "/home/you/development")).toBe(
        [
          "WORKSPACE_BACKEND=wss://api.tools.rod.dev",
          "WORKSPACE_ROOTS=/home/you/development",
          "WORKSPACE_SERVICE_SECRET=YOUR_API_SECRET",
        ].join("\n"),
      );
    });
  });
});
