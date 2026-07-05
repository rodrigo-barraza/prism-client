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
// -- StorageService keys (auto-prefixed "prism:<key>") -----------
export const STORAGE_KEY_LAST_PROVIDER = "lastProvider";
export const STORAGE_KEY_LAST_MODEL = "lastModel";
export const STORAGE_KEY_INFERENCE_MODE = "inferenceMode";

// -- Page-scoped model memory keys (auto-prefixed "prism:<key>") --
// Each page remembers the last-used model independently.
// Value shape: { provider, model, isLocal }
export const STORAGE_KEY_MODEL_MEMORY_AGENT = "modelMemory:agent";
export const STORAGE_KEY_MODEL_MEMORY_AGENT_PREFIX = "modelMemory:agent:";
export const STORAGE_KEY_MODEL_MEMORY_SYNTHESIS = "modelMemory:synthesis";
export const STORAGE_KEY_MODEL_MEMORY_BENCHMARKS = "modelMemory:benchmarks";

// -- Re-exports from utilities-library (single source of truth) ---
import {
  AGENT_IDS,
  AGENTLESS_AGENT,
  DEFAULT_CONVERSATION_TITLE,
  DEFAULT_WORKFLOW_TITLE,
  DEFAULT_USERNAME,
  MAX_TOOL_ITERATIONS,
  DEFAULT_RECURSIVE_SPAWNING_DEPTH,
  DEFAULT_CODING_PROJECT as PROJECT_AGENT,
  PROVIDERS,
  PROVIDER_LIST,
  LOCAL_PROVIDER_TYPES as LOCAL_PROVIDERS,
  PROVIDER_LABELS,
  isLocalProvider,
  resolveProviderBaseType,
  THINKING_PATTERNS as FALLBACK_THINKING_PATTERNS,
  MESSAGE_ROLES,
  APPROVAL_STATUS,
  SYSTEM_STATUSES,
} from "@rodrigo-barraza/utilities-library/taxonomy";

export {
  AGENT_IDS,
  AGENTLESS_AGENT,
  DEFAULT_CONVERSATION_TITLE,
  DEFAULT_WORKFLOW_TITLE,
  DEFAULT_USERNAME,
  MAX_TOOL_ITERATIONS,
  DEFAULT_RECURSIVE_SPAWNING_DEPTH,
  PROJECT_AGENT,
  PROVIDERS,
  PROVIDER_LIST,
  LOCAL_PROVIDERS,
  PROVIDER_LABELS,
  isLocalProvider,
  resolveProviderBaseType,
  FALLBACK_THINKING_PATTERNS,
  MESSAGE_ROLES,
  APPROVAL_STATUS,
  SYSTEM_STATUSES,
};

export type {
  ProviderType,
  MessageRole,
  ApprovalStatusType,
  SystemStatus,
} from "@rodrigo-barraza/utilities-library/taxonomy";

// -- Raw localStorage keys (no namespace prefix) -----------------
export const LOCAL_STORAGE_KEY_PANEL_LEFT = "panel_left";
export const LOCAL_STORAGE_KEY_PANEL_RIGHT = "panel_right";
export const LOCAL_STORAGE_KEY_PANEL_NAV = "panel_nav";
export const LOCAL_STORAGE_KEY_SYSTEM_INSTRUCTIONS = "prism_system_instructions";
export const LOCAL_STORAGE_KEY_WORKFLOW_INSPECTOR_WIDTH = "workflow-inspector-width";
export const LOCAL_STORAGE_KEY_WORKFLOW_EXPANDED_NODES = "workflow-expanded-nodes";
export const LOCAL_STORAGE_KEY_WORKFLOW_VIEWS = "workflow-views";
export const LOCAL_STORAGE_KEY_ADMIN_PROJECT_FILTER = "admin:projectFilter";
export const LOCAL_STORAGE_KEY_DATE_RANGE = "prism-date-range";
export const LOCAL_STORAGE_KEY_CHAT_FILTERS = "prism:chat-filters";
export const LOCAL_STORAGE_KEY_ADMIN_CHAT_FILTERS = "prism:admin-chat-filters";
export const LOCAL_STORAGE_KEY_WORKSPACE_ROOT = "prism:workspace";
export const LOCAL_STORAGE_KEY_FILE_VIEWER_WIDTH = "prism:fileViewerWidth";
export const LOCAL_STORAGE_KEY_LEFT_SIDEBAR_SPLIT_RATIO = "prism:leftSidebarSplitRatio";
export const LOCAL_STORAGE_KEY_USERNAME = "prism:username";
export const LOCAL_STORAGE_KEY_CRITIC_GATE_ENABLED = "agent:criticGateEnabled";
export const LOCAL_STORAGE_KEY_AUTO_APPROVE_ENABLED = "agent:autoApproveEnabled";
export const LOCAL_STORAGE_KEY_AGENT_MAX_ITERATIONS = "agent:maxIterations";
export const LOCAL_STORAGE_KEY_AGENT_MAX_SUB_AGENT_ITERATIONS = "agent:maxSubAgentIterations";
export const LOCAL_STORAGE_KEY_AGENT_MAX_RECURSION_DEPTH = "agent:maxRecursionDepth";
export const LOCAL_STORAGE_KEY_CRON_JOB_NOTIFICATIONS_COUNT = "cron-job-notifications-count";
export const STORAGE_KEY_TOOL_MEMORY_AGENT_PREFIX = "toolMemory:agent:";
export const LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE = "agent:workspaceTogglePreference";
export const LOCAL_STORAGE_KEY_ACTIVE_AGENT = "prism:activeAgent";
export const LOCAL_STORAGE_KEY_LM_STUDIO_LOAD_CONFIG_PREFIX = "lm-studio-load-config:";

