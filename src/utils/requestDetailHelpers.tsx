/**
 * requestDetailHelpers.js — Shared helpers for the request detail drawer
 * used by both /admin/requests and /admin/traces pages.
 *
 * Centralises extractMediaAssets, getMediaTypeFromRef,
 * buildRequestDetailSections, and reconstructChatMessages so they
 * aren't copy-pasted across pages.
 */

import { formatNumber, formatLatency, formatTokensPerSec } from "@rodrigo-barraza/utilities-library";
import BadgeComponent from "../components/BadgeComponent";
import ModalityIconComponent from "../components/ModalityIconComponent";
import ToolIconComponent from "../components/ToolIconComponent";
import { prepareDisplayMessages } from "../components/MessageListComponent";
import type { TransformedRequestItem, Message, JsonValue } from "../types/types";
import type { DrawerSection } from "../components/RequestDetailsComponent";

export interface TransformedMediaAsset {
  url: string;
  origin: string;
}

/* -- Media extraction -------------------------------------------- */

/**
 * Recursively walk request/response payloads and collect media URLs
 * (minio://, data:image/…, https://…jpg, etc.) with their origin
 * ("user" for request, "ai" for response).
 */
export function extractMediaAssets(
  object: TransformedRequestItem | null | undefined,
): TransformedMediaAsset[] {
  const seen = new Set<string>();
  const assets: TransformedMediaAsset[] = [];
  const search = (node: JsonValue | undefined, origin: string) => {
    if (!node) return;
    if (typeof node === "string") {
      if (seen.has(node)) return;
      if (
        node.startsWith("minio://") ||
        node.startsWith("data:image/") ||
        node.startsWith("data:audio/") ||
        node.startsWith("data:video/") ||
        node.startsWith("data:application/pdf")
      ) {
        seen.add(node);
        assets.push({ url: node, origin });
      } else if (node.startsWith("http://") || node.startsWith("https://")) {
        const fileExtension = node
          .split("?")[0]
          .split(".")
          .pop()
          ?.toLowerCase();
        if (
          [
            "png",
            "jpg",
            "jpeg",
            "gif",
            "webp",
            "mp3",
            "wav",
            "ogg",
            "webm",
            "mp4",
            "mov",
            "avi",
            "pdf",
          ].includes(fileExtension as string)
        ) {
          seen.add(node);
          assets.push({ url: node, origin });
        }
      }
    } else if (Array.isArray(node)) {
      node.forEach((childNode) => search(childNode, origin));
    } else if (typeof node === "object" && node !== null) {
      Object.values(node).forEach((childNode) => search(childNode, origin));
    }
  };
  search(object?.requestPayload, "user");
  search(object?.responsePayload, "ai");
  return assets;
}

/**
 * Classify a media reference string into a type for MediaCardComponent.
 */
export function getMediaTypeFromRef(mediaReference: string) {
  if (!mediaReference) return "image";
  const isData = mediaReference.startsWith("data:");
  if (isData) {
    if (mediaReference.startsWith("data:audio")) return "audio";
    if (mediaReference.startsWith("data:video")) return "video";
    if (mediaReference.startsWith("data:application/pdf")) return "pdf";
    return "image";
  }
  const fileExtension = mediaReference.split("?")[0].split(".").pop()?.toLowerCase();
  if (["mp3", "wav", "ogg", "webm"].includes(fileExtension as string))
    return "audio";
  if (["mp4", "avi", "mov"].includes(fileExtension as string)) return "video";
  if (fileExtension === "pdf") return "pdf";
  return "image";
}

/* -- Detail sections builder ------------------------------------- */

/**
 * Format the harness ID into a human-readable display label.
 */
