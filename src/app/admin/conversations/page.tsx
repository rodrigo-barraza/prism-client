"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  Suspense,
} from "react";
import { buildDateRangeParams } from "../../../utils/utilities";
import useSessionStats from "../../../hooks/useSessionStats";
import { useSearchParams } from "next/navigation";
import {
  Loader,
  MessageSquare,
  Settings,
  SlidersHorizontal,
  Info,
} from "lucide-react";

import IrisService from "../../../services/IrisService";
import PrismService from "../../../services/PrismService";
import MessageList, {
  prepareDisplayMessages,
} from "../../../components/MessageListComponent";
import SettingsPanel from "../../../components/SettingsPanelComponent";
import ModelInfoPanel from "../../../components/ModelInfoPanelComponent";
import ParametersPanelComponent from "../../../components/ParametersPanelComponent";
import HistoryPanel from "../../../components/HistoryPanelComponent";

import ThreePanelLayout from "../../../components/ThreePanelLayoutComponent";
import {
  SelectComponent,
  TabBarComponent,
} from "@rodrigo-barraza/components-library";

import ModelPickerPopoverComponent from "../../../components/ModelPickerPopoverComponent";
import { ErrorMessage } from "../../../components/StateMessageComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import useProjectFilter from "../../../hooks/useProjectFilter";
import ProjectBadgeComponent from "../../../components/ProjectBadgeComponent";
import UserBadgeComponent from "../../../components/UserBadgeComponent";

import { SETTINGS_DEFAULTS } from "../../../constants";
import type { Conversation, PrismConfig, Favorite, Workflow } from "../../../types/types";
import styles from "./page.module.css";

const POLL_INTERVAL = 5000; // 5s

export default function ConversationsPage(props: { searchParams?: Record<string, string>; params?: Record<string, string>; initialId?: string | null; traceId?: string | null }) {
  return (
    <Suspense>
      <ConversationsPageInner {...props} />
    </Suspense>
  );
}

