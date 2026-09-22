"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  Webhook,
  Play,
  Ban,
  Eye,
  MessageSquare,
  Globe,
  Wrench,
  Terminal,
  Bot,
  ShieldAlert,
} from "lucide-react";
import PrismService from "../services/PrismService";
import {
  ButtonComponent,
  ToggleComponent,
  InputComponent,
  TextAreaComponent,
  SearchInputComponent,
  SelectComponent,
  SegmentedControlComponent,
} from "@rodrigo-barraza/components-library";
import { TRUNCATION_LIMITS } from "../constants";
import { getErrorMessage } from "../utils/errorMessage";
import styles from "./HooksPanelComponent.module.css";
import {
  HOOK_EVENT_NAMES,
  type Hook,
  type HookEventName,
  type HookHandlerConfig,
  type HookTestResult,
} from "@/types/types";

const PROMPT_MAX_CHARS = TRUNCATION_LIMITS.MAX_CONTENT_CHARS;
const PROMPT_WARN_CHARS = 2000;
const DEFAULT_TIMEOUT_MILLISECONDS = 5000;
const MINIMUM_TIMEOUT_MILLISECONDS = 100;
/** The server's ceiling (HOOKS.MAX_TIMEOUT_MILLISECONDS); a larger value is a 400. */
const MAXIMUM_TIMEOUT_MILLISECONDS = 60_000;
const JSON_INDENT_SPACES = 2;

/** Events whose matcher filters the tool call (name, or `Tool(argPattern)`). */
const TOOL_MATCHER_EVENTS: HookEventName[] = [
  "PreToolUse",
  "PermissionRequest",
  "PermissionDenied",
  "PostToolUse",
  "PostToolUseFailure",
];

/**
 * Events whose matcher tests one payload field instead of a tool — the
 * server's MATCHER_FIELD_BY_EVENT. Every other event rejects a matcher, so
 * the field is locked rather than silently dropped.
 */
const FIELD_MATCHER_HINTS: Partial<Record<HookEventName, string>> = {
  SessionStart: "source — startup | resume",
  SessionEnd: "reason — idle | shutdown",
  Notification: "notification_type — approval_required",
  StopFailure: "error_type — rate_limit | overloaded | server_error | …",
  PreModelSwitch: "the model being switched to",
  PostModelSwitch: "the model being switched to",
  InstructionsLoaded: "instruction_type — project_instructions | rule",
  SubagentStart: "the sub-agent's agent",
  SubagentStop: "the sub-agent's agent",
};

function eventAcceptsMatcher(event: HookEventName): boolean {
  return TOOL_MATCHER_EVENTS.includes(event) || event in FIELD_MATCHER_HINTS;
}

/** Events whose decision can refuse what is about to happen. */
const BLOCKING_EVENTS: HookEventName[] = [
  "PreToolUse",
  "UserPromptSubmit",
  "PermissionRequest",
  "PreModelSwitch",
  "Stop",
];

/** What each event is, in one line — shown under the picker. */
const EVENT_DESCRIPTIONS: Record<HookEventName, string> = {
  SessionStart: "Once per conversation session (a new conversation, or the first turn after idling).",
  TurnStart: "Every turn, before the first model call.",
  UserPromptSubmit: "The prompt that opened the turn. Deny refuses it; context is added for the model.",
  InstructionsLoaded: "PRISM.md or a pinned rule went into the system prompt.",
  PreModelSwitch: "This turn runs a different model than the last one; carries the estimated re-cache cost. Block refuses the turn.",
  PostModelSwitch: "After a model switch was allowed.",
  PreToolUse: "Before the approval gate: deny drops the call, ask forces a per-call approval, allow skips the prompt (never a deny rule).",
  PermissionRequest: "Just before a person is asked to approve a call — allow or deny answers for them.",
  PermissionDenied: "A call was denied by a rule, the classifier, a hook or the user.",
  PostToolUse: "After a tool returned — rewrite its output or add context.",
  PostToolUseFailure: "After a tool failed.",
  PostToolBatch: "A whole batch resolved, before the next model call — add context.",
  Stop: "The agent is about to end the turn. Block keeps it going with your reason (at most 3 times).",
  StopFailure: "The turn ended on an error (rate_limit, overloaded, …).",
  Interrupt: "The user pressed Stop — sees the transcript. 1 s default, 3 s max.",
  SubagentStart: "A sub-agent started.",
  SubagentStop: "A sub-agent finished.",
  PreCompact: "Before the context is compacted.",
  PostCompact: "After the context was compacted.",
  Notification: "A person is actually being asked something (after the gate decided).",
  TurnEnd: "Every turn, on every exit path.",
  SessionEnd: "The session went idle, or the service is shutting down.",
  Error: "The loop raised an error.",
};

/**
 * A plausible sample payload per event, so the Test button exercises the
 * handler with the fields it will really receive. The server fills in the
 * identity envelope around it.
 */