export function formatHarnessLabel(harness: string): string {
  if (harness === "standard") return "Standard (ReAct)";
  return harness
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Build the 4-section array (General, Usage, Timing, Parameters)
 * consumed by <RequestDetailsComponent sections={…}>.
 *
 * Both /admin/requests and /admin/traces pass the exact same
 * section definitions — this function is the single source of truth.
 */
export function buildRequestDetailSections(
  request: TransformedRequestItem | null | undefined,
): DrawerSection[] {
  if (!request) return [];
  return [
    {
      title: "General",
      items: [
        {
          label: "Request ID",
          value: request.requestId || "-",
          mono: true,
        },
        {
          label: "Timestamp",
          value: request.timestamp ? (
            <BadgeComponent type="dateTime" date={request.timestamp} />
          ) : (
            "-"
          ),
        },
        {
          label: "Project",
          value: request.project ? (
            <BadgeComponent variant="info">{request.project}</BadgeComponent>
          ) : (
            "-"
          ),
        },
        {
          label: "Endpoint",
          value: (
            <BadgeComponent variant="endpoint">
              {request.endpoint || "-"}
            </BadgeComponent>
          ),
        },
        {
          label: "Operation",
          value: (
            <BadgeComponent variant="info">
              {request.operation || "-"}
            </BadgeComponent>
          ),
        },
        ...(request.agent
          ? [
              {
                label: "Agent",
                value: (
                  <BadgeComponent variant="accent">
                    {request.agent as React.ReactNode}
                  </BadgeComponent>
                ),
              },
            ]
          : []),
        ...(request.harness
          ? [
              {
                label: "Harness",
                value: (
                  <BadgeComponent variant="accent">
                    {formatHarnessLabel(request.harness as string)}
                  </BadgeComponent>
                ),
              },
            ]
          : []),
        {
          label: "Provider",
          value: request.provider ? (
            <BadgeComponent type="providers" providers={[request.provider]} />
          ) : (
            "-"
          ),
        },
        {
          label: "Model",
          value: request.model ? (
            <BadgeComponent
              type="model"
              models={[request.model]}
              provider={request.provider}
            />
          ) : (
            "-"
          ),
        },
        {
          label: "Modalities",
          value: request.modalities ? (
            <ModalityIconComponent modalities={request.modalities} size={14} />
          ) : (
            "-"
          ),
        },
        {
          label: "Status",
          value: (
            <BadgeComponent variant={request.success ? "success" : "error"}>
              {request.success ? "Success" : "Error"}
            </BadgeComponent>
          ),
        },
        {
          label: "Tools",
          value: request.toolDisplayNames?.length ? (
            <ToolIconComponent
              toolDisplayNames={request.toolDisplayNames}
              toolApiNames={request.toolApiNames}
              size={14}
            />
          ) : (
            <BadgeComponent variant="info">No</BadgeComponent>
          ),
        },
        ...(request.toolApiNames?.length
          ? [
              {
                label: "Tool Calls",
                value: request.toolApiNames.join(", "),
                mono: true,
              },
            ]
          : []),
        ...(request.errorMessage
          ? [
              {
                label: "Error",
                value: (
                  <span style={{ color: "var(--color-danger)" }}>
                    {request.errorMessage}
                  </span>
                ),
              },
            ]
          : []),
        ...(request.agentConversationId
          ? [{ label: "Agent Conversation", value: request.agentConversationId, mono: true }]
          : []),
        ...(request.conversationId
          ? [{ label: "Conversation", value: request.conversationId, mono: true }]
          : []),
      ],
    },
    {
      title: "Usage",
      items: [
        {
          label: "Input Tokens",
          value:
            (request.inputTokens ?? 0) > 0 ? (
              <BadgeComponent
                type="tokens"
                value={request.inputTokens ?? 0}
                label="in"
              />
            ) : (
              formatNumber(request.inputTokens ?? 0)
            ),
        },
        {
          label: "Output Tokens",
          value:
            (request.outputTokens ?? 0) > 0 ? (
              <BadgeComponent
                type="tokens"
                value={request.outputTokens ?? 0}
                label="out"
              />
            ) : (
              formatNumber(request.outputTokens ?? 0)
            ),
        },
        ...((request.cacheReadInputTokens ?? 0) > 0
          ? [
              {
                label: "Cache Read Tokens",
                value: (
                  <BadgeComponent
                    type="tokens"
                    value={request.cacheReadInputTokens ?? 0}
                    label="cached read"
                  />
                ),
              },
            ]
          : []),
        ...((request.cacheCreationInputTokens ?? 0) > 0
          ? [
              {
                label: "Cache Write Tokens",
                value: (
                  <BadgeComponent
                    type="tokens"
                    value={request.cacheCreationInputTokens ?? 0}
                    label="cached write"
                  />
                ),
              },
            ]
          : []),
        ...((request.reasoningOutputTokens ?? 0) > 0
          ? [
              {
                label: "Reasoning Tokens",
                value: (
                  <BadgeComponent
                    type="tokens"
                    value={request.reasoningOutputTokens ?? 0}
                    label="reasoning"
                  />
                ),
              },
            ]
          : []),
        {
          label: "Estimated Cost",
          value: <BadgeComponent type="cost" cost={request.estimatedCost ?? 0} />,
        },
        {
          label: "Tokens/sec",
          value:
            (request.tokensPerSec ?? 0) > 0 ? (
              <BadgeComponent variant="accent">
                {formatTokensPerSec(request.tokensPerSec ?? 0)}
              </BadgeComponent>
            ) : (
              formatTokensPerSec(request.tokensPerSec ?? 0)
            ),
        },
        {
          label: "Input Chars",
          value: formatNumber((request.inputCharacters as number) ?? 0),
        },
        {
          label: "Output Chars",
          value: formatNumber((request.outputCharacters as number) ?? 0),
        },
        {
          label: "Messages",
          value: request.messageCount || 0,
        },
      ],
    },
    {
      title: "Timing",
      items: [
        {
          label: "Time to Generation",
          value:
            (request.timeToGeneration ?? 0) > 0 ? (
              <BadgeComponent
                type="stopwatch"
                seconds={request.timeToGeneration ?? 0}
              />
            ) : (
              formatLatency(request.timeToGeneration ?? 0)
            ),
        },
        {
          label: "Generation Time",
          value:
            (request.generationTime ?? 0) > 0 ? (
              <BadgeComponent
                type="stopwatch"
                seconds={request.generationTime ?? 0}
              />
            ) : (
              formatLatency(request.generationTime ?? 0)
            ),
        },
        {
          label: "Total Time",
          value:
            (request.totalTime ?? 0) > 0 ? (
              <BadgeComponent type="stopwatch" seconds={request.totalTime ?? 0} />
            ) : (
              formatLatency(request.totalTime ?? 0)
            ),
        },
      ],
    },
    {
      title: "Parameters",
      items: [
        {
          label: "Temperature",
          value: request.temperature ?? "-",
        },
        {
          label: "Max Tokens",
          value: request.maxTokens ?? "-",
        },
        { label: "Top P", value: request.topP ?? "-" },
        { label: "Top K", value: request.topK ?? "-" },
        {
          label: "Frequency Penalty",
          value: request.frequencyPenalty ?? "-",
        },
        {
          label: "Presence Penalty",
          value: request.presencePenalty ?? "-",
        },
      ],
    },
  ];
}

/* -- Chat message reconstruction --------------------------------- */

/**
 * Reconstruct a displayable chat message array from the raw
 * request/response payloads stored in a request log document.
 *
 * Returns { messages, systemPrompt } or null if there's nothing
 * to display.
 */
export function reconstructChatMessages(
  selectedRequest: TransformedRequestItem | null | undefined,
) {
  if (!selectedRequest) return null;
  const requestPayload = selectedRequest.requestPayload as
    | { messages?: Message[] }
    | undefined;
  const responsePayload = selectedRequest.responsePayload as
    | {
        text?: string;
        content?: string;
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        choices?: Array<{ message?: { content?: string; tool_calls?: JsonValue[] } }>;
        toolCalls?: JsonValue[];
        images?: string[];
        thinking?: string;
      }
    | string
    | undefined;

  if (!requestPayload?.messages?.length) return null;

  // Start with the prompt messages from the request
  const chatMessages = [...requestPayload.messages];

  // Append the assistant response
  if (responsePayload) {
    const assistantMessage: Message = {
      role: "assistant",
      content: "",
      model: selectedRequest.model,
      provider: selectedRequest.provider,
    };

    // Handle different response formats
    if (typeof responsePayload === "string") {
      assistantMessage.content = responsePayload;
    } else if (responsePayload.text) {
      // Prism standardized format
      assistantMessage.content = responsePayload.text;
    } else if (responsePayload.content) {
      assistantMessage.content = responsePayload.content;
    } else if (Array.isArray(responsePayload.candidates?.[0]?.content?.parts)) {
      // Google format
      assistantMessage.content = responsePayload.candidates[0].content.parts
        .map((part: { text?: string }) => part.text || "")
        .join("");
    } else if (responsePayload.choices?.[0]?.message?.content) {
      // OpenAI format
      assistantMessage.content = responsePayload.choices[0].message.content as string;
    }

    // Extract tool calls if present
    const toolCalls =
      typeof responsePayload === "object" && responsePayload
        ? responsePayload.choices?.[0]?.message?.tool_calls || responsePayload.toolCalls
        : undefined;
    if (Array.isArray(toolCalls) && toolCalls.length) {
      assistantMessage.toolCalls = (toolCalls as Array<Record<string, unknown>>).map(
        (toolCall) => ({
          id: String(toolCall.id || ""),
          name: String(
            (toolCall.function as Record<string, unknown> | undefined)?.name ||
            toolCall.name || ""
          ),
          args:
            typeof (toolCall.function as Record<string, unknown> | undefined)?.arguments === "string"
              ? JSON.parse((toolCall.function as Record<string, string>).arguments)
              : (toolCall.function as Record<string, unknown> | undefined)?.arguments || toolCall.args || {},
          result: toolCall.result,
          status: toolCall.status as string | undefined,
        }),
      );
    }

    // Extract generated images
    if (
      typeof responsePayload === "object" &&
      responsePayload &&
      Array.isArray(responsePayload.images) &&
      responsePayload.images.length
    ) {
      assistantMessage.images = responsePayload.images;
    }

    // Extract thinking content
    if (
      typeof responsePayload === "object" &&
      responsePayload &&
      typeof responsePayload.thinking === "string"
    ) {
      assistantMessage.thinking = responsePayload.thinking;
    }

    if (
      assistantMessage.content ||
      assistantMessage.toolCalls?.length ||
      assistantMessage.images?.length
    ) {
      chatMessages.push(assistantMessage);
    }
  }

  const messages = prepareDisplayMessages(chatMessages);
  const systemPrompt = chatMessages.find(
    (message: Message) => message.role === "system",
  )?.content;
  if (!messages.length) return null;

  return { messages, systemPrompt };
}
