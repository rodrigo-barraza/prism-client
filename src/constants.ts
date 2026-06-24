/**
 * constants.js — Centralized constants for the Prism app.
 *
 * All localStorage key strings live here so they're discoverable,
 * searchable, and impossible to silently misspell.
 *
 * Keys used via StorageService are automatically prefixed with "prism:"
 * by the service itself — these constants hold the *un-prefixed* key.
 *
 * Keys used via raw localStorage are stored exactly as-is — these
 * constants hold the full key string.
 */

// -- StorageService keys (auto-prefixed "prism:<key>") -----------
export const SK_LAST_PROVIDER = "lastProvider";
export const SK_LAST_MODEL = "lastModel";
export const SK_INFERENCE_MODE = "inferenceMode";

// -- Page-scoped model memory keys (auto-prefixed "prism:<key>") --
// Each page remembers the last-used model independently.
// Value shape: { provider, model, isLocal }
export const SK_MODEL_MEMORY_AGENT = "modelMemory:agent";
export const SK_MODEL_MEMORY_AGENT_PREFIX = "modelMemory:agent:";
export const SK_MODEL_MEMORY_SYNTHESIS = "modelMemory:synthesis";
export const SK_MODEL_MEMORY_BENCHMARKS = "modelMemory:benchmarks";



// -- Re-exports from utilities-library (single source of truth) ---
export {
  AGENT_IDS,
  AGENTLESS_AGENT,
  DEFAULT_CONVERSATION_TITLE,
  DEFAULT_WORKFLOW_TITLE,
  DEFAULT_USERNAME,
  MAX_TOOL_ITERATIONS,
  DEFAULT_CODING_PROJECT as PROJECT_AGENT,
  PROVIDERS,
  PROVIDER_LIST,
  LOCAL_PROVIDER_TYPES as LOCAL_PROVIDERS,
  PROVIDER_LABELS,
  isLocalProvider,
  resolveProviderBaseType,
  THINKING_PATTERNS as FALLBACK_THINKING_PATTERNS,
} from "@rodrigo-barraza/utilities-library/taxonomy";
export type { ProviderType } from "@rodrigo-barraza/utilities-library/taxonomy";

// -- Raw localStorage keys (no namespace prefix) -----------------
export const LS_PANEL_LEFT = "panel_left";
export const LS_PANEL_RIGHT = "panel_right";
export const LS_PANEL_NAV = "panel_nav";
export const LS_SYSTEM_INSTRUCTIONS = "prism_system_instructions";
export const LS_WORKFLOW_INSPECTOR_WIDTH = "workflow-inspector-width";
export const LS_WORKFLOW_EXPANDED_NODES = "workflow-expanded-nodes";
export const LS_WORKFLOW_VIEWS = "workflow-views";
export const LS_ADMIN_PROJECT_FILTER = "admin:projectFilter";
export const LS_DATE_RANGE = "prism-date-range";
export const LS_CHAT_FILTERS = "prism:chat-filters";
export const LS_ADMIN_CHAT_FILTERS = "prism:admin-chat-filters";
export const LS_WORKSPACE_ROOT = "prism:workspace";
export const LS_FILE_VIEWER_WIDTH = "prism:fileViewerWidth";
export const LS_LEFT_SIDEBAR_SPLIT_RATIO = "prism:leftSidebarSplitRatio";
export const LS_USERNAME = "prism:username";
export const LS_CRITIC_GATE_ENABLED = "agent:criticGateEnabled";
export const LOCAL_STORAGE_AUTO_APPROVE_ENABLED = "agent:autoApproveEnabled";
export const LS_AGENT_MAX_ITERATIONS = "agent:maxIterations";
export const LS_AGENT_MAX_SUB_AGENT_ITERATIONS = "agent:maxSubAgentIterations";
export const LS_AGENT_MAX_RECURSION_DEPTH = "agent:maxRecursionDepth";
export const LS_CRON_JOB_NOTIFICATIONS_COUNT = "cron-job-notifications-count";
export const SK_TOOL_MEMORY_AGENT_PREFIX = "toolMemory:agent:";
export const LS_WORKSPACE_TOGGLE_PREFERENCE = "agent:workspaceTogglePreference";
export const LS_ACTIVE_AGENT = "prism:activeAgent";
export const LS_LM_STUDIO_LOAD_CONFIG_PREFIX = "lm-studio-load-config:";

// -- Custom Event Names --------------------------------------------
export const EV_CRON_JOB_SCHEDULED = "cron-job-scheduled";
export const EV_PRISM_SETTINGS_UPDATED = "prism-settings-updated";
export const EV_PANEL_DISMISS_SIDEBARS = "panel:dismiss-sidebars";
export const EV_SIDEBAR_TAB_CHANGE = "sidebarTab:change";
export const EV_SIDEBAR_TAB_BOTTOM_CHANGE = "sidebarTabBottom:change";
export const EV_VIEW_MODE_CHANGE = "viewMode:change";
export const EV_USER_TYPING = "user:typing";
export const EV_CONVERSATION_CHANGE = "conversation:change";
export const EV_AGENT_SWITCH = "agent:switch";
export const EV_MODEL_CHANGE = "model:change";

// -- Settings defaults (shared by Agent, admin) ------
export const SETTINGS_DEFAULTS = {
  provider: "",
  model: "",
  systemPrompt: "",
  temperature: 1.0,
  maxTokens: 2048,
  topP: 1,
  topK: 0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stopSequences: "",
  thinkingEnabled: true,
  reasoningEffort: "high",
  thinkingLevel: "high",
  thinkingBudget: "",
  webSearchEnabled: false,
  verbosity: "",
  reasoningSummary: "",
};

// -- Chart / UI color palette -------------------------------------
/** Cycled by row index for provider charts, tables, and distribution bars. */
export const PROVIDER_COLORS = [
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#06b6d4",
];

// -- Polling intervals (re-exported from utilities-library) -------
export {
  POLL_FAST, // 3s  — benchmarks, sub-agents
  POLL_STANDARD, // 5s  — conversations, requests, traces
  POLL_MODERATE, // 15s — model lists, analytics
  POLL_SLOW, // 30s — health checks
  POLL_LAZY, // 60s — dashboard refresh
} from "@rodrigo-barraza/utilities-library";

