import { describe, it, expect } from "vitest";
import { escapeXmlDelimiterTags } from "../xmlTagEscaper";

describe("escapeXmlDelimiterTags", () => {
  it("should escape non-standard XML opening tags to inline code", () => {
    expect(escapeXmlDelimiterTags("<agent-identity>")).toBe(
      "`<agent-identity>`",
    );
  });

  it("should escape non-standard XML closing tags to inline code", () => {
    expect(escapeXmlDelimiterTags("</agent-identity>")).toBe(
      "`</agent-identity>`",
    );
  });

  it("should escape self-closing non-standard tags", () => {
    expect(escapeXmlDelimiterTags("<tool-policy />")).toBe(
      "`<tool-policy />`",
    );
  });

  it("should preserve standard HTML elements", () => {
    const htmlContent = "<div>hello</div> <span>world</span> <br> <img src='x'>";
    expect(escapeXmlDelimiterTags(htmlContent)).toBe(htmlContent);
  });

  it("should escape XML delimiter tags while preserving surrounding markdown", () => {
    const input =
      "<agent-identity> # Identity - You are the Omni Agent </agent-identity>";
    const expected =
      "`<agent-identity>` # Identity - You are the Omni Agent `</agent-identity>`";
    expect(escapeXmlDelimiterTags(input)).toBe(expected);
  });

  it("should not escape tags inside fenced code blocks", () => {
    const input = "```xml\n<agent-identity>\nhello\n</agent-identity>\n```";
    expect(escapeXmlDelimiterTags(input)).toBe(input);
  });

  it("should handle mixed content with code blocks and plain text tags", () => {
    const input =
      "<context>\nsome text\n```\n<context>\ninside code\n</context>\n```\n</context>";
    const expected =
      "`<context>`\nsome text\n```\n<context>\ninside code\n</context>\n```\n`</context>`";
    expect(escapeXmlDelimiterTags(input)).toBe(expected);
  });

  it("should handle empty string", () => {
    expect(escapeXmlDelimiterTags("")).toBe("");
  });

  it("should handle null-ish values", () => {
    expect(escapeXmlDelimiterTags(null as unknown as string)).toBeNull();
    expect(escapeXmlDelimiterTags(undefined as unknown as string)).toBeUndefined();
  });

  it("should handle content with no tags at all", () => {
    const plainText = "# Hello World\nThis is plain markdown with **bold** text.";
    expect(escapeXmlDelimiterTags(plainText)).toBe(plainText);
  });

  it("should escape multiple different non-standard tags", () => {
    const input =
      "<system_instructions>\n# Rules\n</system_instructions>\n<user_input>\nHello\n</user_input>";
    const expected =
      "`<system_instructions>`\n# Rules\n`</system_instructions>`\n`<user_input>`\nHello\n`</user_input>`";
    expect(escapeXmlDelimiterTags(input)).toBe(expected);
  });

  it("should handle tags with hyphenated names", () => {
    expect(escapeXmlDelimiterTags("<tool-policy>")).toBe("`<tool-policy>`");
    expect(escapeXmlDelimiterTags("<my-custom-tag>")).toBe(
      "`<my-custom-tag>`",
    );
  });

  it("should handle tags with underscored names", () => {
    expect(escapeXmlDelimiterTags("<user_input>")).toBe("`<user_input>`");
  });

  it("should preserve standard HTML headings and semantic elements", () => {
    const input = "<h1>Title</h1> <section>Content</section> <article>Post</article>";
    expect(escapeXmlDelimiterTags(input)).toBe(input);
  });
});
