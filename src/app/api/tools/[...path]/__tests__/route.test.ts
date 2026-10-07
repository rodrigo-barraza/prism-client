// @vitest-environment node
/**
 * /api/tools/* — the signed-in proxy to tools-service: it adds the service
 * secret, keeps the browser's credentials to itself, and streams both ways
 * (server-sent events included).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({
  auth,
  ALLOWED_EMAILS: ["owner@example.com"],
  PRISM_USERS: new Map(),
}));

import { GET, POST } from "../route";

const TOOLS_SECRET = "test-tools-service-secret";

let upstream: ReturnType<typeof vi.fn>;

function browserRequest(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  return new Request(`http://localhost:3333/api/tools${path}`, {
    ...init,
    headers: { "sec-fetch-site": "same-origin", ...init.headers },
  });
}

/** What reached tools-service: the URL and the request as fetch() got it. */
function upstreamCall(index = 0): { url: string; init: RequestInit & { duplex?: string }; headers: Headers } {
  const [url, init] = upstream.mock.calls[index] as [string, RequestInit & { duplex?: string }];
  return { url, init, headers: new Headers(init.headers) };
}

describe("/api/tools/*", () => {
  beforeEach(() => {
    process.env.TOOLS_SERVICE_URL = "http://tools.internal:5590/";
    process.env.TOOLS_SERVICE_API_SECRET = TOOLS_SECRET;
    auth.mockReset();
    auth.mockResolvedValue({ user: { id: "1", email: "owner@example.com", roles: ["admin"] }, expires: "2099-01-01" });
    upstream = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": "11",
          "x-total-count": "3",
          "set-cookie": "tools=1",
        },
      }),
    );
    vi.stubGlobal("fetch", upstream);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards path, query and method with the service secret — and none of the browser's credentials", async () => {
    const response = await GET(
      browserRequest("/admin/tool-calls?limit=10&status=success", {
        headers: {
          cookie: "authjs.session-token=browser-session",
          authorization: "Bearer browser-token",
          "x-api-secret": "forged-by-the-page",
          accept: "application/json",
          "x-project": "prism-client",
        },
      }),
    );

    expect(upstream).toHaveBeenCalledTimes(1);
    const { url, init, headers } = upstreamCall();
    expect(url).toBe("http://tools.internal:5590/admin/tool-calls?limit=10&status=success");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(headers.get("x-api-secret")).toBe(TOOLS_SECRET);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-project")).toBe("prism-client");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("x-total-count")).toBe("3");
    expect(response.headers.get("content-length")).toBe("11");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("streams a request body up to tools-service", async () => {
    await POST(
      browserRequest("/agentic/task/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project: "coding", limit: 5 }),
      }),
    );
    const { init, headers } = upstreamCall();
    expect(init.method).toBe("POST");
    expect(init.duplex).toBe("half");
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect(headers.get("content-type")).toBe("application/json");
    expect(await new Response(init.body as ReadableStream).json()).toEqual({ project: "coding", limit: 5 });
  });

  it("relays server-sent events frame by frame, uncompressed", async () => {
    const encoder = new TextEncoder();
    let push: (_frame: string) => void = () => {};
    let end: () => void = () => {};
    const events = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (frame) => controller.enqueue(encoder.encode(frame));
        end = () => controller.close();
      },
    });
    upstream.mockResolvedValueOnce(
      new Response(events, {
        status: 200,
        headers: { "content-type": "text/event-stream", "content-encoding": "gzip" },
      }),
    );

    const response = await GET(browserRequest("/agentic/task/stream"));
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    // fetch() decoded the body: neither its encoding nor its length is the browser's.
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    push("data: {\"n\":1}\n\n");
    expect(decoder.decode((await reader.read()).value)).toBe("data: {\"n\":1}\n\n");
    push("data: {\"n\":2}\n\n");
    expect(decoder.decode((await reader.read()).value)).toBe("data: {\"n\":2}\n\n");
    end();
    expect((await reader.read()).done).toBe(true);
  });

  it("refuses a signed-out request without reaching tools-service", async () => {
    auth.mockResolvedValue(null);
    const response = await GET(browserRequest("/admin/tool-calls"));
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses an account that is not on the list", async () => {
    auth.mockResolvedValue({ user: { id: "2", email: "stranger@example.com" }, expires: "2099-01-01" });
    const response = await GET(browserRequest("/admin/tool-calls"));
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses another site's page", async () => {
    const response = await POST(
      browserRequest("/agentic/task/delete", {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("without its own secret configured, still never passes on one a page sent", async () => {
    delete process.env.TOOLS_SERVICE_API_SECRET;
    await GET(browserRequest("/admin/tool-calls", { headers: { "x-api-secret": "forged-by-the-page" } }));
    expect(upstreamCall().headers.get("x-api-secret")).toBeNull();
  });

  it("says so when tools-service cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    upstream.mockRejectedValueOnce(new TypeError("fetch failed"));
    const response = await GET(browserRequest("/admin/tool-calls"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Failed to reach tools-service: fetch failed" });
  });
});