// -- Custom Event Names --------------------------------------------
export const EVENT_NAME_CRON_JOB_SCHEDULED = "cron-job-scheduled";
export const EVENT_NAME_PRISM_SETTINGS_UPDATED = "prism-settings-updated";
export const EVENT_NAME_PANEL_DISMISS_SIDEBARS = "panel:dismiss-sidebars";
export const EVENT_NAME_SIDEBAR_TAB_CHANGE = "sidebarTab:change";
export const EVENT_NAME_SIDEBAR_TAB_BOTTOM_CHANGE = "sidebarTabBottom:change";
export const EVENT_NAME_VIEW_MODE_CHANGE = "viewMode:change";
export const EVENT_NAME_USER_TYPING = "user:typing";
export const EVENT_NAME_CONVERSATION_CHANGE = "conversation:change";
export const EVENT_NAME_AGENT_SWITCH = "agent:switch";
export const EVENT_NAME_MODEL_CHANGE = "model:change";

// -- Roles & Categories -------------------------------------------

export const CATEGORIES = {
  USER: "user",
  AGENT: "agent",
  MODEL: "model",
  REQUEST: "request",
  SESSION: "session",
  PROJECT: "project",
  SUBAGENT: "subagent",
  ORCHESTRATOR: "orchestrator",
  AVATAR: "prism_avatar",
  CUSTOM_THEMES: "prism_custom_themes",
} as const;

export const LAYOUT = {
  CANONICAL_WIDTH: 1600,
  CANONICAL_HEIGHT: 1000,
  NODE_RADIUS: 24,
  NODE_SPACING_X: 200,
  NODE_SPACING_Y: 80,
  DEFAULT_NODE_X: 400,
  DEFAULT_NODE_Y: 250,
} as const;

export const TIMING = {
  DEBOUNCE_FAST: 150,
  DEBOUNCE_STANDARD: 500,
  GRAPH_REBUILD_THROTTLE_MILLISECONDS: 400,
  POLL_SLOW: 10000,
  ANIMATION_DURATION: 600,
} as const;

// -- Execution & Lifecycle Statuses -------------------------------
/**
 * EXECUTION_STATUS — UI-specific execution phases.
 * Extends the shared SYSTEM_STATUSES from the utilities library.
 */
export const EXECUTION_STATUS = {
  ...SYSTEM_STATUSES,
  THINKING: "thinking",
  CALLING: "calling",
  STREAMING: "streaming",
  GENERATING: "generating",
  SYNTHESIZING: "synthesizing",
  PREFILLING: "prefilling",
  EXECUTING: "executing",
  LOADING: "loading",
  STARTING: "starting",
  SPAWNED: "spawned",
  FIRED: "fired",
  EXPIRED: "expired",
} as const;

// -- HTTP & API ----------------------------------------------------
export const HTTP_METHODS = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  PATCH: "PATCH",
} as const;

// -- Units & Truncation -------------------------------------------
export const BYTES_IN_KIB = 1024;
export const BYTES_IN_MIB = 1024 ** 2;
export const BYTES_IN_GIB = 1024 ** 3;
export const KIB_IN_MIB = 1024;
export const MIB_IN_GIB = 1024;

export const TRUNCATION_LIMITS = {
  DEFAULT_TOOL_OUTPUT: 3000,
  MAX_CONTENT_CHARS: 10000,
} as const;

// -- Additional LocalStorage Keys ---------------------------------
export const LOCAL_STORAGE_KEY_THEME = "prism:theme";
export const LOCAL_STORAGE_KEY_AVATAR = "prism:avatar";
export const LOCAL_STORAGE_KEY_CUSTOM_THEMES = "prism:custom-themes";


// -- Chart / UI color palette -------------------------------------
/** Cycled by row index for provider charts, tables, and distribution bars. */
export const PROVIDER_COLORS = [
  "oklch(0.585 0.233 277.117)", // Indigo 500
  "oklch(0.606 0.25 293.528)", // Purple 500
  "oklch(0.627 0.265 325.612)", // Pink 500
  "oklch(0.769 0.188 70.08)", // Amber 500
  "oklch(0.705 0.191 165.574)", // Emerald 500
  "oklch(0.588 0.158 241.966)", // Blue 500
  "oklch(0.627 0.226 28.324)", // Red 500
  "oklch(0.697 0.148 209.91)", // Cyan 500
];

// -- Polling intervals (re-exported from utilities-library) -------
export {
  POLL_FAST, // 3s  — benchmarks, sub-agents
  POLL_STANDARD, // 5s  — conversations, requests, traces
  POLL_MODERATE, // 15s — model lists, analytics
  POLL_SLOW, // 30s — health checks
  POLL_LAZY, // 60s — dashboard refresh
} from "@rodrigo-barraza/utilities-library";

