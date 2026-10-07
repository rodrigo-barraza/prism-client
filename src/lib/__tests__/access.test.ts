import { describe, it, expect } from "vitest";
import {
  isEmailAllowed,
  isPublicPath,
  isSameOriginRequest,
  parseAllowlist,
  parsePrismUsers,
  prismUsernameFor,
  publicOrigin,
} from "../access";

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("allowlist", () => {
  it("parses a comma-separated list, case-insensitively", () => {
    expect(parseAllowlist(" A@x.co, b@y.co ,,")).toEqual(["a@x.co", "b@y.co"]);
    expect(parseAllowlist(undefined)).toEqual([]);
  });

  it("admits listed emails only — and nobody when the list is empty", () => {
    const list = parseAllowlist("owner@example.com");
    expect(isEmailAllowed("Owner@Example.com", list)).toBe(true);
    expect(isEmailAllowed(" owner@example.com ", list)).toBe(true);
    expect(isEmailAllowed("stranger@example.com", list)).toBe(false);
    expect(isEmailAllowed(undefined, list)).toBe(false);
    expect(isEmailAllowed(null, list)).toBe(false);
    expect(isEmailAllowed("owner@example.com", [])).toBe(false);
    expect(isEmailAllowed("owner@example.com", parseAllowlist(""))).toBe(false);
  });
});

describe("the Prism username a login becomes", () => {
  const users = parsePrismUsers(" Owner@Example.com = rodrigo , friend@example.com=pal, broken, =nobody, x@y.z=");

  it("parses email=username pairs, ignoring malformed ones", () => {
    expect([...users]).toEqual([
      ["owner@example.com", "rodrigo"],
      ["friend@example.com", "pal"],
    ]);
    expect(parsePrismUsers(undefined).size).toBe(0);
  });

  it("is PRISM_USERS' entry for the email, matched case-insensitively", () => {
    expect(prismUsernameFor("owner@example.com", users)).toBe("rodrigo");
    expect(prismUsernameFor("OWNER@example.COM", users)).toBe("rodrigo");
  });

  it("is the email's local part when PRISM_USERS has none", () => {
    expect(prismUsernameFor("Someone.Else@example.com", users)).toBe("someone.else");
    expect(prismUsernameFor("owner@example.com", new Map())).toBe("owner");
  });
});

describe("isPublicPath — what needs no sign-in", () => {
  it.each([
    "/login",
    "/login/",
    "/icon.png",
    "/apple-icon.png",
    "/icon-192x192.png",
    "/manifest.webmanifest",
    "/cat-spinning.gif",
    "/avatars/taz.jpg",
    "/pcm-processor.js",
    "/sw.js",
    "/favicon.ico",
  ])("%s is public", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/chat",
    "/admin",
    "/login-help",
    "/login/extra",
    "/api/prism-token",
    "/api/tools/agentic/file/raw",
    "/api/tools/image.png",
    "/api/sessions/tracker/client.js",
    "/admin/chat/x.js",
    "/avatars/nested/taz.jpg",
  ])("%s is gated", (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });
});

describe("publicOrigin", () => {
  it("rebuilds the origin the browser used, not the server's bind address", () => {
    const fallback = "http://0.0.0.0:3333";
    expect(
      publicOrigin(headers({ host: "prism.rod.dev", "x-forwarded-proto": "https" }), fallback),
    ).toBe("https://prism.rod.dev");
    expect(
      publicOrigin(
        headers({
          host: "192.168.86.2:3333",
          "x-forwarded-host": "prism.rod.dev",
          "x-forwarded-proto": "https",
        }),
        fallback,
      ),
    ).toBe("https://prism.rod.dev");
    expect(publicOrigin(headers({ host: "192.168.86.2:3333" }), fallback)).toBe(
      "http://192.168.86.2:3333",
    );
    expect(publicOrigin(headers({}), fallback)).toBe(fallback);
  });
});

describe("isSameOriginRequest", () => {
  it("accepts Prism's own pages and a URL the user typed", () => {
    expect(isSameOriginRequest(headers({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(headers({ "sec-fetch-site": "none" }))).toBe(true);
    expect(
      isSameOriginRequest(headers({ host: "prism.rod.dev", origin: "https://prism.rod.dev" })),
    ).toBe(true);
  });

  it("refuses another site's page", () => {
    expect(isSameOriginRequest(headers({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(headers({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(
      isSameOriginRequest(headers({ host: "prism.rod.dev", origin: "https://evil.example" })),
    ).toBe(false);
    expect(isSameOriginRequest(headers({ host: "prism.rod.dev", origin: "null" }))).toBe(false);
  });

  it("lets non-browser clients through (no page can forge them)", () => {
    expect(isSameOriginRequest(headers({ host: "prism.rod.dev" }))).toBe(true);
  });
});
