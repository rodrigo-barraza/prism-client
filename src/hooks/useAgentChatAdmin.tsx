"use client";

/**
 * The admin chat (`/admin/chat`): every user's conversations, read-only.
 * The list is filtered by the admin header (project, date range, trace) and
 * the URL (agent, provider, model); selecting an entry loads its document
 * into the chat's conversation state, which the viewer then streams live.
 *
 * Called on every chat (Rules of Hooks); nothing runs unless `isAdmin`.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { generateUUID } from "@rodrigo-barraza/utilities-library";
import { SelectComponent } from "@rodrigo-barraza/components-library";
import IrisService from "../services/IrisService";
import PrismService from "../services/PrismService";
import ToolsApiService from "../services/ToolsApiService";
import { useAdminHeader } from "../components/AdminHeaderContextComponent";
import { ErrorMessage } from "../components/StateMessageComponent";
import useProjectFilter from "./useProjectFilter";
import adminPageStyles from "../app/admin/chat/page.module.css";
import { AGENTLESS_AGENT, AGENT_IDS, PROJECT_AGENT } from "../constants";
import { buildDateRangeParams } from "../utils/utilities";
import { getErrorMessage } from "../utils/errorMessage";
import { resolveDisplayMessages } from "../utils/messageHelpers";
import { extractPersistedContextBudget, shouldApplySnapshotRefresh } from "../utils/liveConversationView";
import type {
  AgentConversation,
  AgentPersona,
  Conversation,
  Message,
  PrismSettings,
  Rule,
  Skill,
  ToolSchema,
  TransformedRequestItem,
} from "../types/types";
import type { AgentConversation as AgentConversationHook } from "./useAgentConversation";
import type { ChatSession } from "./useChatSession";
import type { ConversationList } from "./useConversationList";
import type { ChatSettings } from "./useChatModelSettings";
import type { ChatSidebar } from "./useChatSidebar";

// Stable default so non-admin renders do not churn admin callback deps
const EMPTY_ADMIN_DATE_RANGE = { from: "", to: "" };

const ADMIN_POLL_INTERVAL = 5000;
// Minimum spacing between change-event-driven admin reloads. Every reload is
// a cache-miss recompute on the service (writes invalidate its StatsCache),
// so this directly caps admin-page load on the shared NAS MongoDB.
const ADMIN_CHANGE_RELOAD_DEBOUNCE_MILLISECONDS = 2500;
// Conversations fetched per page in the admin list. Each list row forces the
// service to read the full conversation document (avg 80–180KB), so small
// pages keep the query cheap; infinite scroll loads more on demand.
const ADMIN_ENTRIES_PAGE_SIZE = 25;

const ADMIN_ALL_AGENT = {
  id: "ALL",
  name: "All",
  description: "View all conversations.",
  project: "",
  toolCount: -1,
  custom: false,
  icon: "",
  color: "",
};

const ADMIN_NONE_AGENT = {
  id: AGENTLESS_AGENT.id,
  name: AGENTLESS_AGENT.name,
  description:
    "A straightforward conversation with the AI — no automated workflows, just you and the model.",
  project: "direct",
  toolCount: -1,
  custom: false,
  icon: "",
  color: "",
};

export type UnifiedEntry = (Conversation | AgentConversation) & {
  _source?: "conversation" | "agent_conversation";
};

type EntrySource = "conversation" | "agent_conversation";

export type AdminAgent = Partial<AgentPersona> & {
  id: string;
  name: string;
  description: string;
  project?: string;
  toolCount: number;
  custom: boolean;
  icon: string;
  color: string;
};

/** The admin chat's agent filter: All, Agentless, then every persona. */
export function useAdminAgentPersonas(isAdmin: boolean): AdminAgent[] {
  const [adminAgents, setAdminAgents] = useState<AdminAgent[]>([]);
  // Fetch agent personas for admin mode
  useEffect(() => {
    if (!isAdmin) return;
    PrismService.getAgentPersonas()
      .then((list: AgentPersona[]) =>
        setAdminAgents([ADMIN_ALL_AGENT, ADMIN_NONE_AGENT, ...list] as AdminAgent[]),
      )
      .catch(console.error);
  }, [isAdmin]);
  return adminAgents;
}

