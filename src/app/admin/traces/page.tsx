"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { FolderOpen, MessageSquare, GitBranch } from "lucide-react";
import { LoadingIndicatorComponent } from "@rodrigo-barraza/components-library";
import { useRouter } from "next/navigation";
import IrisService from "../../../services/IrisService";
import { buildDateRangeParams } from "../../../utils/utilities";
import {
  extractMediaAssets,
  getMediaTypeFromRef,
  buildRequestDetailSections,
  reconstructChatMessages,
} from "../../../utils/requestDetailHelpers";
import { PaginationComponent } from "@rodrigo-barraza/components-library";
import TracesTableComponent from "../../../components/TracesTableComponent";
import { SelectComponent } from "@rodrigo-barraza/components-library";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import useProjectFilter from "../../../hooks/useProjectFilter";
import RequestDetailsComponent from "../../../components/RequestDetailsComponent";
import JsonViewerComponent from "../../../components/JsonViewerComponent";
import HistoryItemComponent from "../../../components/HistoryItemComponent";
import ChatPreviewComponent from "../../../components/ChatPreviewComponent";
import MediaCardComponent from "../../../components/MediaCardComponent";

import styles from "./page.module.css";

const PAGE_SIZE = 30;
const POLL_INTERVAL = 5000; // 5s

