// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  mintPrismUserToken,
  PRISM_TOKEN_AUDIENCE,
  PRISM_TOKEN_ISSUER,
  PRISM_TOKEN_LIFETIME_SECONDS,
} from "../prismUserToken";

const SECRET = "test-user-token-secret";
const NOW = Date.UTC(2026, 9, 6, 18, 0, 0);
const OWNER = { username: "rodrigo", email: "owner@example.com", roles: ["admin"] };

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("mintPrismUserToken", () => {
  it("signs an HS256 JWT that verifies with the secret's UTF-8 bytes", () => {
    const { token } = mintPrismUserToken(OWNER, SECRET, NOW);
    const [header, payload, signature] = token.split(".");
    expect(decodeSegment(header)).toEqual({ alg: "HS256", typ: "JWT" });
    const expected = createHmac("sha256", Buffer.from(SECRET, "utf8"))
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(signature).toBe(expected);
    // Another key does not verify it.
    expect(createHmac("sha256", "another-secret").update(`${header}.${payload}`).digest("base64url")).not.toBe(signature);
  });

  it("carries the contract's claims: sub = the Prism username, an hour, prism-client → prism-service", () => {
    const grant = mintPrismUserToken(OWNER, SECRET, NOW);
    const claims = decodeSegment(grant.token.split(".")[1]);
    const issuedAt = Math.floor(NOW / 1000);
    expect(claims).toEqual({
      sub: "rodrigo",
      email: "owner@example.com",
      roles: ["admin"],
      iat: issuedAt,
      exp: issuedAt + 3600,
      iss: "prism-client",
      aud: "prism-service",
    });
    expect(PRISM_TOKEN_LIFETIME_SECONDS).toBe(3600);
    expect([PRISM_TOKEN_ISSUER, PRISM_TOKEN_AUDIENCE]).toEqual(["prism-client", "prism-service"]);
    expect(grant.expiresAt).toBe((issuedAt + 3600) * 1000);
    expect(grant).toMatchObject(OWNER);
  });

  it("never carries the secret, and refuses to sign without one", () => {
    const { token } = mintPrismUserToken(OWNER, SECRET, NOW);
    const decoded = token
      .split(".")
      .slice(0, 2)
      .map((segment) => Buffer.from(segment, "base64url").toString("utf8"))
      .join("");
    expect(`${token}${decoded}`).not.toContain(SECRET);
    expect(() => mintPrismUserToken(OWNER, "", NOW)).toThrow("PRISM_USER_TOKEN_SECRET");
  });
});
