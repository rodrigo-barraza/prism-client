// @vitest-environment node
/**
 * The sign-in gate (proxy.ts → Auth.js `authorized` → lib/gate.ts), driven
 * with real Auth.js session cookies: signed out, signed in but not on
 * PRISM_ALLOWED_EMAILS, and allowlisted — on the public domain and the LAN
 * alike. Then the matcher, and the sign-in callback both providers share.
 */
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET = "test-auth-secret-for-the-gate-tests-only";
  process.env.PRISM_ALLOWED_EMAILS = "owner@example.com";
  process.env.PRISM_USERS = "owner@example.com=rodrigo";
});

import { encode } from "next-auth/jwt";
import { NextRequest, type NextFetchEvent } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "../proxy";
import { authConfig } from "../auth";

/** A real Auth.js session cookie (an https origin gets the __Secure- one). */
async function sessionCookie(email: string, isSecure: boolean): Promise<string> {
  const name = `${isSecure ? "__Secure-" : ""}authjs.session-token`;
  const token = await encode({
    token: { name: "Someone", email, sub: `user-${email}`, roles: [] },
    secret: process.env.AUTH_SECRET!,
    salt: name,
  });
  return `${name}=${token}`;
}

/** A request as Next hands it to the proxy: with its Host and forwarded protocol. */
async function gate(url: string, { email, headers = {} }: { email?: string; headers?: Record<string, string> } = {}) {
  const target = new URL(url);
  const requestHeaders = new Headers({
    host: target.host,
    "x-forwarded-proto": target.protocol.replace(":", ""),
    ...headers,
  });
  if (email) {
    const isSecure = requestHeaders.get("x-forwarded-proto") === "https";
    requestHeaders.set("cookie", await sessionCookie(email, isSecure));
  }
  return proxy(new NextRequest(url, { headers: requestHeaders }), {} as NextFetchEvent);
}

const isThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";

describe("the gate, signed out", () => {
  it("sends a page to /login, coming back to it", async () => {
    const response = await gate("http://localhost:3333/chat?conversation=c-1");
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe("http://localhost:3333/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/chat?conversation=c-1");
    expect(location.searchParams.get("error")).toBeNull();
  });

  it("redirects to the origin the browser used, behind the reverse proxy", async () => {
    const response = await gate("http://0.0.0.0:3333/settings", {
      headers: { host: "0.0.0.0:3333", "x-forwarded-host": "prism.rod.dev", "x-forwarded-proto": "https" },
    });
    expect(new URL(response.headers.get("location")!).origin).toBe("https://prism.rod.dev");
  });

  it("answers an API route with 401", async () => {
    const response = await gate("http://localhost:3333/api/prism-token");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in to use Prism." });
  });

  it("gives a browser on the LAN no way around it", async () => {
    for (const url of ["http://192.168.86.2:3333/chat", "http://localhost:3333/admin", "http://127.0.0.1:3333/api/tools/admin/tool-calls"]) {
      const response = await gate(url);
      expect(isThrough(response)).toBe(false);
      expect([307, 401]).toContain(response.status);
    }
  });

  it("lets the sign-in page and public files through", async () => {
    for (const path of ["/login", "/icon-192x192.png", "/manifest.webmanifest", "/avatars/taz.jpg"]) {
      expect(isThrough(await gate(`http://localhost:3333${path}`))).toBe(true);
    }
  });
});

describe("the gate, signed in with an account that is not on the list", () => {
  it("sends a page back to /login with AccessDenied", async () => {
    const response = await gate("http://localhost:3333/chat", { email: "stranger@example.com" });
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("AccessDenied");
  });

  it("answers an API route with 403", async () => {
    const response = await gate("http://localhost:3333/api/tools/admin/tool-calls", {
      email: "stranger@example.com",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "This account may not use Prism." });
  });
});

describe("the gate, signed in and allowlisted", () => {
  it("lets pages and API routes through", async () => {
    for (const path of ["/chat", "/admin", "/api/prism-token", "/api/tools/agentic/task/list"]) {
      expect(isThrough(await gate(`http://localhost:3333${path}`, { email: "Owner@Example.com" }))).toBe(true);
    }
  });

  it("lets the owner in on the public domain, behind the reverse proxy", async () => {
    const response = await gate("http://0.0.0.0:3333/chat", {
      email: "owner@example.com",
      headers: { host: "prism.rod.dev", "x-forwarded-proto": "https" },
    });
    expect(isThrough(response)).toBe(true);
  });
});

describe("the gate's matcher", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it("never sends Auth.js's routes, build assets, favicon.ico or sw.js through", () => {
    for (const url of ["/api/auth/signin", "/api/auth/callback/google", "/_next/static/chunks/main.js", "/_next/image?url=x", "/favicon.ico", "/sw.js"]) {
      expect(matches(url)).toBe(false);
    }
  });

  it("sends every page and every other API route through", () => {
    for (const url of ["/", "/chat", "/admin/traces", "/login", "/api/prism-token", "/api/tools/agentic/file/raw", "/api/sessions/tracker/client.js", "/api/prism/workspaces/download/agent"]) {
      expect(matches(url)).toBe(true);
    }
  });
});

describe("Auth.js callbacks", () => {
  const signIn = authConfig.callbacks!.signIn! as (_parameters: {
    user: { email?: string | null };
    account: { provider: string; type: string } | null;
  }) => boolean | Promise<boolean>;

  it("signs in an allowlisted email, with Google or a password", async () => {
    expect(await signIn({ user: { email: "owner@example.com" }, account: { provider: "google", type: "oidc" } })).toBe(true);
    expect(await signIn({ user: { email: "Owner@Example.com" }, account: { provider: "credentials", type: "credentials" } })).toBe(true);
  });

  it("refuses any other email, with either provider", async () => {
    expect(await signIn({ user: { email: "stranger@example.com" }, account: { provider: "google", type: "oidc" } })).toBe(false);
    expect(await signIn({ user: { email: "stranger@example.com" }, account: { provider: "credentials", type: "credentials" } })).toBe(false);
    expect(await signIn({ user: { email: null }, account: { provider: "credentials", type: "credentials" } })).toBe(false);
  });

  it("authorized() is the gate, not a blanket yes", async () => {
    const authorized = authConfig.callbacks!.authorized!;
    const request = new NextRequest("http://localhost:3333/chat");
    expect(await authorized({ request, auth: null })).toBeInstanceOf(Response);
    expect(
      await authorized({
        request,
        auth: { user: { id: "1", email: "owner@example.com" }, expires: "2099-01-01T00:00:00.000Z" },
      }),
    ).toBe(true);
  });
});
