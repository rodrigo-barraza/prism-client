"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Download, MessageSquare, GitBranch, FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import HistoryItemComponent from "../../../components/HistoryItemComponent";
import JsonViewerComponent from "../../../components/JsonViewerComponent";
import IrisService from "../../../services/IrisService";
import {
  formatNumber,
  formatTokensPerSec,
  buildDateRangeParams,
} from "../../../utils/utilities";
import { getErrorMessage } from "../../../utils/errorMessage";
import {
  extractMediaAssets,
  getMediaTypeFromRef,
  buildRequestDetailSections,
  reconstructChatMessages,
} from "../../../utils/requestDetailHelpers";

import RequestsTableComponent from "../../../components/RequestsTableComponent";
import {
  ButtonComponent,
  PaginationComponent,
  SelectComponent,
} from "@rodrigo-barraza/components-library";

import { ErrorMessage } from "../../../components/StateMessageComponent";
import {
  FilterBarComponent,
  FilterGroupComponent,
  FilterInputComponent,
  FilterSelectComponent,
  FilterClearButton,
} from "../../../components/FilterBarComponent";
import RequestDetailsComponent from "../../../components/RequestDetailsComponent";
import ChatPreviewComponent from "../../../components/ChatPreviewComponent";
import MediaCardComponent from "../../../components/MediaCardComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import useProjectFilter from "../../../hooks/useProjectFilter";
import styles from "./page.module.css";

const POLL_INTERVAL = 5000;
import { TransformedRequestItem } from "../../../types/types";

type RequestItem = TransformedRequestItem;

interface RequestFilters {
  provider: string;
  model: string;
  endpoint: string;
  operation: string;
  success: string;
  [key: string]: string;
}

interface RequestAssociations {
  conversations?: Array<{
    id: string;
    title?: string;
    project?: string;
    updatedAt?: string;
    createdAt?: string;
    totalCost?: number;
    modalities?: Record<string, number>;
    model?: string;
    username?: string;
    agent?: string;
  }>;
  workflows?: Array<{
    id: string;
    name?: string;
    nodeCount?: number;
    edgeCount?: number;
    updatedAt?: string;
    createdAt?: string;
  }>;
  sessions?: Array<{
    id: string;
    conversationCount?: number;
    updatedAt?: string;
    createdAt?: string;
  }>;
}

