/**
 * The token manager (prismTokenManager.ts): one request for the token,
 * cached; renewed five minutes before it expires, on a timer and on
 * demand; and the session's end announced, never swallowed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// tests/setup.ts stubs the manager for every other test.
vi.unmock("../prismTokenManager");

import {
  currentPrismToken,
  forgetPrismToken,
  PRISM_TOKEN_REFRESH_LEAD_MILLISECONDS,
  PRISM_TOKEN_ROUTE,
  PrismSignInRequiredError,
  renewPrismToken,
  requestPrismToken,
} from "../prismTokenManager";
import { EVENT_NAME_PRISM_SIGN_IN_REQUIRED } from "../../constants";

const T0 = Date.UTC(2026, 9, 6, 18, 0, 0);
const HOUR = 60 * 60_000;

/** A JWT-shaped token whose claims give it `lifetimeSeconds` from `issuedAtSeconds`. */
function jwt(name: string, issuedAtSeconds: number, lifetimeSeconds = 3600): string {
  const claims = { sub: "rodrigo", iat: issuedAtSeconds, exp: issuedAtSeconds + lifetimeSeconds };
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${name}`;
}

let tokenRoute: ReturnType<typeof vi.fn>;
let issued: string[];

/** The token route, issuing t1, t2, … — `skewMilliseconds` is how far the server's clock is behind. */
function serveTokens({ skewMilliseconds = 0 } = {}) {
  issued = [];
  tokenRoute = vi.fn(async () => {
    const serverNow = Math.floor((Date.now() - skewMilliseconds) / 1000);
    const token = jwt(`t${issued.length + 1}`, serverNow);
    issued.push(token);
    return new Response(
      JSON.stringify({ token, expiresAt: (serverNow + 3600) * 1000, username: "rodrigo", roles: ["admin"] }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", tokenRoute);
}

describe("prismTokenManager", () => {
  beforeEach(() => {
    forgetPrismToken();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    serveTokens();
  });

  afterEach(() => {
    forgetPrismToken();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fetches the token once, on the session cookie, and serves it from the cache", async () => {
    expect(currentPrismToken()).toBeNull();
    const first = await requestPrismToken();
    const second = await requestPrismToken();
    expect(second).toBe(first);
    expect(first).toBe(issued[0]);
    expect(currentPrismToken()).toBe(first);
    expect(tokenRoute).toHaveBeenCalledTimes(1);
    expect(tokenRoute).toHaveBeenCalledWith(PRISM_TOKEN_ROUTE, {
      cache: "no-store",
      credentials: "same-origin",
    });
  });

  it("shares one request among everything that asks at once", async () => {
    const tokens = await Promise.all([requestPrismToken(), requestPrismToken(), renewPrismToken()]);
    expect(new Set(tokens).size).toBe(1);
    expect(tokenRoute).toHaveBeenCalledTimes(1);
  });

  it("renews the token five minutes before it expires, on its own", async () => {
    await requestPrismToken();
    const renewIn = HOUR - PRISM_TOKEN_REFRESH_LEAD_MILLISECONDS;
    await vi.advanceTimersByTimeAsync(renewIn - 1);
    expect(tokenRoute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tokenRoute).toHaveBeenCalledTimes(2);
    expect(currentPrismToken()).toBe(issued[1]);
  });

  it("asks again once the renewal is due, even when the timer never ran (a sleeping laptop)", async () => {
    await requestPrismToken();
    vi.setSystemTime(T0 + HOUR - PRISM_TOKEN_REFRESH_LEAD_MILLISECONDS + 1);
    expect(await requestPrismToken()).toBe(issued[1]);
    expect(tokenRoute).toHaveBeenCalledTimes(2);
  });

  it("after a 401, renews — unless another request already replaced the refused token", async () => {
    const refused = await requestPrismToken();
    expect(await renewPrismToken(refused)).toBe(issued[1]);
    expect(await renewPrismToken(refused)).toBe(issued[1]);
    expect(tokenRoute).toHaveBeenCalledTimes(2);
    // Before a socket reconnects: always a new one.
    expect(await renewPrismToken()).toBe(issued[2]);
  });

  it("trusts the token's own lifetime over a browser clock that disagrees with the server's", async () => {
    serveTokens({ skewMilliseconds: 3 * HOUR });
    await requestPrismToken();
    await requestPrismToken();
    expect(tokenRoute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HOUR - PRISM_TOKEN_REFRESH_LEAD_MILLISECONDS);
    expect(tokenRoute).toHaveBeenCalledTimes(2);
  });

  it("signed out (401): throws PrismSignInRequiredError, announces it, keeps no token", async () => {
    await requestPrismToken();
    const announced = vi.fn();
    window.addEventListener(EVENT_NAME_PRISM_SIGN_IN_REQUIRED, announced);
    tokenRoute.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Sign in to use Prism." }), { status: 401 }));

    const failure = await renewPrismToken().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PrismSignInRequiredError);
    expect((failure as PrismSignInRequiredError).status).toBe(401);
    expect(announced).toHaveBeenCalledTimes(1);
    expect((announced.mock.calls[0][0] as CustomEvent).detail).toEqual({ status: 401 });
    expect(currentPrismToken()).toBeNull();
    window.removeEventListener(EVENT_NAME_PRISM_SIGN_IN_REQUIRED, announced);
  });

  it("an account that may not use Prism (403) is announced as such", async () => {
    const announced = vi.fn();
    window.addEventListener(EVENT_NAME_PRISM_SIGN_IN_REQUIRED, announced);
    tokenRoute.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    await expect(requestPrismToken()).rejects.toMatchObject({ status: 403 });
    expect((announced.mock.calls[0][0] as CustomEvent).detail).toEqual({ status: 403 });
    window.removeEventListener(EVENT_NAME_PRISM_SIGN_IN_REQUIRED, announced);
  });

  it("a broken token route is an error, not a sign-out", async () => {
    const announced = vi.fn();
    window.addEventListener(EVENT_NAME_PRISM_SIGN_IN_REQUIRED, announced);
    tokenRoute.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Prism sign-in is not configured (PRISM_USER_TOKEN_SECRET)." }), {
        status: 503,
      }),
    );
    const failure = await requestPrismToken().catch((error: unknown) => error);
    expect(failure).not.toBeInstanceOf(PrismSignInRequiredError);
    expect((failure as Error).message).toBe("Prism sign-in is not configured (PRISM_USER_TOKEN_SECRET).");
    expect(announced).not.toHaveBeenCalled();
    window.removeEventListener(EVENT_NAME_PRISM_SIGN_IN_REQUIRED, announced);
  });

  it("forgets the token and its renewal on sign-out", async () => {
    await requestPrismToken();
    forgetPrismToken();
    expect(currentPrismToken()).toBeNull();
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(tokenRoute).toHaveBeenCalledTimes(1);
  });
});
