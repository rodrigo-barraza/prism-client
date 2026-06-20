import type { Conversation, AgentConversation } from "../types/types";

interface HistoryItemTag {
  label: string;
  style?: React.CSSProperties;
}

interface AgentRef {
  id: string;
  name?: string;
}

export interface MappedHistoryItem {
  id: string;
  title: string;
  updatedAt?: string;
  createdAt?: string;
  totalCost: number;
  modalities: Record<string, number | boolean>;
  providers: string[];
  tags: HistoryItemTag[];
  username?: string;
  modelNames: string[];
  modelName: string | null;
  agent?: string | AgentRef;
  parentConversationId?: string | null;
  hasSubAgents?: boolean;
  searchText?: string;
  requestErrorCount?: number;
}

interface MapConversationOptions {
  showProject?: boolean;
}

export function mapConversationToHistoryItem(
  conversation: Conversation,
  options: MapConversationOptions = {},
): MappedHistoryItem {
  const { showProject = false } = options;

  const totalCost = conversation.totalCost ?? 0;

  const tags: HistoryItemTag[] = [];
  if (showProject && conversation.project) {
    tags.push({
      label: conversation.project,
      style: {
        background: "var(--accent-primary-subtle)",
        color: "var(--accent-primary)",
      },
    });
  }
  if (conversation.synthetic) {
    tags.push({
      label: "SYNTHETIC",
      style: {
        background: "oklch(0.55 0.24 303 / 0.12)",
        color: "oklch(0.55 0.24 303)",
      },
    });
  }

  const modelNames = deriveModelNames(conversation);
  const derivedProviders = conversation.providers || [];

  const baseModalities = conversation.modalities || {};
  const modalities = conversation.toolCounts
    ? {
        ...baseModalities,
        functionCalling: Object.values(conversation.toolCounts).reduce(
          (sum: number, count: number) => sum + count,
          0,
        ),
      }
    : baseModalities;

  const searchTextParts = [
    conversation.project || "",
    conversation.username || "",
  ];

  if (conversation.messages && conversation.messages.length > 0) {
    for (const message of conversation.messages) {
      if (typeof message.content === "string" && message.content) {
        searchTextParts.push(message.content);
      }
    }
  }

  return {
    id: conversation.id || String(conversation._id),
    title: conversation.title || "Untitled Chat",
    updatedAt: conversation.updatedAt,
    createdAt: conversation.createdAt,
    totalCost,
    modalities,
    providers: derivedProviders,
    tags,
    username: conversation.username,
    modelNames,
    modelName: conversation.model || conversation.settings?.model || null,
    agent: conversation.agent,
    parentConversationId: conversation.parentConversationId || null,
    hasSubAgents: conversation.hasSubAgents || false,
    searchText: searchTextParts.join(" "),
    requestErrorCount: conversation.requestErrorCount || 0,
  };
}

export function mapAgentConversationToHistoryItem(
  conversation: AgentConversation,
): MappedHistoryItem {
  const conversationId = conversation.id || conversation._id;
  const conversationStats = conversation.stats;

  const totalCost = conversationStats?.totalCost ?? 0;

  const modelNames =
    (conversationStats?.models?.length ?? 0) > 0
      ? conversationStats!.models!
      : conversation.model
        ? [conversation.model]
        : [];

  const derivedProviders =
    (conversationStats?.providers?.length ?? 0) > 0
      ? conversationStats!.providers!
      : conversation.provider
        ? [conversation.provider]
        : [];

  const baseModalities = conversationStats?.modalities ?? {};
  const modalities = conversationStats?.toolCounts
    ? {
        ...baseModalities,
        functionCalling: Object.values(conversationStats.toolCounts).reduce(
          (sum: number, count: number) => sum + count,
          0,
        ),
      }
    : baseModalities;

  const tags: HistoryItemTag[] = [];
  if (conversation.project) {
    tags.push({
      label: conversation.project,
      style: {
        background: "var(--accent-primary-subtle)",
        color: "var(--accent-primary)",
      },
    });
  }

  return {
    id: conversationId,
    title: conversation.title || "Untitled Conversation",
    updatedAt: conversation.updatedAt,
    createdAt: conversation.createdAt,
    totalCost,
    providers: derivedProviders,
    modelNames,
    modelName: conversation.model || null,
    modalities,
    agent: conversation.agent,
    parentConversationId: conversation.parentConversationId || null,
    hasSubAgents: conversation.hasSubAgents || false,
    tags,
    requestErrorCount: conversationStats?.requestErrorCount || 0,
  };
}

function deriveModelNames(conversation: Conversation): string[] {
  if ((conversation._liveModelNames?.length ?? 0) > 0) {
    return conversation._liveModelNames!;
  }
  if ((conversation.modelNames?.length ?? 0) > 0) {
    return conversation.modelNames!;
  }

  const messages = conversation.messages || [];
  const modelNamesSet = new Set<string>();

  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === "assistant") {
      if (messages[index].model) modelNamesSet.add(messages[index].model!);
    }
  }

  if (modelNamesSet.size === 0) {
    const fallbackModel =
      conversation.model || conversation.settings?.model;
    if (fallbackModel) modelNamesSet.add(fallbackModel);
  }

  return Array.from(modelNamesSet);
}


