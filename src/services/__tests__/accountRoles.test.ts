import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ACCOUNTS_URL = "http://accounts.test:5615";
const API_SECRET = "test-api-secret";

// config.ts reads process.env at import time, so stub env first and
// import the module fresh per test.
async function importFetchAccountRoles() {
  vi.resetModules();
  const { fetchAccountRoles } = await import("../accountRoles");
  return fetchAccountRoles;
}

describe("fetchAccountRoles", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ACCOUNTS_SERVICE_URL", ACCOUNTS_URL);
    vi.stubEnv("ACCOUNTS_SERVICE_API_SECRET", API_SECRET);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns roles from the lookup endpoint with the shared secret header", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ email: "hello@rod.dev", roles: ["admin"] }),
    });
    const fetchAccountRoles = await importFetchAccountRoles();

    const retrievedRoles = await fetchAccountRoles("hello@rod.dev");

    expect(retrievedRoles).toEqual(["admin"]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ACCOUNTS_URL}/auth/lookup?email=${encodeURIComponent("hello@rod.dev")}`,
      expect.objectContaining({
        headers: { "x-api-secret": API_SECRET },
      }),
    );
  });

  it("returns no roles without calling fetch when the email is missing", async () => {
    const fetchAccountRoles = await importFetchAccountRoles();

    expect(await fetchAccountRoles(null)).toEqual([]);
    expect(await fetchAccountRoles("")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no roles without calling fetch when the shared secret is not configured", async () => {
    vi.stubEnv("ACCOUNTS_SERVICE_API_SECRET", "");
    const fetchAccountRoles = await importFetchAccountRoles();

    expect(await fetchAccountRoles("hello@rod.dev")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no roles for unknown accounts (404)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const fetchAccountRoles = await importFetchAccountRoles();

    expect(await fetchAccountRoles("nobody@rod.dev")).toEqual([]);
  });

  it("fails closed when the lookup request throws", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));
    const fetchAccountRoles = await importFetchAccountRoles();

    expect(await fetchAccountRoles("hello@rod.dev")).toEqual([]);
  });

  it("normalizes malformed roles payloads", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ roles: ["admin", 7, null, "viewer"] }),
    });
    const fetchAccountRoles = await importFetchAccountRoles();
    expect(await fetchAccountRoles("hello@rod.dev")).toEqual(["admin", "viewer"]);

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ roles: "admin" }) });
    const fetchAccountRolesAgain = await importFetchAccountRoles();
    expect(await fetchAccountRolesAgain("hello@rod.dev")).toEqual([]);
  });
});
