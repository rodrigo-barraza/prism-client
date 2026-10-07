/**
 * prismFetch: every request to prism-service carries the user's token; a
 * 401 renews it once and retries once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const tokens = vi.hoisted(() => ({
  request: vi.fn(async () => "token-in-hand"),
  renew: vi.fn(async (_rejected?: string) => "token-renewed"),
}));
vi.mock("../prismTokenManager", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../prismTokenManager")>()),
  requestPrismToken: tokens.request,
  renewPrismToken: tokens.renew,
}));

import { prismFetch, withPrismToken } from "../prismFetch";
import { PrismSignInRequiredError } from "../prismTokenManager";

const URL_ = "http://prism.test/conversations";

function answer(status: number) {
  return new Response(JSON.stringify({ status }), { status });
}

describe("prismFetch", () => {
  let network: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tokens.request.mockClear();
    tokens.renew.mockClear();
    network = vi.fn(async () => answer(200));
    vi.stubGlobal("fetch", network);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the token in hand as the Authorization, keeping the caller's request", async () => {
    const controller = new AbortController();
    const response = await prismFetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-project": "prism-client" },
      body: "{}",
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(network).toHaveBeenCalledTimes(1);
    const [url, init] = network.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_);
    expect(init).toMatchObject({ method: "POST", body: "{}", signal: controller.signal });
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "x-project": "prism-client",
      Authorization: "Bearer token-in-hand",
    });
    expect(tokens.renew).not.toHaveBeenCalled();
  });

  it("on a 401, renews the refused token once and sends the request once more", async () => {
    network.mockResolvedValueOnce(answer(401));
    const response = await prismFetch(URL_, { method: "DELETE", body: "{\"id\":1}" });
    expect(response.status).toBe(200);
    expect(tokens.renew).toHaveBeenCalledWith("token-in-hand");
    expect(network).toHaveBeenCalledTimes(2);
    const [, retry] = network.mock.calls[1] as [string, RequestInit];
    expect(retry).toMatchObject({ method: "DELETE", body: "{\"id\":1}" });
    expect((retry.headers as Record<string, string>).Authorization).toBe("Bearer token-renewed");
  });

  it("hands a second 401 to the caller, without asking again", async () => {
    network.mockResolvedValue(answer(401));
    const response = await prismFetch(URL_);
    expect(response.status).toBe(401);
    expect(network).toHaveBeenCalledTimes(2);
    expect(tokens.renew).toHaveBeenCalledTimes(1);
  });

  it("when the session is gone, hands back the 401 it got", async () => {
    network.mockResolvedValueOnce(answer(401));
    tokens.renew.mockRejectedValueOnce(new PrismSignInRequiredError(401));
    const response = await prismFetch(URL_);
    expect(response.status).toBe(401);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("leaves every other answer to the caller", async () => {
    for (const status of [400, 403, 404, 409, 500]) {
      network.mockResolvedValueOnce(answer(status));
      expect((await prismFetch(URL_)).status).toBe(status);
    }
    expect(tokens.renew).not.toHaveBeenCalled();
  });
});

describe("withPrismToken", () => {
  it("replaces any Authorization, whatever case it came in", () => {
    expect(withPrismToken({ authorization: "Bearer old", accept: "*/*" }, "new")).toEqual({
      accept: "*/*",
      Authorization: "Bearer new",
    });
    expect(withPrismToken(undefined, "new")).toEqual({ Authorization: "Bearer new" });
  });

  it("keeps Headers and header lists working", () => {
    const fromHeaders = withPrismToken(new Headers({ Authorization: "Bearer old", accept: "*/*" }), "new");
    expect(new Headers(fromHeaders).get("authorization")).toBe("Bearer new");
    expect(new Headers(fromHeaders).get("accept")).toBe("*/*");
    const fromList = withPrismToken([["accept", "*/*"]], "new");
    expect(new Headers(fromList).get("authorization")).toBe("Bearer new");
  });
});
