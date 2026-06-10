"use client";
import {
  AGENT_IDS,
  AGENTLESS_AGENT,
  LS_ACTIVE_AGENT,
  EV_AGENT_SWITCH,
  EV_MODEL_CHANGE,
  EV_CONVERSATION_CHANGE,
  EV_SIDEBAR_TAB_CHANGE,
  EV_VIEW_MODE_CHANGE,
} from "@/constants";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ChatSessionComponent from "../../components/ChatSessionComponent";
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
  coreToolsLocked: false,
  canSpawnWorkers: false,
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
    const stored = localStorage.getItem(LS_ACTIVE_AGENT);
    if (stored && stored !== AGENT_IDS.CODING) {
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
      setLocalAgentId(fromUrl);
      localStorage.setItem(LS_ACTIVE_AGENT, fromUrl);
    }
  }, [searchParams, localAgentId]);

  const forceFc = searchParams.get("fc") === "true";
  const forceThinking = searchParams.get("thinking") === "true";

  // -- Deep-link params: model + session ------------------------
  const initialModel = searchParams.get("model") || null;
  const initialSessionId = searchParams.get("session") || null;
  const initialTabKey = searchParams.get("tab") || null;
  const initialViewMode = searchParams.get("view") || null;

  // Fetch agent personas on mount — prepend "Agentless" synthetic entry
  useEffect(() => {
    PrismService.getAgentPersonas()
      .then((list: AgentPersona[]) => setAgents([NONE_AGENT, ...list]))
      .catch(console.error);
  }, []);

  // -- Strip stale URL params on mount when session is present ----
  // If the URL arrives with ?session=...&model=..., remove
  // model immediately — the session data owns those values.
  useEffect(() => {
    const sessionId = searchParams.get("session");
    if (!sessionId) return;
    const hasModel = searchParams.has("model");
    if (hasModel) {
      router.replace(buildUrl(searchParams, { model: null }), {
        scroll: false,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for agent:switch events from ChatSessionComponent
  const handleAgentSwitch = useCallback(
    (e: Event) => {
      const customEvent = e as CustomEvent;
      const newId = customEvent.detail?.agentId;
      if (newId) {
        setLocalAgentId(newId);
        localStorage.setItem(LS_ACTIVE_AGENT, newId);
        if (searchParams.has("session")) {
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

  // Listen for model:change events from ChatSessionComponent — sync URL
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

  // Listen for conversation:change events from ChatSessionComponent — sync URL
  // When a session is active, strip model from URL but keep agent — the
  // session data is the source of truth for the model, and we keep agent
  // in the URL to prevent ChatSessionComponent remounting.
  const handleConversationChange = useCallback(
    (e: Event) => {
      const customEvent = e as CustomEvent;
      const { conversationId } = customEvent.detail || {};
      const current = searchParams.get("session");
      if (current === (conversationId || null)) return;
      if (conversationId) {
        // Session active → keep session and agent params
        router.replace(
          buildUrl(searchParams, {
            session: conversationId,
            model: null,
            agent: activeAgentId,
          }),
          { scroll: false },
        );
      } else {
        // New chat → clear session param, keep everything else
        router.replace(buildUrl(searchParams, { session: null }), {
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
    window.addEventListener(EV_AGENT_SWITCH, handleAgentSwitch);
    window.addEventListener(EV_MODEL_CHANGE, handleModelChange);
    window.addEventListener(EV_CONVERSATION_CHANGE, handleConversationChange);
    window.addEventListener(
      EV_SIDEBAR_TAB_CHANGE,
      handleSidebarTabChangeNotification,
    );
    window.addEventListener(
      EV_VIEW_MODE_CHANGE,
      handleViewModeChangeNotification,
    );
    return () => {
      window.removeEventListener(EV_AGENT_SWITCH, handleAgentSwitch);
      window.removeEventListener(EV_MODEL_CHANGE, handleModelChange);
      window.removeEventListener(
        EV_CONVERSATION_CHANGE,
        handleConversationChange,
      );
      window.removeEventListener(
        EV_SIDEBAR_TAB_CHANGE,
        handleSidebarTabChangeNotification,
      );
      window.removeEventListener(
        EV_VIEW_MODE_CHANGE,
        handleViewModeChangeNotification,
      );
    };
  }, [
    handleAgentSwitch,
    handleModelChange,
    handleConversationChange,
    handleSidebarTabChangeNotification,
    handleViewModeChangeNotification,
  ]);

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem(LS_ACTIVE_AGENT, activeAgentId);
  }, [activeAgentId]);

  return (
    <main className={styles['container']}>
      <ChatSessionComponent
        key={activeAgentId}
        agentId={activeAgentId}
        agents={agents}
        initialFcEnabled={forceFc}
        initialThinkingEnabled={forceThinking}
        initialModel={initialModel}
        initialSessionId={initialSessionId}
        initialTabKey={initialTabKey}
        initialViewMode={initialViewMode}
      />
    </main>
  );
}