export default function RequestsPage() {
  const router = useRouter();
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const { setControls, setTitleBadge, dateRange } = useAdminHeader();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState("timestamp");
  const [order, setOrder] = useState("desc");
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [associations, setAssociations] = useState<RequestAssociations | null>(null);
  const [loadingAssociations, setLoadingAssociations] = useState(false);
  const [filters, setFilters] = useState<RequestFilters>({
    provider: "",
    model: "",
    endpoint: "",
    operation: "",
    success: "",
  });

  const [hoveredConversationId, setHoveredConversationId] = useState<string | null>(null);
  const initialLoadDone = useRef<boolean>(false);
  const fetchGenRef = useRef<number>(0);

  // "Just now" row highlighting — track fresh rows and fade-outs
  const prevJustNowIds = useRef<Set<string>>(new Set());
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  const fadingTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [justNowTick, setJustNowTick] = useState(0);

  // Compute which rows are "just now" (< 5s old) on every render/tick
  const justNowIds = useMemo<Set<string>>(() => {
    const now = Date.now();
    const ids = new Set<string>();
    for (const r of requests) {
      if (!r.timestamp) continue;
      const age = now - new Date(r.timestamp).getTime();
      // Treat timestamps up to 10s in the future (clock skew) or < 5s old
      if (age < 5000 && age > -10000)
        ids.add(r.requestId || r._id);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, justNowTick]);

  // Tick every 1s while there are "just now" rows so they age out naturally
  useEffect(() => {
    if (justNowIds.size === 0) return;
    const timer = setInterval(() => setJustNowTick((t: number) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [justNowIds.size]);

  // Detect transitions: was "just now" → no longer → trigger fade
  useEffect(() => {
    const previousJustNowIds = prevJustNowIds.current;
    for (const id of previousJustNowIds) {
      if (!justNowIds.has(id) && !fadingTimers.current.has(id)) {
        setFadingIds((s: Set<string>) => {
          const n = new Set(s);
          n.add(id);
          return n;
        });
        const timer = setTimeout(() => {
          setFadingIds((s: Set<string>) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
          fadingTimers.current.delete(id);
        }, 1000);
        fadingTimers.current.set(id, timer);
      }
    }
    prevJustNowIds.current = justNowIds;
  }, [justNowIds]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = fadingTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  const LIMIT = 50;

  const loadRequests = useCallback(async () => {
    const fetchGeneration = fetchGenRef.current;
    try {
      const params: Record<string, string | number | boolean> = { page, limit: LIMIT, sort, order };
      if (projectFilter) params.project = projectFilter;
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      Object.assign(params, buildDateRangeParams(dateRange));

      const data = await IrisService.getRequests(params);
      if (fetchGeneration !== fetchGenRef.current) return;
      setRequests((data.data || []) as RequestItem[]);
      setTotal(data.total || 0);
    } catch (error: unknown) {
      if (fetchGeneration !== fetchGenRef.current) return;
      setError(getErrorMessage(error));
    } finally {
      if (fetchGeneration !== fetchGenRef.current) return;
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setLoading(false);
      }
    }
  }, [page, sort, order, filters, dateRange, projectFilter]);

  useEffect(() => {
    // Bump generation to invalidate any in-flight requests from previous effect
    fetchGenRef.current += 1;
    initialLoadDone.current = false;
    setLoading(true);
    setError(null);

    loadRequests();

    // Subscribe to change stream SSE for real-time updates
    let pollInterval: NodeJS.Timeout | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadRequests, 800);
    };
    const es = IrisService.subscribeCollectionChanges({
      onStatus: (data: { changeStreams?: boolean }) => {
        if (!data.changeStreams) {
          // No Change Streams — fall back to polling
          if (!pollInterval) {
            pollInterval = setInterval(loadRequests, POLL_INTERVAL);
          }
        }
      },
      onChange: (event: { collection?: string }) => {
        if (event.collection === "requests") {
          debouncedLoad();
        }
      },
    });

    return () => {
      es.close();
      if (pollInterval) clearInterval(pollInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [loadRequests]);

  // Fetch associations when a request is selected
  useEffect(() => {
    if (!selectedRequest?.requestId) {
      setAssociations(null);
      return;
    }
    let cancelled = false;
    setLoadingAssociations(true);
    IrisService.getRequestAssociations(selectedRequest.requestId)
      .then((data) => {
        if (!cancelled) setAssociations(data as unknown as RequestAssociations);
      })
      .catch(() => {
        if (!cancelled)
          setAssociations({ conversations: [], workflows: [], sessions: [] });
      })
      .finally(() => {
        if (!cancelled) setLoadingAssociations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRequest?.requestId]);

  function handleSort(key: string, dir: string) {
    setSort(key);
    setOrder(dir);
    setPage(1);
  }

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev: RequestFilters) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  function clearFilters() {
    setFilters({
      provider: "",
      model: "",
      endpoint: "",
      operation: "",
      success: "",
    });
    setPage(1);
  }

  const exportCSV = useCallback(() => {
    const headers = [
      "Timestamp",
      "Project",
      "Endpoint",
      "Operation",
      "Provider",
      "Model",
      "Tokens In",
      "Tokens Out",
      "Cost",
      "Tok/s",
      "Latency",
      "Status",
    ].join(",");
    const rows = requests.map((r: RequestItem) =>
      [
        r.timestamp || "",
        r.project || "",
        r.endpoint || "",
        r.operation || "",
        r.provider || "",
        r.model || "",
        r.inputTokens || 0,
        r.outputTokens || 0,
        r.estimatedCost || 0,
        r.tokensPerSec ? formatTokensPerSec(r.tokensPerSec) : "",
        r.totalTime || 0,
        r.success ? "OK" : "ERR",
      ].join(","),
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iris-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [requests]);

  const totalPages = Math.ceil(total / LIMIT);

  // Inject controls into AdminShell header
  useEffect(() => {
    setControls(
      <>
        <ErrorMessage message={error} />
        <SelectComponent
          value={projectFilter || ""}
          options={projectOptions}
          onChange={handleProjectChange}
          placeholder="All Projects"
        />
      </>,
    );
  }, [
    setControls,
    total,
    error,
    projectFilter,
    projectOptions,
    handleProjectChange,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setControls(null);
      setTitleBadge(null);
    };
  }, [setControls, setTitleBadge]);

  // Set title badge with total count
  useEffect(() => {
    setTitleBadge(formatNumber(total));
  }, [setTitleBadge, total]);

  return (
    <div className={styles.page}>
      {/* Filters */}
      <FilterBarComponent>
        <FilterGroupComponent label="Provider">
          <FilterSelectComponent
            value={filters.provider}
            onChange={(value: string) => handleFilterChange("provider", value)}
            options={[
              { value: "", label: "All" },
              { value: "openai", label: "OpenAI" },
              { value: "anthropic", label: "Anthropic" },
              { value: "google", label: "Google" },
              { value: "elevenlabs", label: "ElevenLabs" },
            ]}
          />
        </FilterGroupComponent>
        <FilterGroupComponent label="Model">
          <FilterInputComponent
            placeholder="Filter by model..."
            value={filters.model}
            onChange={(value: string) => handleFilterChange("model", value)}
          />
        </FilterGroupComponent>
        <FilterGroupComponent label="Endpoint">
          <FilterSelectComponent
            value={filters.endpoint}
            onChange={(value: string) => handleFilterChange("endpoint", value)}
            options={[
              { value: "", label: "All" },
              { value: "/chat", label: "/chat" },
              { value: "/agent", label: "/coding-agent" },
              { value: "/embed", label: "/embed" },
              { value: "/live", label: "/live" },
            ]}
          />
        </FilterGroupComponent>
        <FilterGroupComponent label="Operation">
          <FilterSelectComponent
            value={filters.operation}
            onChange={(value: string) => handleFilterChange("operation", value)}
            options={[
              { value: "", label: "All" },
              { value: "chat", label: "Chat" },
              { value: "chat:image", label: "Chat: Image" },
              { value: "agent", label: "Agent" },
              { value: "agent:iteration", label: "Agent: Iteration" },
              { value: "agent:image", label: "Agent: Image" },
              { value: "live", label: "Live" },
              { value: "memory:extract", label: "Memory: Extract" },
              { value: "memory:consolidate", label: "Memory: Consolidate" },
              { value: "session:summarize", label: "Session: Summarize" },
              {
                value: "coordinator:decompose",
                label: "Coordinator: Decompose",
              },
              { value: "embed:memory", label: "Embed: Memory" },
              { value: "embed:api", label: "Embed: API" },
              { value: "embed:agent-memory", label: "Embed: Agent Memory" },
              { value: "embed:skill-relevance", label: "Embed: Skill" },
            ]}
          />
        </FilterGroupComponent>
        <FilterGroupComponent label="Status">
          <FilterSelectComponent
            value={filters.success}
            onChange={(value: string) => handleFilterChange("success", value)}
            options={[
              { value: "", label: "All" },
              { value: "true", label: "Success" },
              { value: "false", label: "Error" },
            ]}
          />
        </FilterGroupComponent>

        <FilterClearButton onClick={clearFilters} />
        <ButtonComponent
          variant="secondary"
          icon={Download}
          onClick={exportCSV}
        >
          Export CSV
        </ButtonComponent>
      </FilterBarComponent>

      {/* Table */}
      <div className={styles.tableWrapper}>
        <RequestsTableComponent
          requests={requests}
          sortKey={sort}
          sortDir={order}
          onSort={handleSort}
          maxHeight={null}
          onRowMouseEnter={(row: RequestItem) => {
            if (row.conversationId)
              setHoveredConversationId(row.conversationId);
          }}
          onRowMouseLeave={() => setHoveredConversationId(null)}
          getRowClassName={(row: RequestItem) => {
            const id = row.requestId || row._id;
            const classes = [];
            if (
              hoveredConversationId &&
              row.conversationId === hoveredConversationId
            ) {
              classes.push(styles.sharedConversationRow);
            }
            if (justNowIds.has(id)) classes.push(styles.newRow);
            else if (fadingIds.has(id)) classes.push(styles.newRowFadeOut);
            return classes.join(" ");
          }}
          onRowClick={async (req: RequestItem) => {
            setSelectedRequest(req as RequestItem);
            if (!req.requestId) return;
            try {
              const full = await IrisService.getRequest(req.requestId);
              setSelectedRequest(full as RequestItem);
            } catch {
              /* keep partial data */
            }
          }}
          emptyText={loading ? "Loading..." : "No requests found"}
        />

        {/* Pagination */}
        <PaginationComponent
          page={page}
          totalPages={totalPages}
          totalItems={total}
          onPageChange={setPage}
          limit={LIMIT}
        />
      </div>

      <RequestDetailsComponent
        open={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title="Request Detail"
        sections={buildRequestDetailSections(selectedRequest)}
      >
        {selectedRequest && (
          <>
            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>Associations</div>
              {loadingAssociations ? (
                <span style={{ color: "var(--text-muted)" }}>Loading…</span>
              ) : (
                <div className={styles.associationGrid}>
                  <div className={styles.associationGroup}>
                    <span className={styles.associationGroupLabel}>
                      <MessageSquare size={12} /> Conversations
                    </span>
                    {associations?.conversations && associations.conversations.length > 0 ? (
                      <div className={styles.associationList}>
                        {associations?.conversations?.map((c) => (
                          <HistoryItemComponent
                            key={c.id}
                            item={{
                              id: c.id,
                              title: c.title || "Untitled",
                              tags: c.project
                                ? [
                                    {
                                      label: c.project,
                                      style: {
                                        background: "var(--accent-subtle)",
                                        color: "var(--accent-color)",
                                      },
                                    },
                                  ]
                                : [],
                              updatedAt: c.updatedAt || c.createdAt,
                              createdAt: c.createdAt,
                              totalCost: c.totalCost || 0,
                              modalities: c.modalities || {},
                              modelName: c.model || null,
                              username: c.username,
                              agent: c.agent,
                            }}
                            icon={MessageSquare}
                            admin
                            onClick={() =>
                              router.push(`/admin/chat/${c.id}`)
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <span className={styles.associationEmpty}>—</span>
                    )}
                  </div>
                  <div className={styles.associationGroup}>
                    <span className={styles.associationGroupLabel}>
                      <GitBranch size={12} /> Workflows
                    </span>
                    {associations?.workflows && associations.workflows.length > 0 ? (
                      <div className={styles.associationList}>
                        {associations?.workflows?.map((w) => (
                          <HistoryItemComponent
                            key={w.id}
                            item={{
                              id: w.id,
                              title: w.name || "Untitled",
                              tags: [
                                {
                                  label: `${w.nodeCount} nodes · ${w.edgeCount} edges`,
                                  style: {
                                    background: "var(--bg-tertiary)",
                                    color: "var(--text-muted)",
                                  },
                                },
                              ],
                              updatedAt: w.updatedAt || w.createdAt,
                            }}
                            icon={GitBranch}
                            onClick={() =>
                              router.push(`/admin/workflows/${w.id}`)
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <span className={styles.associationEmpty}>—</span>
                    )}
                  </div>
                  <div className={styles.associationGroup}>
                    <span className={styles.associationGroupLabel}>
                      <FolderOpen size={12} /> Sessions
                    </span>
                    {associations?.sessions && associations.sessions.length > 0 ? (
                      <div className={styles.associationList}>
                        {associations?.sessions?.map((s) => (
                          <HistoryItemComponent
                            key={s.id}
                            item={{
                              id: s.id,
                              title: s.id.slice(0, 8),
                              tags: [
                                {
                                  label: `${s.conversationCount} conversation${s.conversationCount !== 1 ? "s" : ""}`,
                                  style: {
                                    background: "var(--bg-tertiary)",
                                    color: "var(--text-muted)",
                                  },
                                },
                              ],
                              updatedAt: s.updatedAt || s.createdAt,
                            }}
                            icon={FolderOpen}
                            onClick={() => router.push("/admin/traces")}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className={styles.associationEmpty}>—</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {(() => {
              const mediaAssets = extractMediaAssets(selectedRequest);
              if (!mediaAssets.length) return null;
              return (
                <div className={styles.detailSection}>
                  <div className={styles.detailSectionTitle}>Media Assets</div>
                  <div className={styles.mediaGrid}>
                    {mediaAssets.map((asset, index: number) => (
                      <MediaCardComponent
                        key={index}
                        media={{
                          convId: selectedRequest?.conversationId || "",
                          url: String(asset.url || ""),
                          mediaType: getMediaTypeFromRef(String(asset.url || "")),
                          origin: String(asset.origin || ""),
                        }}
                        compact
                        showInfo={false}
                        showOrigin
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
            {(() => {
              const chat = reconstructChatMessages(selectedRequest);
              if (!chat) return null;
              return (
                <div className={styles.detailSection}>
                  <div className={styles.detailSectionTitle}>Chat Preview</div>
                  <ChatPreviewComponent
                    messages={chat.messages}
                    systemPrompt={chat.systemPrompt}
                    readOnly
                  />
                </div>
              );
            })()}
            {selectedRequest.requestPayload && (
              <div className={styles.detailSection}>
                <JsonViewerComponent
                  data={selectedRequest.requestPayload}
                  label="Request Payload"
                  maxHeight="400px"
                />
              </div>
            )}
            {selectedRequest.responsePayload && (
              <div className={styles.detailSection}>
                <JsonViewerComponent
                  data={selectedRequest.responsePayload}
                  label="Response Payload"
                  maxHeight="400px"
                />
              </div>
            )}
          </>
        )}
      </RequestDetailsComponent>
    </div>
  );
}
