// -------------------------------------------------------------
// StreamingText — Splits in-flight streaming text into a markdown
// body and the trailing token. The body renders as markdown while
// the token is drawn inline by StreamingCursorComponent with the
// rainbow effect, so the newest word appears to come out of the
// cursor itself.
// -------------------------------------------------------------

// Tokens containing markdown pairing/structural characters stay in the
// body — pulling them out could unbalance emphasis, code, links, or math
// in the already-rendered text.
const MARKDOWN_UNSAFE_TOKEN = /[`*_~[\]$]/;

export interface StreamingTailSplit {
  body: string;
  token: string;
}

export function splitStreamingTail(text: string): StreamingTailSplit {
  if (!text) return { body: "", token: "" };
  const trimmed = text.trimEnd();
  const match = trimmed.match(/\S+$/);
  if (!match) return { body: text, token: "" };
  const token = match[0];
  if (MARKDOWN_UNSAFE_TOKEN.test(token)) return { body: text, token: "" };
  const body = trimmed.slice(0, trimmed.length - token.length);
  // Inside an unclosed code fence the token belongs to the code block —
  // leave it there rather than rendering it outside the fence.
  const fenceCount = body.match(/```/g)?.length ?? 0;
  if (fenceCount % 2 === 1) return { body: text, token: "" };
  return { body, token };
}
