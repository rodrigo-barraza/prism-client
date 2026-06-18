"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ButtonComponent,
} from "@rodrigo-barraza/components-library";
import StorageService from "../services/StorageService";
import { SK_TOOL_MEMORY_AGENT_PREFIX, AGENT_IDS } from "../constants";
import {
  X,
  Play,
  Bot,
  BarChart3,
  Activity,
  DollarSign,
  TrendingUp,
  Calendar,
  Hash,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
} from "lucide-react";
import {
  humanizeToolName,
  formatCostAdaptive,
  formatCompact,
  formatLatencyMilliseconds,
  timeAgo as formatTimeAgo,
} from "@rodrigo-barraza/utilities-library";
import styles from "./ToolsPageComponent.module.css";

/* -- Types --------------------------------------------------- */

export interface ToolDetailSchema {
  name: string;
  description?: string;
  emoji?: string | string[];
  domain?: string;
  parameters?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  dataSource?: {
    type: string;
    provider?: string;
    intervalSeconds?: number;
  };
}

interface TopModelStat {
  model: string;
  provider: string;
  count: number;
}

interface TopAgentStat {
  agent: string;
  count: number;
}

export interface ToolDetailStats {
  tool?: string;
  totalCalls?: number;
  totalRequests?: number;
  totalCost?: number;
  avgLatency?: number;
  minLatency?: number;
  maxLatency?: number;
  errorRate?: number;
  totalTransferBytes?: number;
  topModels?: TopModelStat[];
  topAgents?: TopAgentStat[];
  totalInputTokens?: number;
  totalOutputTokens?: number;
  successCount?: number;
  failureCount?: number;
  firstUsed?: string;
  lastUsed?: string;
}

interface ToolDetailModalComponentProps {
  tool: ToolDetailSchema;
  onClose: () => void;
  agents: { id: string; name: string }[];
  stats: ToolDetailStats;
  allTools: ToolDetailSchema[];
}

/* -- Agent color mapping ------------------------------------- */

const AGENT_COLORS: Record<string, string> = {
  CODING: "#3b82f6",
  OMNI: "#dc2626",
  OOG: "#a78bfa",
  LUPOS: "#ef4444",
  STICKERS: "#f59e0b",
  LIGHTS: "#22c55e",
  DIGEST: "#14b8a6",
  IMAGE: "#ec4899",
};

function getAgentColor(agentId: string) {
  return AGENT_COLORS[agentId] || "var(--accent-primary)";
}

/* -- Helpers ------------------------------------------------- */

function extractOutputFields(tool: ToolDetailSchema) {
  const properties = tool.parameters?.properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  const fieldsParam = properties?.fields;
  if (!fieldsParam) return null;
  const itemsEnum = (fieldsParam as { items?: { enum?: string[] } }).items
    ?.enum;
  if (itemsEnum) return itemsEnum;
  const directEnum = (fieldsParam as { enum?: string[] }).enum;
  if (directEnum) return directEnum;
  return null;
}

interface ParameterSchema {
  type?: string;
  enum?: (string | number)[];
  description?: string;
}

function getInputParams(tool: ToolDetailSchema): [string, ParameterSchema][] {
  const properties = tool.parameters?.properties || {};
  return Object.entries(properties).filter(
    ([name]) => name !== "fields",
  ) as [string, ParameterSchema][];
}

/* -- Component ----------------------------------------------- */

