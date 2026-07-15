"use client";
import {
  AGENT_IDS,
  AGENTLESS_AGENT,
  LOCAL_STORAGE_KEY_ACTIVE_AGENT,
  EVENT_NAME_AGENT_SWITCH,
  EVENT_NAME_MODEL_CHANGE,
  EVENT_NAME_CONVERSATION_CHANGE,
  EVENT_NAME_SIDEBAR_TAB_CHANGE,
  EVENT_NAME_SIDEBAR_TAB_BOTTOM_CHANGE,
  EVENT_NAME_VIEW_MODE_CHANGE,
} from "@/constants";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AgentChatComponent from "../../components/AgentChatComponent";
import PrismService from "../../services/PrismService";
import { AgentPersona } from "../../types/types";
import styles from "./page.module.css";

const NONE_AGENT: AgentPersona = {
  id: AGENTLESS_AGENT.id,
  name: AGENTLESS_AGENT.name,
  description:
    "A straightforward conversation with the AI — no automated workflows, just you and the model.",
  project: "direct",
  toolCount: -1,
  custom: false,
  icon: "",
  avatar: "",
  color: "",
  backgroundImage: "",
  enabledToolNames: [],
  enabledByDefaultToolNames: [],
  coreToolsLocked: false,
  canSpawnSubAgents: false,
  usesDirectoryTree: false,
  usesCodingGuidelines: false,
};


export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsPageInner />
    </Suspense>
  );
}

/**
 * Helper to build a URLSearchParams from the current params,
 * apply a set of updates, and return the URL string.
 * Keys with null/undefined values are removed.
 */
function buildUrl(
  currentParams: URLSearchParams,
  updates: Record<string, string | null>,
) {
  const params = new URLSearchParams(currentParams.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value as string);
    }
  }
  const queryString = params.toString();
  return queryString ? `/chat?${queryString}` : "/chat";
}

function AgentsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [agents, setAgents] = useState<Array<AgentPersona | typeof NONE_AGENT>>(
    [],
  );
  // Always initialize to AGENT_IDS.CODING for SSR/client parity — hydrate from
  // localStorage after mount to avoid hydration mismatch.
  const [localAgentId, setLocalAgentId] = useState<string>(AGENT_IDS.CODING);

  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY_ACTIVE_AGENT);
    if (stored && stored !== AGENT_IDS.CODING) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setLocalAgentId(stored);
    }
  }, []);

  // Derive active agent: URL param takes priority over localStorage
  const activeAgentId = useMemo(() => {
    const fromUrl = searchParams.get("agent");
    return fromUrl || localAgentId;
  }, [searchParams, localAgentId]);

  useEffect(() => {
    const fromUrl = searchParams.get("agent");
    if (fromUrl && fromUrl !== localAgentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setLocalAgentId(fromUrl);
      localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_AGENT, fromUrl);
    }
  }, [searchParams, localAgentId]);

  const forceFc = searchParams.get("fc") === "true";
  const forceThinking = searchParams.get("thinking") === "true";

  // -- Deep-link params: model + conversation ------------------
  const initialModel = searchParams.get("model") || null;
  const initialConversationId = searchParams.get("conversation") || null;
  const initialTabKey = searchParams.get("tab") || null;
  const initialTabBottomKey = searchParams.get("tabBottom") || null;
  const initialViewMode = searchParams.get("view") || null;

  // Fetch agent personas on mount — prepend "Agentless" synthetic entry
  useEffect(() => {
    PrismService.getAgentPersonas()
      .then((list: AgentPersona[]) => setAgents([NONE_AGENT, ...list]))
      .catch(console.error);
  }, []);

  // -- Strip stale URL params on mount when conversation is present
  // If the URL arrives with ?conversation=...&model=..., remove
  // model immediately — the conversation data owns those values.
  useEffect(() => {
    const conversationId = searchParams.get("conversation");
    if (!conversationId) return;
    if (searchParams.has("model")) {
      router.replace(buildUrl(searchParams, { model: null }), {
        scroll: false,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for agent:switch events from AgentChatComponent
  const handleAgentSwitch = useCallback(
    (e: Event) => {
      const customEvent = e as CustomEvent;
      const newId = customEvent.detail?.agentId;
      if (newId) {
        setLocalAgentId(newId);
        localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_AGENT, newId);
        if (searchParams.has("conversation")) {
          router.push(`/chat?agent=${encodeURIComponent(newId)}`);
        } else if (newId !== activeAgentId) {
          router.replace(
            buildUrl(searchParams, { agent: encodeURIComponent(newId) }),
            { scroll: false },
          );
        }
      }
    },
    [activeAgentId, router, searchParams],
  );

  // Listen for model:change events from AgentChatComponent — sync URL
  const handleModelChange = useCallback(
    (e: Event) => {
      const customEvent = e as CustomEvent;
      const { provider, model } = customEvent.detail || {};
      if (!provider || !model) return;
      const modelKey = `${provider}:${model}`;
      const current = searchParams.get("model");
      if (current === modelKey) return;
      router.replace(buildUrl(searchParams, { model: modelKey }), {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  // When a conversation is active, strip model from URL but keep agent — the
  // conversation data is the source of truth for the model, and we keep agent
  // in the URL to prevent AgentChatComponent remounting.
  const handleConversationChange = useCallback(
    (e: Event) => {
      const customEvent = e as CustomEvent;
      const { conversationId } = customEvent.detail || {};
      const current = searchParams.get("conversation");
      if (current === (conversationId || null)) return;
      if (conversationId) {
        // Conversation active — keep conversation and agent params
        router.replace(
          buildUrl(searchParams, {
            conversation: conversationId,
            model: null,
            agent: activeAgentId,
          }),
          { scroll: false },
        );
      } else {
        // New chat — clear conversation param, keep everything else
        router.replace(buildUrl(searchParams, { conversation: null }), {
          scroll: false,
        });
      }
    },
    [activeAgentId, router, searchParams],
  );

  const handleSidebarTabChangeNotification = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent;
      const { tab: activeTabKey } = customEvent.detail || {};
      if (!activeTabKey) return;
      const currentSidebarTabKey = searchParams.get("tab");
      if (currentSidebarTabKey === activeTabKey) return;
      router.replace(buildUrl(searchParams, { tab: activeTabKey }), {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const handleSidebarTabBottomChangeNotification = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent;
      const { tabBottom: activeTabBottomKey } = customEvent.detail || {};
      if (!activeTabBottomKey) return;
      const currentSidebarTabBottomKey = searchParams.get("tabBottom");
      if (currentSidebarTabBottomKey === activeTabBottomKey) return;
      router.replace(buildUrl(searchParams, { tabBottom: activeTabBottomKey }), {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const handleViewModeChangeNotification = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent;
      const { viewMode: activeViewMode } = customEvent.detail || {};
      if (!activeViewMode) return;
      const currentViewMode = searchParams.get("view");
      if (currentViewMode === activeViewMode) return;
      router.replace(buildUrl(searchParams, { view: activeViewMode }), {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  useEffect(() => {
    window.addEventListener(EVENT_NAME_AGENT_SWITCH, handleAgentSwitch);
    window.addEventListener(EVENT_NAME_MODEL_CHANGE, handleModelChange);
    window.addEventListener(EVENT_NAME_CONVERSATION_CHANGE, handleConversationChange);
    window.addEventListener(
      EVENT_NAME_SIDEBAR_TAB_CHANGE,
      handleSidebarTabChangeNotification,
    );
    window.addEventListener(
      EVENT_NAME_SIDEBAR_TAB_BOTTOM_CHANGE,
      handleSidebarTabBottomChangeNotification,
    );
    window.addEventListener(
      EVENT_NAME_VIEW_MODE_CHANGE,
      handleViewModeChangeNotification,
    );
    return () => {
      window.removeEventListener(EVENT_NAME_AGENT_SWITCH, handleAgentSwitch);
      window.removeEventListener(EVENT_NAME_MODEL_CHANGE, handleModelChange);
      window.removeEventListener(
        EVENT_NAME_CONVERSATION_CHANGE,
        handleConversationChange,
      );
      window.removeEventListener(
        EVENT_NAME_SIDEBAR_TAB_CHANGE,
        handleSidebarTabChangeNotification,
      );
      window.removeEventListener(
        EVENT_NAME_SIDEBAR_TAB_BOTTOM_CHANGE,
        handleSidebarTabBottomChangeNotification,
      );
      window.removeEventListener(
        EVENT_NAME_VIEW_MODE_CHANGE,
        handleViewModeChangeNotification,
      );
    };
  }, [
    handleAgentSwitch,
    handleModelChange,
    handleConversationChange,
    handleSidebarTabChangeNotification,
    handleSidebarTabBottomChangeNotification,
    handleViewModeChangeNotification,
  ]);

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_AGENT, activeAgentId);
  }, [activeAgentId]);

  return (
    <main className={styles['container']}>
      <AgentChatComponent
        key={activeAgentId}
        agentId={activeAgentId}
        agents={agents}
        initialFcEnabled={forceFc}
        initialThinkingEnabled={forceThinking}
        initialModel={initialModel}
        initialConversationId={initialConversationId}
        initialTabKey={initialTabKey}
        initialTabBottomKey={initialTabBottomKey}
        initialViewMode={initialViewMode}
      />
    </main>
  );
}
