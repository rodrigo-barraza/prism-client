import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  serializeEditable,
  flattenTree,
  detectMentionToken,
  filterMentionResults,
  createMentionBadge,
  applyMentionToTextNode,
  placeCaretAfter,
} from "../src/utils/mentionUtils.js";

// ═════════════════════════════════════════════════════════════════
// serializeEditable
// ═════════════════════════════════════════════════════════════════

describe("serializeEditable", () => {
  let root: any;
  beforeEach(() => {
    root = document.createElement("div");
  });

  it("serializes plain text nodes", () => {
    root.appendChild(document.createTextNode("Hello world"));
    expect(serializeEditable(root)).toBe("Hello world");
  });

  it("serializes a mention badge as @path", () => {
    root.appendChild(document.createTextNode("Check "));
    const badge = document.createElement("span");
    badge.dataset.mentionPath = "src/utils/mentionUtils.js";
    badge.textContent = "📄 mentionUtils.js";
    root.appendChild(badge);
    root.appendChild(document.createTextNode(" for details"));
    expect(serializeEditable(root)).toBe(
      "Check @src/utils/mentionUtils.js for details",
    );
  });

  it("serializes multiple mentions", () => {
    root.appendChild(document.createTextNode("Compare "));
    const b1 = document.createElement("span");
    b1.dataset.mentionPath = "src/a.js";
    b1.textContent = "📄 a.js";
    root.appendChild(b1);
    root.appendChild(document.createTextNode(" and "));
    const b2 = document.createElement("span");
    b2.dataset.mentionPath = "src/b.js";
    b2.textContent = "📄 b.js";
    root.appendChild(b2);
    expect(serializeEditable(root)).toBe("Compare @src/a.js and @src/b.js");
  });

  it("serializes <br> as newline", () => {
    root.appendChild(document.createTextNode("line one"));
    root.appendChild(document.createElement("br"));
    root.appendChild(document.createTextNode("line two"));
    expect(serializeEditable(root)).toBe("line one\nline two");
  });

  it("serializes block wrappers (div) with newlines", () => {
    const div1 = document.createElement("div");
    div1.appendChild(document.createTextNode("first"));
    const div2 = document.createElement("div");
    div2.appendChild(document.createTextNode("second"));
    root.appendChild(div1);
    root.appendChild(div2);
    expect(serializeEditable(root)).toBe("first\nsecond");
  });

  it("handles empty element", () => {
    expect(serializeEditable(root)).toBe("");
  });

  it("handles mention-only content", () => {
    const badge = document.createElement("span");
    badge.dataset.mentionPath = "package.json";
    badge.textContent = "📄 package.json";
    root.appendChild(badge);
    expect(serializeEditable(root)).toBe("@package.json");
  });

  it("handles nested block wrappers with mentions", () => {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode("Look at "));
    const badge = document.createElement("span");
    badge.dataset.mentionPath = "src/index.js";
    badge.textContent = "📄 index.js";
    div.appendChild(badge);
    root.appendChild(document.createTextNode("Hello"));
    root.appendChild(div);
    expect(serializeEditable(root)).toBe("Hello\nLook at @src/index.js");
  });
});

// ═════════════════════════════════════════════════════════════════
// flattenTree
// ═════════════════════════════════════════════════════════════════

