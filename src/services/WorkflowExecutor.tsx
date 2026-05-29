/**
 * WorkflowExecutor — executes a workflow graph by topologically sorting nodes
 * and calling PrismService for each model, passing outputs forward via edges.
 */
import PrismService from "./PrismService";
import { generateUUID } from "@rodrigo-barraza/utilities-library";
// ─── Local types ─────────────────────────────────────────────

/** Loose message shape used during workflow execution — covers piped/merged messages */
interface WorkflowMessage {
  role?: string;
  content?: string;
  images?: string[];
  audio?: string[];
  video?: string[];
  pdf?: string[];
}

interface WorkflowInputDatum {
  type: string;
  data: unknown;
  sourceNodeId: string | null;
}

interface WorkflowOutputs {
  text?: string;
  image?: string;
  audio?: string;
  embedding?: number[];
  conversation?: unknown[];
  tools?: {
    schemas: ToolSchemaEntry[];
    customMap: Map<string, WorkflowCustomTool>;
  };
  [key: string]: unknown;
}

/** OpenAI-format tool schema entry used inside workflow tool nodes */
interface ToolSchemaEntry {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/** Minimal custom tool representation used in workflow executor */
interface WorkflowCustomTool {
  name: string;
  description?: string;
  parameters?: Array<{
    name: string;
    type?: string;
    description?: string;
    required?: boolean;
    enum?: string[];
  }>;
  implementation?: string;
  _id?: string;
}

interface MediaRef {
  data?: string;
  imageData?: string;
  mimeType?: string;
  minioRef?: string;
}

interface WorkflowModelNode {
  id: string;
  nodeType: string;
  label?: string;
  provider?: string;
  modelName?: string;
  modality?: string | null;
  content?: string;
  systemPrompt?: string;
  userPrompt?: string;
  outputTypes?: string[];
  messages?: WorkflowMessage[];
  staticInputs?: Record<string, unknown>;
  disabledTools?: string[];
  builtInTools?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
  customTools?: WorkflowCustomTool[];
}

interface WorkflowEdge {
  id?: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceModality: string;
  targetModality: string;
}

interface WorkflowCallbacks {
  onNodeStart?: (nodeId: string) => void;
  onNodeComplete?: (nodeId: string, outputs: WorkflowOutputs) => void;
  onNodeError?: (nodeId: string, error: unknown) => void;
  onViewerPartial?: (nodeId: string, outputs: WorkflowOutputs) => void;
  onNodeContentUpdate?: (nodeId: string, data: unknown) => void;
}

/**
 * Determine which Prism endpoint to use based on the model's modalities
 * and the types of inputs it's receiving.
 *
 * textToText handles images via the `images` field in messages and
 * properly sends system prompts as system messages, so we prefer it
 * over the dedicated imageToText captioning endpoint.
 */
function resolveEndpoint(
  node: WorkflowModelNode,
  inputData: WorkflowInputDatum[],
) {
  const hasAudioInput = inputData.some((d) => d.type === "audio");
  const outputsImage = (node.outputTypes || []).includes("image");
  const outputsAudio = (node.outputTypes || []).includes("audio");
  const outputsEmbedding = (node.outputTypes || []).includes("embedding");

  // Embedding generation: → embedding output
  if (outputsEmbedding) return "modalityToEmbedding";
  // Image generation: → image output
  if (outputsImage) return "textToImage";
  // Audio transcription: audio in → text out
  if (hasAudioInput && !outputsAudio) return "audioToText";
  // TTS: → audio output
  if (outputsAudio) return "textToSpeech";
  // Default: chat (handles multimodal inputs including images)
  return "textToText";
}

/**
 * Resolve a minio:// or other file ref to a fetchable URL, then convert to base64 data URL.
 * Also handles object refs like { imageData, mimeType } from chat API responses.
 */
async function resolveToDataUrl(ref: unknown): Promise<string | null> {
  if (!ref) return null;
  // Object with inline base64 data (chat API image format: { data, mimeType, minioRef })
  if (typeof ref === "object" && ref !== null) {
    const mediaRef = ref as MediaRef;
    // Prefer minioRef if available (lightweight URL instead of base64 blob)
    if (mediaRef.minioRef) return PrismService.getFileUrl(mediaRef.minioRef);
    const b64 = mediaRef.data || mediaRef.imageData;
    if (b64) {
      const mime = mediaRef.mimeType || "image/png";
      return `data:${mime};base64,${b64}`;
    }
    return null;
  }
  if (typeof ref !== "string") return null;
  // Already a data URL — return as-is
  if (ref.startsWith("data:")) return ref;
  // HTTP URL or minio:// ref — resolve to HTTP URL (no base64 conversion)
  return PrismService.getFileUrl(ref);
}

/**
 * Execute a single model node.

 */
async function executeModelNode(
  node: WorkflowModelNode,
  inputData: WorkflowInputDatum[],
  {
    onNodeContentUpdate,
    toolSchemas,
    customToolMap,
  }: {
    onNodeContentUpdate?: WorkflowCallbacks["onNodeContentUpdate"];
    toolSchemas?: ToolSchemaEntry[] | null;
    customToolMap?: Map<string, WorkflowCustomTool> | null;
  } = {},
) {
  const endpoint = resolveEndpoint(node, inputData);
  const outputs: WorkflowOutputs = {};

  // Auto-create a conversation for this model execution
  const conversationId = generateUUID();
  const nodeLabel = node.label || node.modelName || "Model Node";
  const conversationMeta = {
    title: `🔀 ${nodeLabel} · ${node.provider || "unknown"}/${node.modelName || "unknown"}`,
    systemPrompt: node.systemPrompt || "",
  };

  if (endpoint === "textToText") {
    // Collect piped inputs from edges
    const textParts = inputData
      .filter((d) => d.type === "text")
      .map((d) => d.data);
    const imageParts = inputData
      .filter((d) => d.type === "image")
      .map((d) => d.data);
    const audioParts = inputData
      .filter((d) => d.type === "audio")
      .map((d) => d.data);
    const videoParts = inputData
      .filter((d) => d.type === "video")
      .map((d) => d.data);
    const pdfParts = inputData
      .filter((d) => d.type === "pdf")
      .map((d) => d.data);
    const conversationParts = inputData
      .filter((d) => d.type === "conversation")
      .map((d) => d.data);
    const pipedText = textParts.join("\n\n");
    const hasMedia =
      imageParts.length > 0 ||
      audioParts.length > 0 ||
      videoParts.length > 0 ||
      pdfParts.length > 0;

    // Helper: merge piped media fields into a message (all are arrays)
    interface MediaFields {
      images?: string[];
      audio?: string[];
      video?: string[];
      pdf?: string[];
    }
    const buildMediaFields = (existing: MediaFields = {}): MediaFields => {
      const fields: MediaFields = {};
      const imgs = [...(existing.images || []), ...imageParts] as string[];
      const auds = [...(existing.audio || []), ...audioParts] as string[];
      const vids = [...(existing.video || []), ...videoParts] as string[];
      const pdfs = [...(existing.pdf || []), ...pdfParts] as string[];
      if (imgs.length > 0) fields.images = imgs;
      if (auds.length > 0) fields.audio = auds;
      if (vids.length > 0) fields.video = vids;
      if (pdfs.length > 0) fields.pdf = pdfs;
      return fields;
    };

    let finalMessages: WorkflowMessage[];

    // Priority: conversation input > node.messages > legacy systemPrompt/userPrompt
    if (conversationParts.length > 0) {
      // Use the first conversation input as the base messages, filtering out empty ones
      finalMessages = (conversationParts[0] as WorkflowMessage[])
        .map((m) => ({
          role: m.role,
          content: m.content || "",
          ...(m.images && m.images.length > 0 ? { images: m.images } : {}),
          ...(m.audio && m.audio.length > 0 ? { audio: m.audio } : {}),
          ...(m.video && m.video.length > 0 ? { video: m.video } : {}),
          ...(m.pdf && m.pdf.length > 0 ? { pdf: m.pdf } : {}),
        }))
        .filter(
          (m) =>
            m.content ||
            (m.images && m.images.length > 0) ||
            (m.audio && m.audio.length > 0) ||
            (m.video && m.video.length > 0) ||
            (m.pdf && m.pdf.length > 0),
        );

      // Append piped text/media to the last user message (or add a new one)
      const lastUserIdx = finalMessages
        .map((m, i: number) => ({ m, i }))
        .filter(({ m }) => (m as Record<string, unknown>).role === "user")
        .pop()?.i;
      if (lastUserIdx !== undefined && (pipedText || hasMedia)) {
        const lastUser = finalMessages[lastUserIdx];
        finalMessages[lastUserIdx] = {
          ...lastUser,
          content: pipedText
            ? lastUser.content
              ? `${lastUser.content}\n\n${pipedText}`
              : pipedText
            : lastUser.content,
          ...buildMediaFields(lastUser),
        };
      } else if (pipedText || hasMedia) {
        finalMessages.push({
          role: "user",
          content: pipedText || "",
          ...buildMediaFields(),
        });
      }
    } else if (node.messages && node.messages.length > 0) {
      // Use the full conversation messages array, preserving all media
      finalMessages = node.messages.map((m) => ({
        role: m.role,
        content: m.content || "",
        ...(m.images && m.images.length > 0 ? { images: m.images } : {}),
        ...(m.audio && m.audio.length > 0 ? { audio: m.audio } : {}),
        ...(m.video && m.video.length > 0 ? { video: m.video } : {}),
        ...(m.pdf && m.pdf.length > 0 ? { pdf: m.pdf } : {}),
      }));

      // Append piped text/media to the last user message (or add a new one)
      const lastUserIdx = finalMessages
        .map((m, i: number) => ({ m, i }))
        .filter(({ m }) => m.role === "user")
        .pop()?.i;
      if (lastUserIdx !== undefined && (pipedText || hasMedia)) {
        const lastUser = finalMessages[lastUserIdx];
        finalMessages[lastUserIdx] = {
          ...lastUser,
          content: pipedText
            ? lastUser.content
              ? `${lastUser.content}\n\n${pipedText}`
              : pipedText
            : lastUser.content,
          ...buildMediaFields(lastUser),
        };
      } else if (pipedText || hasMedia) {
        // No user message exists — create one for piped input
        finalMessages.push({
          role: "user",
          content: pipedText || "",
          ...buildMediaFields(),
        });
      }
    } else {
      // No messages — build from piped input only
      const userMessage = {
        role: "user",
        content: pipedText || "",
        ...buildMediaFields(),
      };
      finalMessages = [userMessage];
    }

    const generatePayload = {
      provider: node.provider,
      model: node.modelName,
      messages: finalMessages,
      conversationId,
      conversationMeta,
      ...(toolSchemas != null && {
        enabledTools: toolSchemas.map((t) => t.function?.name || ""),
      }),
    } as unknown as import("../types/types").ChatPayload;

    // Route through /agent for tool-enabled runs, /chat for simple text
    const result =
      toolSchemas !== null
        ? await PrismService.generateAgentText(generatePayload)
        : await PrismService.generateText(generatePayload);

    const currentResult = result;

    // Propagate minio refs returned by Prism back to input node content
    if (currentResult.messages && onNodeContentUpdate) {
      // Build a map from data URL → minio ref by comparing what we sent vs what came back
      const refMap = new Map();
      for (let i = 0; i < finalMessages.length; i++) {
        const sent = finalMessages[i];
        const returned = currentResult.messages[i];
        if (!returned) continue;
        for (const field of ["images", "audio", "video", "pdf"]) {
          const sentArr = sent[field as keyof typeof sent] as string[];
          const retArr = returned[field as keyof typeof returned] as string[];
          if (!Array.isArray(sentArr) || !Array.isArray(retArr)) continue;
          for (let j = 0; j < sentArr.length; j++) {
            if (
              sentArr[j]?.startsWith("data:") &&
              retArr[j]?.startsWith("minio://")
            ) {
              refMap.set(sentArr[j], retArr[j]);
            }
          }
        }
      }
      // Update upstream input nodes whose content was a data URL
      if (refMap.size > 0) {
        for (const input of inputData) {
          if (input.sourceNodeId && refMap.has(input.data)) {
            onNodeContentUpdate(input.sourceNodeId, refMap.get(input.data));
          }
        }
      }
    }

    outputs.text = currentResult.text || currentResult.content || "";
    // Some models return inline images
    if (currentResult.images && currentResult.images.length > 0) {
      outputs.image =
        (await resolveToDataUrl(currentResult.images[0])) || undefined;
    }
  } else if (endpoint === "textToImage") {
    const pipedPrompt =
      (inputData.find((d) => d.type === "text")?.data as string) || "";
    const rawImages = inputData
      .filter((d) => d.type === "image")
      .map((d) => d.data);
    const conversationParts = inputData
      .filter((d) => d.type === "conversation")
      .map((d) => d.data);

    let prompt;
    let systemPrompt;
    const messageImages: unknown[] = [];

    if (conversationParts.length > 0) {
      // Extract from conversation input: system message → systemPrompt, user messages → prompt + images
      const convMessages = (conversationParts[0] as WorkflowMessage[]).filter(
        (m) => m.content || (m.images && m.images.length > 0) || m.audio,
      );
      const systemMsg = convMessages.find((m) => m.role === "system");
      const userMsgs = convMessages.filter((m) => m.role === "user");
      const lastUser = userMsgs[userMsgs.length - 1];

      systemPrompt = (systemMsg?.content as string) || undefined;
      const userContent = (lastUser?.content as string) || "";
      prompt = pipedPrompt
        ? userContent
          ? `${userContent}\n\n${pipedPrompt}`
          : pipedPrompt
        : userContent;

      // Collect images from all user messages
      userMsgs.forEach((m) => {
        if (m.images && m.images.length > 0) messageImages.push(...m.images);
      });
    } else if (node.messages && node.messages.length > 0) {
      // Extract from messages array: last user message = prompt, system message = systemPrompt
      const systemMsg = node.messages.find((m) => m.role === "system");
      const userMsgs = node.messages.filter((m) => m.role === "user");
      const lastUser = userMsgs[userMsgs.length - 1];

      systemPrompt = (systemMsg?.content as string) || undefined;
      const userContent = (lastUser?.content as string) || "";
      prompt = pipedPrompt
        ? userContent
          ? `${userContent}\n\n${pipedPrompt}`
          : pipedPrompt
        : userContent;

      // Collect images from all user messages
      userMsgs.forEach((m) => {
        if (m.images && m.images.length > 0) messageImages.push(...m.images);
      });
    } else {
      // No messages — use piped input only
      systemPrompt = undefined;
      prompt = pipedPrompt;
    }

    // Merge piped images + message images
    const allRawImages = [...rawImages, ...messageImages];

    // Convert data URLs → { imageData, mimeType } objects for Prism/providers
    const images = allRawImages.map((image) => {
      if (typeof image === "string" && image.startsWith("data:")) {
        const match = image.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return { imageData: match[2], mimeType: match[1] };
        }
      }
      // Already an object or fallback
      return typeof image === "object"
        ? (image as { imageData?: string; mimeType?: string })
        : { imageData: image as string, mimeType: "image/jpeg" };
    }) as Array<string | { imageData: string; mimeType?: string }>;

    const result = await PrismService.generateImage({
      provider: node.provider as string,
      model: node.modelName as string,
      prompt: prompt as string,
      systemPrompt: systemPrompt as string | undefined,
      images: images.length > 0 ? images : undefined,
      conversationId,
      conversationMeta,
    });

    // Chat-based image models return { images: [...], text }
    if (result.images && result.images.length > 0) {
      outputs.image = (await resolveToDataUrl(result.images[0])) || undefined;
    } else if (result.imageData) {
      const mime = result.mimeType || "image/png";
      outputs.image = `data:${mime};base64,${result.imageData}`;
    } else if (result.minioRef) {
      outputs.image = (await resolveToDataUrl(result.minioRef)) || undefined;
    }
    if (result.text) {
      outputs.text = result.text;
    }
  } else if (endpoint === "audioToText") {
    const audio =
      (inputData.find((d) => d.type === "audio")?.data as string) || "";
    const result = await PrismService.transcribeAudio({
      provider: node.provider as string,
      model: node.modelName as string,
      audio: audio as string,
      ...(node.userPrompt
        ? { prompt: node.userPrompt }
        : node.systemPrompt
          ? { prompt: node.systemPrompt }
          : {}),
      conversationId,
      conversationMeta,
    });

    outputs.text = result.text || "";
  } else if (endpoint === "textToSpeech") {
    const text =
      (inputData.find((d) => d.type === "text")?.data as string) || "";
    const result = await PrismService.generateSpeech({
      provider: node.provider as string,
      model: node.modelName as string,
      text: text as string,
      conversationId,
      conversationMeta,
    });

    outputs.audio = result.audioDataUrl || "";
  } else if (endpoint === "modalityToEmbedding") {
    const textParts = inputData
      .filter((d) => d.type === "text")
      .map((d) => d.data);
    const imageParts = inputData
      .filter((d) => d.type === "image")
      .map((d) => d.data);
    const audioPart = inputData.find((d) => d.type === "audio")?.data;

    const payload: import("../types/types").EmbeddingPayload = {
      provider: node.provider,
      model: node.modelName,
    };

    // Combine user prompt with piped text
    const pipedText = textParts.join("\n\n");
    const combinedText = node.userPrompt
      ? pipedText
        ? `${node.userPrompt}\n\n${pipedText}`
        : node.userPrompt
      : pipedText;
    if (combinedText) payload.text = combinedText;
    if (imageParts.length > 0) payload.images = imageParts as string[];
    if (audioPart) payload.audio = audioPart as string;

    const result = await PrismService.generateEmbedding(payload);
    outputs.embedding = result.embedding;
  }

