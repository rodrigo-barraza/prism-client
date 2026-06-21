import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  GitBranch,
  FolderOpen,
  Wrench,
} from "lucide-react";
import { TableComponent } from "@rodrigo-barraza/components-library";
import { getRequestsColumns } from "../app/admin/requestsColumns";
import IrisService from "../services/IrisService";
import ToolsApiService from "../services/ToolsApiService";
import type { IrisRequestEntry } from "../services/IrisService";
import type { TransformedRequestItem } from "../types/types";
import { getErrorMessage } from "../utils/errorMessage";
import {
  extractMediaAssets,
  getMediaTypeFromRef,
  buildRequestDetailSections,
  reconstructChatMessages,
} from "../utils/requestDetailHelpers";
import RequestDetailsComponent from "./RequestDetailsComponent";
import HistoryItemComponent from "./HistoryItemComponent";
import JsonViewerComponent from "./JsonViewerComponent";
import ChatPreviewComponent from "./ChatPreviewComponent";
import MediaCardComponent from "./MediaCardComponent";
import styles from "./RequestsTableComponent.module.css";

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
  toolCalls?: Array<{
    _id: string;
    toolName?: string;
    elapsedMs?: number;
    timestamp?: string;
    success?: boolean;
  }>;
}

/**
 * RequestsTableComponent — reusable table for displaying request logs.
 *
 * Supports three usage modes:
 *   1. **External data** — pass `requests` directly (admin global view, paginated).
 *   2. **Conversation-scoped** — pass `conversationId` to auto-fetch conversation requests.
 *   3. **User-scoped** — pass `requests` filtered by the caller (user dashboard).
 *
 * Clicking a row opens a built-in DrawerComponent showing the full request
 * detail (associations, media, chat preview, payloads). This behaviour
 * matches the /admin/requests detail drawer and works everywhere the
 * component is mounted (ThreePanelLayout sidebars, dashboard, traces).
 */
