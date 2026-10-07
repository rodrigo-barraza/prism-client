/**
 * fetch() for prism-service. Every request carries the signed-in user's
 * token (`Authorization: Bearer …`, prismTokenManager.ts), waiting for the
 * first one if it is not in hand yet. A 401 means prism-service refused
 * that token — it expired while the tab slept, or the signing key changed
 * — so the token is renewed once and the request sent once more; a second
 * 401 goes back to the caller like any other answer.
 */

import { HEADER_AUTHORIZATION } from "@/constants";
import { renewPrismToken, requestPrismToken } from "./prismTokenManager";

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

/** `headers`, whatever shape they came in, with the user's token as the Authorization. */
export function withPrismToken(headers: HeadersInit | undefined, token: string): HeadersInit {
  if (headers instanceof Headers || Array.isArray(headers)) {
    const copy = new Headers(headers);
    copy.set(HEADER_AUTHORIZATION, bearer(token));
    return copy;
  }
  const copy: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() !== HEADER_AUTHORIZATION.toLowerCase()) copy[name] = value;
  }
  copy[HEADER_AUTHORIZATION] = bearer(token);
  return copy;
}

export async function prismFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await requestPrismToken();
  const response = await fetch(input, { ...init, headers: withPrismToken(init.headers, token) });
  if (response.status !== 401) return response;
  let renewed: string;
  try {
    renewed = await renewPrismToken(token);
  } catch {
    // The session is gone; the app is already on its way to the sign-in page.
    return response;
  }
  return fetch(input, { ...init, headers: withPrismToken(init.headers, renewed) });
}
