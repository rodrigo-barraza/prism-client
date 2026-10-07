// @vitest-environment node
/**
 * The workspace-agent downloads: a plain link cannot carry the user's
 * token, so this route calls prism-service for the signed-in user — with a
 * token minted for them, never a service secret — and streams the file back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({
  auth,
  ALLOWED_EMAILS: ["owner@example.com"],
  PRISM_USERS: new Map([["owner@example.com", "rodrigo"]]),
}));

import { GET } from "../route";

const SECRET = "test-user-token-secret";
let upstream: ReturnType<typeof vi.fn>;

function download(artifact: string, query = "") {
  return GET(
    new Request(`http://localhost:3333/api/prism/workspaces/download/${artifact}${query}`, {
      headers: { "sec-fetch-site": "same-origin", cookie: "authjs.session-token=browser-session" },
    }),
    { params: Promise.resolve({ artifact }) },
  );
}

describe("GET /api/prism/workspaces/download/[artifact]", () => {
  beforeEach(() => {
    process.env.PRISM_SERVICE_URL = "http://prism.internal:7777";
    process.env.PRISM_USER_TOKEN_SECRET = SECRET;
    auth.mockReset();
    auth.mockResolvedValue({ user: { id: "1", email: "owner@example.com", roles: ["admin"] }, expires: "2099-01-01" });
    upstream = vi.fn(async () =>
      new Response("installer-bytes", {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": 'attachment; filename="Prism-Workspace-Agent-Setup.exe"',
        },
      }),
    );
    vi.stubGlobal("fetch", upstream);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the file as the signed-in user, with a token minted for them", async () => {
    const response = await download("tray-app", "?platform=windows");
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://prism.internal:7777/workspaces/download/tray-app?platform=windows");

    const headers = new Headers(init.headers);
    expect(headers.get("x-api-secret")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    const token = headers.get("authorization")!.replace(/^Bearer /, "");
    const [header, payload, signature] = token.split(".");
    expect(createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url")).toBe(signature);
    expect(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).toMatchObject({
      sub: "rodrigo",
      email: "owner@example.com",
      aud: "prism-service",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Prism-Workspace-Agent-Setup.exe"');
    expect(await response.text()).toBe("installer-bytes");
  });

  it("serves the connector script without a platform", async () => {
    await download("agent");
    expect(upstream.mock.calls[0][0]).toBe("http://prism.internal:7777/workspaces/download/agent");
  });

  it("knows only the two downloads", async () => {
    const response = await download("config");
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses a signed-out request", async () => {
    auth.mockResolvedValue(null);
    const response = await download("agent");
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
});