function samplePayloadFor(event: HookEventName): Record<string, unknown> {
  const toolCall = {
    tool_name: "execute_shell",
    tool_input: { command: "git push --force" },
    tool_use_id: "test-call",
  };
  switch (event) {
    case "PreToolUse":
    case "PermissionRequest":
      return { ...toolCall, ...(event === "PermissionRequest" && { permission_mode: "default", tier: "danger" }) };
    case "PermissionDenied":
      return { ...toolCall, denied_by: "user", reason: "user_rejected" };
    case "PostToolUse":
    case "PostToolUseFailure":
      return { ...toolCall, tool_output: { success: event === "PostToolUse" } };
    case "PostToolBatch":
      return { tool_calls: [{ ...toolCall, tool_output: { success: true } }] };
    case "UserPromptSubmit":
      return { prompt: "Deploy the release branch." };
    case "Stop":
      return { last_assistant_message: "All done!", stop_hook_active: false };
    case "StopFailure":
      return { error_type: "rate_limit", error_message: "429 Too Many Requests" };
    case "PreModelSwitch":
    case "PostModelSwitch":
      return { from_model: "gpt-6", to_model: "claude-opus-5-5", estimated_recache_tokens: 42_000, estimated_recache_cost_usd: 0.26 };
    case "SessionStart":
      return { source: "startup" };
    case "SessionEnd":
      return { reason: "idle", turns: 3 };
    case "Interrupt":
      return { transcript: [{ role: "user", content: "Refactor the parser" }] };
    case "InstructionsLoaded":
      return { instruction_type: "project_instructions", file_path: "PRISM.md", file_content: "…" };
    case "Notification":
      return { notification_type: "approval_required", tool_names: ["write_file"] };
    default:
      return {};
  }
}

type HookHandlerType = HookHandlerConfig["type"];

const HANDLER_TYPE_LABELS: Record<HookHandlerType, string> = {
  prompt: "Prompt",
  http: "HTTP",
  mcp_tool: "MCP Tool",
  command: "Command",
  agent: "Agent",
};

const HANDLER_TYPE_ICONS: Record<HookHandlerType, typeof MessageSquare> = {
  prompt: MessageSquare,
  http: Globe,
  mcp_tool: Wrench,
  command: Terminal,
  agent: Bot,
};

const HANDLER_SEGMENT_ICON_SIZE = 13;

function createDefaultHandler(type: HookHandlerType): HookHandlerConfig {
  switch (type) {
    case "prompt":
      return { type: "prompt", prompt: "" };
    case "http":
      return { type: "http", url: "" };
    case "mcp_tool":
      return { type: "mcp_tool", server: "", tool: "" };
    case "command":
      return { type: "command", command: "" };
    case "agent":
      return { type: "agent", prompt: "" };
  }
}

/** A one-line summary of where the handler sends the event. */
function describeHandler(handler: HookHandlerConfig): string {
  switch (handler.type) {
    case "prompt":
      return handler.model || handler.provider || "model decision";
    case "http":
      return handler.url || "no URL set";
    case "mcp_tool":
      return `${handler.server || "?"} · ${handler.tool || "?"}`;
    case "command":
      return handler.command || "no command set";
    case "agent":
      return handler.model || "conversation model";
  }
}

/** Whether every field the server requires for this handler is filled in. */
function isHandlerComplete(handler: HookHandlerConfig): boolean {
  switch (handler.type) {
    case "prompt":
      return Boolean(handler.prompt?.trim());
    case "http":
      return Boolean(handler.url?.trim());
    case "mcp_tool":
      return Boolean(handler.server?.trim() && handler.tool?.trim());
    case "command":
      return Boolean(handler.command?.trim());
    case "agent":
      return Boolean(handler.prompt?.trim());
  }
}

/** A readable message from a failed save — zod errors arrive as an object. */
function saveErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);
  return message === "[object Object]"
    ? "The server rejected this hook's configuration — check the fields."
    : message;
}

function resolveHookId(hook: Hook): string {
  return hook.id || hook._id?.toString() || "";
}

/**
 * HooksPanel — CRUD interface for lifecycle hooks.
 *
 * A hook binds a lifecycle event (SessionStart, PreToolUse, …) to a handler
 * that produces a decision: a model prompt, an HTTP endpoint, an MCP tool, a
 * shell command, or a verifier agent. Only the events in `BLOCKING_EVENTS`
 * can refuse anything; every other event observes or transforms.
 */
