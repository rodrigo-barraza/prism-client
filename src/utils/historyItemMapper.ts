import type { Conversation, AgentSession } from "../types/types";

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
    parentConversationId: conversation.parentConversationId || conversation.parentAgentSessionId || null,
    hasSubAgents: conversation.hasSubAgents || false,
    searchText: searchTextParts.join(" "),
    requestErrorCount: conversation.requestErrorCount || 0,
  };
}

export function mapAgentSessionToHistoryItem(
  session: AgentSession,
): MappedHistoryItem {
  const sessionId = session.id || session._id;
  const sessionStats = session.stats;

  const totalCost = sessionStats?.totalCost ?? 0;

  const modelNames =
    (sessionStats?.models?.length ?? 0) > 0
      ? sessionStats!.models!
      : session.model
        ? [session.model]
        : [];

  const derivedProviders =
    (sessionStats?.providers?.length ?? 0) > 0
      ? sessionStats!.providers!
      : session.provider
        ? [session.provider]
        : [];

  const baseModalities = sessionStats?.modalities ?? {};
  const modalities = sessionStats?.toolCounts
    ? {
        ...baseModalities,
        functionCalling: Object.values(sessionStats.toolCounts).reduce(
          (sum: number, count: number) => sum + count,
          0,
        ),
      }
    : baseModalities;

  const tags: HistoryItemTag[] = [];
  if (session.project) {
    tags.push({
      label: session.project,
      style: {
        background: "var(--accent-primary-subtle)",
        color: "var(--accent-primary)",
      },
    });
  }

  return {
    id: sessionId,
    title: session.title || "Untitled Session",
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    totalCost,
    providers: derivedProviders,
    modelNames,
    modelName: session.model || null,
    modalities,
    agent: session.agent,
    parentConversationId: session.parentConversationId || session.parentAgentSessionId || null,
    hasSubAgents: session.hasSubAgents || false,
    tags,
    requestErrorCount: sessionStats?.requestErrorCount || 0,
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


