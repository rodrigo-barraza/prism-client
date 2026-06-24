/**
 * Shared sub-agent emoji mapping by nesting depth.
 * Each depth level gets a visually distinct baby emoji skin tone.
 * Used in both the conversation history and the node graph.
 */

const SUB_AGENT_DEPTH_EMOJIS: Record<number, string> = {
  1: "👶",
  2: "👶🏻",
  3: "👶🏼",
};

const DEEP_NESTING_EMOJI = "👶🏽";

export function resolveSubAgentEmoji(depth: number): string {
  return SUB_AGENT_DEPTH_EMOJIS[depth] ?? DEEP_NESTING_EMOJI;
}

export const AGENT_EMOJI = "📂";
export const CONVERSATION_EMOJI = "💬";
export const PROJECT_EMOJI = "🗂️";
