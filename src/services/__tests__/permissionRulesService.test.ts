import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PermissionRulesService from "../PermissionRulesService";

describe("PermissionRulesService", () => {
  let calls: Array<{ url: string; method?: string; body?: unknown; headers?: Record<string, string> }>;
  let response: unknown;
  let status: number;

  beforeEach(() => {
    calls = [];
    response = {};
    status = 200;
    vi.spyOn(global, "fetch").mockImplementation(async (url: any, init: any) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(init.body) : undefined,
        headers: init?.headers,
      });
      return {
        ok: status < 400,
        status,
        json: async () => response,
      } as Response;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("lists with only the filters given", async () => {
    response = [];
    await PermissionRulesService.list({ scope: "conversation", conversationId: "c1" });
    expect(calls[0].url).toMatch(/\/permissions\/rules\?scope=conversation&conversationId=c1$/);
    expect(calls[0].method).toBe("GET");
    await PermissionRulesService.list();
    expect(calls[1].url).toMatch(/\/permissions\/rules$/);
  });

  it("creates, updates and deletes against the rule id", async () => {
    await PermissionRulesService.create({ rule: "read_file", decision: "deny", scope: "profile" });
    expect(calls[0]).toMatchObject({ method: "POST", body: { rule: "read_file", decision: "deny", scope: "profile" } });

    await PermissionRulesService.update("a/b", { enabled: false });
    expect(calls[1].url).toMatch(/\/permissions\/rules\/a%2Fb$/);
    expect(calls[1]).toMatchObject({ method: "PUT", body: { enabled: false } });

    await PermissionRulesService.remove("r1");
    expect(calls[2].url).toMatch(/\/permissions\/rules\/r1$/);
    expect(calls[2].method).toBe("DELETE");
  });

  it("tests, proposes and fetches suggestions", async () => {
    await PermissionRulesService.test({ toolName: "execute_shell", args: { command: "ls" } });
    expect(calls[0].url).toMatch(/\/permissions\/rules\/test$/);
    expect(calls[0].body).toEqual({ toolName: "execute_shell", args: { command: "ls" } });

    await PermissionRulesService.propose({ toolName: "write_file", args: { path: "a" }, workspaceRoot: "/ws" });
    expect(calls[1].url).toMatch(/\/permissions\/rules\/propose$/);

    await PermissionRulesService.suggestions();
    expect(calls[2].url).toMatch(/\/permissions\/rules\/suggestions$/);
    expect(calls[2].method).toBe("GET");
  });

  it("surfaces the server's validation message", async () => {
    status = 400;
    response = { error: "rule: Unknown capability \"telepathy\"." };
    await expect(
      PermissionRulesService.create({ rule: "capability:telepathy", decision: "deny", scope: "profile" }),
    ).rejects.toThrow(/Unknown capability/);
  });
});
