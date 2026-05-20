/**
 * requestDetailHelpers.js — Shared helpers for the request detail drawer
 * used by both /admin/requests and /admin/traces pages.
 *
 * Centralises extractMediaAssets, getMediaTypeFromRef,
 * buildRequestDetailSections, and reconstructChatMessages so they
 * aren't copy-pasted across pages.
 */

import { formatNumber, formatLatency, formatTokensPerSec } from "./utilities";
import {
  BadgeComponent,
  DateTimeBadgeComponent,
} from "@rodrigo-barraza/components-library";
import ModelBadgeComponent from "../components/ModelBadgeComponent";
import ProvidersBadgeComponent from "../components/ProvidersBadgeComponent";
import TokenCountBadgeComponent from "../components/TokenCountBadgeComponent";

import StopwatchBadgeComponent from "../components/StopwatchBadgeComponent";
import ModalityIconComponent from "../components/ModalityIconComponent";

import CostBadgeComponent from "../components/CostBadgeComponent";
import ToolIconComponent from "../components/ToolIconComponent";
import { prepareDisplayMessages } from "../components/MessageListComponent";

/* -- Media extraction -------------------------------------------- */

/**
 * Recursively walk request/response payloads and collect media URLs
 * (minio://, data:image/…, https://…jpg, etc.) with their origin
 * ("user" for request, "ai" for response).
 */