  return { outputs, conversationId };
}

/**
 * Topological sort of nodes based on edge graph.
 */
function topologicalSort(
  nodes: WorkflowModelNode[],
  edges: WorkflowEdge[],
): string[] {
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};
  for (const node of nodes) {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  }
  for (const conn of edges) {
    inDegree[conn.targetNodeId] = (inDegree[conn.targetNodeId] || 0) + 1;
    adjacency[conn.sourceNodeId] = adjacency[conn.sourceNodeId] || [];
    adjacency[conn.sourceNodeId].push(conn.targetNodeId);
  }

  const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const neighbor of adjacency[current] || []) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  return sorted;
}

/**
 * Execute the entire workflow.


 */
export async function executeWorkflow(
  nodes: WorkflowModelNode[],
  edges: WorkflowEdge[],
  {
    onNodeStart,
    onNodeComplete,
    onNodeError,
    onViewerPartial,
    onNodeContentUpdate,
  }: WorkflowCallbacks,
) {
  const sortedIds = topologicalSort(nodes, edges);
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // Store outputs: nodeId → { [modality]: data }
  const nodeOutputs: Record<string, WorkflowOutputs> = {};

  // Collect conversationIds generated by model nodes
  const generatedConversationIds: string[] = [];

  // Pre-compute which viewers each node feeds into
  const viewerConnsBySource: Record<string, WorkflowEdge[]> = {};
  for (const conn of edges) {
    const targetNode = nodeMap[conn.targetNodeId];
    if (targetNode?.nodeType === "viewer") {
      (viewerConnsBySource[conn.sourceNodeId] ??= []).push(conn);
    }
  }

  // Track partial viewer outputs (accumulated as upstream nodes complete)
  const viewerPartials: Record<string, WorkflowOutputs> = {};

  // Track nodes that errored so downstream nodes can be skipped
  const erroredNodeIds = new Set();

  for (const nodeId of sortedIds) {
    const node = nodeMap[nodeId];
    if (!node) continue;

    // Check if any upstream source has errored — if so, skip this node
    const incomingForCheck = edges.filter((c) => c.targetNodeId === nodeId);
    const hasErroredUpstream = incomingForCheck.some((c) =>
      erroredNodeIds.has(c.sourceNodeId),
    );
    if (hasErroredUpstream) {
      // Propagate as errored so further downstream nodes are also skipped
      erroredNodeIds.add(nodeId);
      nodeOutputs[nodeId] = {};
      continue;
    }

    try {
      onNodeStart?.(nodeId);

      if (node.nodeType === "input") {
        // Conversation input nodes emit their messages array, merging piped inputs
        if (node.modality === "conversation") {
          const messages = structuredClone(node.messages || []);

          // Collect piped data from upstream edges using compound port IDs
          // Port format: "{msgIndex}.{modality}" e.g. "0.text", "1.image"
          const incomingConns = edges.filter((c) => c.targetNodeId === nodeId);

          for (const conn of incomingConns) {
            const sourceOut = nodeOutputs[conn.sourceNodeId];
            if (!sourceOut) continue;
            const data = sourceOut[conn.sourceModality];
            if (!data) continue;

            // Parse compound port ID to route data to correct message slot
            const dotIdx = conn.targetModality.indexOf(".");
            if (dotIdx === -1) continue;
            const msgIdx = parseInt(conn.targetModality.substring(0, dotIdx));
            const modality = conn.targetModality.substring(dotIdx + 1);

            if (msgIdx < 0 || msgIdx >= messages.length) continue;
            const message = messages[msgIdx];

            if (modality === "text") {
              message.content = message.content
                ? `${message.content}\n\n${data}`
                : (data as string);
            } else if (modality === "image") {
              message.images = [
                ...((message.images as string[]) || []),
                data as string,
              ];
            } else if (modality === "audio") {
              message.audio = [
                ...((message.audio as string[]) || []),
                data as string,
              ];
            } else if (modality === "video") {
              message.video = [
                ...((message.video as string[]) || []),
                data as string,
              ];
            } else if (modality === "pdf") {
              message.pdf = [
                ...((message.pdf as string[]) || []),
                data as string,
              ];
            }
          }

          nodeOutputs[nodeId] = { conversation: messages };
        } else {
          // Input asset nodes just emit their content under the active modality
          nodeOutputs[nodeId] = node.modality
            ? { [node.modality]: node.content || "" }
            : {}; // file input with no file loaded
        }
        onNodeComplete?.(nodeId, nodeOutputs[nodeId]);

        // Push partial updates to any connected viewers
        if (viewerConnsBySource[nodeId]) {
          for (const conn of viewerConnsBySource[nodeId]) {
            const data = nodeOutputs[nodeId]?.[conn.sourceModality];
            if (data) {
              viewerPartials[conn.targetNodeId] ??= {};
              viewerPartials[conn.targetNodeId][conn.targetModality] = data;
              onViewerPartial?.(conn.targetNodeId, {
                ...viewerPartials[conn.targetNodeId],
              });
            }
          }
        }
        continue;
      }

      // Tool nodes — emit their enabled tool schemas as output
      if (node.nodeType === "tools") {
        const disabled = new Set(node.disabledTools || []);
        const builtIn = (node.builtInTools || []).filter(
          (t) => !disabled.has(t.name),
        );
        const custom = (node.customTools || []).filter(
          (t) => !disabled.has(t.name || t._id || ""),
        );

        // Build OpenAI-format tool schemas
        const schemas = [
          ...builtIn.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters || {
                type: "object",
                properties: {},
                required: [],
              },
            },
          })),
          ...custom.map((t) => {
            const props: Record<string, unknown> = {};
            const required = [];
            for (const p of t.parameters || []) {
              if (!p.name) continue;
              props[p.name] = {
                type: p.type || "string",
                description: p.description || "",
                ...(p.enum && p.enum.length > 0 ? { enum: p.enum } : {}),
              };
              if (p.required) required.push(p.name);
            }
            return {
              type: "function",
              function: {
                name: t.name,
                description: t.description || "",
                parameters: { type: "object", properties: props, required },
              },
            };
          }),
        ];

        // Also build a custom tool lookup map for execution
        const customMap = new Map();
        for (const t of custom) {
          customMap.set(t.name, t);
        }

        nodeOutputs[nodeId] = { tools: { schemas, customMap } };
        onNodeComplete?.(nodeId, {});
        continue;
      }

      if (node.nodeType === "viewer") {
        // Viewer nodes collect connected input data and display it
        const incomingConns = edges.filter((c) => c.targetNodeId === nodeId);
        const collectedOutputs: Record<string, unknown> = {};

        for (const conn of incomingConns) {
          const sourceOutputs = nodeOutputs[conn.sourceNodeId];
          if (
            sourceOutputs &&
            sourceOutputs[conn.sourceModality] !== undefined
          ) {
            collectedOutputs[conn.targetModality] =
              sourceOutputs[conn.sourceModality];
          }
        }

        nodeOutputs[nodeId] = collectedOutputs;
        onNodeComplete?.(nodeId, collectedOutputs);
        continue;
      }

      // Model node — gather inputs from edges
      const incomingConns = edges.filter((c) => c.targetNodeId === nodeId);
      const inputData: WorkflowInputDatum[] = [];

      for (const conn of incomingConns) {
        const sourceOutputs = nodeOutputs[conn.sourceNodeId];
        if (sourceOutputs && sourceOutputs[conn.sourceModality] !== undefined) {
          inputData.push({
            type: conn.targetModality,
            data: sourceOutputs[conn.sourceModality],
            sourceNodeId: conn.sourceNodeId,
          });
        }
      }

      // Separate tool inputs from regular modality inputs
      const toolInputs = inputData.filter((d) => d.type === "tools");
      const regularInputData = inputData.filter((d) => d.type !== "tools");

      // Collect tool schemas from connected tool nodes
      let toolSchemas = null;
      let customToolMap = null;
      if (toolInputs.length > 0) {
        toolSchemas = [];
        customToolMap = new Map();
        for (const ti of toolInputs) {
          const tiData = ti.data as {
            schemas?: ToolSchemaEntry[];
            customMap?: Map<string, WorkflowCustomTool>;
          };
          if (tiData?.schemas) toolSchemas.push(...tiData.schemas);
          if (tiData?.customMap) {
            for (const [k, v] of tiData.customMap) customToolMap.set(k, v);
          }
        }
      }

      // Also include any static inputs attached to the node
      if (node.staticInputs) {
        for (const [modality, data] of Object.entries(node.staticInputs)) {
          if (data) {
            regularInputData.push({ type: modality, data, sourceNodeId: null });
          }
        }
      }

      // Execute the model
      const { outputs, conversationId } = await executeModelNode(
        node,
        regularInputData,
        {
          onNodeContentUpdate,
          toolSchemas,
          customToolMap,
        },
      );
      nodeOutputs[nodeId] = outputs;
      if (conversationId) generatedConversationIds.push(conversationId);
      onNodeComplete?.(nodeId, outputs);

      // Push partial updates to any connected viewers
      if (viewerConnsBySource[nodeId]) {
        for (const conn of viewerConnsBySource[nodeId]) {
          const data = outputs[conn.sourceModality];
          if (data) {
            viewerPartials[conn.targetNodeId] ??= {};
            viewerPartials[conn.targetNodeId][conn.targetModality] = data;
            onViewerPartial?.(conn.targetNodeId, {
              ...viewerPartials[conn.targetNodeId],
            });
          }
        }
      }
    } catch (error: unknown) {
      erroredNodeIds.add(nodeId);
      onNodeError?.(nodeId, error);
      // Put empty outputs so downstream nodes don't hang
      nodeOutputs[nodeId] = {};
    }
  }

  return { nodeOutputs, conversationIds: generatedConversationIds };
}
