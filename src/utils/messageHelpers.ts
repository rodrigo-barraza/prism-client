import type { Message, ToolCallEvent } from "../types/types";

/**
 * Client-side display message preparation.
 *
 * For conversation loads, the backend now returns pre-joined `displayMessages`
 * — use those directly instead of calling this function.
 *
 * This function remains for edge cases where messages are reconstructed
 * client-side from raw payloads (e.g. request detail view).
 */
export function prepareDisplayMessages(
  rawMessages: Message[] | undefined | null,
): Message[] {
  if (!rawMessages || rawMessages.length === 0) return [];

  // Pass 1: collect tool results keyed by tool_call_id
  const toolResults: Record<string, string> = {};
  const toolDurations: Record<string, number> = {};
  for (const message of rawMessages) {
    if (message.role === "tool") {
      const identifier = message.tool_call_id || message.toolCallId;
      if (identifier) {
        toolResults[identifier] = message.content || "";
        const persistedDuration = (message as unknown as Record<string, unknown>).durationMilliseconds as number | undefined;
        if (persistedDuration != null) {
          toolDurations[identifier] = persistedDuration;
        }
      }
    }
  }

  const hasToolResults = Object.keys(toolResults).length > 0;
  const hasToolDurations = Object.keys(toolDurations).length > 0;

  // Pass 2: filter and enrich
  return rawMessages
    .filter((message) => {
      if (message.role === "tool") return false;
      const isEmptyAssistant =
        message.role === "assistant" &&
        !message.content?.trim() &&
        !message.toolCalls?.length &&
        !message.images?.length &&
        !message.audio &&
        !message.error &&
        !message.thinking;
      return !isEmptyAssistant;
    })
    .map((message) => {
      let enrichedCalls = message.toolCalls;
      if (
        message.toolCalls &&
        message.toolCalls.length > 0 &&
        (hasToolResults || hasToolDurations)
      ) {
        enrichedCalls = message.toolCalls.map(
          (toolCall: ToolCallEvent) => ({
            ...toolCall,
            result:
              toolCall.result ||
              toolResults[toolCall.id] ||
              toolResults[toolCall.tool_call_id || ""] ||
              null,
            ...(toolDurations[toolCall.id] != null && {
              durationMs: toolDurations[toolCall.id],
            }),
            ...(toolDurations[toolCall.tool_call_id || ""] != null && {
              durationMs: toolDurations[toolCall.tool_call_id || ""],
            }),
          }),
        );
      }

      // Extract audio from tool call results
      let updatedAudio = message.audio;
      if (enrichedCalls && enrichedCalls.length > 0) {
        const audioSources: string[] = [];
        for (const toolCall of enrichedCalls) {
          if (!toolCall.result) continue;
          interface ParsedToolCallAudioResult {
            audioRef?: string;
            audio?: { data?: string; mimeType?: string };
          }
          let parsedResult: ParsedToolCallAudioResult | null = null;
          if (typeof toolCall.result === "object" && toolCall.result !== null) {
            parsedResult = toolCall.result as ParsedToolCallAudioResult;
          } else if (typeof toolCall.result === "string") {
            try {
              parsedResult = JSON.parse(toolCall.result) as ParsedToolCallAudioResult;
            } catch {
              // Non-JSON result — skip audio extraction
            }
          }
          if (parsedResult) {
            if (parsedResult.audioRef) {
              audioSources.push(parsedResult.audioRef);
            } else if (parsedResult.audio?.data) {
              const mimeType = parsedResult.audio.mimeType || "audio/wav";
              audioSources.push(`data:${mimeType};base64,${parsedResult.audio.data}`);
            }
          }
        }
        if (audioSources.length > 0) {
          const existingAudio = Array.isArray(message.audio)
            ? message.audio
            : message.audio
              ? [message.audio]
              : [];
          const mergedAudio = [...existingAudio];
          for (const audioSource of audioSources) {
            if (!mergedAudio.includes(audioSource)) {
              mergedAudio.push(audioSource);
            }
          }
          if (mergedAudio.length > 0) {
            updatedAudio = mergedAudio;
          }
        }
      }

      if (enrichedCalls !== message.toolCalls || updatedAudio !== message.audio) {
        return { ...message, toolCalls: enrichedCalls, audio: updatedAudio };
      }
      return message;
    });
}
