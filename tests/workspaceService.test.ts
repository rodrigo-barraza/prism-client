import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import WorkspaceService from "../src/services/WorkspaceService";
import { PRISM_SERVICE_URL } from "../src/config";

describe("WorkspaceService", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should perform GET request to list workspaces and return results", async () => {
    const mockWorkspaces = [
      { id: "1", name: "test-workspace", path: "/test", isPinned: false },
    ];
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => mockWorkspaces,
    };
    mockFetch.mockResolvedValue(mockResponse);

    const retrievedWorkspaces = await WorkspaceService.list();

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/workspaces`,
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(retrievedWorkspaces).toEqual(mockWorkspaces);
  });

  it("should perform GET request to fetch full workspace configuration", async () => {
    const mockFullConfig = {
      workspaces: [],
      agents: [],
      staticRoots: [],
    };
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => mockFullConfig,
    };
    mockFetch.mockResolvedValue(mockResponse);

    const retrievedConfig = await WorkspaceService.listFull();

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/workspaces/full`,
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(retrievedConfig).toEqual(mockFullConfig);
  });

  it("should perform PUT request to update workspace roots with JSON payload", async () => {
    const newRoots = ["/new/path/one", "/new/path/two"];
    const mockUpdateResponse = {
      workspaceRoots: newRoots,
      staticRoots: [],
      userRoots: newRoots,
    };
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => mockUpdateResponse,
    };
    mockFetch.mockResolvedValue(mockResponse);

    const result = await WorkspaceService.update(newRoots);

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/workspaces`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ roots: newRoots }),
      }),
    );
    expect(result).toEqual(mockUpdateResponse);
  });

  it("should perform POST request to validate path", async () => {
    const validationResponse = {
      valid: true,
      resolvedPath: "/resolved/path",
      originalPath: "/original/path",
      isWsl: false,
      exists: true,
      isDirectory: true,
      alreadyRegistered: false,
    };
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => validationResponse,
    };
    mockFetch.mockResolvedValue(mockResponse);

    const result = await WorkspaceService.validate("/original/path");

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/workspaces/validate`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: "/original/path" }),
      }),
    );
    expect(result).toEqual(validationResponse);
  });

  it("should fetch workspace directory tree with custom depth parameter", async () => {
    const mockTreeResponse = {
      path: "/workspace/path",
      tree: [],
    };
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => mockTreeResponse,
    };
    mockFetch.mockResolvedValue(mockResponse);

    const result = await WorkspaceService.tree("/workspace/path", 5);

    expect(mockFetch).toHaveBeenCalledWith(
      `${PRISM_SERVICE_URL}/workspaces/tree?path=%2Fworkspace%2Fpath&maxDepth=5`,
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(result).toEqual(mockTreeResponse);
  });

  it("should throw an error when fetch response is not ok", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
    };
    mockFetch.mockResolvedValue(mockResponse);

    await expect(WorkspaceService.list()).rejects.toThrow(
      "WorkspaceService.list failed: 500",
    );
  });

  it("should throw an error when listFull response is not ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    await expect(WorkspaceService.listFull()).rejects.toThrow(
      "WorkspaceService.listFull failed: 403",
    );
  });

  it("should throw an error when update response is not ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422 });
    await expect(WorkspaceService.update(["/bad/path"])).rejects.toThrow(
      "WorkspaceService.update failed: 422",
    );
  });

  it("should throw an error when validate response is not ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(WorkspaceService.validate("/nonexistent")).rejects.toThrow(
      "WorkspaceService.validate failed: 404",
    );
  });

  it("should throw an error when tree response is not ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 });
    await expect(WorkspaceService.tree("/some/path")).rejects.toThrow(
      "WorkspaceService.tree failed: 502",
    );
  });

  it("should propagate network errors when fetch itself rejects", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(WorkspaceService.list()).rejects.toThrow("Failed to fetch");
  });
});