export default function RequestsTableComponent({
  requests: externalRequests,
  conversationId,
  refreshKey = 0,
  emptyText = "No requests yet",
  compact = false,
  mini = false,
  title,
  maxHeight = 420,
  sortKey: externalSortKey,
  sortDir: externalSortDir,
  onSort: externalOnSort,
  onRowClick: externalOnRowClick,
  onRowMouseEnter,
  onRowMouseLeave,
  getRowClassName,
  storageKey = "requests",
}: {
  requests?: TransformedRequestItem[];
  conversationId?: string | null;
  refreshKey?: number;
  emptyText?: string;
  compact?: boolean;
  mini?: boolean;
  title?: React.ReactNode;
  maxHeight?: number | string | null;
  sortKey?: string;
  sortDir?: string;
  onSort?: (key: string, dir: string) => void;
  onRowClick?: (row: TransformedRequestItem) => void;
  onRowMouseEnter?: (row: TransformedRequestItem, index: number) => void;
  onRowMouseLeave?: () => void;
  getRowClassName?: (row: TransformedRequestItem) => string;
  storageKey?: string;
}) {
  const router = useRouter();
  const isSelfFetching = !!conversationId && !externalRequests;

  const [fetchedRequests, setFetchedRequests] = useState<IrisRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [internalSortKey, setInternalSortKey] = useState("timestamp");
  const [internalSortDir, setInternalSortDir] = useState("desc");

  // -- Built-in drawer state --
  const [selectedRequest, setSelectedRequest] = useState<TransformedRequestItem | null>(null);
  const [associations, setAssociations] = useState<RequestAssociations | null>(null);
  const [isLoadingAssociations, setIsLoadingAssociations] = useState(false);

  const fetchConversationRequests = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const result = await IrisService.getConversationRequests(conversationId);
      setFetchedRequests(result?.requests || []);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      if (!errorMessage.includes("404")) {
        setFetchError(errorMessage);
      }
      setFetchedRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (isSelfFetching) {
      fetchConversationRequests();
    }
  }, [isSelfFetching, fetchConversationRequests, refreshKey]);

  // -- Fetch associations + tool calls when a request is selected --
  useEffect(() => {
    if (!selectedRequest?.requestId) {
      setAssociations(null);
      return;
    }
    let isCancelled = false;
    setIsLoadingAssociations(true);
    Promise.all([
      IrisService.getRequestAssociations(selectedRequest.requestId),
      ToolsApiService.getToolCalls({ callerRequestId: selectedRequest.requestId }).catch(() => ({ toolCalls: [] })),
    ])
      .then(([associationsData, toolCallsData]) => {
        if (!isCancelled) {
          setAssociations({
            ...associationsData,
            toolCalls: toolCallsData.toolCalls || [],
          } as unknown as RequestAssociations);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setAssociations({ conversations: [], workflows: [], sessions: [], toolCalls: [] });
        }
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingAssociations(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [selectedRequest?.requestId]);

  const requests = externalRequests ?? fetchedRequests;
  const sortKey = externalSortKey ?? internalSortKey;
  const sortDir = externalSortDir ?? internalSortDir;

  const handleSort = useCallback(
    (key: string, direction: string) => {
      if (externalOnSort) {
        externalOnSort(key, direction);
      } else {
        setInternalSortKey(key);
        setInternalSortDir(direction);
      }
    },
    [externalOnSort],
  );

  // -- Row click: open drawer (+ allow external handler) --
  const handleRowClick = useCallback(
    async (row: TransformedRequestItem) => {
      externalOnRowClick?.(row);
      setSelectedRequest(row as TransformedRequestItem);
      const requestId = row.requestId || row._id;
      if (!requestId) return;
      try {
        const fullRequest = await IrisService.getRequest(requestId);
        setSelectedRequest(fullRequest as unknown as TransformedRequestItem);
      } catch {
        // Keep partial data visible in the drawer
      }
    },
    [externalOnRowClick],
  );

  const totalCost = useMemo(
    () =>
      requests.reduce(
        (sum: number, request: TransformedRequestItem) => sum + (request.estimatedCost || 0),
        0,
      ) || 1,
    [requests],
  );

  const totalDuration = useMemo(
    () =>
      requests.reduce((sum: number, request: TransformedRequestItem) => sum + (request.totalTime || 0), 0) ||
      1,
    [requests],
  );

  const allColumns = useMemo(
    () => getRequestsColumns({ totalCost, totalDuration, mini }),
    [totalCost, totalDuration, mini],
  );

  const COMPACT_KEYS = [
    "timestamp",
    "project",
    "provider",
    "model",
    "estimatedCost",
    "totalTime",
    "success",
  ];
  const columns = compact
    ? allColumns.filter((column) => COMPACT_KEYS.includes(column.key))
    : allColumns;

  const resolvedEmptyText = isLoading
    ? "Loading…"
    : fetchError
      ? `Error: ${fetchError}`
      : emptyText;

  return (
    <>
      <div data-drawer-ignore-click-outside>
        <TableComponent
          className="requests-table-component"
          title={title}
          maxHeight={maxHeight ?? undefined}
          columns={columns}
          data={requests}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={handleRowClick}
          onRowMouseEnter={onRowMouseEnter}
          onRowMouseLeave={onRowMouseLeave}
          getRowClassName={getRowClassName}
          getRowKey={(request: TransformedRequestItem, index: number) => `${request.requestId || request._id || "request"}-${index}`}
          emptyText={resolvedEmptyText}
          mini={mini}
          storageKey={storageKey}
        />
      </div>

      {/* Built-in request detail drawer */}
      <RequestDetailsComponent
        open={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title="Request Detail"
        sections={buildRequestDetailSections(selectedRequest)}
        contentKey={selectedRequest?.requestId || selectedRequest?._id}
      >
        {selectedRequest && (
          <>
            <div className={styles['detail-section']}>
              <div className={styles['detail-section-title']}>Associations</div>
              {isLoadingAssociations ? (
                <span style={{ color: "var(--text-muted)" }}>Loading…</span>
              ) : (
                <div className={styles['association-grid']}>
                  <div className={styles['association-group']}>
                    <span className={styles['association-group-label']}>
                      <MessageSquare size={12} /> Conversations
                    </span>
                    {associations?.conversations &&
                    associations.conversations.length > 0 ? (
                      <div className={styles['association-list']}>
                        {associations.conversations.map((conversation) => (
                          <HistoryItemComponent
                            key={conversation.id}
                            item={{
                              id: conversation.id,
                              title: conversation.title || "Untitled",
                              tags: conversation.project
                                ? [
                                    {
                                      label: conversation.project,
                                      style: {
                                        background:
                                          "var(--accent-primary-subtle)",
                                        color: "var(--accent-primary)",
                                      },
                                    },
                                  ]
                                : [],
                              updatedAt: conversation.updatedAt || conversation.createdAt,
                              createdAt: conversation.createdAt,
                              totalCost: conversation.totalCost || 0,
                              modalities: conversation.modalities || {},
                              modelName: conversation.model || null,
                              username: conversation.username,
                              agent: conversation.agent,
                            }}
                            icon={MessageSquare}
                            admin
                            onClick={() => router.push(`/admin/chat/${conversation.id}`)}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className={styles['association-empty']}>—</span>
                    )}
                  </div>
                  <div className={styles['association-group']}>
                    <span className={styles['association-group-label']}>
                      <GitBranch size={12} /> Workflows
                    </span>
                    {associations?.workflows &&
                    associations.workflows.length > 0 ? (
                      <div className={styles['association-list']}>
                        {associations.workflows.map((workflow) => (
                          <HistoryItemComponent
                            key={workflow.id}
                            item={{
                              id: workflow.id,
                              title: workflow.name || "Untitled",
                              tags: [
                                {
                                  label: `${workflow.nodeCount} nodes · ${workflow.edgeCount} edges`,
                                  style: {
                                    background: "var(--background-elevated)",
                                    color: "var(--text-muted)",
                                  },
                                },
                              ],
                              updatedAt: workflow.updatedAt || workflow.createdAt,
                            }}
                            icon={GitBranch}
                            onClick={() =>
                              router.push(`/admin/workflows/${workflow.id}`)
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <span className={styles['association-empty']}>—</span>
                    )}
                  </div>
                  <div className={styles['association-group']}>
                    <span className={styles['association-group-label']}>
                      <FolderOpen size={12} /> Traces
                    </span>
                    {associations?.sessions &&
                    associations.sessions.length > 0 ? (
                      <div className={styles['association-list']}>
                        {associations.sessions.map((session) => (
                          <HistoryItemComponent
                            key={session.id}
                            item={{
                              id: session.id,
                              title: session.id.slice(0, 8),
                              tags: [
                                {
                                  label: `${session.conversationCount} conversation${session.conversationCount !== 1 ? "s" : ""}`,
                                  style: {
                                    background: "var(--background-elevated)",
                                    color: "var(--text-muted)",
                                  },
                                },
                              ],
                              updatedAt: session.updatedAt || session.createdAt,
                            }}
                            icon={FolderOpen}
                            onClick={() => router.push("/admin/traces")}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className={styles['association-empty']}>—</span>
                    )}
                  </div>
                  <div className={styles['association-group']}>
                    <span className={styles['association-group-label']}>
                      <Wrench size={12} /> Tool Requests
                    </span>
                    {associations?.toolCalls &&
                    associations.toolCalls.length > 0 ? (
                      <div className={styles['association-list']}>
                        {associations.toolCalls.map((toolCall) => (
                          <HistoryItemComponent
                            key={toolCall._id}
                            item={{
                              id: toolCall._id,
                              title: toolCall.toolName || "Untitled Tool",
                              tags: [
                                {
                                  label: toolCall.elapsedMs != null ? `${toolCall.elapsedMs.toFixed(0)} ms` : "—",
                                  style: {
                                    background: "var(--background-elevated)",
                                    color: "var(--text-muted)",
                                  },
                                },
                                {
                                  label: toolCall.success ? "Success" : "Error",
                                  style: {
                                    background: toolCall.success
                                      ? "var(--accent-primary-subtle)"
                                      : "var(--danger-subtle)",
                                    color: toolCall.success
                                      ? "var(--accent-primary)"
                                      : "var(--danger)",
                                  },
                                },
                              ],
                              updatedAt: toolCall.timestamp,
                            }}
                            icon={Wrench}
                            onClick={() => router.push(`/admin/tool-requests?id=${toolCall._id}`)}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className={styles['association-empty']}>—</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {(() => {
              const mediaAssets = extractMediaAssets(selectedRequest);
              if (!mediaAssets.length) return null;
              return (
                <div className={styles['detail-section']}>
                  <div className={styles['detail-section-title']}>Media Assets</div>
                  <div className={styles['media-grid']}>
                    {mediaAssets.map((asset, index: number) => (
                      <MediaCardComponent
                        key={index}
                        media={{
                          convId: selectedRequest?.conversationId || "",
                          url: String(asset.url || ""),
                          mediaType: getMediaTypeFromRef(
                            String(asset.url || ""),
                          ),
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
                <div className={styles['detail-section']}>
                  <div className={styles['detail-section-title']}>Chat Preview</div>
                  <ChatPreviewComponent
                    messages={chat.messages}
                    systemPrompt={chat.systemPrompt}
                    readOnly
                  />
                </div>
              );
            })()}
            {selectedRequest.requestPayload && (
              <div className={styles['detail-section']}>
                <JsonViewerComponent
                  data={selectedRequest.requestPayload}
                  label="Request Payload"
                  maxHeight="400px"
                />
              </div>
            )}
            {selectedRequest.responsePayload && (
              <div className={styles['detail-section']}>
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
    </>
  );
}
