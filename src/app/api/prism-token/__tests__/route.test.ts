// @vitest-environment node
/**
 * GET /api/prism-token: the signed-in, allowlisted user's token for
 * prism-service — its claims, the username it carries, its expiry — and
 * every way it is refused. The signing secret never leaves the server.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({
  auth,
  ALLOWED_EMAILS: ["owner@example.com", "friend@example.com"],
  PRISM_USERS: new Map([["owner@example.com", "rodrigo"]]),
}));

import { GET } from "../route";

const SECRET = "test-user-token-secret";

function signedIn(email: string, roles: string[] = []) {
  auth.mockResolvedValue({ user: { id: "1", email, roles }, expires: "2099-01-01T00:00:00.000Z" });
}

function tokenRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3333/api/prism-token", {
    headers: { "sec-fetch-site": "same-origin", ...headers },
  });
}

function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("GET /api/prism-token", () => {
  beforeEach(() => {
    auth.mockReset();
    process.env.PRISM_USER_TOKEN_SECRET = SECRET;
  });

  it("answers { token, expiresAt, username, roles } for the owner, with the contract's claims", async () => {
    signedIn("Owner@Example.com", ["admin"]);
    const before = Math.floor(Date.now() / 1000);
    const response = await GET(tokenRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as { token: string; expiresAt: number; username: string; roles: string[] };
    expect(Object.keys(body).sort()).toEqual(["expiresAt", "roles", "token", "username"]);
    expect(body.username).toBe("rodrigo");
    expect(body.roles).toEqual(["admin"]);

    const [header, payload, signature] = body.token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString("utf8"))).toEqual({ alg: "HS256", typ: "JWT" });
    expect(createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url")).toBe(signature);
    const claims = claimsOf(body.token);
    expect(claims).toMatchObject({
      sub: "rodrigo",
      email: "owner@example.com",
      roles: ["admin"],
      iss: "prism-client",
      aud: "prism-service",
    });
    expect(claims.iat as number).toBeGreaterThanOrEqual(before);
    expect((claims.exp as number) - (claims.iat as number)).toBe(3600);
    expect(body.expiresAt).toBe((claims.exp as number) * 1000);
  });

  it("names a user PRISM_USERS does not list by the email's local part", async () => {
    signedIn("friend@example.com");
    const body = (await (await GET(tokenRequest())).json()) as { token: string; username: string; roles: string[] };
    expect(body.username).toBe("friend");
    expect(body.roles).toEqual([]);
    expect(claimsOf(body.token).sub).toBe("friend");
  });

  it("never sends the signing secret", async () => {
    signedIn("owner@example.com", ["admin"]);
    const text = await (await GET(tokenRequest())).text();
    expect(text).not.toContain(SECRET);
  });

  it("refuses a request with no session: 401, no token", async () => {
    auth.mockResolvedValue(null);
    const response = await GET(tokenRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in to use Prism." });
  });

  it("refuses an account that is not on PRISM_ALLOWED_EMAILS: 403", async () => {
    signedIn("stranger@example.com", ["admin"]);
    const response = await GET(tokenRequest());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "This account may not use Prism." });
  });

  it("refuses another site's page, whatever the session", async () => {
    signedIn("owner@example.com", ["admin"]);
    const response = await GET(tokenRequest({ "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(auth).not.toHaveBeenCalled();
  });

  it("mints nothing when PRISM_USER_TOKEN_SECRET is not configured: 503", async () => {
    delete process.env.PRISM_USER_TOKEN_SECRET;
    signedIn("owner@example.com", ["admin"]);
    const response = await GET(tokenRequest());
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.token).toBeUndefined();
  });
});