interface UseAgentChatAdminOptions {
  isAdmin: boolean;
  /** useAdminAgentPersonas. */
  agents: AdminAgent[];
  /** The admin page's deep link (`/admin/chat/:id`). */
  initialId: string | null;
  conversation: AgentConversationHook;
  session: ChatSession;
  list: ConversationList;
  setSettings: React.Dispatch<React.SetStateAction<ChatSettings>>;
  setSkills: (_skills: Skill[]) => void;
  setRules: (_rules: Rule[]) => void;
  setBuiltInTools: (_tools: ToolSchema[]) => void;
  sidebar: ChatSidebar;
}

export default function useAgentChatAdmin({
  isAdmin,
  agents: adminAgents,
  initialId,
  conversation,
  session,
  list,
  setSettings,
  setSkills,
  setRules,
  setBuiltInTools,
  sidebar,
}: UseAgentChatAdminOptions) {
  const { dispatch: dispatchConversation, setMessages, setContextBudget } = conversation;
  const {
    activeId,
    setActiveId,
    activeIdRef,
    setConversationId,
    setTitle,
    setBackendConversationStats,
    isWebSocketStreamingRef,
    webSocketHasStreamedContentRef,
  } = session;
  const { conversations, setConversations } = list;
  const { setTotalMemoriesCount, setTasksCount, setSubAgentCounts } = sidebar;

  // -- Admin mode hooks (called unconditionally per Rules of Hooks) --
  const adminHeaderContext = useAdminHeader();
  const adminProjectFilterHook = useProjectFilter(isAdmin);
  const adminSearchParams = useSearchParams();
  const adminRouter = useRouter();

  // -- Admin mode state --
  const [adminEntries, setAdminEntries] = useState<UnifiedEntry[]>([]);
  const [adminEntriesHasMore, setAdminEntriesHasMore] = useState(false);
  const [adminEntriesLoading, setAdminEntriesLoading] = useState(false);
  const adminEntriesPageRef = useRef<number>(1);
  const adminEntriesTotalRef = useRef<number>(0);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSelectedSource, setAdminSelectedSource] = useState<EntrySource | null>(null);
  // Ref mirror so the long-lived change-stream subscription reads the
  // current source without re-subscribing (see activeIdRef).
  const adminSelectedSourceRef = useRef<EntrySource | null>(adminSelectedSource);
  useLayoutEffect(() => {
    adminSelectedSourceRef.current = adminSelectedSource;
  });
  const [adminLoadingDetail, setAdminLoadingDetail] = useState(false);
  const [adminNewIds, setAdminNewIds] = useState<Set<string>>(new Set());
  const [adminGeneratingCount, setAdminGeneratingCount] = useState(0);
  const [adminChangeStreamsActive, setAdminChangeStreamsActive] = useState(false);
  const [adminConversationSystemPrompt, setAdminConversationSystemPrompt] = useState<string | null>(null);
  const adminKnownIdsRef = useRef<Set<string> | null>(null);
  const adminLastFingerprintRef = useRef<string>("");
  const adminAutoSelectedRef = useRef<boolean>(!!initialId);
  const adminViewerBodyRef = useRef<HTMLDivElement | null>(null);
  const adminFingerprintRef = useRef<string>("");
  const [adminFingerprint, setAdminFingerprint] = useState("");

  // Derive admin filter values from hooks
  const adminProjectFilter = isAdmin ? adminProjectFilterHook.projectFilter : null;
  const adminProjectOptions = isAdmin ? adminProjectFilterHook.projectOptions : [];
  const adminHandleProjectChange = adminProjectFilterHook.handleProjectChange;
  const adminProviderFilter = isAdmin ? (adminSearchParams.get("provider") || null) : null;
  const adminModelFilter = isAdmin ? (adminSearchParams.get("model") || null) : null;
  const adminAgentParam = isAdmin ? (adminSearchParams.get("agent") || null) : null;
  const adminDateRange = isAdmin ? adminHeaderContext.dateRange : EMPTY_ADMIN_DATE_RANGE;
  const adminTraceFilter = isAdmin ? adminHeaderContext.traceFilter : null;
  const adminActiveAgentId = adminAgentParam || "ALL";
  const adminIsAllMode = adminActiveAgentId === "ALL";
  const adminIsNoAgent = adminActiveAgentId === AGENT_IDS.NONE;
  const adminIsAgentMode = !adminIsAllMode && !adminIsNoAgent;

  // Admin: determine if the selected entry is an agent conversation
  const adminIsSelectedAgentConversation = adminSelectedSource === "agent_conversation";
  const selectedEntry = conversations.find((entry) => entry.id === activeId) as UnifiedEntry | undefined;
  const adminTargetAgentId = adminIsSelectedAgentConversation
    ? selectedEntry?.agent
    : (adminIsAgentMode ? adminActiveAgentId : null);
  const adminTargetProject = adminIsSelectedAgentConversation
    ? (selectedEntry?.project || selectedEntry?.agent || PROJECT_AGENT)
    : (adminIsAgentMode ? PROJECT_AGENT : null);

  // Admin: resolve the agent persona data for the selected conversation so
  // MessageList can render the correct agent name and avatar icon.
  const adminActiveAgentData = useMemo(() => {
    if (!isAdmin || !adminTargetAgentId) return null;
    return adminAgents.find((agent) => agent.id === adminTargetAgentId) || null;
  }, [isAdmin, adminTargetAgentId, adminAgents]);

  // Admin: extract conversation-time tool snapshot from conversation settings
  const adminConversationToolConfig = useMemo(() => {
    if (!isAdmin || !activeId) return null;
    const entry = conversations.find((listed) => listed.id === activeId) as UnifiedEntry | undefined;
    if (!entry) return null;
    const conversationSettings = (entry as Conversation)?.settings as Record<string, unknown> | undefined;
    return conversationSettings?.toolConfig as
      | { availableTools?: string[]; disabledTools?: string[]; dynamicEnabledTools?: string[] }
      | undefined
      ?? null;
  }, [isAdmin, activeId, conversations]);

  // Admin: load agent-specific data (tools, skills, memories, rules) for selected conversation
  useEffect(() => {
    if (!isAdmin) return;
    if (!adminTargetAgentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setSkills([]);
      setBuiltInTools([]);
      setTotalMemoriesCount(0);
      setRules([]);
      return;
    }

    const project = adminTargetProject || PROJECT_AGENT;

    PrismService.getSkills(project)
      .then((loadedSkills: Skill[]) => setSkills(loadedSkills))
      .catch(() => {});

    const conversationAvailableToolNames = adminConversationToolConfig?.availableTools;
    if (conversationAvailableToolNames && conversationAvailableToolNames.length > 0) {
      const availableToolNameSet = new Set(conversationAvailableToolNames);
      PrismService.getBuiltInToolSchemas()
        .then((allSchemas: ToolSchema[]) => {
          const conversationFilteredTools = allSchemas.filter(
            (tool) => availableToolNameSet.has(tool.name),
          );
          setBuiltInTools(conversationFilteredTools);
        })
        .catch(() => {});
    } else {
      PrismService.getBuiltInToolSchemas(adminTargetAgentId)
        .then((tools: ToolSchema[]) => {
          setBuiltInTools(tools);
        })
        .catch(() => {});
    }

    PrismService.getAgentMemories(project, 1, undefined)
      .then((result: { total?: number }) => setTotalMemoriesCount(result.total || 0))
      .catch(() => {});
    PrismService.getRules(adminTargetAgentId)
      .then((rulesList: Rule[]) => setRules(rulesList))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the setters are stable
  }, [isAdmin, adminTargetAgentId, adminTargetProject, adminConversationToolConfig]);

  // Admin: upsert a freshly-fetched document into `conversations`. The
  // live-stream gate (isConversationRunning / isActiveConversationSubAgent)
  // derives from this entry's isActive/parentAgentConversationId, so it must
  // track the latest fetch — an insert-only snapshot would freeze the gate
  // in whatever state the conversation had when first selected.
  const adminUpsertConversationEntry = useCallback(
    (fullEntry: AgentConversation | Conversation) => {
      if (!fullEntry?.id) return;
      setConversations((previousConversations) => {
        const exists = previousConversations.some(
          (entry) => entry.id === fullEntry.id,
        );
        if (!exists) return [fullEntry, ...previousConversations];
        return previousConversations.map((entry) =>
          entry.id === fullEntry.id ? { ...entry, ...fullEntry } : entry,
        );
      });
    },
    [setConversations],
  );

  // Admin: select an entry
  const adminSelectEntry = useCallback(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- manual memoization is authoritative; React Compiler not enabled
    async (id: string, source: EntrySource = "conversation") => {
      if (!isAdmin || id === activeId) return;
      setActiveId(id);
      setAdminSelectedSource(source);

      // Update URL for deep-linking
      const parameters = new URLSearchParams();
      if (adminAgentParam) parameters.set("agent", adminAgentParam);
      if (adminTraceFilter) parameters.set("trace", adminTraceFilter);
      if (adminProjectFilter) parameters.set("project", adminProjectFilter);
      if (adminProviderFilter) parameters.set("provider", adminProviderFilter);
      if (adminModelFilter) parameters.set("model", adminModelFilter);

      const queryString = parameters.toString();
      window.history.replaceState(
        null,
        "",
        `/admin/chat/${id}${queryString ? `?${queryString}` : ""}`,
      );

      setAdminNewIds((previousNewIds) => {
        if (!previousNewIds.has(id)) return previousNewIds;
        const next = new Set(previousNewIds);
        next.delete(id);
        return next;
      });

      setAdminLoadingDetail(true);
      try {
        const detail =
          source === "agent_conversation"
            ? await IrisService.getAgentConversation(id)
            : await IrisService.getConversation(id);
        const fullEntry = detail as UnifiedEntry;
        const displayMessages = resolveDisplayMessages(fullEntry);
        dispatchConversation({ type: "conversation/loaded" });
        setMessages(displayMessages);
        setConversationId(fullEntry.id || generateUUID());
        setTitle(fullEntry.title || "Untitled");
        setBackendConversationStats(fullEntry.stats || null);
        // Hydrate the persisted context budget so the read-only budget
        // indicator renders for the viewed conversation.
        setContextBudget(extractPersistedContextBudget(fullEntry));
        setSettings((previousSettings) => {
          const nextSettings = { ...previousSettings };
          const conversationSettings = (fullEntry as Conversation)?.settings as Partial<PrismSettings> | undefined;
          if (conversationSettings?.provider) nextSettings.provider = conversationSettings.provider;
          if (conversationSettings?.model) nextSettings.model = conversationSettings.model;
          if (fullEntry.systemPrompt != null) nextSettings.systemPrompt = fullEntry.systemPrompt;

          // Fallback: extract from last assistant message. Admin detail
          // responses no longer carry raw `messages` (displayMessages is the
          // single serve-time form), and assistant entries survive display
          // preparation with model/provider intact.
          if (!nextSettings.model && displayMessages.length) {
            for (let i = displayMessages.length - 1; i >= 0; i--) {
              const message = displayMessages[i];
              if (message.role === "assistant" && message.model) {
                nextSettings.model = message.model;
                nextSettings.provider = message.provider || nextSettings.provider;
                break;
              }
            }
          }

          return nextSettings;
        });

        // Update sidebar conversations with the full entry
        adminUpsertConversationEntry(fullEntry as AgentConversation | Conversation);
      } catch {
        setMessages([]);
      } finally {
        setAdminLoadingDetail(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the session setters are stable
    [isAdmin, activeId, adminAgentParam, adminTraceFilter, adminProjectFilter, adminProviderFilter, adminModelFilter, adminUpsertConversationEntry, dispatchConversation, setMessages, setContextBudget],
  );

  // Admin: load entries (conversations / agent conversations / both)
  const adminLoadEntries = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const parameters: Record<string, string | number | boolean> = {
        page: 1,
        limit: ADMIN_ENTRIES_PAGE_SIZE,
        sort: "updatedAt",
        order: "desc",
      };
      if (adminTraceFilter) {
        parameters.trace = adminTraceFilter;
      } else {
        Object.assign(parameters, buildDateRangeParams(adminDateRange));
        if (adminProjectFilter) parameters.project = adminProjectFilter;
      }
      if (adminProviderFilter) parameters.provider = adminProviderFilter;
      if (adminModelFilter) parameters.model = adminModelFilter;

      if (adminIsNoAgent) {
        parameters.type = "direct";
      } else if (adminIsAgentMode) {
        parameters.agent = adminActiveAgentId;
      }

      const data = await IrisService.getConversations(parameters);
      const entries = (data.data || []).map(
        (listed: Conversation & { type?: string }) => ({
          ...listed,
          _source:
            listed.type === "agent"
              ? ("agent_conversation" as const)
              : ("conversation" as const),
        }),
      );
      const total = data.total || 0;

      const fingerprint = entries
        .map(
          (listed: UnifiedEntry) =>
            `${listed.id}:${listed.messages?.length || (listed as Conversation).messageCount || 0}`,
        )
        .join("|");

      if (fingerprint !== adminLastFingerprintRef.current) {
        adminLastFingerprintRef.current = fingerprint;
        setAdminEntries(entries);
        setAdminFingerprint(fingerprint);
      }

      adminEntriesPageRef.current = 1;
      adminEntriesTotalRef.current = total;
      setAdminEntriesHasMore(entries.length < total);

      const currentIds = new Set(entries.map((listed: UnifiedEntry) => listed.id || ""));
      if (adminKnownIdsRef.current === null) {
        adminKnownIdsRef.current = currentIds;
      } else {
        const freshIds = new Set<string>();
        for (const id of currentIds) {
          if (!adminKnownIdsRef.current.has(id)) freshIds.add(id);
        }
        if (freshIds.size > 0) {
          setAdminNewIds((previousNewIds) => {
            const merged = new Set(previousNewIds);
            for (const id of freshIds) merged.add(id);
            return merged;
          });
          adminKnownIdsRef.current = currentIds;
        }
      }

      // Auto-select first entry on load
      if (entries.length > 0 && !adminAutoSelectedRef.current) {
        adminAutoSelectedRef.current = true;
        adminSelectEntryRef.current(entries[0].id || "", entries[0]._source || "conversation");
      }

      setAdminError((previousError) => (previousError !== null ? null : previousError));
    } catch (error) {
      setAdminError(getErrorMessage(error));
    }
  }, [
    isAdmin,
    adminProjectFilter,
    adminProviderFilter,
    adminModelFilter,
    adminDateRange,
    adminTraceFilter,
    adminActiveAgentId,
    adminIsNoAgent,
    adminIsAgentMode,
  ]);
  // adminLoadEntries selects imperatively: through a ref, so its identity stays stable.
  const adminSelectEntryRef = useRef(adminSelectEntry);
  useLayoutEffect(() => {
    adminSelectEntryRef.current = adminSelectEntry;
  }, [adminSelectEntry]);

  // Admin: load more entries (pagination)
  const adminLoadMoreEntries = useCallback(async () => {
    if (!isAdmin || adminEntriesLoading || !adminEntriesHasMore) return;
    try {
      setAdminEntriesLoading(true);
      const nextPage = adminEntriesPageRef.current + 1;
      const parameters: Record<string, string | number | boolean> = {
        page: nextPage,
        limit: ADMIN_ENTRIES_PAGE_SIZE,
        sort: "updatedAt",
        order: "desc",
      };
      if (adminTraceFilter) {
        parameters.trace = adminTraceFilter;
      } else {
        Object.assign(parameters, buildDateRangeParams(adminDateRange));
        if (adminProjectFilter) parameters.project = adminProjectFilter;
      }
      if (adminProviderFilter) parameters.provider = adminProviderFilter;
      if (adminModelFilter) parameters.model = adminModelFilter;

      if (adminIsNoAgent) {
        parameters.type = "direct";
      } else if (adminIsAgentMode) {
        parameters.agent = adminActiveAgentId;
      }

      const data = await IrisService.getConversations(parameters);
      const newItems = (data.data || []).map(
        (listed: Conversation & { type?: string }) => ({
          ...listed,
          _source:
            listed.type === "agent"
              ? ("agent_conversation" as const)
              : ("conversation" as const),
        }),
      );

      adminEntriesPageRef.current = nextPage;
      setAdminEntries((previousEntries) => [...previousEntries, ...newItems]);
      setAdminEntriesHasMore(
        adminEntries.length + newItems.length < adminEntriesTotalRef.current,
      );
    } catch (error) {
      console.error("Failed to load more entries:", error);
    } finally {
      setAdminEntriesLoading(false);
    }
  }, [
    isAdmin,
    adminEntriesLoading,
    adminEntriesHasMore,
    adminTraceFilter,
    adminDateRange,
    adminProjectFilter,
    adminProviderFilter,
    adminModelFilter,
    adminEntries.length,
    adminIsNoAgent,
    adminIsAgentMode,
    adminActiveAgentId,
  ]);

  // Admin: refresh selected entry
  const adminRefreshSelectedEntry = useCallback(
    async (id: string, source: EntrySource | null) => {
      if (!isAdmin || !id) return;
      try {
        const full =
          source === "agent_conversation"
            ? ((await IrisService.getAgentConversation(id)) as UnifiedEntry)
            : ((await IrisService.getConversation(id)) as UnifiedEntry);
        // Keep the gate-driving entry (isActive etc.) in sync with the DB
        adminUpsertConversationEntry(full as AgentConversation | Conversation);
        // Budget updates never clobber streamed text — safe during streaming
        setContextBudget(extractPersistedContextBudget(full));
        // While the live WebSocket stream is actively delivering content,
        // don't clobber the partially-streamed text with a whole-document
        // snapshot — the stream's onDone does the final canonical refresh.
        // A merely-open-but-silent subscription must not block refreshes.
        if (
          !shouldApplySnapshotRefresh({
            isStreamOpen: isWebSocketStreamingRef.current,
            hasStreamedContent: webSocketHasStreamedContentRef.current,
          })
        ) {
          return;
        }
        const displayMessages = resolveDisplayMessages(full);
        dispatchConversation({ type: "conversation/loaded" });
        setMessages(displayMessages);
        setBackendConversationStats(full.stats || null);
      } catch (error: unknown) {
        console.error("Failed to refresh selected entry:", error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable setters
    [isAdmin, adminUpsertConversationEntry, dispatchConversation, setMessages, setContextBudget],
  );

  // Admin: initial detail load by ID.
  // On failure the deep-linked id STILL becomes activeId — the always-on
  // viewer WebSocket then subscribes and renders the active turn's
  // LiveTurnBuffer replay, instead of the page dying with no subscription
  // and staying empty until the conversation finalizes.
  useEffect(() => {
    if (!isAdmin || !initialId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setAdminLoadingDetail(true);
    IrisService.getConversation(initialId)
      .then((fetched: unknown) => {
        const conversationEntry = fetched as UnifiedEntry & { type?: string };
        const source = conversationEntry.type === "agent" ? "agent_conversation" : "conversation";
        setAdminSelectedSource(source);
        setActiveId(conversationEntry.id || initialId);
        setConversationId(conversationEntry.id || generateUUID());
        setTitle(conversationEntry.title || "Untitled");
        const displayMessages = resolveDisplayMessages(conversationEntry);
        dispatchConversation({ type: "conversation/loaded" });
        setMessages(displayMessages);
        setBackendConversationStats(conversationEntry.stats || null);
        setConversations((previousConversations) => [conversationEntry as AgentConversation | Conversation, ...previousConversations]);
      })
      .catch(() => {
        setMessages([]);
        setActiveId(initialId);
        setConversationId(initialId);
      })
      .finally(() => setAdminLoadingDetail(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the session setters are stable
  }, [isAdmin, initialId, dispatchConversation, setMessages]);

  // Admin: lazy load system prompt for agent conversations
  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setAdminConversationSystemPrompt(null);
    if (!activeId || adminSelectedSource !== "agent_conversation") return;

    let cancelled = false;
    IrisService.getRequests({ conversationId: activeId, limit: 1 })
      .then((response) => {
        if (cancelled) return;
        const firstRequest = response.data?.[0] as TransformedRequestItem | undefined;
        const payload = firstRequest?.requestPayload as
          | { messages?: Message[] }
          | undefined;
        const systemMessage = payload?.messages?.find(
          (message: Message) => message.role === "system",
        );
        if (systemMessage?.content) {
          setAdminConversationSystemPrompt(systemMessage.content as string);
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [isAdmin, activeId, adminSelectedSource]);

  // Admin: generating count
  useEffect(() => {
    if (!isAdmin) return;
    IrisService.getConversationStats(adminProjectFilter)
      .then((data) => setAdminGeneratingCount(data.generatingCount || 0))
      .catch(() => {});
  }, [isAdmin, adminProjectFilter]);

  // Admin: backend conversation stats for agent conversations
  useEffect(() => {
    if (!isAdmin) return;
    if (!activeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setBackendConversationStats(null);
      return;
    }
    if (adminSelectedSource === "agent_conversation") {
      IrisService.getConversationRunStats(activeId)
        .then((stats) => setBackendConversationStats(stats))
        .catch(() => setBackendConversationStats(null));

      ToolsApiService.getAllAgenticTasks({ conversationId: activeId })
        .then((result) => setTasksCount(result.summary?.total || (result.tasks || []).length))
        .catch(() => setTasksCount(0));

      PrismService.getCoordinatorSubAgents(activeId)
        .then((result) => setSubAgentCounts(result.subAgents || []))
        .catch(() => setSubAgentCounts([]));
    } else {
      setBackendConversationStats(null);
      setTasksCount(0);
      setSubAgentCounts([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the setters are stable
  }, [isAdmin, activeId, adminSelectedSource]);

  // Admin: auto-scroll to bottom
  useEffect(() => {
    if (!isAdmin || adminLoadingDetail || !activeId || !adminViewerBodyRef.current) return;
    const element = adminViewerBodyRef.current;
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }, [isAdmin, activeId, adminLoadingDetail]);

  // Admin: entry list SSE-driven + polling fallback
  useEffect(() => {
    if (!isAdmin) return;
    adminKnownIdsRef.current = null;
    if (!initialId) adminAutoSelectedRef.current = false;
    adminLastFingerprintRef.current = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setAdminEntries([]);
    setAdminFingerprint("");

    adminLoadEntries();

    // Change events arrive per Mongo write — several per agent turn, and
    // background generations (lupos etc.) write around the clock. Reloading
    // the list on every event kept the NAS Mongo saturated with back-to-back
    // multi-second list recomputes. Trailing debounce + in-flight coalescing
    // caps the reload rate regardless of event volume.
    let reloadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isReloadInFlight = false;
    let hasQueuedReload = false;
    const runDebouncedListReload = async () => {
      if (isReloadInFlight) {
        hasQueuedReload = true;
        return;
      }
      isReloadInFlight = true;
      try {
        await adminLoadEntries();
      } finally {
        isReloadInFlight = false;
        if (hasQueuedReload) {
          hasQueuedReload = false;
          scheduleListReload();
        }
      }
    };
    const scheduleListReload = () => {
      if (reloadDebounceTimer) return;
      reloadDebounceTimer = setTimeout(() => {
        reloadDebounceTimer = null;
        runDebouncedListReload();
      }, ADMIN_CHANGE_RELOAD_DEBOUNCE_MILLISECONDS);
    };

    // Same treatment for the viewed conversation's full-document refresh —
    // it ships the whole displayMessages payload, so per-event refetches of
    // a large conversation multiply into megabytes during a generation.
    let selectedRefreshDebounceTimer: ReturnType<typeof setTimeout> | null =
      null;
    const scheduleSelectedEntryRefresh = () => {
      if (selectedRefreshDebounceTimer) return;
      selectedRefreshDebounceTimer = setTimeout(() => {
        selectedRefreshDebounceTimer = null;
        const currentActiveId = activeIdRef.current;
        if (currentActiveId) {
          adminRefreshSelectedEntry(
            currentActiveId,
            adminSelectedSourceRef.current,
          );
        }
      }, ADMIN_CHANGE_RELOAD_DEBOUNCE_MILLISECONDS);
    };

    let pollInterval: NodeJS.Timeout | null = null;
    const sseSubscription = IrisService.subscribeCollectionChanges({
      onStatus: (data: { changeStreams?: boolean }) => {
        setAdminChangeStreamsActive(!!data.changeStreams);
        if (!data.changeStreams) {
          if (!pollInterval) {
            pollInterval = setInterval(
              scheduleListReload,
              ADMIN_POLL_INTERVAL,
            );
          }
        }
      },
      onChange: (event: { collection?: string; id?: string }) => {
        if (
          event.collection === "model_conversations" ||
          event.collection === "agent_conversations"
        ) {
          scheduleListReload();
          // Also refresh selected entry if it matches. Read the CURRENT
          // selection through refs — this subscription lives for the whole
          // admin session, so closing over activeId state would compare
          // against the selection at subscribe time (always null) and the
          // viewed conversation would never refresh.
          if (event.id && event.id === activeIdRef.current) {
            scheduleSelectedEntryRefresh();
          }
        }
      },
    });

    return () => {
      sseSubscription.close();
      if (pollInterval) clearInterval(pollInterval);
      if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer);
      if (selectedRefreshDebounceTimer)
        clearTimeout(selectedRefreshDebounceTimer);
    };
  }, [isAdmin, adminLoadEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Admin: fingerprint-based fallback refresh for selected entry
  useEffect(() => {
    if (!isAdmin || adminChangeStreamsActive) return;
    if (!activeId || adminFingerprint === adminFingerprintRef.current) return;
    adminFingerprintRef.current = adminFingerprint;
    adminRefreshSelectedEntry(activeId, adminSelectedSource);
  }, [isAdmin, activeId, adminFingerprint, adminChangeStreamsActive, adminRefreshSelectedEntry, adminSelectedSource]);

  // Admin: agent picker handler
  const adminHandleAgentSelect = useCallback(
    (agentPickedId: string) => {
      if (!isAdmin) return;
      const parameters = new URLSearchParams(adminSearchParams.toString());
      if (agentPickedId === "ALL") {
        parameters.delete("agent");
      } else {
        parameters.set("agent", agentPickedId);
      }
      const queryString = parameters.toString();
      adminRouter.replace(
        queryString ? `/admin/chat?${queryString}` : "/admin/chat",
        { scroll: false },
      );

      setActiveId(null);
      setMessages([]);
      setAdminSelectedSource(null);
      adminAutoSelectedRef.current = false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setActiveId is a state setter
    [isAdmin, adminSearchParams, adminRouter, setMessages],
  );

  // Admin: header controls
  useEffect(() => {
    if (!isAdmin) return;
    adminHeaderContext.setControls(
      <>
        <SelectComponent
          value={adminProjectFilter || ""}
          options={adminProjectOptions}
          onChange={adminHandleProjectChange}
          placeholder="All Projects"
          disabled={!!adminTraceFilter}
        />
        {adminGeneratingCount > 0 && (
          <span className={`${adminPageStyles['stat-pill']} ${adminPageStyles['stat-pill-generating']}`}>
            <Loader size={10} className={adminPageStyles['spinning']} />
            {adminGeneratingCount} generating
          </span>
        )}
        <ErrorMessage message={adminError} />
      </>,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- effect keyed to explicit admin filters; adminHeaderContext object identity churns every render
  }, [
    isAdmin,
    adminProjectFilter,
    adminProjectOptions,
    adminHandleProjectChange,
    adminGeneratingCount,
    adminError,
    adminTraceFilter,
  ]);

  // Admin: title badge and cleanup
  useEffect(() => {
    if (!isAdmin) return;
    adminHeaderContext.setTitleBadge(adminEntries.length);
  }, [isAdmin, adminEntries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAdmin) return;
    return () => {
      adminHeaderContext.setControls(null);
      adminHeaderContext.setTitleBadge(null);
    };
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    agents: adminAgents,
    activeAgentId: adminActiveAgentId,
    activeAgentData: adminActiveAgentData,
    entries: adminEntries,
    entriesHasMore: adminEntriesHasMore,
    entriesLoading: adminEntriesLoading,
    newIds: adminNewIds,
    selectedSourceRef: adminSelectedSourceRef,
    isLoadingDetail: adminLoadingDetail,
    conversationSystemPrompt: adminConversationSystemPrompt,
    providerFilter: adminProviderFilter,
    traceFilter: adminTraceFilter,
    dateRange: adminDateRange,
    setDateRange: adminHeaderContext.setDateRange,
    viewerBodyRef: adminViewerBodyRef,
    selectEntry: adminSelectEntry,
    loadMoreEntries: adminLoadMoreEntries,
    selectAgent: adminHandleAgentSelect,
    refreshSelectedEntry: adminRefreshSelectedEntry,
  };
}

export type AgentChatAdmin = ReturnType<typeof useAgentChatAdmin>;
