"use client";
import {
  AGENT_IDS,
  AGENTLESS_AGENT,
  LOCAL_STORAGE_KEY_ACTIVE_AGENT,
} from "@/constants";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AgentChatComponent, { type ChatUrlChange } from "../../components/AgentChatComponent";
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

  // The chat reports what the URL mirrors (ChatUrlChange); the router
  // applies it. `agent` also switches the chat itself (a remount).
  const handleUrlChange = useCallback(
    (change: ChatUrlChange) => {
      const replace = (updates: Record<string, string | null>) =>
        router.replace(buildUrl(searchParams, updates), { scroll: false });
      switch (change.kind) {
        case "agent": {
          const newId = change.agentId;
          if (!newId) return;
          setLocalAgentId(newId);
          localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_AGENT, newId);
          if (searchParams.has("conversation")) {
            router.push(`/chat?agent=${encodeURIComponent(newId)}`);
          } else if (newId !== activeAgentId) {
            replace({ agent: encodeURIComponent(newId) });
          }
          return;
        }
        case "model": {
          if (!change.provider || !change.model) return;
          const modelKey = `${change.provider}:${change.model}`;
          if (searchParams.get("model") === modelKey) return;
          replace({ model: modelKey });
          return;
        }
        case "conversation": {
          // A conversation owns its model: the URL drops `model` and keeps
          // `agent`, which stops AgentChatComponent from remounting.
          const { conversationId } = change;
          if (searchParams.get("conversation") === (conversationId || null)) return;
          if (conversationId) {
            replace({ conversation: conversationId, model: null, agent: activeAgentId });
          } else {
            // New chat — clear conversation param, keep everything else
            replace({ conversation: null });
          }
          return;
        }
        case "tab":
          if (!change.tab || searchParams.get("tab") === change.tab) return;
          replace({ tab: change.tab });
          return;
        case "tabBottom":
          if (!change.tabBottom || searchParams.get("tabBottom") === change.tabBottom) return;
          replace({ tabBottom: change.tabBottom });
          return;
        case "viewMode":
          if (!change.viewMode || searchParams.get("view") === change.viewMode) return;
          replace({ view: change.viewMode });
          return;
      }
    },
    [activeAgentId, router, searchParams],
  );

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
        onUrlChange={handleUrlChange}
      />
    </main>
  );
}
