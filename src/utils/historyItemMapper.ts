import type { Conversation } from "../types/types";

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
  pendingBackgroundTasks?: number;
  /** Persisted active-session flag from agent_conversations — false means the session explicitly ended */
  isActive?: boolean;
  /** Backend-authoritative zero-based spawn index within a team of sub-agents */
  agentIndex?: number | null;
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
    pendingBackgroundTasks: conversation.pendingBackgroundTasks,
    isActive: conversation.isActive,
    agentIndex: conversation.agentIndex ?? null,
  };
}


function deriveModelNames(conversation: Conversation): string[] {
  // Prefer the client-side live enrichment written during active generation
  // (keeps sidebar badges live before the backend listing catches up), then
  // fall back to the backend-authoritative modelNames field.
  if ((conversation._liveModelNames?.length ?? 0) > 0) {
    return conversation._liveModelNames!;
  }
  return conversation.modelNames ?? [];
}


