import type { MCPPrompt, MCPResource } from "@/types/types";

/**
 * MCP in the composer: prompts are offered in the `/` menu, resources in the
 * `@` menu. A resource mention is sent as `@mcp:<server>:<uri>` and its
 * content is attached to the message when it is sent.
 */

/** How much of one resource is attached to a message. */
export const MCP_RESOURCE_MAX_CHARACTERS = 50_000;

const REFERENCE_PATTERN = /@mcp:([A-Za-z0-9_-]+):(\S+)/g;

export function mcpResourceReference(server: string, uri: string): string {
  return `@mcp:${server}:${uri}`;
}

export function filterMcpPrompts(prompts: MCPPrompt[], query: string, limit = 8): MCPPrompt[] {
  const needle = query.toLowerCase();
  return prompts
    .filter((prompt) =>
      [prompt.name, prompt.title ?? "", prompt.server, `${prompt.server}:${prompt.name}`].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    )
    .slice(0, limit);
}

export function filterMcpResources(resources: MCPResource[], query: string, limit = 8): MCPResource[] {
  const needle = query.toLowerCase();
  return resources
    .filter((resource) =>
      [resource.name, resource.uri, resource.server].some((field) => field.toLowerCase().includes(needle)),
    )
    .slice(0, limit);
}

export function extractMcpResourceReferences(text: string): Array<{ server: string; uri: string }> {
  const seen = new Set<string>();
  const references: Array<{ server: string; uri: string }> = [];
  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const key = `${match[1]}\u0000${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({ server: match[1], uri: match[2] });
  }
  return references;
}

/**
 * Attach the content of every `@mcp:` resource the message mentions, so the
 * model reads it without a tool call. A resource that can't be read is
 * attached as a note saying so.
 */
export async function appendMcpResourceContext(
  content: string,
  text: string,
  read: (_server: string, _uri: string) => Promise<string | null>,
): Promise<string> {
  const references = extractMcpResourceReferences(text);
  if (references.length === 0) return content;
  const blocks = await Promise.all(
    references.map(async ({ server, uri }) => {
      let body: string | null = null;
      try {
        body = await read(server, uri);
      } catch {
        body = null;
      }
      const truncated =
        body && body.length > MCP_RESOURCE_MAX_CHARACTERS
          ? `${body.slice(0, MCP_RESOURCE_MAX_CHARACTERS)}\n[… truncated at ${MCP_RESOURCE_MAX_CHARACTERS} characters]`
          : body;
      const attributes = `server="${server.replace(/"/g, "")}" uri="${uri.replace(/"/g, "%22")}"`;
      return truncated === null
        ? `<mcp-resource ${attributes} unavailable="true" />`
        : `<mcp-resource ${attributes}>\n${truncated}\n</mcp-resource>`;
    }),
  );
  return `${content}\n\n${blocks.join("\n\n")}`;
}
