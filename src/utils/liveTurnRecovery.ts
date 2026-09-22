/**
 * The sending client's view of its own turn after the SSE stream dropped:
 * text the live socket recovers continues the trailing assistant bubble
 * (the cursor has already dropped what the SSE delivered), and the final
 * database refresh replaces it with the canonical messages.
 */
import type { ContentSegment, Message } from "../types/types";

export function appendRecoveredText<T extends Message>(messages: T[], text: string): T[] {
  if (!text) return messages;
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant" || last.completedAt) {
    return [
      ...messages,
      {
        role: "assistant",
        content: text,
        contentSegments: [{ type: "text", fragmentIndex: 0 }],
        textFragments: [text],
      } as T,
    ];
  }

  const segments = last.contentSegments ?? [];
  if (segments.length === 0) {
    return [...messages.slice(0, -1), { ...last, content: (last.content || "") + text }];
  }
  const fragments = [...(last.textFragments ?? [])];
  const tail = segments[segments.length - 1];
  let nextSegments: ContentSegment[] = segments;
  if (
    tail.type === "text" &&
    tail.fragmentIndex !== undefined &&
    tail.fragmentIndex < fragments.length
  ) {
    fragments[tail.fragmentIndex] += text;
  } else {
    nextSegments = [...segments, { type: "text", fragmentIndex: fragments.length }];
    fragments.push(text);
  }
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      content: (last.content || "") + text,
      contentSegments: nextSegments,
      textFragments: fragments,
    },
  ];
}
