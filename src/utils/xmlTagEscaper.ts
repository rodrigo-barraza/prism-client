/**
 * Escapes XML-style delimiter tags in text content so they render as visible
 * text instead of being swallowed by the markdown/HTML parser.
 *
 * System prompts and agent instructions commonly use tags like
 * `<agent-identity>`, `<tool-policy>`, `<context>` as structural delimiters.
 * ReactMarkdown (via rehype) interprets these as unknown HTML elements and
 * silently strips them, which breaks the surrounding markdown formatting
 * (e.g., headings that follow a tag lose their block context).
 *
 * This function converts `<tag-name>` and `</tag-name>` into their
 * HTML-entity equivalents (`&lt;tag-name&gt;`) so they appear as literal
 * text in the rendered output.
 *
 * Tags inside fenced code blocks (``` ... ```) are left untouched.
 */

const FENCED_CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;

/**
 * Matches XML-style tags that are NOT standard HTML elements.
 * Captures opening, closing, and self-closing variants:
 *   <agent-identity>  </agent-identity>  <some-tag />
 *
 * Standard HTML elements (div, span, p, a, img, br, etc.) are excluded
 * to avoid interfering with any intentional HTML in the content.
 */
const STANDARD_HTML_ELEMENTS = new Set([
  "a", "abbr", "address", "area", "article", "aside", "audio",
  "b", "base", "bdi", "bdo", "blockquote", "body", "br", "button",
  "canvas", "caption", "cite", "code", "col", "colgroup",
  "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt",
  "em", "embed",
  "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html",
  "i", "iframe", "img", "input", "ins",
  "kbd",
  "label", "legend", "li", "link",
  "main", "map", "mark", "menu", "meta", "meter",
  "nav", "noscript",
  "object", "ol", "optgroup", "option", "output",
  "p", "param", "picture", "pre", "progress",
  "q",
  "rp", "rt", "ruby",
  "s", "samp", "script", "search", "section", "select", "slot", "small", "source",
  "span", "strong", "style", "sub", "summary", "sup",
  "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time",
  "title", "tr", "track",
  "u", "ul",
  "var", "video",
  "wbr",
]);

/**
 * Matches any XML/HTML-like tag: `<tag>`, `</tag>`, `<tag />`, `<tag attr="val">`.
 * Group 1 captures the optional `/` (closing tag indicator).
 * Group 2 captures the tag name.
 */
const XML_TAG_PATTERN = /(<\/?)([a-zA-Z][a-zA-Z0-9_-]*)\b([^>]*?)(\/?\s*>)/g;

export function escapeXmlDelimiterTags(content: string): string {
  if (!content) return content;

  // Split on fenced code blocks to avoid escaping tags inside code
  const segments = content.split(FENCED_CODE_BLOCK_PATTERN);
  const codeBlocks = content.match(FENCED_CODE_BLOCK_PATTERN) || [];

  const processedSegments = segments.map((segment) =>
    segment.replace(XML_TAG_PATTERN, (fullMatch, openOrClose, tagName, _attributes, _closing) => {
      // Preserve standard HTML elements
      if (STANDARD_HTML_ELEMENTS.has(tagName.toLowerCase())) {
        return fullMatch;
      }
      // Escape non-standard XML-style delimiter tags
      return `\`${fullMatch}\``;
    }),
  );

  // Reassemble with code blocks interleaved
  let result = processedSegments[0];
  for (let index = 0; index < codeBlocks.length; index++) {
    result += codeBlocks[index] + (processedSegments[index + 1] || "");
  }

  return result;
}