export function extractMediaAssets(object: Record<string, unknown>) {
  const seen = new Set();
  const assets: Record<string, unknown>[] = [];
  const search = (node: string | Record<string, unknown> | Record<string, unknown>[], origin: string) => {
    if (!node) return;
    if (typeof node === "string") {
      if (seen.has(node)) return;
      if (
        (typeof node === "string" && node.startsWith("minio://")) ||
        (typeof node === "string" && node.startsWith("data:image/")) ||
        (typeof node === "string" && node.startsWith("data:audio/")) ||
        (typeof node === "string" && node.startsWith("data:video/")) ||
        (typeof node === "string" && node.startsWith("data:application/pdf"))
      ) {
        seen.add(node);
        assets.push({ url: node, origin });
      } else if ((typeof node === "string" && node.startsWith("http://")) || (typeof node === "string" && node.startsWith("https://"))) {
        const fileExtension = (node as string).split("?")[0].split(".").pop()?.toLowerCase();
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
      node.forEach((n: Record<string, unknown>) => search(n, origin));
    } else if (typeof node === "object") {
      Object.values(node).forEach((n: Record<string, unknown>) => search(n, origin));
    }
  };
  search(object?.requestPayload, "user");
  search(object?.responsePayload, "ai");
  return assets;
}

/**
 * Classify a media reference string into a type for MediaCardComponent.
 */
export function getMediaTypeFromRef(ref: string) {
  if (!ref) return "image";
  const isData = ref.startsWith("data:");
  if (isData) {
    if (ref.startsWith("data:audio")) return "audio";
    if (ref.startsWith("data:video")) return "video";
    if (ref.startsWith("data:application/pdf")) return "pdf";
    return "image";
  }
  const fileExtension = ref.split("?")[0].split(".").pop()?.toLowerCase();
  if (["mp3", "wav", "ogg", "webm"].includes(fileExtension as string)) return "audio";
  if (["mp4", "avi", "mov"].includes(fileExtension as string)) return "video";
  if (fileExtension === "pdf") return "pdf";
  return "image";
}

/* -- Detail sections builder ------------------------------------- */

/**
 * Build the 4-section array (General, Usage, Timing, Parameters)
 * consumed by <RequestDetailsComponent sections={…}>.
 *
 * Both /admin/requests and /admin/traces pass the exact same
 * section definitions — this function is the single source of truth.
 */
export function buildRequestDetailSections(req: Record<string, unknown> | null) {
  if (!req) return [];
  return [
    {
      title: "General",
      items: [
        {
          label: "Request ID",
          value: req.requestId || "-",
          mono: true,
        },
        {
          label: "Timestamp",
          value: req.timestamp ? (
            <DateTimeBadgeComponent date={req.timestamp} />
          ) : (
            "-"
          ),
        },
        {
          label: "Project",
          value: req.project ? (
            <BadgeComponent variant="info">{req.project}</BadgeComponent>
          ) : (
            "-"
          ),
        },
        {
          label: "Endpoint",
          value: (
            <BadgeComponent variant="endpoint">
              {req.endpoint || "-"}
            </BadgeComponent>
          ),
        },
        {
          label: "Operation",
          value: (
            <BadgeComponent variant="info">
              {req.operation || "-"}
            </BadgeComponent>
          ),
        },
        ...(req.agent
          ? [
              {
                label: "Agent",
                value: (
                  <BadgeComponent variant="accent">{req.agent}</BadgeComponent>
                ),
              },
            ]
          : []),
        {
          label: "Provider",
          value: req.provider ? (
            <ProvidersBadgeComponent providers={[req.provider]} />
          ) : (
            "-"
          ),
        },
        {
          label: "Model",
          value: req.model ? (
            <ModelBadgeComponent models={[req.model]} provider={req.provider} />
          ) : (
            "-"
          ),
        },
        {
          label: "Modalities",
          value: req.modalities ? (
            <ModalityIconComponent modalities={req.modalities} size={14} />
          ) : (
            "-"
          ),
        },
        {
          label: "Status",
          value: (
            <BadgeComponent variant={req.success ? "success" : "error"}>
              {req.success ? "Success" : "Error"}
            </BadgeComponent>
          ),
        },
        {
          label: "Tools",
          value: req.toolDisplayNames?.length ? (
            <ToolIconComponent
              toolDisplayNames={req.toolDisplayNames}
              toolApiNames={req.toolApiNames}
              size={14}
            />
          ) : (
            <BadgeComponent variant="info">No</BadgeComponent>
          ),
        },
        ...(req.toolApiNames?.length
          ? [
              {
                label: "Tool Calls",
                value: req.toolApiNames.join(", "),
                mono: true,
              },
            ]
          : []),
        ...(req.errorMessage
          ? [
              {
                label: "Error",
                value: (
                  <span style={{ color: "var(--danger)" }}>
                    {req.errorMessage}
                  </span>
                ),
              },
            ]
          : []),
        ...(req.agentSessionId
          ? [{ label: "Agent Session", value: req.agentSessionId, mono: true }]
          : []),
        ...(req.conversationId
          ? [{ label: "Conversation", value: req.conversationId, mono: true }]
          : []),
      ],
    },
    {
      title: "Usage",
      items: [
        {
          label: "Input Tokens",
          value:
            req.inputTokens > 0 ? (
              <TokenCountBadgeComponent value={req.inputTokens} label="in" />
            ) : (
              formatNumber(req.inputTokens)
            ),
        },
        {
          label: "Output Tokens",
          value:
            req.outputTokens > 0 ? (
              <TokenCountBadgeComponent value={req.outputTokens} label="out" />
            ) : (
              formatNumber(req.outputTokens)
            ),
        },
        ...(req.cacheReadInputTokens > 0
          ? [
              {
                label: "Cache Read Tokens",
                value: (
                  <TokenCountBadgeComponent
                    value={req.cacheReadInputTokens}
                    label="cached read"
                  />
                ),
              },
            ]
          : []),
        ...(req.cacheCreationInputTokens > 0
          ? [
              {
                label: "Cache Write Tokens",
                value: (
                  <TokenCountBadgeComponent
                    value={req.cacheCreationInputTokens}
                    label="cached write"
                  />
                ),
              },
            ]
          : []),
        ...(req.reasoningOutputTokens > 0
          ? [
              {
                label: "Reasoning Tokens",
                value: (
                  <TokenCountBadgeComponent
                    value={req.reasoningOutputTokens}
                    label="reasoning"
                  />
                ),
              },
            ]
          : []),
        {
          label: "Estimated Cost",
          value: <CostBadgeComponent cost={req.estimatedCost} />,
        },
        {
          label: "Tokens/sec",
          value:
            req.tokensPerSec > 0 ? (
              <BadgeComponent variant="accent">
                {formatTokensPerSec(req.tokensPerSec)}
              </BadgeComponent>
            ) : (
              formatTokensPerSec(req.tokensPerSec)
            ),
        },
        {
          label: "Input Chars",
          value: formatNumber(req.inputCharacters),
        },
        {
          label: "Output Chars",
          value: formatNumber(req.outputCharacters),
        },
        {
          label: "Messages",
          value: req.messageCount || 0,
        },
      ],
    },
    {
      title: "Timing",
      items: [
        {
          label: "Time to Generation",
          value:
            req.timeToGeneration > 0 ? (
              <StopwatchBadgeComponent seconds={req.timeToGeneration} />
            ) : (
              formatLatency(req.timeToGeneration)
            ),
        },
        {
          label: "Generation Time",
          value:
            req.generationTime > 0 ? (
              <StopwatchBadgeComponent seconds={req.generationTime} />
            ) : (
              formatLatency(req.generationTime)
            ),
        },
        {
          label: "Total Time",
          value:
            req.totalTime > 0 ? (
              <StopwatchBadgeComponent seconds={req.totalTime} />
            ) : (
              formatLatency(req.totalTime)
            ),
        },
      ],
    },
    {
      title: "Parameters",
      items: [
        {
          label: "Temperature",
          value: req.temperature ?? "-",
        },
        {
          label: "Max Tokens",
          value: req.maxTokens ?? "-",
        },
        { label: "Top P", value: req.topP ?? "-" },
        { label: "Top K", value: req.topK ?? "-" },
        {
          label: "Frequency Penalty",
          value: req.frequencyPenalty ?? "-",
        },
        {
          label: "Presence Penalty",
          value: req.presencePenalty ?? "-",
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
export function reconstructChatMessages(selectedRequest: Record<string, unknown>) {
  const reqPayload = selectedRequest?.requestPayload;
  const resPayload = selectedRequest?.responsePayload;
  if (!reqPayload?.messages?.length) return null;

  // Start with the prompt messages from the request
  const chatMessages = [...reqPayload.messages];

  // Append the assistant response
  if (resPayload) {
    const assistantMsg = {
      role: "assistant",
      content: "",
      model: selectedRequest.model,
      provider: selectedRequest.provider,
    };

    // Handle different response formats
    if (resPayload.text) {
      // Prism standardized format
      assistantMsg.content = resPayload.text;
    } else if (resPayload.content) {
      assistantMsg.content = resPayload.content;
    } else if (resPayload.candidates?.[0]?.content?.parts) {
      // Google format
      assistantMsg.content = resPayload.candidates[0].content.parts
        .map((p: Record<string, unknown>) => p.text || "")
        .join("");
    } else if (resPayload.choices?.[0]?.message?.content) {
      // OpenAI format
      assistantMsg.content = resPayload.choices[0].message.content;
    } else if (typeof resPayload === "string") {
      assistantMsg.content = resPayload;
    }

    // Extract tool calls if present
    const toolCalls =
      resPayload.choices?.[0]?.message?.tool_calls || resPayload.toolCalls;
    if (toolCalls?.length) {
      (assistantMsg as Record<string, unknown>).toolCalls = toolCalls.map((tc: Record<string, unknown>) => ({
        id: tc.id,
        name: tc.function?.name || tc.name,
        args:
          typeof tc.function?.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function?.arguments || tc.args || {},
      }));
    }

    // Extract generated images
    if (resPayload.images?.length) {
      (assistantMsg as Record<string, unknown>).images = resPayload.images;
    }

    // Extract thinking content
    if (resPayload.thinking) {
      (assistantMsg as Record<string, unknown>).thinking = resPayload.thinking;
    }

    if (
      assistantMsg.content ||
      (assistantMsg as Record<string, unknown>).toolCalls?.length ||
      (assistantMsg as Record<string, unknown>).images?.length
    ) {
      chatMessages.push(assistantMsg);
    }
  }

  const messages = prepareDisplayMessages(chatMessages);
  const systemPrompt = chatMessages.find(
    (m: Record<string, unknown>) => m.role === "system",
  )?.content;
  if (!messages.length) return null;

  return { messages, systemPrompt };
}
