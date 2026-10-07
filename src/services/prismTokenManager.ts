/**
 * The signed-in user's Prism token: what every call to prism-service
 * carries, because prism-service accepts nothing else from a browser.
 *
 * GET /api/prism-token signs one for the session, good for an hour. This
 * keeps the current one: fetched once and cached, renewed five minutes
 * before it expires — on a timer, so a header built synchronously
 * (serviceHeaders.ts) never carries a stale one — and on demand after a
 * 401 (prismFetch.ts) or before a socket reconnects (agentStream.ts).
 * Concurrent asks share one request. When the session itself is gone (the
 * route answers 401, or 403 for an account that may not use Prism) it
 * announces EVENT_NAME_PRISM_SIGN_IN_REQUIRED, and the app goes to the
 * sign-in page (PrismSessionGateComponent).
 */

import { EVENT_NAME_PRISM_SIGN_IN_REQUIRED } from "@/constants";

export const PRISM_TOKEN_ROUTE = "/api/prism-token";

/** A token is renewed this long before it expires. */
export const PRISM_TOKEN_REFRESH_LEAD_MILLISECONDS = 5 * 60_000;

/** Never renew sooner than this after the last renewal, whatever the clocks say. */
const MINIMUM_RENEWAL_DELAY_MILLISECONDS = 30_000;

export interface PrismTokenGrant {
  token: string;
  /** When the token expires: epoch milliseconds, by the server's clock. */
  expiresAt: number;
  /** The Prism username the token speaks for. */
  username: string;
  roles: string[];
}

export class PrismSignInRequiredError extends Error {
  /** 401: signed out. 403: signed in with an account that may not use Prism. */
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 403 ? "This account may not use Prism." : "Sign in to use Prism.");
    this.name = "PrismSignInRequiredError";
    this.status = status;
  }
}

let current: { grant: PrismTokenGrant; renewAt: number } | null = null;
let pending: Promise<PrismTokenGrant> | null = null;
let renewalTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by forgetPrismToken: a request already in flight then stores nothing. */
let generation = 0;

/**
 * How long a token lives, from its own claims (`exp − iat`) and so counted
 * from when it arrived: a browser clock that disagrees with the server's
 * cannot make every token look stale (or fresh forever).
 */
function lifetimeMilliseconds(grant: PrismTokenGrant, receivedAt: number): number {
  try {
    const payload = JSON.parse(
      atob(grant.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { iat?: unknown; exp?: unknown };
    if (
      typeof payload.iat === "number" &&
      typeof payload.exp === "number" &&
      payload.exp > payload.iat
    ) {
      return (payload.exp - payload.iat) * 1000;
    }
  } catch {
    // Not a JWT we can read: the server's own expiry is all there is.
  }
  return grant.expiresAt - receivedAt;
}

function store(grant: PrismTokenGrant): void {
  const receivedAt = Date.now();
  const renewIn = Math.max(
    lifetimeMilliseconds(grant, receivedAt) - PRISM_TOKEN_REFRESH_LEAD_MILLISECONDS,
    MINIMUM_RENEWAL_DELAY_MILLISECONDS,
  );
  current = { grant, renewAt: receivedAt + renewIn };
  if (renewalTimer) clearTimeout(renewalTimer);
  renewalTimer = setTimeout(() => {
    renewalTimer = null;
    // A renewal that fails leaves the old token in place; the next
    // request finds it due and asks again.
    renewGrant().catch(() => {});
  }, renewIn);
}

function announceSignInRequired(status: 401 | 403): void {
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME_PRISM_SIGN_IN_REQUIRED, { detail: { status } }),
  );
}

async function fetchGrant(): Promise<PrismTokenGrant> {
  const response = await fetch(PRISM_TOKEN_ROUTE, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401 || response.status === 403) {
    forgetPrismToken();
    announceSignInRequired(response.status);
    throw new PrismSignInRequiredError(response.status);
  }
  const body = (await response.json().catch(() => null)) as {
    token?: unknown;
    expiresAt?: unknown;
    username?: unknown;
    roles?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `The Prism token route answered ${response.status}`,
    );
  }
  if (typeof body?.token !== "string" || typeof body.expiresAt !== "number") {
    throw new Error("The Prism token route answered without a token");
  }
  return {
    token: body.token,
    expiresAt: body.expiresAt,
    username: typeof body.username === "string" ? body.username : "",
    roles: Array.isArray(body.roles)
      ? body.roles.filter((role): role is string => typeof role === "string")
      : [],
  };
}

function renewGrant(): Promise<PrismTokenGrant> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The Prism token is fetched in the browser"));
  }
  if (!pending) {
    const startedIn = generation;
    pending = fetchGrant()
      .then((grant) => {
        if (startedIn === generation) store(grant);
        return grant;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** The token in hand, if any — for a header built synchronously. */
export function currentPrismToken(): string | null {
  return current?.grant.token ?? null;
}

/** A token good for at least five more minutes: the cached one, or a new one. */
export async function requestPrismToken(): Promise<string> {
  if (current && Date.now() < current.renewAt) return current.grant.token;
  return (await renewGrant()).token;
}

/**
 * A new token: after prism-service refused `rejected` (a 401), or before a
 * socket reconnects. When another request already replaced `rejected`,
 * that replacement is the answer.
 */
export async function renewPrismToken(rejected?: string): Promise<string> {
  if (
    rejected !== undefined &&
    current &&
    current.grant.token !== rejected &&
    Date.now() < current.renewAt
  ) {
    return current.grant.token;
  }
  return (await renewGrant()).token;
}

/** Drop the token in hand (signing out, a session that is gone). */
export function forgetPrismToken(): void {
  generation += 1;
  current = null;
  if (renewalTimer) clearTimeout(renewalTimer);
  renewalTimer = null;
}