function ConversationsPageInner({ initialId = null, traceId = null }: { initialId?: string | null; traceId?: string | null }) {
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const searchParams = useSearchParams();
  const providerFilter = searchParams.get("provider") || null;
  const modelFilter = searchParams.get("model") || null;
  const traceParam = searchParams.get("trace") || traceId;
  const {
    setControls,
    setTitleBadge,
    dateRange,
    sessionFilter,
    setSessionFilter,
  } = useAdminHeader();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsHasMore, setConversationsHasMore] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const conversationsPageRef = useRef<number>(1);
  const conversationsTotalRef = useRef<number>(0);

  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [config, setConfig] = useState<PrismConfig | null>(null);

  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [generatingCount, setGeneratingCount] = useState(0);
  const [changeStreamsActive, setChangeStreamsActive] = useState(false);

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [leftTab, setLeftTab] = useState("settings");
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  const knownIdsRef = useRef<Set<string> | null>(null); // null = not yet initialized
  const lastFingerprintRef = useRef<string>("");
  const autoSelectedRef = useRef<boolean>(!!initialId);
  const viewerBodyRef = useRef<HTMLDivElement | null>(null);

  // Sync the session parameter into the admin header context
  useEffect(() => {
    if (traceParam) {
      setSessionFilter(traceParam);
    }
    return () => {
      // Only clear if we set it — avoid clearing on unmount when there's no trace
      if (traceParam) setSessionFilter(null);
    };
  }, [traceParam, setSessionFilter]);

  // The active session filter (from URL param or context)
  const activeSession = traceParam || sessionFilter;

  useEffect(() => {
    IrisService.getConfig()
      .then(setConfig)
      .catch(() => {});

    // Load favorites
    PrismService.getFavorites("model")
      .then((favs: Favorite[]) => setFavoriteKeys(favs.map((f: Favorite) => f.key as string)))
      .catch(() => {});
  }, []);

  // -- Favorites -------------------------------------------------
  const handleToggleFavorite = useCallback(
    async (key: string) => {
      if (favoriteKeys.includes(key)) {
        setFavoriteKeys((prev) => prev.filter((k: string) => k !== key));
        PrismService.removeFavorite("model", key).catch(() => {});
      } else {
        setFavoriteKeys((prev) => [...prev, key]);
        const [provider, ...rest] = key.split(":");
        PrismService.addFavorite("model", key, {
          provider,
          name: rest.join(":"),
        }).catch(() => {});
      }
    },
    [favoriteKeys],
  );

  // If initialId is set, load that conversation immediately
  useEffect(() => {
    if (initialId) {
      setLoadingDetail(true);
      IrisService.getConversation(initialId)
        .then((conv) => setSelectedConv(conv as Conversation))
        .catch(() => setSelectedConv(null))
        .finally(() => setLoadingDetail(false));
    }
  }, [initialId]);

  const loadConversations = useCallback(async () => {
    try {
      const params = {
        page: 1,
        limit: 200,
        sort: "updatedAt",
        order: "desc",
      };
      // When filtering by session, skip date/project filters
      if (activeSession) {
        (params as Record<string, any>).trace = activeSession;
      } else {
        Object.assign(params, buildDateRangeParams(dateRange));
        if (projectFilter) (params as Record<string, any>).project = projectFilter;
      }
      if (providerFilter) (params as Record<string, any>).provider = providerFilter;
      if (modelFilter) (params as Record<string, any>).model = modelFilter;
      const data = await IrisService.getConversations(params);
      const list = (data.data || []) as Conversation[];

      // Build fingerprint from meaningful fields
      const fp = list
        .map((c: Conversation) => `${c.id}:${c.messages?.length || c.messageCount || 0}`)
        .join("|");

      if (fp !== lastFingerprintRef.current) {
        lastFingerprintRef.current = fp;
        setConversations(list);
        setFingerprint(fp);
      }

      // Track pagination state
      conversationsPageRef.current = 1;
      conversationsTotalRef.current = data.total || 0;
      setConversationsHasMore(list.length < (data.total || 0));

      // Track new IDs
      const currentIds = new Set(list.map((c: Conversation) => c.id || ""));
      if (knownIdsRef.current === null) {
        // First load — mark everything as known
        knownIdsRef.current = currentIds;
      } else {
        // Find new IDs that weren't known before
        const freshIds = new Set();
        for (const id of currentIds) {
          if (!(knownIdsRef.current as Set<string>).has(id)) freshIds.add(id);
        }
        if (freshIds.size > 0) {
          setNewIds((prev) => {
            const merged = new Set(prev);
            for (const id of Array.from(freshIds)) merged.add(id as string);
            return merged;
          });
          // Update known IDs
          knownIdsRef.current = currentIds;
        }
      }

      // Auto-select on first load (only if no initialId)
      if (list.length > 0 && !autoSelectedRef.current) {
        autoSelectedRef.current = true;
        selectConversation(list[0].id || "");
      }

      setError((prev) => (prev !== null ? null : prev));
    } catch (error: any) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [projectFilter, providerFilter, modelFilter, dateRange, activeSession]);

  const loadMoreConversations = useCallback(async () => {
    if (conversationsLoading || !conversationsHasMore) return;
    try {
      setConversationsLoading(true);
      const nextPage = conversationsPageRef.current + 1;
      const params = {
        page: nextPage,
        limit: 200,
        sort: "updatedAt",
        order: "desc",
      };
      if (activeSession) {
        (params as Record<string, any>).trace = activeSession;
      } else {
        Object.assign(params, buildDateRangeParams(dateRange));
        if (projectFilter) (params as Record<string, any>).project = projectFilter;
      }
      if (providerFilter) (params as Record<string, any>).provider = providerFilter;
      if (modelFilter) (params as Record<string, any>).model = modelFilter;
      const data = await IrisService.getConversations(params);
      const list = (data.data || []) as Conversation[];
      conversationsPageRef.current = nextPage;
      setConversations((prev) => [...prev, ...list]);
      setConversationsHasMore(
        conversations.length + list.length < (data.total || 0),
      );
    } catch (error: any) {
      console.error("Failed to load more conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  }, [
    conversationsLoading,
    conversationsHasMore,
    activeSession,
    dateRange,
    projectFilter,
    providerFilter,
    modelFilter,
    conversations.length,
  ]);

  // Initial stats fetch (SSE subscription for generating count is handled
  // globally by AdminShell to avoid duplicate SSE connections).
  useEffect(() => {
    IrisService.getConversationStats(projectFilter)
      .then((data) => {
        setGeneratingCount(data.generatingCount || 0);
      })
      .catch(() => {});
  }, [projectFilter]);

  // Live conversation detail — re-fetch when Change Streams detect updates
  const fingerprintRef = useRef<string>("");
  const [fingerprint, setFingerprint] = useState("");
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  // Refresh the selected conversation detail
  const refreshSelectedConv = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const full = (await IrisService.getConversation(id)) as Conversation;
      setSelectedConv((prev) => {
        const oldMsgs = prev?.messages || [];
        const newMsgs = full?.messages || [];
        if (oldMsgs.length !== newMsgs.length) return full;
        const oldLast = oldMsgs[oldMsgs.length - 1];
        const newLast = newMsgs[newMsgs.length - 1];
        if (oldLast?.content?.length !== newLast?.content?.length) return full;
        // Also refresh if isGenerating changed
        if (prev?.isGenerating !== full?.isGenerating) return full;
        return prev;
      });
    } catch (error: any) {
      console.error("Failed to refresh selected conversation:", error);
    }
  }, []);

  // Change Stream-driven: instant detail refresh when selected conv is updated
  useEffect(() => {
    if (!changeStreamsActive) return;

    const onEvent = (event: Record<string, any>) => {
      if (
        event.collection === "conversations" &&
        selectedIdRef.current &&
        event.id === selectedIdRef.current
      ) {
        refreshSelectedConv(selectedIdRef.current);
      }
    };

    const es = IrisService.subscribeCollectionChanges({
      onChange: onEvent,
    });

    return () => es.close();
  }, [changeStreamsActive, refreshSelectedConv]);

  // Fallback: fingerprint-based refresh (when list changes detected new data)
  useEffect(() => {
    if (changeStreamsActive) return; // Change Streams handle this
    if (!selectedId || fingerprint === fingerprintRef.current) return;
    fingerprintRef.current = fingerprint;
    refreshSelectedConv(selectedId);
  }, [selectedId, fingerprint, changeStreamsActive, refreshSelectedConv]);

  // Conversation list — SSE-driven with polling fallback
  useEffect(() => {
    // Immediately clear stale data and reset tracking when filters change
    knownIdsRef.current = null;
    // Only reset auto-select when there is no initialId — otherwise the
    // deep-linked conversation would be overwritten by list[0].
    if (!initialId) autoSelectedRef.current = false;
    lastFingerprintRef.current = "";
    setConversations([]);
    setFingerprint("");

    loadConversations();

    // Subscribe to change stream SSE for real-time updates
    let pollInterval: NodeJS.Timeout | null = null;
    const es = IrisService.subscribeCollectionChanges({
      onStatus: (data: Record<string, any>) => {
        setChangeStreamsActive(!!data.changeStreams);
        if (!data.changeStreams) {
          // No Change Streams — fall back to polling
          if (!pollInterval) {
            pollInterval = setInterval(loadConversations, POLL_INTERVAL);
          }
        }
      },
      onChange: (event: Record<string, any>) => {
        if (event.collection === "conversations") {
          loadConversations();
        }
      },
    });

    return () => {
      es.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [loadConversations]);

  // Fetch workflows for the selected conversation
  useEffect(() => {
    if (!selectedId) {
      setWorkflows([]);
      return;
    }
    IrisService.getConversationWorkflows(selectedId)
      .then(setWorkflows)
      .catch(() => setWorkflows([]));
  }, [selectedId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!loadingDetail && selectedConv && viewerBodyRef.current) {
      const element = viewerBodyRef.current;
      requestAnimationFrame(() => {
        (element as HTMLElement).scrollTop = (element as HTMLElement).scrollHeight;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loadingDetail]);

  const generatingDisplay = useMemo(() => generatingCount, [generatingCount]);

  async function selectConversation(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    // Update URL for deep-linking (preserve all filter params)
    const params = new URLSearchParams();
    if (activeSession) params.set("trace", activeSession);
    if (projectFilter) params.set("project", projectFilter);
    if (providerFilter) params.set("provider", providerFilter);
    if (modelFilter) params.set("model", modelFilter);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `/admin/conversations/${id}${qs ? `?${qs}` : ""}`,
    );
    // Remove NEW badge when clicking into a conversation
    setNewIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setLoadingDetail(true);
    try {
      const conversation = await IrisService.getConversation(id);
      setSelectedConv(conversation);
    } catch {
      setSelectedConv(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  const convTitle = selectedConv
    ? selectedConv.title || "Untitled Conversation"
    : "Select a conversation";

  const {
    uniqueModels,
    uniqueProviders,
    totalCost,
    totalTokens,
    requestCount,
    usedTools,
    modalities,
  } = useSessionStats(selectedConv?.messages || []);

  const settingsWithDefaults = useMemo(
    () => ({
      ...SETTINGS_DEFAULTS,
      ...(selectedConv?.settings || {}),
    }),
    [selectedConv],
  );

  // Inject controls into AdminShell header
  useEffect(() => {
    setControls(
      <>
        <SelectComponent
          value={projectFilter || ""}
          options={projectOptions}
          onChange={handleProjectChange}
          placeholder="All Projects"
          disabled={!!activeSession}
        />
        {generatingCount > 0 && (
          <span className={`${styles.statPill} ${styles.statPillGenerating}`}>
            <Loader size={10} className={styles.spinning} />
            {generatingDisplay} generating
          </span>
        )}
        <ErrorMessage message={error} />
      </>,
    );
  }, [
    setControls,
    projectFilter,
    projectOptions,
    handleProjectChange,
    generatingCount,
    generatingDisplay,
    error,
    activeSession,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setControls(null);
      setTitleBadge(null);
    };
  }, [setControls, setTitleBadge]);

  // Set title badge with conversations count
  useEffect(() => {
    setTitleBadge(conversations.length);
  }, [setTitleBadge, conversations.length]);

  return (
    <div className={styles.page}>
      {/* Chat-like 3-panel layout */}
      <div className={styles.chatContainer}>
        <ThreePanelLayout
          leftPanel={
            selectedConv?.settings ? (
              <>
                <TabBarComponent
                  tabs={[
                    {
                      key: "settings",
                      icon: <Settings size={14} />,
                      tooltip: "Settings",
                    },
                    {
                      key: "params",
                      icon: <SlidersHorizontal size={14} />,
                      tooltip: "Parameters",
                    },
                    {
                      key: "info",
                      icon: <Info size={14} />,
                      tooltip: "Info",
                    },
                  ]}
                  activeTab={leftTab}
                  onChange={setLeftTab}
                />
                {leftTab === "settings" && (
                  <SettingsPanel
                    config={config}
                    settings={settingsWithDefaults}
                    readOnly
                    hideProviderModel
                    workflows={workflows}
                    sessionStats={
                      selectedConv.messages && selectedConv.messages.length > 0
                        ? (() => {
                            const displayMessages = prepareDisplayMessages(
                              selectedConv.messages,
                            );
                            return {
                              messageCount: displayMessages.length,
                              deletedCount:
                                ((selectedConv.messageCount ||
                                  selectedConv.messages.length) -
                                selectedConv.messages.length),
                              requestCount,
                              uniqueModels,
                              uniqueProviders,
                              totalTokens,
                              totalCost,
                              originalTotalCost: selectedConv.totalCost || 0,
                              usedTools,
                              modalities,
                            };
                          })()
                        : null
                    }
                  />
                )}
                {leftTab === "params" && (
                  <ParametersPanelComponent
                    settings={settingsWithDefaults}
                    config={config}
                    readOnly
                  />
                )}
                {leftTab === "info" && (
                  <ModelInfoPanel
                    config={config}
                    settings={settingsWithDefaults}
                    readOnly
                  />
                )}
              </>
            ) : (
              <div className={styles.emptyPanel}>
                Select a conversation to view settings
              </div>
            )
          }
          rightPanel={
            <HistoryPanel
              sessions={conversations}
              activeId={selectedId}
              onSelect={(conversation: Conversation) =>
                selectConversation(conversation.id || "")
              }
              readOnly
              showProject
              showUsername
              newIds={newIds}
              initialProviders={providerFilter ? [providerFilter] : undefined}
              initialSearch={modelFilter || ""}
              countLabel="conversations"
              hasMore={conversationsHasMore}
              loadingMore={conversationsLoading}
              onLoadMore={loadMoreConversations}
            />
          }
          rightTitle={`${conversations.length}${conversationsHasMore ? "+" : ""} Conversations`}
          headerTitle={convTitle}
          headerMeta={
            selectedConv && (
              <div className={styles.headerMeta}>
                <ProjectBadgeComponent
                  project={selectedConv.project}
                />
                <UserBadgeComponent username={selectedConv.username} />
                {selectedConv.isGenerating && (
                  <span className={styles.generatingBadge}>
                    <Loader size={12} className={styles.spinning} />
                    Generating
                  </span>
                )}
              </div>
            )
          }
          headerCenter={
            selectedConv?.settings?.provider ? (
              <ModelPickerPopoverComponent
                config={config}
                settings={settingsWithDefaults}
                onSelectModel={() => {}}
                disabled
                favorites={favoriteKeys}
                onToggleFavorite={handleToggleFavorite}
              />
            ) : null
          }
        >
          <div className={styles.viewerBody} ref={viewerBodyRef}>
            {!selectedConv && !loadingDetail ? (
              <div className={styles.emptyViewer}>
                <MessageSquare
                  size={40}
                  style={{ opacity: 0.3, marginBottom: 12 }}
                />
                <div>Select a conversation to view</div>
              </div>
            ) : loadingDetail ? (
              <div className={styles.emptyViewer}>Loading conversation...</div>
            ) : (
              <MessageList
                messages={prepareDisplayMessages(selectedConv?.messages || [])}
                readOnly
                systemPrompt={selectedConv?.systemPrompt}
              />
            )}
          </div>
        </ThreePanelLayout>
      </div>
    </div>
  );
}
