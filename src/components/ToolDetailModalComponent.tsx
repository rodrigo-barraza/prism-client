"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ButtonComponent,
  ModalComponent,
} from "@rodrigo-barraza/components-library";
import StorageService from "../services/StorageService";
import { STORAGE_KEY_TOOL_MEMORY_AGENT_PREFIX, AGENT_IDS } from "../constants";
import {
  Play,
  Bot,
  BarChart3,
  Activity,
  ChevronDown,
  DollarSign,
  TrendingUp,
  Calendar,
  Hash,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
} from "lucide-react";
import { resolveAgentAccentColor } from "../utils/agentUiMap";
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

/* -- Constants ------------------------------------------------ */

const SECTION_ICON_SIZE = 12;
const STAT_ICON_SIZE = 14;
const AGENT_BADGE_ICON_SIZE = 10;

/** Direct-chat route preconfigured for single-tool testing. */
const TRY_TOOL_CHAT_ROUTE = `/chat?agent=${AGENT_IDS.NONE}&fc=true&thinking=true`;

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
      `${STORAGE_KEY_TOOL_MEMORY_AGENT_PREFIX}${AGENT_IDS.NONE}`,
      { disabledTools },
    );
    router.push(TRY_TOOL_CHAT_ROUTE);
  };

  const successRate = stats
    ? ((stats.successCount || 0) /
        ((stats.successCount || 0) + (stats.failureCount || 0))) *
        100 || 0
    : 0;

  const resolvedEmoji = Array.isArray(tool.emoji) ? tool.emoji[0] : tool.emoji;

  const modalTitle = (
    <div className={styles['detail-title-block']}>
      <div className={styles['detail-clean-name']}>
        {resolvedEmoji &&
          (resolvedEmoji.startsWith("http") ? (
            <img
              src={resolvedEmoji}
              alt={tool.name}
              className={styles['detail-emoji-image']}
            />
          ) : (
            <span className={styles['detail-emoji']}>{resolvedEmoji}</span>
          ))}
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
                  "--agent-color": resolveAgentAccentColor(agent.id),
                } as React.CSSProperties
              }
            >
              <Bot size={AGENT_BADGE_ICON_SIZE} />
              {agent.name}
            </span>
          ))}
      </div>
    </div>
  );

  return (
    <ModalComponent
      title={modalTitle}
      onClose={onClose}
      size="lg"
      id="tool-detail-modal"
      className="tool-detail-modal-component"
    >
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
              <BarChart3 size={SECTION_ICON_SIZE} /> Lifetime Usage Stats
            </div>
            {stats ? (
              <>
                <div className={styles['stats-grid']}>
                  <div className={styles['stat-cell']}>
                    <Hash size={STAT_ICON_SIZE} className={styles['stat-cell-icon']} />
                    <div className={styles['stat-cell-value']}>
                      {formatCompact(stats.totalCalls)}
                    </div>
                    <div className={styles['stat-cell-label']}>Total Calls</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <Activity
                      size={STAT_ICON_SIZE}
                      className={styles['stat-cell-icon']}
                    />
                    <div className={styles['stat-cell-value']}>
                      {formatCompact(stats.totalRequests)}
                    </div>
                    <div className={styles['stat-cell-label']}>Requests</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <DollarSign
                      size={STAT_ICON_SIZE}
                      className={styles['stat-cell-icon']}
                    />
                    <div className={styles['stat-cell-value']}>
                      {formatCostAdaptive(stats.totalCost)}
                    </div>
                    <div className={styles['stat-cell-label']}>Total Cost</div>
                  </div>
                  <div className={styles['stat-cell']}>
                    <TrendingUp
                      size={STAT_ICON_SIZE}
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
                    <Zap size={STAT_ICON_SIZE} className={styles['stat-cell-icon']} />
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
                      size={STAT_ICON_SIZE}
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
                    <Calendar size={SECTION_ICON_SIZE} />
                    <span className={styles['stats-time-label']}>
                      First used
                    </span>
                    <span className={styles['stats-time-value']}>
                      {formatTimeAgo(stats.firstUsed)}
                    </span>
                  </div>
                  <div className={styles['stats-time-item']}>
                    <Clock size={SECTION_ICON_SIZE} />
                    <span className={styles['stats-time-label']}>
                      Last used
                    </span>
                    <span className={styles['stats-time-value']}>
                      {formatTimeAgo(stats.lastUsed)}
                    </span>
                  </div>
                  {(stats.failureCount || 0) > 0 && (
                    <div className={styles['stats-time-item']}>
                      <XCircle size={SECTION_ICON_SIZE} />
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
                <Activity size={STAT_ICON_SIZE} />
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
              <ChevronDown
                size={SECTION_ICON_SIZE}
                className={styles['raw-chevron']}
                data-is-open={isRawSchemaVisible}
              />
            </button>
            {isRawSchemaVisible && (
              <pre className={styles['json-block']}>
                {JSON.stringify(tool, null, 2)}
              </pre>
            )}
          </div>
      </div>
    </ModalComponent>
  );
}
