"use client";

/**
 * The agent chat's two side-panel groups: which tab each shows (mirrored in
 * the page's URL once the user changes it), which tabs have news the user
 * has not looked at, the counts on their badges, and the keys that make a
 * panel refetch after the agent changed what it lists.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import PrismService from "../services/PrismService";
import ToolsApiService from "../services/ToolsApiService";
import { normalizeSubAgentStatusToPhase } from "../utils/subAgentActivity";
import type { AgentConversationSetters } from "./useAgentConversation";
import type { ChatUrlChange } from "../utils/chatUrlChange";

/** The tabs of the lower panel group; every other tab is the upper group's. */
export const BOTTOM_PANEL_TABS = new Set([
  "tools",
  "skills",
  "rules",
  "hooks",
  "instructions",
  "memories",
  "tasks",
]);

interface UseChatSidebarOptions {
  initialTabKey: string | null;
  initialTabBottomKey: string | null;
  reportUrlChange: (_change: ChatUrlChange) => void;
  isAdmin: boolean;
  agentId: string;
  agentProject: string | undefined;
  /** The conversation on screen (its tasks and sub-agents). */
  conversationId: string;
  isWorkspaceTabVisible: boolean;
  hasOrchestratorTools: boolean;
  /**
   * The tools and workspaces that decide the Workspace and Sub-Agents tabs
   * have loaded. Before that a `?tab=` link must not fall back.
   */
  isToolsetKnown: boolean;
  /** Settings said whether memory models exist; without any, there is no Memories tab. */
  hasLoadedModelSettings: boolean;
  hasAnyMemoryModelSet: boolean;
  setSubAgentToolActivity: AgentConversationSetters["setSubAgentToolActivity"];
}