export default function ToolDetailModalComponent({
  tool,
  onClose,
  agents,
  stats,
  allTools,
}: ToolDetailModalComponentProps) {
  const router = useRouter();
  const required = new Set(
    (tool.parameters as { required?: string[] })?.required || [],
  );
  const inputParams = getInputParams(tool);
  const outputFields = extractOutputFields(tool);
  const cleanName = humanizeToolName(tool.name);
  const [isRawSchemaVisible, setIsRawSchemaVisible] = useState(false);

  const handleTryTool = () => {
    if (!allTools) return;
    const allToolNames = allTools.map(
      (currentTool: ToolDetailSchema) => currentTool.name,
    );
    const disabledTools = allToolNames.filter(
      (name: string) => name !== tool.name,
    );
    StorageService.set(
      `${SK_TOOL_MEMORY_AGENT_PREFIX}${AGENT_IDS.NONE}`,
      { disabledTools },
    );
    router.push("/chat?agent=NONE&fc=true&thinking=true");
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const successRate = stats
    ? ((stats.successCount || 0) /
        ((stats.successCount || 0) + (stats.failureCount || 0))) *
        100 || 0
    : 0;

  return (
    <div className={styles['detail-overlay']} onClick={onClose}>
      <div
        className={styles['detail-panel']}
        onClick={(event: React.MouseEvent) => event.stopPropagation()}
      >
        {/* Header */}
        <div className={styles['detail-header']}>
          <div className={styles['detail-title-block']}>
            <div className={styles['detail-clean-name']}>
              {(() => {
                const resolvedEmoji = Array.isArray(tool.emoji)
                  ? tool.emoji[0]
                  : tool.emoji;
                return (
                  resolvedEmoji &&
                  (resolvedEmoji.startsWith("http") ? (
                    <img
                      src={resolvedEmoji}
                      alt={tool.name}
                      className={styles['detail-emoji-image']}
                    />
                  ) : (
                    <span className={styles['detail-emoji']}>
                      {resolvedEmoji}
                    </span>
                  ))
                );
              })()}
              {cleanName}
            </div>
            <div className={styles['detail-title']}>{tool.name}</div>
            <div className={styles['detail-domain-layout-row']}>
              {tool.domain && (
                <span className={styles['tool-domain']}>{tool.domain}</span>
              )}
              {tool.dataSource && (
                <span className={styles['data-source-badge']}>
                  <span className={styles['data-source-type']}>
                    {tool.dataSource.type}
                  </span>
                  {tool.dataSource.provider && (
                    <span className={styles['data-source-provider']}>
                      {tool.dataSource.provider}
                    </span>
                  )}
                  {tool.dataSource.intervalSeconds && (
                    <span className={styles['data-source-interval']}>
                      ~{tool.dataSource.intervalSeconds}s
                    </span>
                  )}
                </span>
              )}
              {agents?.length > 0 &&
                agents.map((agent: { id: string; name: string }) => (
                  <span
                    key={agent.id}
                    className={styles['agent-badge']}
                    style={
                      {
                        "--agent-color": getAgentColor(agent.id),
                      } as React.CSSProperties
                    }
                  >
                    <Bot size={10} />
                    {agent.name}
                  </span>
                ))}
            </div>
          </div>
          <button
            className={styles['detail-close']}
            onClick={onClose}
            title="Close"
          >
            <X />
          </button>
        </div>

        {/* Body */}
        <div className={styles['detail-body']}>
          <ButtonComponent
            variant="primary"
            icon={Play}
            onClick={handleTryTool}
            className={styles['try-tool-button']}
          >
            Try Tool in Direct Chat
          </ButtonComponent>

          {/* Description */}
          <div className={styles['detail-description']}>
            {tool.description}
          </div>

          {/* Lifetime Stats */}
          <div className={styles['detail-section']}>
            <div className={styles['detail-section-title']}>
              <BarChart3 size={12} /> Lifetime Usage Stats
            </div>
            {stats ? (
              <>
                <div className={styles['stats-grid']}>
                  <div className={styles['stat-cell']}>
                    <Hash size={14} className={styles['stat-cell-icon']} />
                    <div className={styles['stat-cell-value']}>
                      {formatCompact(stats.totalCalls)}
                    </div>
                    <div className={styles['stat-cell-label']}>Total Calls</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <Activity
                      size={14}
                      className={styles['stat-cell-icon']}
                    />
                    <div className={styles['stat-cell-value']}>
                      {formatCompact(stats.totalRequests)}
                    </div>
                    <div className={styles['stat-cell-label']}>Requests</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <DollarSign
                      size={14}
                      className={styles['stat-cell-icon']}
                    />
                    <div className={styles['stat-cell-value']}>
                      {formatCostAdaptive(stats.totalCost)}
                    </div>
                    <div className={styles['stat-cell-label']}>Total Cost</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <TrendingUp
                      size={14}
                      className={styles['stat-cell-icon']}
                    />
                    <div className={styles['stat-cell-value']}>
                      {formatLatencyMilliseconds(stats.avgLatency)}
                    </div>
                    <div className={styles['stat-cell-label']}>
                      Avg Latency
                    </div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <Zap size={14} className={styles['stat-cell-icon']} />
                    <div className={styles['stat-cell-value']}>
                      {formatCompact(
                        (stats.totalInputTokens || 0) +
                          (stats.totalOutputTokens || 0),
                      )}
                    </div>
                    <div className={styles['stat-cell-label']}>
                      Total Tokens
                    </div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <CheckCircle2
                      size={14}
                      className={styles['stat-cell-icon']}
                    />
                    <div className={styles['stat-cell-value']}>
                      {successRate.toFixed(0)}%
                    </div>
                    <div className={styles['stat-cell-label']}>
                      Success Rate
                    </div>
                  </div>
                </div>

                {/* Time Range */}
                <div className={styles['stats-time-range']}>
                  <div className={styles['stats-time-item']}>
                    <Calendar size={12} />
                    <span className={styles['stats-time-label']}>
                      First used
                    </span>
                    <span className={styles['stats-time-value']}>
                      {formatTimeAgo(stats.firstUsed)}
                    </span>
                  </div>
                  <div className={styles['stats-time-item']}>
                    <Clock size={12} />
                    <span className={styles['stats-time-label']}>
                      Last used
                    </span>
                    <span className={styles['stats-time-value']}>
                      {formatTimeAgo(stats.lastUsed)}
                    </span>
                  </div>
                  {(stats.failureCount || 0) > 0 && (
                    <div className={styles['stats-time-item']}>
                      <XCircle size={12} />
                      <span className={styles['stats-time-label']}>
                        Failures
                      </span>
                      <span className={styles['stats-time-value-danger']}>
                        {stats.failureCount}
                      </span>
                    </div>
                  )}
                </div>

                {/* Top Models / Agents */}
                {((stats.topModels && stats.topModels.length > 0) ||
                  (stats.topAgents && stats.topAgents.length > 0)) && (
                  <div className={styles['stats-breakdown']}>
                    {stats.topModels && stats.topModels.length > 0 && (
                      <div className={styles['stats-breakdown-layout-column']}>
                        <div className={styles['stats-breakdown-title']}>
                          Top Models
                        </div>
                        {stats.topModels.map((modelStat: TopModelStat) => (
                          <div
                            key={modelStat.model}
                            className={styles['stats-breakdown-layout-row']}
                          >
                            <span
                              className={styles['stats-breakdown-name']}
                            >
                              {modelStat.model}
                            </span>
                            <span
                              className={styles['stats-breakdown-count']}
                            >
                              {modelStat.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {stats.topAgents && stats.topAgents.length > 0 && (
                      <div className={styles['stats-breakdown-layout-column']}>
                        <div className={styles['stats-breakdown-title']}>
                          Top Agents
                        </div>
                        {stats.topAgents.map((agentStat: TopAgentStat) => (
                          <div
                            key={agentStat.agent}
                            className={styles['stats-breakdown-layout-row']}
                          >
                            <span
                              className={styles['stats-breakdown-name']}
                            >
                              {agentStat.agent}
                            </span>
                            <span
                              className={styles['stats-breakdown-count']}
                            >
                              {agentStat.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className={styles['stats-empty']}>
                <Activity size={16} />
                No usage data recorded yet
              </div>
            )}
          </div>

          {/* Payload (Input Parameters) */}
          {inputParams.length > 0 && (
            <div className={styles['detail-section']}>
              <div className={styles['detail-section-title']}>
                Payload — Input Parameters ({inputParams.length})
              </div>
              <table className={styles['param-table']}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {inputParams.map(
                    ([name, schema]) => (
                      <tr key={name}>
                        <td>
                          <span className={styles['param-name']}>
                            {name}
                          </span>
                          {required.has(name) && (
                            <span className={styles['param-required']}>
                              req
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={styles['param-type']}>
                            {schema.type || "any"}
                          </span>
                          {schema.enum && (
                            <div className={styles['param-enum']}>
                              {schema.enum.map(
                                (enumValue: string | number) => (
                                  <span
                                    key={enumValue}
                                    className={styles['enum-value']}
                                  >
                                    {String(enumValue)}
                                  </span>
                                ),
                              )}
                            </div>
                          )}
                        </td>
                        <td>{schema.description || "—"}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Output Fields */}
          {outputFields && outputFields.length > 0 && (
            <div className={styles['detail-section']}>
              <div className={styles['detail-section-title']}>
                Output — Available Fields ({outputFields.length})
              </div>
              <div className={styles['output-fields-grid']}>
                {outputFields.map((field: string) => (
                  <span key={field} className={styles['output-field']}>
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Raw JSON schema (collapsible) */}
          <div className={styles['detail-section']}>
            <button
              className={styles['raw-toggle']}
              onClick={() => setIsRawSchemaVisible(!isRawSchemaVisible)}
            >
              <span className={styles['detail-section-title']}>
                Raw Schema
              </span>
              <span
                className={styles['raw-chevron']}
                data-is-open={isRawSchemaVisible}
              >
                ▾
              </span>
            </button>
            {isRawSchemaVisible && (
              <pre className={styles['json-block']}>
                {JSON.stringify(tool, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
