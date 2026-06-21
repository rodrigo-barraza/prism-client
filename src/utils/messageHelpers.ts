import type { Message, ToolCallEvent } from "../types/types";

/**
 * Prepare messages for display — filters out tool/system messages
 * and merges tool results into the preceding assistant's toolCalls.
 * Soft-deleted messages are always included (with their `deleted` flag)
 * so they render in-place as ghostly apparitions.
 * Use this in both /chat and /admin/chat for consistency.
 */
export function prepareDisplayMessages(
  rawMessages: Message[] | undefined | null,
): Message[] {
  if (!rawMessages || rawMessages.length === 0) return [];

  // Normalize any snake_case tool_calls to camelCase toolCalls
  const normalizedMessages = rawMessages.map((message) => {
    if (message.tool_calls && !message.toolCalls) {
      const normalizedCalls: ToolCallEvent[] = message.tool_calls.map(
        (toolCall) => {
          const parsedArguments: Record<string, unknown> =
            typeof toolCall.args === "string"
              ? (JSON.parse(toolCall.args) as Record<string, unknown>)
              : (toolCall.args as Record<string, unknown>) ||
                (typeof toolCall.function?.arguments === "string"
                  ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
                  : (toolCall.function?.arguments as Record<string, unknown>)) ||
                {};
          return {
            id: toolCall.id,
            name: toolCall.name || toolCall.function?.name || "",
            args: parsedArguments,
            result: toolCall.result,
            status: toolCall.status,
          };
        },
      );
      return { ...message, toolCalls: normalizedCalls };
    }
    return message;
  });

  console.debug(
    `[prepareDisplayMessages] input: ${normalizedMessages.length} messages`,
    normalizedMessages
      .map(
        (message, index) =>
          `  [${index}] role=${message.role} content=${(message.content || "").length}ch toolCalls=${message.toolCalls?.length || 0} images=${message.images?.length || 0} audio=${!!message.audio} error=${!!message.error}`,
      )
      .join("\n"),
  );

  // First pass: collect tool results keyed by tool_call_id
  // Support both snake_case (API) and camelCase (normalized) property names
  const toolResults: Record<string, string> = {};
  for (const message of normalizedMessages) {
    if (message.role === "tool") {
      const id = message.tool_call_id || message.toolCallId;
      if (id) toolResults[id] = message.content || "";
    }
  }

  // Second pass: filter and enrich
  const filtered = normalizedMessages
    .filter((message, index) => {
      // Filter out tool role messages (they're merged into toolCalls)
      if (message.role === "tool") return false;
      // System messages pass through — visibility is controlled downstream
      // by the filteredMessages memo based on the clean/raw view toggle
      // Filter out empty assistant messages with no useful content
      const isEmptyAssistant =
        message.role === "assistant" &&
        !message.content?.trim() &&
        !message.toolCalls?.length &&
        !message.images?.length &&
        !message.audio &&
        !message.error &&
        !message.thinking;
      if (isEmptyAssistant) {
        console.debug(
          `[prepareDisplayMessages] ⚠️ FILTERING OUT empty assistant msg [${index}]:`,
          `content="${(message.content || "").slice(0, 50)}" toolCalls=${message.toolCalls?.length || 0}`,
          `images=${message.images?.length || 0} audio=${!!message.audio} error=${!!message.error}`,
        );
      }
      return !isEmptyAssistant;
    })
    .map((message) => {
      // Merge tool results into toolCalls
      let enrichedCalls = message.toolCalls;
      if (
        message.toolCalls &&
        message.toolCalls.length > 0 &&
        Object.keys(toolResults).length > 0
      ) {
        enrichedCalls = message.toolCalls.map(
          (toolCall: ToolCallEvent) => ({
            ...toolCall,
            result:
              toolCall.result ||
              toolResults[toolCall.id] ||
              toolResults[toolCall.tool_call_id || ""] ||
              null,
          }),
        );
      }

      // Extract generated audio from tool call results and merge into message.audio
      let updatedAudio = message.audio;
      if (enrichedCalls && enrichedCalls.length > 0) {
        const audioSources: string[] = [];
        for (const toolCall of enrichedCalls) {
          if (toolCall.result) {
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
                // Ignore parsing errors for non-JSON results
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
        return {
          ...message,
          toolCalls: enrichedCalls,
          audio: updatedAudio,
        };
      }
      return message;
    });

  console.debug(
    `[prepareDisplayMessages] output: ${filtered.length} messages (filtered ${normalizedMessages.length - filtered.length})`,
    filtered.length === 0 && normalizedMessages.length > 0
      ? "⚠️ ALL MESSAGES FILTERED — this will empty the chat!"
      : "",
  );

  return filtered;
}
