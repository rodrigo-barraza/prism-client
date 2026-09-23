import { describe, it, expect, vi } from "vitest";
import {
  MCP_RESOURCE_MAX_CHARACTERS,
  appendMcpResourceContext,
  extractMcpResourceReferences,
  filterMcpPrompts,
  filterMcpResources,
} from "../mcpComposer";
import { createMcpResourceBadge, serializeEditable } from "../mentionUtils";

vi.mock("../../components/MentionBadgeComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));

describe("MCP in the composer", () => {
  it("serializes a resource badge to a reference the send handler resolves", () => {
    const editor = document.createElement("div");
    editor.append("Read ", createMcpResourceBadge("notes", "notes://today", "today"), " please");
    const text = serializeEditable(editor);
    expect(text).toBe("Read @mcp:notes:notes://today please");
    expect(extractMcpResourceReferences(text)).toEqual([{ server: "notes", uri: "notes://today" }]);
  });

  it("attaches each mentioned resource once, truncated, and says when one can't be read", async () => {
    const read = vi.fn(async (_server: string, uri: string) =>
      uri === "notes://big" ? "x".repeat(MCP_RESOURCE_MAX_CHARACTERS + 10) : uri === "notes://gone" ? null : "hello",
    );
    const text = "@mcp:notes:notes://a @mcp:notes:notes://a @mcp:notes:notes://big @mcp:notes:notes://gone";
    const content = await appendMcpResourceContext(text, text, read);
    expect(read).toHaveBeenCalledTimes(3);
    expect(content).toContain('<mcp-resource server="notes" uri="notes://a">\nhello\n</mcp-resource>');
    expect(content).toContain("[… truncated at 50000 characters]");
    expect(content).toContain('<mcp-resource server="notes" uri="notes://gone" unavailable="true" />');
  });

  it("leaves a message without references untouched", async () => {
    const read = vi.fn();
    expect(await appendMcpResourceContext("hi", "hi", read)).toBe("hi");
    expect(read).not.toHaveBeenCalled();
  });

  it("filters prompts and resources by what was typed", () => {
    const prompts = [
      { server: "github", name: "review_pr", title: "Review a PR", description: null, arguments: [] },
      { server: "linear", name: "triage", title: null, description: null, arguments: [] },
    ];
    expect(filterMcpPrompts(prompts, "review").map((prompt) => prompt.name)).toEqual(["review_pr"]);
    expect(filterMcpPrompts(prompts, "linear:").map((prompt) => prompt.name)).toEqual(["triage"]);
    const resources = [
      { server: "notes", uri: "notes://today", name: "today", description: null, mimeType: null },
      { server: "repo", uri: "file:///README.md", name: "README", description: null, mimeType: null },
    ];
    expect(filterMcpResources(resources, "readme").map((resource) => resource.name)).toEqual(["README"]);
  });
});
