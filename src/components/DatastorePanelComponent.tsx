"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import BadgeComponent from "./BadgeComponent";
import {
  Database,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  KeyRound,
} from "lucide-react";
import ToolsApiService from "../services/ToolsApiService";
import type {
  DatastoreNamespaceInfo,
  DatastoreRecordItem,
} from "../services/ToolsApiService";
import { getErrorMessage } from "../utils/errorMessage";
import { SearchInputComponent } from "@rodrigo-barraza/components-library";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./DatastorePanelComponent.module.css";

const RECORDS_PAGE_SIZE = 25;

interface DatastorePanelProps {
  project?: string;
  refreshKey?: number;
  onCountChange?: (count: number) => void;
  onActionsChange?: (actions: ReactNode) => void;
}

/**
 * DatastorePanel — browse the structured datastore (agent_datastore).
 *
 * Displayed in the agent sidebar alongside Memories and Tasks. Namespaces
 * are written by agents via write_datastore and shared across all agents
 * in the project; this panel lets the user inspect records and clean up.
 */
export default function DatastorePanel({
  project,
  refreshKey,
  onCountChange,
  onActionsChange,
}: DatastorePanelProps) {
  const [namespaces, setNamespaces] = useState<DatastoreNamespaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const hasData = useRef<boolean>(false);

  // Expanded namespace record browsing
  const [expandedNamespace, setExpandedNamespace] = useState<string | null>(null);
  const [records, setRecords] = useState<DatastoreRecordItem[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [confirmingDeleteNamespace, setConfirmingDeleteNamespace] = useState<
    string | null
  >(null);

  // -- Load namespaces -----------------------------------------

  const loadNamespaces = useCallback(async () => {
    if (!project) {
      setLoading(false);
      return;
    }
    if (!hasData.current) setLoading(true);
    setError(null);
    try {
      const result = await ToolsApiService.queryDatastore(project);
      const namespaceList = result.namespaces || [];
      setNamespaces(namespaceList);
      onCountChange?.(
        namespaceList.reduce((sum, namespaceInfo) => sum + namespaceInfo.count, 0),
      );
      hasData.current = true;
    } catch (error: unknown) {
      console.error("Failed to load datastore namespaces:", error);
      if (!hasData.current) setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [project, onCountChange]);

  useEffect(() => {
    hasData.current = false;
    setNamespaces([]);
    setExpandedNamespace(null);
    setRecords([]);
  }, [project]);

  useEffect(() => {
    loadNamespaces();
  }, [loadNamespaces, refreshKey]);

  // -- Load records for expanded namespace ----------------------

  const loadRecords = useCallback(
    async (namespace: string, skip = 0) => {
      if (!project) return;
      setRecordsLoading(true);
      try {
        const result = await ToolsApiService.queryDatastore(project, {
          namespace,
          limit: RECORDS_PAGE_SIZE,
          skip,
        });
        setRecords((previousRecords) =>
          skip > 0
            ? [...previousRecords, ...(result.records || [])]
            : result.records || [],
        );
        setRecordsTotal(result.total || 0);
      } catch (error: unknown) {
        console.error("Failed to load datastore records:", error);
      } finally {
        setRecordsLoading(false);
      }
    },
    [project],
  );

  const handleToggleNamespace = useCallback(
    (namespace: string) => {
      if (expandedNamespace === namespace) {
        setExpandedNamespace(null);
        setRecords([]);
        return;
      }
      setExpandedNamespace(namespace);
      setExpandedRecordId(null);
      setRecords([]);
      loadRecords(namespace);
    },
    [expandedNamespace, loadRecords],
  );

  // -- Delete ---------------------------------------------------

  const handleDeleteRecord = useCallback(
    async (namespace: string, recordId: string) => {
      if (!project) return;
      try {
        await ToolsApiService.deleteDatastoreRecords(project, namespace, {
          ids: [recordId],
        });
        setRecords((previousRecords) =>
          previousRecords.filter((record) => record.id !== recordId),
        );
        setRecordsTotal((previousTotal) => Math.max(0, previousTotal - 1));
        loadNamespaces();
      } catch (error: unknown) {
        console.error("Failed to delete datastore record:", error);
      }
    },
    [project, loadNamespaces],
  );

  const handleDeleteNamespace = useCallback(
    async (namespace: string) => {
      if (!project) return;
      try {
        await ToolsApiService.deleteDatastoreRecords(project, namespace, {
          all: true,
        });
        setConfirmingDeleteNamespace(null);
        if (expandedNamespace === namespace) {
          setExpandedNamespace(null);
          setRecords([]);
        }
        loadNamespaces();
      } catch (error: unknown) {
        console.error("Failed to delete datastore namespace:", error);
      }
    },
    [project, expandedNamespace, loadNamespaces],
  );

  // -- Filtered namespaces (client-side) ------------------------

  const filteredNamespaces = useMemo(() => {
    if (!searchQuery.trim()) return namespaces;
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return namespaces.filter(
      (namespaceInfo) =>
        namespaceInfo.namespace.toLowerCase().includes(normalizedSearch) ||
        namespaceInfo.fields.some((field) =>
          field.toLowerCase().includes(normalizedSearch),
        ),
    );
  }, [namespaces, searchQuery]);

  // -- Header actions -------------------------------------------

  useEffect(() => {
    onActionsChange?.(
      <button
        className={styles["header-button"]}
        onClick={loadNamespaces}
        disabled={loading}
        title="Refresh"
      >
        <RefreshCw size={11} className={loading ? styles["spin"] : ""} />
      </button>,
    );
  }, [onActionsChange, loading, loadNamespaces]);

  useEffect(() => {
    return () => onActionsChange?.(null);
  }, [onActionsChange]);

  // -- Loading / error ------------------------------------------

  if (loading) {
    return (
      <div className={styles["container"]}>
        <PanelLoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles["container"]}>
        <div className={styles["error"]}>Failed to load datastore: {error}</div>
      </div>
    );
  }

  // -- Render ----------------------------------------------------

  return (
    <div className={`datastore-panel-component ${styles["container"]}`}>
      {namespaces.length > 0 && (
        <div className={styles["filter-controls-section"]}>
          <SearchInputComponent
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search namespaces…"
            compact
            className={styles["search-input-wrapper"]}
          />
        </div>
      )}

      {/* -- Empty ------------------------------------------- */}
      {namespaces.length === 0 && (
        <div className={styles["empty-state"]}>
          <div className={styles["empty-icon"]}>
            <Database size={24} />
          </div>
          <div className={styles["empty-title"]}>No datasets yet</div>
          <div className={styles["empty-subtitle"]}>
            Agents store queryable records here via write_datastore — workout
            logs, price history, tracked metrics, and other structured data.
          </div>
        </div>
      )}

      {namespaces.length > 0 && filteredNamespaces.length === 0 && (
        <div className={styles["empty-state"]}>
          <div className={styles["empty-title"]}>No matching datasets</div>
          <div className={styles["empty-subtitle"]}>
            Try adjusting your search query.
          </div>
        </div>
      )}

      {/* -- Namespace list ------------------------------------ */}
      {filteredNamespaces.map((namespaceInfo) => {
        const isExpanded = expandedNamespace === namespaceInfo.namespace;
        const isConfirming =
          confirmingDeleteNamespace === namespaceInfo.namespace;

        return (
          <div key={namespaceInfo.namespace} className={styles["namespace-card"]}>
            <div className={styles["namespace-card-header"]}>
              <button
                className={styles["expand-button"]}
                onClick={() => handleToggleNamespace(namespaceInfo.namespace)}
                title={isExpanded ? "Collapse" : "Browse records"}
              >
                {isExpanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
              </button>

              <div
                className={styles["namespace-info"]}
                onClick={() => handleToggleNamespace(namespaceInfo.namespace)}
              >
                <div className={styles["namespace-name"]}>
                  <Database size={11} className={styles["namespace-icon"]} />
                  {namespaceInfo.namespace}
                  <span className={styles["record-count-badge"]}>
                    {namespaceInfo.count}
                  </span>
                </div>
                <div className={styles["namespace-meta"]}>
                  {namespaceInfo.fields.slice(0, 6).map((field) => (
                    <span key={field} className={styles["field-tag"]}>
                      {field}
                    </span>
                  ))}
                  {namespaceInfo.fields.length > 6 && (
                    <span className={styles["field-tag"]}>
                      +{namespaceInfo.fields.length - 6}
                    </span>
                  )}
                  {namespaceInfo.lastUpdated && (
                    <BadgeComponent
                      type="dateTime"
                      date={namespaceInfo.lastUpdated}
                    />
                  )}
                </div>
              </div>

              <button
                className={styles["delete-button"]}
                onClick={() =>
                  setConfirmingDeleteNamespace(
                    isConfirming ? null : namespaceInfo.namespace,
                  )
                }
                title="Delete entire dataset"
              >
                <Trash2 size={12} />
              </button>
            </div>

            {/* Delete namespace confirm */}
            {isConfirming && (
              <div className={styles["confirm-layout-row"]}>
                <span className={styles["confirm-label"]}>
                  Delete all {namespaceInfo.count} records in &quot;
                  {namespaceInfo.namespace}&quot;?
                </span>
                <button
                  className={`${styles["confirm-button"]} ${styles["confirm-button-element-yes"]}`}
                  onClick={() => handleDeleteNamespace(namespaceInfo.namespace)}
                >
                  Delete
                </button>
                <button
                  className={`${styles["confirm-button"]} ${styles["confirm-button-element-no"]}`}
                  onClick={() => setConfirmingDeleteNamespace(null)}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Expanded record list */}
            {isExpanded && (
              <div className={styles["record-list"]}>
                {recordsLoading && records.length === 0 && (
                  <div className={styles["records-loading"]}>
                    <RefreshCw size={11} className={styles["spin"]} />
                    Loading records…
                  </div>
                )}

                {records.map((record) => {
                  const recordId = record.id || JSON.stringify(record.data);
                  const isRecordExpanded = expandedRecordId === recordId;
                  const preview = JSON.stringify(record.data);

                  return (
                    <div key={recordId} className={styles["record-row"]}>
                      <div
                        className={styles["record-row-header"]}
                        onClick={() =>
                          setExpandedRecordId(
                            isRecordExpanded ? null : recordId,
                          )
                        }
                      >
                        {record.key && (
                          <span className={styles["record-key"]}>
                            <KeyRound size={9} />
                            {record.key}
                          </span>
                        )}
                        <span className={styles["record-preview"]}>
                          {preview}
                        </span>
                        {record.id && (
                          <button
                            className={styles["record-delete-button"]}
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              handleDeleteRecord(
                                namespaceInfo.namespace,
                                record.id!,
                              );
                            }}
                            title="Delete record"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                      {isRecordExpanded && (
                        <div className={styles["record-detail"]}>
                          <pre className={styles["record-json"]}>
                            {JSON.stringify(record.data, null, 2)}
                          </pre>
                          <div className={styles["record-provenance"]}>
                            {record.agent && (
                              <span className={styles["meta-tag"]}>
                                <span className={styles["meta-key"]}>agent</span>
                                <span className={styles["meta-value"]}>
                                  {record.agent}
                                </span>
                              </span>
                            )}
                            {record.username && (
                              <span className={styles["meta-tag"]}>
                                <span className={styles["meta-key"]}>by</span>
                                <span className={styles["meta-value"]}>
                                  {record.username}
                                </span>
                              </span>
                            )}
                            {record.updatedAt && (
                              <BadgeComponent
                                type="dateTime"
                                date={record.updatedAt}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {records.length < recordsTotal && (
                  <button
                    className={styles["load-more-button"]}
                    onClick={() =>
                      loadRecords(namespaceInfo.namespace, records.length)
                    }
                    disabled={recordsLoading}
                  >
                    {recordsLoading ? (
                      <RefreshCw size={10} className={styles["spin"]} />
                    ) : (
                      `Load more (${records.length} / ${recordsTotal})`
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
