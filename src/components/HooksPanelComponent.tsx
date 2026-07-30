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
const MAXIMUM_TIMEOUT_MILLISECONDS = 600_000;
const JSON_INDENT_SPACES = 2;

/**
 * The only events the server accepts a `matcher` on — it filters which tool
 * fires the hook. Authoring a matcher on any other event is rejected server
 * side, so the field is locked rather than silently dropped.
 */
const MATCHER_CAPABLE_EVENTS: HookEventName[] = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
];

/** The only events whose decision can deny the thing that is about to happen. */
const BLOCKING_EVENTS: HookEventName[] = ["PreToolUse", "UserPromptSubmit"];

type HookHandlerType = HookHandlerConfig["type"];

const HANDLER_TYPE_LABELS: Record<HookHandlerType, string> = {
  prompt: "Prompt",
  http: "HTTP",
  mcp_tool: "MCP Tool",
};

const HANDLER_TYPE_ICONS: Record<HookHandlerType, typeof MessageSquare> = {
  prompt: MessageSquare,
  http: Globe,
  mcp_tool: Wrench,
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
  }
}

function resolveHookId(hook: Hook): string {
  return hook.id || hook._id?.toString() || "";
}

/**
 * HooksPanel — CRUD interface for lifecycle hooks.
 *
 * A hook binds a lifecycle event (SessionStart, PreToolUse, …) to a handler
 * that produces a decision: a model prompt, an HTTP endpoint, or an MCP tool.
 * Only `PreToolUse` and `UserPromptSubmit` decisions can *block*; every other
 * event observes or transforms what is already happening.
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
      // that the server would reject it on.
      const keepsMatcher = MATCHER_CAPABLE_EVENTS.includes(nextEvent);
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
    try {
      const usesMatcher = MATCHER_CAPABLE_EVENTS.includes(editingHook.event);
      const payload = {
        name: editingHook.name.trim(),
        description: editingHook.description || "",
        event: editingHook.event,
        matcher: usesMatcher ? editingHook.matcher?.trim() || "" : "",
        handler: editingHook.handler,
        agent: editingHook.agent?.trim() || null,
        enabled: editingHook.enabled ?? true,
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
      const result = await PrismService.testHook(hookId);
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
    const supportsMatcher = MATCHER_CAPABLE_EVENTS.includes(editingHook.event);
    const canBlock = BLOCKING_EVENTS.includes(editingHook.event);
    const handler = editingHook.handler;
    const promptLength =
      handler.type === "prompt" ? handler.prompt?.length || 0 : 0;
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
                  <Ban size={11} /> This event can <strong>block</strong> — a
                  deny decision stops the tool call or the prompt.
                </>
              ) : (
                <>
                  <Eye size={11} /> This event observes or transforms — its
                  decision cannot block.
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
              placeholder={supportsMatcher ? "Bash|Write|Edit" : ""}
            />
            <span className={styles["hint"]}>
              {supportsMatcher
                ? "Tool-name pattern — leave blank to fire on every tool."
                : `A matcher only applies to ${MATCHER_CAPABLE_EVENTS.join(", ")}. The server rejects one on ${editingHook.event}, so this field is locked.`}
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

          {/* -- Handler sub-form: prompt --------------------------- */}
          {handler.type === "prompt" && (
            <div className={styles["handler-fields"]}>
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
            A hook runs a prompt, an HTTP endpoint, or an MCP tool at a
            lifecycle event. Only <strong>PreToolUse</strong> and{" "}
            <strong>UserPromptSubmit</strong> can block — every other event
            observes or transforms.
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