export default function useChatSidebar({
  initialTabKey,
  initialTabBottomKey,
  reportUrlChange,
  isAdmin,
  agentId,
  agentProject,
  conversationId,
  isWorkspaceTabVisible,
  hasOrchestratorTools,
  isToolsetKnown,
  hasLoadedModelSettings,
  hasAnyMemoryModelSet,
  setSubAgentToolActivity,
}: UseChatSidebarOptions) {
  const [leftTab, setLeftTab] = useState(() => {
    if (initialTabKey && !BOTTOM_PANEL_TABS.has(initialTabKey)) {
      return initialTabKey;
    }
    return "settings";
  });
  const [leftTabBottom, setLeftTabBottom] = useState(() => {
    if (initialTabBottomKey) {
      return initialTabBottomKey;
    }
    if (initialTabKey && BOTTOM_PANEL_TABS.has(initialTabKey)) {
      return initialTabKey;
    }
    return "tools";
  });
  const leftTabRef = useRef<string>(leftTab);
  const leftTabBottomRef = useRef<string>(leftTabBottom);
  useLayoutEffect(() => {
    leftTabRef.current = leftTab;
    leftTabBottomRef.current = leftTabBottom;
  });

  // Track which tabs have received new data the user hasn't viewed yet
  const [newDataTabs, setNewDataTabs] = useState<Set<string>>(new Set());

  // Badge counts
  const [totalMemoriesCount, setTotalMemoriesCount] = useState(0);
  const [workflowMemoriesCount, setWorkflowMemoriesCount] = useState(0);
  const [tasksCount, setTasksCount] = useState(0);
  const [datastoreCount, setDatastoreCount] = useState(0);
  const [subAgentsCount, setSubAgentsCount] = useState(0);
  const [maxSubAgentDepth, setMaxSubAgentDepth] = useState(0);
  const [workspaceTreeStats, setWorkspaceTreeStats] = useState<{
    totalEntries: number;
    truncated: boolean;
  } | null>(null);

  // Bumped when the agent changed what a panel lists: the panel refetches.
  const [memoriesRefreshKey, setMemoriesRefreshKey] = useState(0);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
  const [datastoreRefreshKey, setDatastoreRefreshKey] = useState(0);
  const [workspaceTreeRefreshKey, setWorkspaceTreeRefreshKey] = useState(0);

  // The URL follows the tabs once the user changes them; the tabs the chat
  // opens with stay out of it.
  const reportedTabsRef = useRef({ tab: leftTab, tabBottom: leftTabBottom });
  useEffect(() => {
    if (reportedTabsRef.current.tab === leftTab) return;
    reportedTabsRef.current.tab = leftTab;
    if (leftTab) reportUrlChange({ kind: "tab", tab: leftTab });
  }, [leftTab, reportUrlChange]);

  useEffect(() => {
    if (reportedTabsRef.current.tabBottom === leftTabBottom) return;
    reportedTabsRef.current.tabBottom = leftTabBottom;
    if (leftTabBottom) reportUrlChange({ kind: "tabBottom", tabBottom: leftTabBottom });
  }, [leftTabBottom, reportUrlChange]);

  useEffect(() => {
    if (initialTabKey) {
      if (BOTTOM_PANEL_TABS.has(initialTabKey)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
        if (initialTabKey !== leftTabBottom) setLeftTabBottom(initialTabKey);
      } else {
        if (initialTabKey !== leftTab) setLeftTab(initialTabKey);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initial tab sync runs on trigger props only; adding tab state would clobber user navigation
  }, [initialTabKey]);

  useEffect(() => {
    if (initialTabBottomKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      if (initialTabBottomKey !== leftTabBottom) setLeftTabBottom(initialTabBottomKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initial tab sync runs on trigger props only; adding tab state would clobber user navigation
  }, [initialTabBottomKey]);

  // A tab that is not offered falls back to the default, once the tools and
  // workspaces that decide it have loaded: on the first render neither tab is
  // offered yet, and a `?tab=subAgents` / `?tab=workspace` link was lost.
  useEffect(() => {
    if (isToolsetKnown && leftTab === "workspace" && !isWorkspaceTabVisible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setLeftTab("settings");
    }
  }, [leftTab, isWorkspaceTabVisible, isToolsetKnown]);

  useEffect(() => {
    if (isToolsetKnown && leftTab === "subAgents" && !hasOrchestratorTools) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setLeftTab("settings");
    }
  }, [leftTab, hasOrchestratorTools, isToolsetKnown]);

  useEffect(() => {
    if (hasLoadedModelSettings && !hasAnyMemoryModelSet && leftTabBottomRef.current === "memories") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setLeftTabBottom("tools");
    }
  }, [hasLoadedModelSettings, hasAnyMemoryModelSet]);

  /** Mark a tab as having new unseen data (only if user isn't already viewing it). */
  const markTabNew = useCallback((tabKey: string) => {
    if (leftTabRef.current === tabKey || leftTabBottomRef.current === tabKey)
      return;
    setNewDataTabs((previousNewDataTabs) => {
      if (previousNewDataTabs.has(tabKey)) return previousNewDataTabs;
      const next = new Set(previousNewDataTabs);
      next.add(tabKey);
      return next;
    });
  }, []);

  const clearNewData = useCallback((tabKey: string) => {
    setNewDataTabs((previousNewDataTabs) => {
      if (!previousNewDataTabs.has(tabKey)) return previousNewDataTabs;
      const next = new Set(previousNewDataTabs);
      next.delete(tabKey);
      return next;
    });
  }, []);

  // Ephemeral tab switch — temporarily show a tab then revert after a delay.
  // Cancels any pending revert to avoid stacking timeouts.
  const tabRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTabTemporarily = useCallback(
    (targetTab: string, delayMs = 5000) => {
      const isBottomTab = BOTTOM_PANEL_TABS.has(targetTab);
      const currentRef = isBottomTab ? leftTabBottomRef : leftTabRef;
      const updateTabState = isBottomTab ? setLeftTabBottom : setLeftTab;
      const previousTab = currentRef.current;
      if (previousTab === targetTab) return;
      // Cancel any pending revert from a previous ephemeral switch
      if (tabRevertTimerRef.current) clearTimeout(tabRevertTimerRef.current);
      updateTabState(targetTab);
      tabRevertTimerRef.current = setTimeout(() => {
        tabRevertTimerRef.current = null;
        // Only revert if the user hasn't manually navigated away
        if (currentRef.current === targetTab) {
          updateTabState(previousTab);
        }
      }, delayMs);
    },
    [],
  );

  /** The user picked an upper tab: it stays (no pending revert), and its news are seen. */
  const selectTopTab = useCallback(
    (tab: string) => {
      setLeftTab(tab);
      // User manually switched — cancel any pending ephemeral revert
      if (tabRevertTimerRef.current) {
        clearTimeout(tabRevertTimerRef.current);
        tabRevertTimerRef.current = null;
      }
      clearNewData(tab);
    },
    [clearNewData],
  );

  const selectBottomTab = useCallback(
    (tab: string) => {
      setLeftTabBottom(tab);
      clearNewData(tab);
    },
    [clearNewData],
  );

  /** Badge props: 0 = greyed-out, >0 = lit, "new" if the tab has unseen data. */
  const badgeProps = (count: number, tabKey: string) => ({
    badge: count,
    badgeDisabled: count === 0,
    badgeState: newDataTabs.has(tabKey) ? "new" : "default",
  });

  // -- Eager-fetch tab badge counts (fires on mount / conversation change) --

  useEffect(() => {
    if (isAdmin) return;
    PrismService.getAgentMemories(agentProject, 1, agentId)
      .then((result) => setTotalMemoriesCount(result.total || 0))
      .catch(() => {});
    PrismService.getWorkflowMemories(agentProject, 1, agentId)
      .then((result) => setWorkflowMemoriesCount(result.total || 0))
      .catch(() => {});
  }, [agentProject, agentId, isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    ToolsApiService.getAllAgenticTasks({ conversationId })
      .then((result) => setTasksCount(result.summary?.total || (result.tasks || []).length))
      .catch(() => {});
  }, [conversationId, tasksRefreshKey, isAdmin]);

  useEffect(() => {
    if (isAdmin || !agentProject) return;
    ToolsApiService.queryDatastore(agentProject)
      .then((result) =>
        setDatastoreCount(
          (result.namespaces || []).reduce(
            (sum, namespaceInfo) => sum + namespaceInfo.count,
            0,
          ),
        ),
      )
      .catch(() => {});
  }, [agentProject, datastoreRefreshKey, isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    PrismService.getCoordinatorSubAgents(conversationId)
      .then((result) => {
        const subAgentsList = result.subAgents || [];
        setSubAgentsCount(subAgentsList.length);
        setMaxSubAgentDepth(
          subAgentsList.reduce((maximumDepth, subAgent) => Math.max(maximumDepth, subAgent.recursionDepth ?? 0), 0),
        );
        setSubAgentToolActivity((previousSubAgentToolActivity) => {
          const nextSubAgentToolActivity = { ...previousSubAgentToolActivity };
          for (const subAgent of subAgentsList) {
            const agentId = subAgent.agentId || subAgent.id;
            if (agentId && !nextSubAgentToolActivity[agentId]) {
              nextSubAgentToolActivity[agentId] = {
                toolCount: subAgent.toolCallCount || 0,
                currentTool: null,
                iteration: 0,
                toolNames: subAgent.toolNames || {},
                description: subAgent.description,
                phase: normalizeSubAgentStatusToPhase(subAgent.status),
                conversationId: subAgent.id || undefined,
              };
            }
          }
          return nextSubAgentToolActivity;
        });
      })
      .catch(() => {});
  }, [conversationId, tasksRefreshKey, isAdmin, setSubAgentToolActivity]);

  /** The count of sub-agents and how deep they nest (a sub-agents listing). */
  const setSubAgentCounts = useCallback(
    (subAgents: ReadonlyArray<{ recursionDepth?: number }>) => {
      setSubAgentsCount(subAgents.length);
      setMaxSubAgentDepth(
        subAgents.reduce((maximumDepth, subAgent) => Math.max(maximumDepth, subAgent.recursionDepth ?? 0), 0),
      );
    },
    [],
  );

  const refreshMemories = useCallback(() => setMemoriesRefreshKey((key) => key + 1), []);
  const refreshTasks = useCallback(() => setTasksRefreshKey((key) => key + 1), []);
  const refreshDatastore = useCallback(() => setDatastoreRefreshKey((key) => key + 1), []);
  const refreshWorkspaceTree = useCallback(() => setWorkspaceTreeRefreshKey((key) => key + 1), []);

  return {
    leftTab,
    selectTopTab,
    leftTabBottom,
    setLeftTabBottom,
    selectBottomTab,
    newDataTabs,
    markTabNew,
    switchTabTemporarily,
    badgeProps,
    totalMemoriesCount,
    setTotalMemoriesCount,
    workflowMemoriesCount,
    setWorkflowMemoriesCount,
    tasksCount,
    setTasksCount,
    datastoreCount,
    setDatastoreCount,
    subAgentsCount,
    setSubAgentsCount,
    maxSubAgentDepth,
    setMaxSubAgentDepth,
    setSubAgentCounts,
    workspaceTreeStats,
    setWorkspaceTreeStats,
    memoriesRefreshKey,
    refreshMemories,
    tasksRefreshKey,
    refreshTasks,
    datastoreRefreshKey,
    refreshDatastore,
    workspaceTreeRefreshKey,
    refreshWorkspaceTree,
  };
}

export type ChatSidebar = ReturnType<typeof useChatSidebar>;