export default function HooksPanel({
  hooks,
  onHooksChange,
  agent,
  onActionsChange,
  readOnly = false,
}: {
  hooks: Hook[];
  onHooksChange: () => void;
  agent?: string;
  onActionsChange?: (_actions: ReactNode) => void;
  readOnly?: boolean;
}) {
  const [editingHook, setEditingHook] = useState<Hook | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // -- Test run state -------------------------------------------
  const [testingHookId, setTestingHookId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, HookTestResult>>(
    {},
  );

  // -- MCP tool `input` is free-form JSON, edited as raw text ----
  const [mcpInputText, setMcpInputText] = useState("");
  const [mcpInputError, setMcpInputError] = useState<string | null>(null);

  /**
   * Handler sub-forms are shape-incompatible, so switching type would
   * otherwise throw away what was typed. Stash each variant so flipping
   * back and forth is lossless within one editing session.
   */
  const handlerDraftsReference = useRef<
    Partial<Record<HookHandlerType, HookHandlerConfig>>
  >({});

  const filteredHooks = useMemo(() => {
    if (!searchQuery.trim()) return hooks;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return hooks.filter((hook: Hook) => {
      const name = (hook.name || "").toLowerCase();
      const description = (hook.description || "").toLowerCase();
      const event = (hook.event || "").toLowerCase();
      const matcher = (hook.matcher || "").toLowerCase();
      const handler = describeHandler(hook.handler).toLowerCase();
      return (
        name.includes(normalizedQuery) ||
        description.includes(normalizedQuery) ||
        event.includes(normalizedQuery) ||
        matcher.includes(normalizedQuery) ||
        handler.includes(normalizedQuery)
      );
    });
  }, [hooks, searchQuery]);

  // -- Open / close the editor ----------------------------------

  const openEditor = useCallback((hook: Hook, creating: boolean) => {
    handlerDraftsReference.current = { [hook.handler.type]: hook.handler };
    setMcpInputText(
      hook.handler.type === "mcp_tool" && hook.handler.input
        ? JSON.stringify(hook.handler.input, null, JSON_INDENT_SPACES)
        : "",
    );
    setMcpInputError(null);
    setSaveError(null);
    setEditingHook(hook);
    setIsNew(creating);
  }, []);

  const handleCreate = useCallback(() => {
    openEditor(
      {
        name: "",
        description: "",
        event: "PreToolUse",
        matcher: "",
        handler: createDefaultHandler("prompt"),
        agent: agent || "",
        enabled: true,
        async: false,
        timeoutMilliseconds: DEFAULT_TIMEOUT_MILLISECONDS,
      },
      true,
    );
  }, [agent, openEditor]);

  const handleEdit = useCallback(
    (hook: Hook) => {
      openEditor({ ...hook, handler: { ...hook.handler } }, false);
    },
    [openEditor],
  );

  const handleCancel = useCallback(() => {
    setEditingHook(null);
    setIsNew(false);
    setMcpInputError(null);
    handlerDraftsReference.current = {};
  }, []);

  // -- Field updates --------------------------------------------

  const updateEditingHook = useCallback((patch: Partial<Hook>) => {
    setEditingHook((previous: Hook | null) =>
      previous ? { ...previous, ...patch } : null,
    );
  }, []);

  const handleEventChange = useCallback((value: string) => {
    const nextEvent = value as HookEventName;
    setEditingHook((previous: Hook | null) => {
      if (!previous) return null;
      // Clear any matcher the user authored before switching to an event
      // that the server would reject it on — including a tool matcher moved
      // onto a field-matched event, where it would mean something else.
      const keepsMatcher = TOOL_MATCHER_EVENTS.includes(nextEvent)
        ? TOOL_MATCHER_EVENTS.includes(previous.event)
        : FIELD_MATCHER_HINTS[nextEvent] !== undefined &&
          FIELD_MATCHER_HINTS[nextEvent] === FIELD_MATCHER_HINTS[previous.event];
      return {
        ...previous,
        event: nextEvent,
        matcher: keepsMatcher ? previous.matcher : "",
      };
    });
  }, []);

  const handleHandlerTypeChange = useCallback(
    (value: string) => {
      if (!editingHook) return;
      const nextType = value as HookHandlerType;
      if (nextType === editingHook.handler.type) return;

      handlerDraftsReference.current[editingHook.handler.type] =
        editingHook.handler;
      const restoredHandler =
        handlerDraftsReference.current[nextType] ??
        createDefaultHandler(nextType);

      if (nextType === "mcp_tool") {
        setMcpInputText(
          restoredHandler.type === "mcp_tool" && restoredHandler.input
            ? JSON.stringify(restoredHandler.input, null, JSON_INDENT_SPACES)
            : "",
        );
        setMcpInputError(null);
      }
      setEditingHook({ ...editingHook, handler: restoredHandler });
    },
    [editingHook],
  );

  const updateHandler = useCallback((patch: Record<string, unknown>) => {
    setEditingHook((previous: Hook | null) =>
      previous
        ? {
            ...previous,
            handler: { ...previous.handler, ...patch } as HookHandlerConfig,
          }
        : null,
    );
  }, []);

  const handleMcpInputChange = useCallback(
    (value: string) => {
      setMcpInputText(value);
      if (!value.trim()) {
        setMcpInputError(null);
        updateHandler({ input: undefined });
        return;
      }
      try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setMcpInputError("Input must be a JSON object");
          return;
        }
        setMcpInputError(null);
        updateHandler({ input: parsed as Record<string, unknown> });
      } catch (error: unknown) {
        setMcpInputError(getErrorMessage(error));
      }
    },
    [updateHandler],
  );

  // -- Persist ---------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!editingHook) return;
    if (!editingHook.name?.trim()) return;
    if (!isHandlerComplete(editingHook.handler)) return;
    if (mcpInputError) return;

    setSaving(true);
    setSaveError(null);
    try {
      const usesMatcher = eventAcceptsMatcher(editingHook.event);
      const payload = {
        name: editingHook.name.trim(),
        description: editingHook.description || "",
        event: editingHook.event,
        matcher: usesMatcher ? editingHook.matcher?.trim() || "" : "",
        handler: editingHook.handler,
        agent: editingHook.agent?.trim() || null,
        enabled: editingHook.enabled ?? true,
        async: editingHook.async ?? false,
        timeoutMilliseconds:
          editingHook.timeoutMilliseconds || DEFAULT_TIMEOUT_MILLISECONDS,
      };

      if (isNew) {
        await PrismService.createHook(payload);
      } else {
        await PrismService.updateHook(resolveHookId(editingHook), payload);
      }

      setEditingHook(null);
      setIsNew(false);
      handlerDraftsReference.current = {};
      onHooksChange();
    } catch (error: unknown) {
      console.error("Failed to save hook:", error);
      setSaveError(saveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [editingHook, isNew, mcpInputError, onHooksChange]);

  const handleDelete = useCallback((id: string) => {
    setConfirmingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(
    async (id: string) => {
      try {
        await PrismService.deleteHook(id);
        setConfirmingDeleteId(null);
        onHooksChange();
      } catch (error: unknown) {
        console.error("Failed to delete hook:", error);
      }
    },
    [onHooksChange],
  );

  const handleToggleEnabled = useCallback(
    async (hook: Hook, enabled: boolean) => {
      try {
        await PrismService.updateHook(resolveHookId(hook), { enabled });
        onHooksChange();
      } catch (error: unknown) {
        console.error("Failed to toggle hook:", error);
      }
    },
    [onHooksChange],
  );

  // -- Test run --------------------------------------------------

  const handleTest = useCallback(async (hook: Hook) => {
    const hookId = resolveHookId(hook);
    if (!hookId) return;
    setTestingHookId(hookId);
    try {
      const result = await PrismService.testHook(hookId, samplePayloadFor(hook.event));
      setTestResults((previous: Record<string, HookTestResult>) => ({
        ...previous,
        [hookId]: result,
      }));
    } catch (error: unknown) {
      setTestResults((previous: Record<string, HookTestResult>) => ({
        ...previous,
        [hookId]: {
          decision: {},
          durationMilliseconds: 0,
          error: getErrorMessage(error),
        },
      }));
    } finally {
      setTestingHookId(null);
    }
  }, []);

  const dismissTestResult = useCallback((hookId: string) => {
    setTestResults((previous: Record<string, HookTestResult>) => {
      const next = { ...previous };
      delete next[hookId];
      return next;
    });
  }, []);

  // -- Header actions --------------------------------------------

  const handleToggleAll = useCallback(async () => {
    const allEnabled =
      hooks.length > 0 && hooks.every((hook: Hook) => hook.enabled);
    const newEnabled = !allEnabled;
    try {
      await Promise.all(
        hooks.map((hook: Hook) =>
          PrismService.updateHook(resolveHookId(hook), {
            enabled: newEnabled,
          }),
        ),
      );
      onHooksChange();
    } catch (error: unknown) {
      console.error("Failed to toggle all hooks:", error);
    }
  }, [hooks, onHooksChange]);

  useEffect(() => {
    if (readOnly) {
      onActionsChange?.(null);
      return;
    }
    onActionsChange?.(
      <>
        {hooks.length > 0 && (
          <ToggleComponent
            checked={hooks.length > 0 && hooks.every((hook: Hook) => hook.enabled)}
            onChange={handleToggleAll}
            size="mini"
          />
        )}
        <ButtonComponent variant="disabled" icon={Plus} onClick={handleCreate}>
          New
        </ButtonComponent>
      </>,
    );
  }, [onActionsChange, hooks, handleToggleAll, handleCreate, readOnly]);

  useEffect(() => {
    return () => onActionsChange?.(null);
  }, [onActionsChange]);

  // -- Edit / Create Form ---------------------------------------

  if (editingHook) {
    const supportsMatcher = eventAcceptsMatcher(editingHook.event);
    const matchesTools = TOOL_MATCHER_EVENTS.includes(editingHook.event);
    const canBlock = BLOCKING_EVENTS.includes(editingHook.event);
    const handler = editingHook.handler;
    const promptLength =
      handler.type === "prompt" || handler.type === "agent"
        ? handler.prompt?.length || 0
        : 0;
    const isOverPromptWarning = promptLength > PROMPT_WARN_CHARS;
    const isOverPromptMaximum = promptLength > PROMPT_MAX_CHARS;
    const canSave =
      !saving &&
      Boolean(editingHook.name?.trim()) &&
      isHandlerComplete(handler) &&
      !mcpInputError;

    return (
      <div className={styles["container"]}>
        <div className={styles["form-header"]}>
          <h3>{isNew ? "New Hook" : "Edit Hook"}</h3>
          <button
            className={styles["cancel-button"]}
            onClick={handleCancel}
            title="Close editor"
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles["form"]}>
          <div className={styles["form-group"]}>
            <label>Hook Name</label>
            <InputComponent
              type="text"
              value={editingHook.name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                updateEditingHook({
                  name: event.target.value
                    .replace(/[^a-zA-Z0-9_-]/g, "-")
                    .toLowerCase(),
                })
              }
              placeholder="block-rm-rf"
            />
            <span className={styles["hint"]}>
              kebab-case identifier — shown in run logs and test output
            </span>
          </div>

          <div className={styles["form-group"]}>
            <label>Description</label>
            <InputComponent
              type="text"
              value={editingHook.description || ""}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                updateEditingHook({ description: event.target.value })
              }
              placeholder="Deny destructive shell commands before they run"
            />
          </div>

          <div className={styles["form-group"]}>
            <label>Event</label>
            <SelectComponent
              value={editingHook.event}
              onChange={handleEventChange}
              options={HOOK_EVENT_NAMES.map((eventName: HookEventName) => ({
                value: eventName,
                label: eventName,
              }))}
            />
            <span
              className={`${styles["hint"]} ${canBlock ? styles["hint-blocking"] : ""}`}
            >
              {canBlock ? (
                <>
                  <Ban size={11} /> This event can <strong>block</strong>.{" "}
                  {EVENT_DESCRIPTIONS[editingHook.event]}
                </>
              ) : (
                <>
                  <Eye size={11} /> Observes or transforms — cannot block.{" "}
                  {EVENT_DESCRIPTIONS[editingHook.event]}
                </>
              )}
            </span>
          </div>

          <div className={styles["form-group"]}>
            <label>Matcher</label>
            <InputComponent
              type="text"
              value={editingHook.matcher || ""}
              disabled={!supportsMatcher}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                updateEditingHook({ matcher: event.target.value })
              }
              placeholder={
                matchesTools
                  ? "execute_shell(git *)"
                  : supportsMatcher
                    ? FIELD_MATCHER_HINTS[editingHook.event]?.split(" — ")[1]?.split(" | ")[0] ?? ""
                    : ""
              }
            />
            <span className={styles["hint"]}>
              {matchesTools ? (
                <>
                  Tool name, <code>A|B</code>, a regex, or{" "}
                  <code>Tool(argPattern)</code> — e.g.{" "}
                  <code>write_file(path=src/**)</code>. Blank fires on every
                  tool.
                </>
              ) : supportsMatcher ? (
                `Matches ${FIELD_MATCHER_HINTS[editingHook.event]}. Blank fires every time.`
              ) : (
                `${editingHook.event} has nothing to narrow — the server rejects a matcher on it, so this field is locked.`
              )}
            </span>
          </div>

          <div className={styles["form-group"]}>
            <label>Agent</label>
            <InputComponent
              type="text"
              value={editingHook.agent || ""}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                updateEditingHook({ agent: event.target.value })
              }
              placeholder="all agents"
            />
            <span className={styles["hint"]}>
              Leave blank to run this hook for every agent in the project.
            </span>
          </div>

          <div className={styles["form-group"]}>
            <label>Handler</label>
            <SegmentedControlComponent
              value={handler.type}
              onChange={handleHandlerTypeChange}
              fullWidth
              compact
              segments={(
                Object.keys(HANDLER_TYPE_LABELS) as HookHandlerType[]
              ).map((handlerType: HookHandlerType) => {
                const HandlerIcon = HANDLER_TYPE_ICONS[handlerType];
                return {
                  value: handlerType,
                  label: HANDLER_TYPE_LABELS[handlerType],
                  icon: <HandlerIcon size={HANDLER_SEGMENT_ICON_SIZE} />,
                };
              })}
            />
          </div>

          {/* -- Handler sub-form: prompt / agent ------------------- */}
          {(handler.type === "prompt" || handler.type === "agent") && (
            <div className={styles["handler-fields"]}>
              {handler.type === "agent" && (
                <span className={styles["hint"]}>
                  <strong>Experimental.</strong> A no-tools verifier: it sees
                  the event payload <em>and</em> the recent transcript, and
                  runs on the conversation&rsquo;s model unless you name one.
                </span>
              )}
              <div className={styles["form-group"]}>
                <label>Prompt</label>
                <TextAreaComponent
                  className={styles["content-textarea"]}
                  value={handler.prompt || ""}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
                    const value = event.target.value;
                    if (value.length <= PROMPT_MAX_CHARS) {
                      updateHandler({ prompt: value });
                    }
                  }}
                  placeholder={
                    "You are a safety reviewer. Given the tool call, reply with\n{ \"decision\": \"allow\" } or { \"decision\": \"deny\", \"reason\": \"…\" }."
                  }
                  autoResize={false}
                />
                <div
                  className={`${styles["character-counter"]} ${isOverPromptMaximum ? styles["character-counter-danger"] : isOverPromptWarning ? styles["character-counter-warning"] : ""}`}
                >
                  {promptLength.toLocaleString()} /{" "}
                  {PROMPT_MAX_CHARS.toLocaleString()} chars
                </div>
              </div>
              <div className={styles["field-grid"]}>
                <div className={styles["form-group"]}>
                  <label>Provider</label>
                  <InputComponent
                    type="text"
                    value={handler.provider || ""}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      updateHandler({ provider: event.target.value })
                    }
                    placeholder="default"
                  />
                </div>
                <div className={styles["form-group"]}>
                  <label>Model</label>
                  <InputComponent
                    type="text"
                    value={handler.model || ""}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      updateHandler({ model: event.target.value })
                    }
                    placeholder="default"
                  />
                </div>
              </div>
            </div>
          )}

          {/* -- Handler sub-form: http ----------------------------- */}
          {handler.type === "http" && (
            <div className={styles["handler-fields"]}>
              <div className={styles["form-group"]}>
                <label>URL</label>
                <InputComponent
                  type="text"
                  value={handler.url || ""}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    updateHandler({ url: event.target.value })
                  }
                  placeholder="https://example.com/prism-hook"
                />
                <span className={styles["hint"]}>
                  The event payload is POSTed here; the JSON response is the
                  decision.
                </span>
              </div>
              <div className={styles["form-group"]}>
                <label>Headers</label>
                <TextAreaComponent
                  className={styles["code-textarea"]}
                  value={Object.entries(handler.headers || {})
                    .map(([key, value]) => `${key}: ${value}`)
                    .join("\n")}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
                    const headers: Record<string, string> = {};
                    for (const line of event.target.value.split("\n")) {
                      const separatorIndex = line.indexOf(":");
                      if (separatorIndex <= 0) continue;
                      const key = line.slice(0, separatorIndex).trim();
                      const value = line.slice(separatorIndex + 1).trim();
                      if (key) headers[key] = value;
                    }
                    updateHandler({
                      headers: Object.keys(headers).length ? headers : undefined,
                    });
                  }}
                  placeholder={"Authorization: Bearer …\nX-Prism-Source: hook"}
                  minRows={3}
                  autoResize={false}
                />
                <span className={styles["hint"]}>
                  One <code>Name: value</code> per line.
                </span>
              </div>
            </div>
          )}

          {/* -- Handler sub-form: command -------------------------- */}
          {handler.type === "command" && (
            <div className={styles["handler-fields"]}>
              <div className={styles["form-group"]}>
                <label>Shell command</label>
                <InputComponent
                  type="text"
                  value={handler.command || ""}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    updateHandler({ command: event.target.value })
                  }
                  placeholder="./block-force-push.sh"
                />
                <span className={styles["hint"]}>
                  Runs in your hooks directory on tools-service with the event
                  JSON on stdin. Exit <code>2</code> blocks (stderr is the
                  reason); stdout JSON is read as the decision.
                </span>
              </div>
              <div className={styles["form-group"]}>
                <label>On timeout</label>
                <SelectComponent
                  value={handler.timeoutBehavior || "fail_open"}
                  onChange={(value: string) =>
                    updateHandler({ timeoutBehavior: value })
                  }
                  options={[
                    { value: "fail_open", label: "Fail open — no decision, the action proceeds" },
                    { value: "fail_closed", label: "Fail closed — a timeout blocks" },
                  ]}
                />
              </div>
              <span className={`${styles["hint"]} ${styles["hint-blocking"]}`}>
                <ShieldAlert size={11} /> Command hooks run with
                tools-service&rsquo;s privileges (there is no OS sandbox yet),
                so only owners listed in <code>PRISM_HOOK_COMMAND_OWNERS</code>{" "}
                can create or edit them.
              </span>
            </div>
          )}

          {/* -- Handler sub-form: mcp_tool ------------------------- */}
          {handler.type === "mcp_tool" && (
            <div className={styles["handler-fields"]}>
              <div className={styles["field-grid"]}>
                <div className={styles["form-group"]}>
                  <label>Server</label>
                  <InputComponent
                    type="text"
                    value={handler.server || ""}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      updateHandler({ server: event.target.value })
                    }
                    placeholder="filesystem"
                  />
                </div>
                <div className={styles["form-group"]}>
                  <label>Tool</label>
                  <InputComponent
                    type="text"
                    value={handler.tool || ""}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      updateHandler({ tool: event.target.value })
                    }
                    placeholder="check_policy"
                  />
                </div>
              </div>
              <div className={styles["form-group"]}>
                <label>Input (JSON)</label>
                <TextAreaComponent
                  className={styles["code-textarea"]}
                  value={mcpInputText}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                    handleMcpInputChange(event.target.value)
                  }
                  placeholder={'{\n  "strict": true\n}'}
                  minRows={4}
                  autoResize={false}
                />
                {mcpInputError ? (
                  <span className={styles["field-error"]}>
                    Invalid JSON — {mcpInputError}
                  </span>
                ) : (
                  <span className={styles["hint"]}>
                    Merged into the tool call alongside the event payload.
                    Leave blank for none.
                  </span>
                )}
              </div>
            </div>
          )}

          <div className={styles["form-group"]}>
            <label>Run in background</label>
            <div className={styles["toggle-field"]}>
              <ToggleComponent
                checked={editingHook.async ?? false}
                onChange={(checked: boolean) =>
                  updateEditingHook({ async: checked })
                }
                size="mini"
              />
              <span className={styles["hint"]}>
                {editingHook.async
                  ? "Async — never waits and cannot block or rewrite; its context reaches the model at the next boundary."
                  : "Sync — the loop waits for this hook's decision."}
              </span>
            </div>
          </div>

          <div className={styles["field-grid"]}>
            <div className={styles["form-group"]}>
              <label>Timeout (ms)</label>
              <InputComponent
                type="number"
                min={MINIMUM_TIMEOUT_MILLISECONDS}
                max={MAXIMUM_TIMEOUT_MILLISECONDS}
                step={100}
                value={String(
                  editingHook.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS,
                )}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  updateEditingHook({
                    timeoutMilliseconds: Number(event.target.value) || 0,
                  })
                }
              />
              <span className={styles["hint"]}>
                A hook that overruns is skipped, never blocking.
              </span>
            </div>
            <div className={styles["form-group"]}>
              <label>Enabled</label>
              <div className={styles["toggle-field"]}>
                <ToggleComponent
                  checked={editingHook.enabled ?? true}
                  onChange={(checked: boolean) =>
                    updateEditingHook({ enabled: checked })
                  }
                  size="mini"
                />
                <span className={styles["hint"]}>
                  {editingHook.enabled ?? true
                    ? "Runs on every matching event"
                    : "Saved but never runs"}
                </span>
              </div>
            </div>
          </div>

          {saveError && (
            <span className={styles["field-error"]} role="alert">
              {saveError}
            </span>
          )}

          <div className={styles["form-actions"]}>
            <button
              className={styles["save-button"]}
              onClick={handleSave}
              disabled={!canSave}
            >
              <Save size={14} />
              {saving ? "Saving..." : isNew ? "Create Hook" : "Save Changes"}
            </button>
            <button
              className={styles["cancel-form-button"]}
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -- List View ------------------------------------------------

  return (
    <div className={`hooks-panel-component ${styles["container"]}`}>
      {hooks.length > 0 && (
        <SearchInputComponent
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search hooks…"
          compact
        />
      )}

      {hooks.length === 0 && (
        <div className={styles["empty-state"]}>
          <div className={styles["empty-icon"]}>
            <Webhook size={24} />
          </div>
          <div className={styles["empty-title"]}>No hooks yet</div>
          <div className={styles["empty-subtitle"]}>
            A hook runs a prompt, an HTTP endpoint, an MCP tool, a shell
            command or a verifier agent at a lifecycle event. Only{" "}
            <strong>{BLOCKING_EVENTS.join(", ")}</strong> can block — every
            other event observes or transforms.
          </div>
          {!readOnly && (
            <ButtonComponent variant="disabled" icon={Plus} onClick={handleCreate}>
              Create your first hook
            </ButtonComponent>
          )}
        </div>
      )}

      {hooks.length > 0 && filteredHooks.length === 0 && (
        <div className={styles["empty-state"]}>
          <div className={styles["empty-title"]}>No matching hooks</div>
          <div className={styles["empty-subtitle"]}>
            Try adjusting your search query.
          </div>
        </div>
      )}

      {filteredHooks.length > 0 && (
        <div className={styles["list"]}>
          {filteredHooks.map((hook: Hook) => {
            const hookId = resolveHookId(hook);
            const isConfirming = confirmingDeleteId === hookId;
            const canBlock = BLOCKING_EVENTS.includes(hook.event);
            const HandlerIcon = HANDLER_TYPE_ICONS[hook.handler.type];
            const testResult = testResults[hookId];
            const isTesting = testingHookId === hookId;

            return (
              <div
                key={hookId}
                className={`${styles["hook-row"]} ${!hook.enabled ? styles["hook-row-disabled"] : ""}`}
              >
                <div className={styles["hook-leading-icon"]}>
                  <Webhook size={13} />
                </div>
                <div className={styles["hook-body"]}>
                  <div className={styles["hook-title-line"]}>
                    <span className={styles["hook-name"]}>{hook.name}</span>
                    {!readOnly && (
                      <>
                        <ToggleComponent
                          checked={hook.enabled ?? true}
                          onChange={(checked: boolean) =>
                            handleToggleEnabled(hook, checked)
                          }
                          size="mini"
                        />
                        <div className={styles["hook-actions"]}>
                          <button
                            className={styles["hook-action-button"]}
                            onClick={() => handleEdit(hook)}
                            title="Edit hook"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            className={`${styles["hook-action-button"]} ${styles["hook-delete-button"]}`}
                            onClick={() => handleDelete(hookId)}
                            title="Delete hook"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {hook.description && (
                    <div className={styles["hook-description"]}>
                      {hook.description}
                    </div>
                  )}

                  <div className={styles["hook-meta"]}>
                    <span
                      className={`${styles["hook-event-badge"]} ${canBlock ? styles["hook-event-badge-blocking"] : ""}`}
                      title={
                        canBlock
                          ? "This event can block the tool call or the prompt"
                          : "This event observes or transforms — it cannot block"
                      }
                    >
                      {canBlock ? <Ban size={10} /> : <Eye size={10} />}
                      {hook.event}
                    </span>
                    <span className={styles["hook-handler-chip"]}>
                      <HandlerIcon size={10} />
                      {HANDLER_TYPE_LABELS[hook.handler.type]}
                      <span className={styles["hook-handler-target"]}>
                        {describeHandler(hook.handler)}
                      </span>
                    </span>
                    {hook.matcher && (
                      <span className={styles["hook-matcher-chip"]}>
                        matcher: {hook.matcher}
                      </span>
                    )}
                    {hook.async && (
                      <span className={styles["hook-matcher-chip"]}>async</span>
                    )}
                    {hook.agent && (
                      <span className={styles["hook-agent-chip"]}>
                        {hook.agent}
                      </span>
                    )}
                    {!readOnly && (
                      <button
                        className={styles["hook-test-button"]}
                        onClick={() => handleTest(hook)}
                        disabled={isTesting || !hookId}
                        title="Dry-run this hook against a sample payload"
                      >
                        <Play size={10} />
                        {isTesting ? "Testing…" : "Test"}
                      </button>
                    )}
                  </div>

                  {testResult && (
                    <div
                      className={`${styles["test-result"]} ${testResult.error ? styles["test-result-error"] : ""}`}
                    >
                      <div className={styles["test-result-header"]}>
                        <span className={styles["test-result-title"]}>
                          {testResult.error ? "Test failed" : "Test decision"}
                        </span>
                        <span className={styles["test-result-duration"]}>
                          {testResult.durationMilliseconds.toLocaleString()} ms
                        </span>
                        <button
                          className={styles["test-result-dismiss"]}
                          onClick={() => dismissTestResult(hookId)}
                          title="Dismiss result"
                        >
                          <X size={11} />
                        </button>
                      </div>
                      {testResult.error && (
                        <div className={styles["test-result-message"]}>
                          {testResult.error}
                        </div>
                      )}
                      {!testResult.error &&
                        (testResult.decision as { _handlerFailed?: boolean } | null)
                          ?._handlerFailed && (
                          <div className={styles["test-result-message"]}>
                            The handler did not complete (
                            {String(
                              (testResult.decision as { _reason?: string })._reason ??
                                "unknown",
                            )}
                            ) — in a live turn this is no decision.
                          </div>
                        )}
                      <pre className={styles["test-result-json"]}>
                        {JSON.stringify(
                          testResult.decision ?? {},
                          null,
                          JSON_INDENT_SPACES,
                        )}
                      </pre>
                    </div>
                  )}

                  {isConfirming && (
                    <div className={styles["confirm-layout-row"]}>
                      <span className={styles["confirm-label"]}>
                        Delete &ldquo;{hook.name}&rdquo;?
                      </span>
                      <button
                        className={`${styles["confirm-button"]} ${styles["confirm-button-yes"]}`}
                        onClick={() => confirmDelete(hookId)}
                      >
                        Delete
                      </button>
                      <button
                        className={`${styles["confirm-button"]} ${styles["confirm-button-no"]}`}
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