describe("flattenTree", () => {
  it("flattens a single file", () => {
    const nodes = [{ name: "README.md", type: "file" }];
    expect(flattenTree(nodes)).toEqual([
      { path: "README.md", name: "README.md", type: "file" },
    ]);
  });

  it("flattens a directory with children", () => {
    const nodes = [
      {
        name: "src",
        type: "directory",
        children: [
          { name: "index.js", type: "file" },
          { name: "utils.js", type: "file" },
        ],
      },
    ];
    const result = flattenTree(nodes);
    expect(result).toEqual([
      { path: "src", name: "src", type: "directory" },
      { path: "src/index.js", name: "index.js", type: "file" },
      { path: "src/utils.js", name: "utils.js", type: "file" },
    ]);
  });

  it("flattens deeply nested structures", () => {
    const nodes = [
      {
        name: "a",
        type: "directory",
        children: [
          {
            name: "b",
            type: "directory",
            children: [{ name: "c.js", type: "file" }],
          },
        ],
      },
    ];
    const result = flattenTree(nodes);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ path: "a/b/c.js", name: "c.js", type: "file" });
  });

  it("handles empty array", () => {
    expect(flattenTree([])).toEqual([]);
  });

  it("handles directories without children", () => {
    const nodes = [{ name: "empty-dir", type: "directory", children: [] }];
    expect(flattenTree(nodes)).toEqual([
      { path: "empty-dir", name: "empty-dir", type: "directory" },
    ]);
  });

  it("respects prefix parameter", () => {
    const nodes = [{ name: "file.txt", type: "file" }];
    expect(flattenTree(nodes, "root/sub")).toEqual([
      { path: "root/sub/file.txt", name: "file.txt", type: "file" },
    ]);
  });

  it("handles mixed files and directories at the same level", () => {
    const nodes = [
      { name: "config.json", type: "file" },
      {
        name: "lib",
        type: "directory",
        children: [{ name: "core.js", type: "file" }],
      },
      { name: "README.md", type: "file" },
    ];
    const result = flattenTree(nodes);
    expect(result).toHaveLength(4);
    expect(result.map((e) => e.path)).toEqual([
      "config.json",
      "lib",
      "lib/core.js",
      "README.md",
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════
// detectMentionToken
// ═════════════════════════════════════════════════════════════════

describe("detectMentionToken", () => {
  it("detects @ at the start of text", () => {
    const result = detectMentionToken("@hello", 6);
    expect(result).toEqual({ query: "hello", anchorOffset: 0 });
  });

  it("detects @ after a space", () => {
    const result = detectMentionToken("check @src/file", 15);
    expect(result).toEqual({ query: "src/file", anchorOffset: 6 });
  });

  it("detects partial query mid-typing", () => {
    const result = detectMentionToken("For @bir", 8);
    expect(result).toEqual({ query: "bir", anchorOffset: 4 });
  });

  it("detects @ after newline", () => {
    const result = detectMentionToken("line one\n@test", 14);
    expect(result).toEqual({ query: "test", anchorOffset: 9 });
  });

  it("returns null when no @ is present", () => {
    expect(detectMentionToken("no mention here", 15)).toBeNull();
  });

  it("returns null when @ is preceded by non-space character", () => {
    // email-like pattern should not trigger
    expect(detectMentionToken("user@domain", 11)).toBeNull();
  });

  it("returns empty query when cursor is right after @", () => {
    const result = detectMentionToken("@", 1);
    expect(result).toEqual({ query: "", anchorOffset: 0 });
  });

  it("returns null when cursor is before the @", () => {
    expect(detectMentionToken("hello @world", 3)).toBeNull();
  });

  it("detects path with slashes", () => {
    const result = detectMentionToken("see @src/components/Foo", 23);
    expect(result).toEqual({ query: "src/components/Foo", anchorOffset: 4 });
  });

  it("detects @ with dots in query (file extensions)", () => {
    const result = detectMentionToken("@utils.js", 9);
    expect(result).toEqual({ query: "utils.js", anchorOffset: 0 });
  });

  it("stops at space boundary (multiple words)", () => {
    // "hello @world more" with cursor at position 12 (@world)
    const result = detectMentionToken("hello @world more", 12);
    expect(result).toEqual({ query: "world", anchorOffset: 6 });
  });
});

// ═════════════════════════════════════════════════════════════════
// filterMentionResults
// ═════════════════════════════════════════════════════════════════

describe("filterMentionResults", () => {
  const entries = [
    { path: "src/components/Button.js", name: "Button.js", type: "file" },
    { path: "src/components/Input.js", name: "Input.js", type: "file" },
    { path: "src/utils/helpers.js", name: "helpers.js", type: "file" },
    { path: "package.json", name: "package.json", type: "file" },
    { path: "src", name: "src", type: "directory" },
  ];

  it("returns all entries (up to limit) when query is empty", () => {
    const result = filterMentionResults(entries, "");
    expect(result).toHaveLength(5);
  });

  it("filters by name match", () => {
    const result = filterMentionResults(entries, "Button");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Button.js");
  });

  it("filters by partial path match", () => {
    const result = filterMentionResults(entries, "components");
    expect(result).toHaveLength(2);
  });

  it("is case-insensitive", () => {
    const result = filterMentionResults(entries, "button");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Button.js");
  });

  it("respects limit", () => {
    const result = filterMentionResults(entries, "", 2);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for no matches", () => {
    const result = filterMentionResults(entries, "zzz_nonexistent");
    expect(result).toHaveLength(0);
  });

  it("returns empty array for null/empty entries", () => {
    expect(filterMentionResults(null, "test")).toEqual([]);
    expect(filterMentionResults([], "test")).toEqual([]);
  });

  it("matches against path (e.g. src/utils)", () => {
    const result = filterMentionResults(entries, "src/utils");
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/utils/helpers.js");
  });
});

// ═════════════════════════════════════════════════════════════════
// createMentionBadge
// ═════════════════════════════════════════════════════════════════

describe("createMentionBadge", () => {
  it("creates a span with correct data attributes", () => {
    const badge = createMentionBadge("src/index.js", "index.js", "file");
    expect(badge.tagName).toBe("SPAN");
    expect(badge.dataset.mentionPath).toBe("src/index.js");
    expect(badge.dataset.mentionType).toBe("file");
    expect(badge.contentEditable).toBe("false");
  });

  it("displays file icon for files", () => {
    const badge = createMentionBadge("a.js", "a.js", "file");
    expect(badge.textContent).toContain("📄");
    expect(badge.textContent).toContain("a.js");
  });

  it("displays folder icon for directories", () => {
    const badge = createMentionBadge("src", "src", "directory");
    expect(badge.textContent).toContain("📁");
    expect(badge.textContent).toContain("src");
  });

  it("applies shared CSS module class by default", () => {
    const badge = createMentionBadge("x", "x", "file");
    // Should have a CSS module class (hashed), not empty
    expect(badge.className).toBeTruthy();
    expect(badge.className.length).toBeGreaterThan(0);
  });

  it("applies stale class when opts.stale is true", () => {
    const badge = createMentionBadge("x", "x", "file", { stale: true });
    // Should have two classes: base + stale
    const classes = badge.className.split(" ");
    expect(classes.length).toBe(2);
  });

  it("sets title attribute to the full path", () => {
    const badge = createMentionBadge(
      "src/utils/helpers.js",
      "helpers.js",
      "file",
    );
    expect(badge.title).toBe("src/utils/helpers.js");
  });

  it("defaults to file type when type is undefined", () => {
    const badge = createMentionBadge("x", "x", undefined);
    expect(badge.dataset.mentionType).toBe("file");
    expect(badge.textContent).toContain("📄");
  });
});

// ═════════════════════════════════════════════════════════════════
// applyMentionToTextNode
// ═════════════════════════════════════════════════════════════════

describe("applyMentionToTextNode", () => {
  let container: any;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("replaces @query with badge and trailing space", () => {
    // Simulate: "For the file @birth" → badge replaces "@birth"
    const textNode = document.createTextNode("For the file @birth");
    container.appendChild(textNode);

    const badge = createMentionBadge(
      "pineapple/lupos-bot/arrays/birthdays.js",
      "birthdays.js",
      "file",
    );

    const space = applyMentionToTextNode(textNode, 13, 19, badge);

    // Text before @ should remain
    expect(textNode.textContent).toBe("For the file ");
    // Badge should follow the text node
    expect(textNode.nextSibling).toBe(badge);
    expect(badge.dataset.mentionPath).toBe(
      "pineapple/lupos-bot/arrays/birthdays.js",
    );
    // Space should follow badge
    expect(badge.nextSibling).toBe(space);
    expect(space.textContent).toBe(" ");
    // Full serialization should produce the @path
    expect(serializeEditable(container)).toBe(
      "For the file @pineapple/lupos-bot/arrays/birthdays.js ",
    );
  });

  it("preserves text after the cursor", () => {
    // "look @src here" → replace @src, keep " here"
    const textNode = document.createTextNode("look @src here");
    container.appendChild(textNode);

    const badge = createMentionBadge("src", "src", "directory");
    applyMentionToTextNode(textNode, 5, 9, badge);

    expect(serializeEditable(container)).toBe("look @src  here");
    // The " here" text is in a separate text node after the trailing space
    const afterSpace = badge.nextSibling!.nextSibling;
    expect(afterSpace!.textContent).toBe(" here");
  });

  it("handles @ at the start of text", () => {
    const textNode = document.createTextNode("@readme");
    container.appendChild(textNode);

    const badge = createMentionBadge("README.md", "README.md", "file");
    applyMentionToTextNode(textNode, 0, 7, badge);

    expect(textNode.textContent).toBe("");
    expect(serializeEditable(container)).toBe("@README.md ");
  });

  it("returns the trailing space node", () => {
    const textNode = document.createTextNode("@test");
    container.appendChild(textNode);

    const badge = createMentionBadge("test", "test", "file");
    const space = applyMentionToTextNode(textNode, 0, 5, badge);

    expect(space.nodeType).toBe(Node.TEXT_NODE);
    expect(space.textContent).toBe(" ");
  });
});

// ═════════════════════════════════════════════════════════════════
// placeCaretAfter
// ═════════════════════════════════════════════════════════════════

describe("placeCaretAfter", () => {
  let container: any;

  beforeEach(() => {
    container = document.createElement("div");
    container.contentEditable = "true";
    document.body.appendChild(container);
    container.focus();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("places the caret after the specified node", () => {
    const text1 = document.createTextNode("hello ");
    const badge = document.createElement("span");
    badge.textContent = "badge";
    const text2 = document.createTextNode(" world");
    container.appendChild(text1);
    container.appendChild(badge);
    container.appendChild(text2);

    placeCaretAfter(badge);

    const sel = window.getSelection()!;
    expect(sel.rangeCount).toBe(1);
    const range = sel.getRangeAt(0);
    expect(range.collapsed).toBe(true);
    // Caret should be positioned after the badge
    // In jsdom the specifics may differ, but the range should exist
    expect(range.startContainer).toBe(container);
  });
});

// ═════════════════════════════════════════════════════════════════
// Integration: Full mention flow
// ═════════════════════════════════════════════════════════════════

describe("Integration: full mention flow", () => {
  const sampleTree = [
    {
      name: "src",
      type: "directory",
      children: [
        { name: "index.js", type: "file" },
        {
          name: "components",
          type: "directory",
          children: [
            { name: "App.js", type: "file" },
            { name: "Header.js", type: "file" },
          ],
        },
      ],
    },
    { name: "package.json", type: "file" },
    { name: "README.md", type: "file" },
  ];

  it("flatten → filter → badge → serialize round-trip", () => {
    // 1. Flatten the tree
    const flat = flattenTree(sampleTree);
    expect(flat.length).toBe(7); // src, index.js, components, App.js, Header.js, package.json, README.md

    // 2. User types "@App" → filter
    const results = filterMentionResults(flat, "App");
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("src/components/App.js");

    // 3. User selects the result → create badge + apply
    const container = document.createElement("div");
    const textNode = document.createTextNode("Edit @App");
    container.appendChild(textNode);

    const entry = results[0];
    const badge = createMentionBadge(entry.path || "", entry.name, entry.type);
    applyMentionToTextNode(textNode, 5, 9, badge);

    // 4. Serialize for sending
    const serialized = serializeEditable(container);
    expect(serialized).toBe("Edit @src/components/App.js ");

    // 5. The badge displays only the basename
    expect(badge.textContent).toContain("App.js");
    expect(badge.textContent).not.toContain("src/components/");
  });

  it("multiple mentions in one message", () => {
    const container = document.createElement("div");

    // Simulate: "Compare [App.js badge] and [Header.js badge]"
    container.appendChild(document.createTextNode("Compare "));
    const badge1 = createMentionBadge(
      "src/components/App.js",
      "App.js",
      "file",
    );
    container.appendChild(badge1);
    container.appendChild(document.createTextNode(" and "));
    const badge2 = createMentionBadge(
      "src/components/Header.js",
      "Header.js",
      "file",
    );
    container.appendChild(badge2);

    const serialized = serializeEditable(container);
    expect(serialized).toBe(
      "Compare @src/components/App.js and @src/components/Header.js",
    );

    // Both @paths should be present for the model
    expect(serialized).toContain("@src/components/App.js");
    expect(serialized).toContain("@src/components/Header.js");
  });

  it("detectMentionToken works within the filter flow", () => {
    // User typed "For @bir" — cursor at 8
    const token = detectMentionToken("For @bir", 8);
    expect(token).not.toBeNull();
    expect(token!.query).toBe("bir");

    // Filter with that query
    const flat = flattenTree([
      {
        name: "pineapple",
        type: "directory",
        children: [
          {
            name: "lupos-bot",
            type: "directory",
            children: [
              {
                name: "arrays",
                type: "directory",
                children: [{ name: "birthdays.js", type: "file" }],
              },
            ],
          },
        ],
      },
    ]);
    const results = filterMentionResults(flat, token!.query);
    // "birthdays.js" should match "bir"
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result: any) => result.name === "birthdays.js")).toBe(true);
  });
});