export default function TracesPage() {
  const router = useRouter();
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const { setControls, setTitleBadge, dateRange } = useAdminHeader();
  const [traces, setTraces] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef<boolean>(false);
  const fetchGenRef = useRef<number>(0);

  // Request detail drawer state
  const [selectedRequest, setSelectedRequest] = useState<Record<string, any> | null>(null);
  const [associations, setAssociations] = useState<Record<string, any> | null>(null);
  const [loadingAssociations, setLoadingAssociations] = useState(false);

  const dateParams = useMemo(
    () => buildDateRangeParams(dateRange),
    [dateRange],
  );

  const loadTraces = useCallback(async () => {
    const gen = fetchGenRef.current;
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        sort,
        order,
        ...dateParams,
      };
      if (projectFilter) (params as Record<string, any>).project = projectFilter;

      const data = await IrisService.getTraces(params);
      // Discard stale responses from previous filter/page generations
      if (gen !== fetchGenRef.current) return;
      setTraces(data.data || []);
      setTotal(data.total || 0);
    } catch (error: unknown) {
      if (gen !== fetchGenRef.current) return;
      console.error("Failed to load traces:", error);
    } finally {
      if (gen !== fetchGenRef.current) return;
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setLoading(false);
      }
    }
  }, [page, sort, order, dateParams, projectFilter]);

  useEffect(() => {
    // Bump generation to invalidate any in-flight requests from previous effect
    fetchGenRef.current += 1;
    initialLoadDone.current = false;
    setLoading(true);

    loadTraces();

    // Subscribe to change stream SSE for real-time updates.
    // Traces are derived from requests, so we refresh on request changes.
    let pollInterval: NodeJS.Timeout | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadTraces, 800);
    };
    const es = IrisService.subscribeCollectionChanges({
      onStatus: (data: Record<string, any>) => {
        if (!data.changeStreams) {
          // No Change Streams — fall back to polling
          if (!pollInterval) {
            pollInterval = setInterval(loadTraces, POLL_INTERVAL);
          }
        }
      },
      onChange: (event: Record<string, any>) => {
        if (event.collection === "requests") {
          // Request changes update trace data — debounce to batch streaming updates
          debouncedLoad();
        }
      },
    });

    return () => {
      es.close();
      if (pollInterval) clearInterval(pollInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [loadTraces]);

  // Fetch associations when a request is selected
  useEffect(() => {
    if (!(selectedRequest as Record<string, any>)?.requestId) {
      setAssociations(null);
      return;
    }
    let cancelled = false;
    setLoadingAssociations(true);
    IrisService.getRequestAssociations((selectedRequest as Record<string, any>).requestId)
      .then((data: Record<string, any>) => {
        if (!cancelled) setAssociations(data);
      })
      .catch(() => {
        if (!cancelled)
          setAssociations({ conversations: [], workflows: [], traces: [] });
      })
      .finally(() => {
        if (!cancelled) setLoadingAssociations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [(selectedRequest as Record<string, any>)?.requestId]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Handle request row click — fetch full details and open drawer
  const handleRequestRowClick = useCallback(async (req: Record<string, any>) => {
    setSelectedRequest(req);
    try {
      const full = await IrisService.getRequest(req.requestId);
      setSelectedRequest(full);
    } catch {
      /* keep partial data */
    }
  }, []);

  // Inject controls into AdminShell header
  useEffect(() => {
    setControls(
      <>
        <SelectComponent
          value={projectFilter || ""}
          options={projectOptions}
          onChange={handleProjectChange}
          placeholder="All Projects"
        />
      </>,
    );
  }, [setControls, total, projectFilter, projectOptions, handleProjectChange]);

  useEffect(() => {
    return () => {
      setControls(null);
      setTitleBadge(null);
    };
  }, [setControls, setTitleBadge]);

  // Set title badge with total count
  useEffect(() => {
    setTitleBadge(total);
  }, [setTitleBadge, total]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <LoadingIndicatorComponent
            size="small"
            color="inherit"
            label="Loading traces…"
          />
        </div>
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <FolderOpen size={36} style={{ opacity: 0.3 }} />
          <div>No traces yet</div>
          <div style={{ fontSize: 12 }}>
            Traces are created when AI calls are grouped together
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TracesTableComponent
        traces={traces}
        emptyText="No traces"
        sortKey={sort}
        sortDir={order}
        onSort={(key: string, dir: string) => {
          setSort(key);
          setOrder(dir);
          setPage(1);
        }}
        onRequestRowClick={handleRequestRowClick}
      />

      {/* Pagination */}
      <PaginationComponent
        page={page}
        totalPages={totalPages}
        totalItems={total}
        onPageChange={setPage}
        limit={PAGE_SIZE}
      />

      {/* Request detail drawer */}
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
                    {(associations as Record<string, any>).conversations?.length > 0 ? (
                      <div className={styles.associationList}>
                        {associations?.conversations?.map((c: Record<string, any>) => (
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
                            }}
                            icon={MessageSquare}
                            admin
                            onClick={() =>
                              router.push(`/admin/conversations/${c.id}`)
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
                    {(associations as Record<string, any>).workflows?.length > 0 ? (
                      <div className={styles.associationList}>
                        {associations?.workflows?.map((w: Record<string, any>) => (
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
                      <FolderOpen size={12} /> Traces
                    </span>
                    {(associations as Record<string, any>).traces?.length > 0 ? (
                      <div className={styles.associationList}>
                        {associations?.traces?.map((s: Record<string, any>) => (
                          <HistoryItemComponent
                            key={s.id}
                            item={{
                              id: s.id,
                              title: s.id.slice(0, 8),
                              tags: [
                                {
                                  label: `${s.requestCount} request${s.requestCount !== 1 ? "s" : ""}`,
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
                    {mediaAssets.map((asset: Record<string, any>, index: number) => (
                      <MediaCardComponent
                        key={index}
                        media={{
                          url: asset.url,
                          mediaType: getMediaTypeFromRef(asset.url),
                          origin: asset.origin,
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
            {(selectedRequest as Record<string, any>).requestPayload && (
              <div className={styles.detailSection}>
                <JsonViewerComponent
                  data={(selectedRequest as Record<string, any>).requestPayload}
                  label="Request Payload"
                  maxHeight="400px"
                />
              </div>
            )}
            {(selectedRequest as Record<string, any>).responsePayload && (
              <div className={styles.detailSection}>
                <JsonViewerComponent
                  data={(selectedRequest as Record<string, any>).responsePayload}
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
