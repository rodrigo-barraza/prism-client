"use client";

import { CustomTool, ToolSchema, CustomToolParameter } from "../types/types";
interface CustomToolFormState extends Omit<CustomTool, 'parameters'> {
  parameters?: (Omit<CustomToolParameter, 'enum'> & { enum?: string })[];
}
import { useState, useCallback, useRef } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Globe,
  Code2,
} from "lucide-react";
import PrismService from "../services/PrismService";
import {
  ButtonComponent,
  TextAreaComponent,
  ToggleComponent,
} from "@rodrigo-barraza/components-library";
import ToolSelectionComponent from "./ToolSelectionComponent";
import styles from "./CustomToolsPanelComponent.module.css";

const PARAM_TYPES = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "boolean", label: "Boolean" },
];

const EMPTY_PARAM = {
  name: "",
  type: "string",
  description: "",
  required: false,
  enum: "",
};

const EMPTY_TOOL = {
  name: "",
  description: "",
  code: "",
  parameters: [],
  enabled: true,
};

/**
 * Resolve domain:/label: shorthand entries into a flat Set of tool names.
 * Mirrors ToolSelectionComponent's internal resolveEnabledTools logic so the
 * consumer can correctly diff the enabled set after a group checkbox toggle.
 */
function resolveShorthands(entries: Iterable<string>, allTools: ToolSchema[]) {
  const resolved = new Set();
  for (const entry of entries) {
    if (entry.startsWith("label:")) {
      const label = entry.slice(6);
      for (const t of allTools) {
        if (t.labels?.includes(label)) resolved.add(t.name);
      }
    } else if (entry.startsWith("domain:")) {
      const domain = entry.slice(7);
      for (const t of allTools) {
        if (t.domain === domain) resolved.add(t.name);
      }
    } else {
      resolved.add(entry);
    }
  }
  return resolved;
}

export default function CustomToolsPanel({
  tools = [] as CustomTool[],
  onToolsChange,
  project,
  builtInTools = [] as ToolSchema[],
  disabledBuiltIns = new Set(),
  onToggleBuiltIn,
  onToggleAllBuiltIn,
  readOnly = false,
  lockedOffTools = new Set(),
  agent = true,
}: { 
  tools?: CustomTool[], 
  onToolsChange: () => void, 
  project?: string, 
  builtInTools?: ToolSchema[], 
  disabledBuiltIns?: Set<string>,
  onToggleBuiltIn?: (name: string) => void,
  onToggleAllBuiltIn?: (enableAll: boolean) => void,
  readOnly?: boolean,
  lockedOffTools?: Set<string>,
  agent?: boolean,
}) {
  const [editingTool, setEditingTool] = useState<any | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSubtab, setActiveSubtab] = useState<"tools" | "custom">("tools");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState("manual"); // "manual" | "json"
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSuccess, setJsonSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // -- CRUD -----------------------------------------------------

  const handleCreate = useCallback(() => {
    setEditingTool({ ...EMPTY_TOOL, parameters: [] });
    setIsNew(true);
    setInputMode("manual");
    setJsonText("");
    setJsonError(null);
    setJsonSuccess(null);
  }, []);

  const handleEdit = useCallback((tool: CustomTool | CustomToolFormState) => {
    setEditingTool({
      ...tool,
      parameters: (tool.parameters || []).map((p: CustomToolParameter | (Omit<CustomToolParameter, 'enum'> & { enum?: string })) => ({
        ...p,
        enum: Array.isArray(p.enum) ? p.enum.join(", ") : p.enum || "",
      })),
    });
    setIsNew(false);
    setInputMode("manual");
    setJsonText("");
    setJsonError(null);
    setJsonSuccess(null);
  }, []);

  const handleCancel = useCallback(() => {
    setEditingTool(null);
    setIsNew(false);
    setInputMode("manual");
    setJsonText("");
    setJsonError(null);
    setJsonSuccess(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingTool?.name || !editingTool?.code) return;
    setSaving(true);
    try {
      const payload = {
        ...editingTool,
        ...(project ? { project } : {}),
        parameters: (editingTool.parameters || [])
          .map((p: Omit<CustomToolParameter, 'enum'> & { enum?: string }) => ({
            name: p.name,
            type: p.type,
            description: p.description,
            required: p.required,
            ...(p.enum?.trim()
              ? {
                  enum: p.enum
                    .split(",")
                    .map((v: string) => v.trim())
                    .filter(Boolean),
                }
              : {}),
          }))
          .filter((p: any) => p.name.trim()),
      };

      if (isNew) {
        await PrismService.createCustomTool(payload);
      } else {
        await PrismService.updateCustomTool(
          (editingTool.id || editingTool._id || "").toString(),
          payload,
        );
      }

      setEditingTool(null);
      setIsNew(false);
      onToolsChange();
    } catch (error: unknown | Error) {
      console.error("Failed to save tool:", error);
    } finally {
      setSaving(false);
    }
  }, [editingTool, isNew, onToolsChange, project]);

  const handleDelete = useCallback((id: string) => {
    setConfirmingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(
    async (id: string) => {
      try {
        await PrismService.deleteCustomTool(id);
        setConfirmingDeleteId(null);
        onToolsChange();
      } catch (error: unknown | Error) {
        console.error("Failed to delete tool:", error);
      }
    },
    [onToolsChange],
  );

  const handleToggle = useCallback(
    async (tool: CustomTool | CustomToolFormState) => {
      try {
        await PrismService.updateCustomTool((tool.id || tool._id || "").toString(), {
          enabled: !tool.enabled,
        });
        onToolsChange();
      } catch (error: unknown | Error) {
        console.error("Failed to toggle tool:", error);
      }
    },
    [onToolsChange],
  );

  // -- Parameter management -------------------------------------

  const addParameter = useCallback(() => {
    setEditingTool((t: CustomToolFormState | null) => t ? ({
      ...t,
      parameters: [...(t?.parameters || []), { ...EMPTY_PARAM }] as (Omit<CustomToolParameter, "enum"> & { enum?: string })[],
    }) : null);
  }, []);

  const updateParameter = useCallback((index: number, field: string, value: string | boolean) => {
    setEditingTool((t: CustomToolFormState | null) => t ? ({
      ...t,
      parameters: (t?.parameters || []).map((p: Omit<CustomToolParameter, 'enum'> & { enum?: string }, i: number) =>
        i === index ? { ...p, [field]: value } : p,
      ),
    }) : null);
  }, []);

  const removeParameter = useCallback((index: number) => {
    setEditingTool((t: CustomToolFormState | null) => t ? ({
      ...t,
      parameters: (t?.parameters || []).filter((_: Omit<CustomToolParameter, 'enum'> & { enum?: string }, i: number) => i !== index),
    }) : null);
  }, []);

  // -- JSON import ----------------------------------------------

  /**
   * Parse a pasted/uploaded JSON in any of these OpenAI-compatible shapes:
   *  1. Full tool definition:  { type: "function", function: { name, description, parameters } }
   *  2. Function wrapper:      { name, description, parameters: { type: "object", properties } }
   *  3. Raw parameters object: { type: "object", properties: { ... } }
   *  4. Array of tools:        [ { type: "function", function: ... }, ... ]  (uses first)
   */
  const parseJsonDefinition = useCallback((raw: string) => {
    setJsonError(null);
    setJsonSuccess(null);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setJsonError("Invalid JSON — check syntax");
      return;
    }

    // Unwrap array → first element
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        setJsonError("Empty array — provide at least one tool definition");
        return;
      }
      parsed = parsed[0];
    }

    let name = "";
    let description = "";
    let parametersObj: Record<string, unknown> | null = null;

    // Shape 1: { type: "function", function: { ... } }
    if (parsed.type === "function" && parsed.function) {
      const parsedFunction = parsed.function;
      name = parsedFunction.name || "";
      description = parsedFunction.description || "";
      parametersObj = parsedFunction.parameters || null;
    }
    // Shape 2: { name, parameters: { type: "object", properties } }
    else if (parsed.name && parsed.parameters?.properties) {
      name = parsed.name;
      description = parsed.description || "";
      parametersObj = parsed.parameters;
    }
    // Shape 3: Raw parameters { type: "object", properties }
    else if (parsed.type === "object" && parsed.properties) {
      parametersObj = parsed;
    } else {
      setJsonError(
        'Unrecognized shape — expected an OpenAI tool definition, a {name, parameters} object, or a raw {type:"object", properties} schema',
      );
      return;
    }

    // Convert parametersObj → flat parameter list
    const params: any[] = [];
    if (parametersObj?.properties) {
      const required = (parametersObj.required as string[]) || [];
      for (const [pName, schema] of Object.entries(parametersObj.properties)) {
        params.push({
          name: pName,
          type: (schema as Record<string, string>).type || "string",
          description: (schema as Record<string, string>).description || "",
          required: required.includes(pName),
          enum: Array.isArray((schema as Record<string, unknown>).enum)
            ? (schema as Record<string, string[]>).enum.join(", ")
            : "",
        });
      }
    }

    setEditingTool((t: CustomToolFormState | null) => t ? ({
      ...t,
      ...(name
        ? { name: name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() }
        : {}),
      ...(description ? { description } : {}),
      parameters: params,
    }) : null);

    const parts = [];
    if (name) parts.push(name);
    if (description) parts.push(description);
    parts.push(`${params.length} parameter${params.length !== 1 ? "s" : ""}`);
    setJsonSuccess(`Imported ${parts.join(", ")}`);
  }, []);

  const handleJsonFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (readerEvent: ProgressEvent<FileReader>) => {
        const text = readerEvent.target?.result;
        if (typeof text === "string") {
          setJsonText(text);
          parseJsonDefinition(text);
        }
      };
      reader.readAsText(file);
      // Reset so re-uploading the same file triggers onChange
      e.target.value = "";
    },
    [parseJsonDefinition],
  );

  // -- Tool list ------------------------------------------------

  const enabledCustomCount = tools.filter((t: CustomTool) => t.enabled).length;
  const allCustomEnabled =
    tools.length > 0 && enabledCustomCount === tools.length;

  const handleToggleAllCustom = useCallback(async () => {
    const newEnabled = !allCustomEnabled;
    try {
      await Promise.all(
        tools.map((t: CustomTool) =>
          PrismService.updateCustomTool((t.id || t._id || "").toString(), {
            enabled: newEnabled,
          }),
        ),
      );
      onToolsChange();
    } catch (error: unknown | Error) {
      console.error("Failed to toggle all custom tools:", error);
    }
  }, [allCustomEnabled, tools, onToolsChange]);

  // -- Edit form ------------------------------------------------

  if (editingTool) {
    return (
      <div className={styles.container}>
        <div className={styles.formHeader}>
          <h3>{isNew ? "New Tool" : "Edit Tool"}</h3>
          <button className={styles.cancelButton} onClick={handleCancel}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.form}>
          <div className={styles.formGroup}>
            <label>Function Name</label>
            <input
              type="text"
              className={styles.input}
              value={editingTool.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                setEditingTool((t: CustomToolFormState | null) => t ? ({
                  ...t,
                  name: e.target.value
                    .replace(/[^a-zA-Z0-9_]/g, "_")
                    .toLowerCase(),
                }) : null)
              }
              placeholder="get_stock_price"
            />
            <span className={styles.hint}>
              snake_case — this is what the AI calls
            </span>
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <TextAreaComponent
              className={styles.textarea}
              value={editingTool.description}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                setEditingTool((t: CustomToolFormState | null) => t ? ({
                  ...t,
                  description: e.target.value,
                }) : null)
              }
              placeholder="Get current stock price for a given ticker symbol..."
              minRows={3}
              maxRows={8}
            />
            <span className={styles.hint}>
              Tell the AI when to use this tool
            </span>
          </div>

          <div className={styles.formGroup}>
            <label>Code</label>
            <TextAreaComponent
              className={`${styles.textarea} ${styles.codeTextarea}`}
              value={editingTool.code}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                setEditingTool((t: CustomToolFormState | null) => t ? ({ ...t, code: e.target.value }) : null)
              }
              placeholder={`// Tool arguments are available via the \`args\` object\nconst { message } = args;\nconsole.log(message);\n// The last expression becomes the return value\n({ logged: message, timestamp: new Date().toISOString() })`}
              minRows={6}
              maxRows={20}
              spellCheck={false}
            />
            <span className={styles.hint}>
              Sandboxed JavaScript — access args via <code>args</code> object.
              Last expression is returned.
            </span>
          </div>

          {/* Parameters */}
          <div className={styles.paramsSection}>
            <div className={styles.paramsSectionHeader}>
              <label>Parameters</label>
              <div className={styles.paramsModeToggle}>
                <button
                  className={`${styles.modeButton} ${inputMode === "manual" ? styles.modeBtnActive : ""}`}
                  onClick={() => setInputMode("manual")}
                >
                  Manual
                </button>
                <button
                  className={`${styles.modeButton} ${inputMode === "json" ? styles.modeBtnActive : ""}`}
                  onClick={() => setInputMode("json")}
                >
                  <FileText size={10} />
                  JSON
                </button>
              </div>
              {inputMode === "manual" && (
                <button className={styles.addParamButton} onClick={addParameter}>
                  <Plus size={12} /> Add
                </button>
              )}
            </div>

            {inputMode === "manual" && (
              <>
                {editingTool.parameters?.length === 0 && (
                  <div className={styles.paramsEmpty}>
                    No parameters — tool will be called without arguments.
                  </div>
                )}

                {editingTool.parameters?.map((param: any, i: any) => (
                  <div key={i} className={styles.paramCard}>
                    <div className={styles.paramCardHeader}>
                      <span className={styles.paramIndex}>#{i + 1}</span>
                      <button
                        className={styles.paramRemoveButton}
                        onClick={() => removeParameter(i)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className={styles.paramFields}>
                      <div className={styles.paramRow}>
                        <div className={styles.paramField}>
                          <label>Name</label>
                          <input
                            type="text"
                            className={styles.inputSmall}
                            value={param.name}
                            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                              updateParameter(i, "name", e.target.value)
                            }
                            placeholder="symbol"
                          />
                        </div>
                        <div
                          className={styles.paramField}
                          style={{ width: 100 }}
                        >
                          <label>Type</label>
                          <select
                            className={styles.selectSmall}
                            value={param.type}
                            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                              updateParameter(i, "type", e.target.value)
                            }
                          >
                            {PARAM_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.paramFieldToggle}>
                          <label>Req</label>
                          <ToggleComponent
                            checked={param.required}
                            onChange={(v: boolean) =>
                              updateParameter(i, "required", v)
                            }
                            size="mini"
                          />
                        </div>
                      </div>

                      <div className={styles.paramField}>
                        <label>Description</label>
                        <input
                          type="text"
                          className={styles.inputSmall}
                          value={param.description}
                          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                            updateParameter(i, "description", e.target.value)
                          }
                          placeholder="Stock ticker symbol (e.g. AAPL)"
                        />
                      </div>

                      <div className={styles.paramField}>
                        <label>
                          Enum values{" "}
                          <span className={styles.optional}>
                            (comma-separated, optional)
                          </span>
                        </label>
                        <input
                          type="text"
                          className={styles.inputSmall}
                          value={param.enum}
                          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                            updateParameter(i, "enum", e.target.value)
                          }
                          placeholder="1d, 5d, 1m, 3m, 1y"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {inputMode === "json" && (
              <div className={styles.jsonImportSection}>
                <div className={styles.jsonImportHint}>
                  Paste an OpenAI-style tool definition, a function schema, or a
                  raw parameters object. Name, description, and parameters will
                  be auto-populated.
                </div>
                <TextAreaComponent
                  className={`${styles.textarea} ${styles.jsonTextarea}`}
                  value={jsonText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
                    setJsonText(e.target.value);
                    setJsonError(null);
                    setJsonSuccess(null);
                  }}
                  placeholder={`{\n  "type": "function",\n  "function": {\n    "name": "get_weather",\n    "description": "Get current weather",\n    "parameters": {\n      "type": "object",\n      "properties": {\n        "location": {\n          "type": "string",\n          "description": "City name"\n        }\n      },\n      "required": ["location"]\n    }\n  }\n}`}
                  minRows={10}
                  maxRows={20}
                  autoResize={false}
                  spellCheck={false}
                />
                <div className={styles.jsonActions}>
                  <button
                    className={styles.jsonParseButton}
                    onClick={() => parseJsonDefinition(jsonText)}
                    disabled={!jsonText.trim()}
                  >
                    <CheckCircle size={12} />
                    Apply JSON
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={handleJsonFileUpload}
                  />
                  <button
                    className={styles.jsonUploadButton}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={12} />
                    Upload .json
                  </button>
                </div>
                {jsonError && (
                  <div className={styles.jsonFeedback} data-content-type="error">
                    <AlertCircle size={12} />
                    {jsonError}
                  </div>
                )}
                {jsonSuccess && (
                  <div className={styles.jsonFeedback} data-content-type="success">
                    <CheckCircle size={12} />
                    {jsonSuccess}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            className={styles.saveButton}
            onClick={handleSave}
            disabled={
              !editingTool.name || !editingTool.code || saving
            }
          >
            <Save size={14} />
            {saving ? "Saving..." : isNew ? "Create Tool" : "Save Changes"}
          </button>
        </div>
      </div>
    );
  }

  // -- Non-agent view: lightweight ToolSelectionComponent only --
  if (!agent) {
    const derivedEnabled = builtInTools
      .filter((t: ToolSchema) => !disabledBuiltIns.has(t.name))
      .map((t: ToolSchema) => t.name);

    return (
      <ToolSelectionComponent
        availableTools={builtInTools}
        enabledTools={derivedEnabled}
        onEnabledToolsChange={(newEnabled: string[]) => {
          const enabledSet = resolveShorthands(newEnabled, builtInTools);
          for (const tool of builtInTools) {
            const isDisabled = disabledBuiltIns.has(tool.name);
            const shouldBeEnabled = enabledSet.has(tool.name);
            if (isDisabled && shouldBeEnabled) onToggleBuiltIn?.(tool.name);
            else if (!isDisabled && !shouldBeEnabled)
              onToggleBuiltIn?.(tool.name);
          }
        }}
      />
    );
  }

  // -- Derive enabled tools from disabledBuiltIns for ToolSelectionComponent --
  const derivedEnabled = builtInTools
    .filter((t: any) => !disabledBuiltIns.has(t.name))
    .map((t: ToolSchema) => t.name);

  const handleSelectionChange = (newEnabled: string[]) => {
    const enabledSet = resolveShorthands(newEnabled, builtInTools);
    for (const tool of builtInTools) {
      const isDisabled = disabledBuiltIns.has(tool.name);
      const shouldBeEnabled = enabledSet.has(tool.name);
      if (isDisabled && shouldBeEnabled) onToggleBuiltIn?.(tool.name);
      else if (!isDisabled && !shouldBeEnabled) onToggleBuiltIn?.(tool.name);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles['subtab-toggle-container']}>
        <ButtonComponent
          variant={activeSubtab === "tools" ? "tonal" : "text"}
          size="small"
          onClick={() => setActiveSubtab("tools")}
          className={styles['subtab-toggle-button']}
        >
          Tools
        </ButtonComponent>
        <ButtonComponent
          variant={activeSubtab === "custom" ? "tonal" : "text"}
          size="small"
          onClick={() => setActiveSubtab("custom")}
          className={styles['subtab-toggle-button']}
        >
          Custom Tools
        </ButtonComponent>
      </div>

      {activeSubtab === "tools" && (
        <ToolSelectionComponent
          availableTools={builtInTools}
          enabledTools={derivedEnabled}
          onEnabledToolsChange={handleSelectionChange}
        />
      )}

      {activeSubtab === "custom" && (
        <>
          <div className={styles['subtab-actions-header']}>
            <span className={styles['subtab-title-text']}>
              Custom Tools ({enabledCustomCount}/{tools.length})
            </span>
            <div className={styles.sectionActions}>
              {tools.length > 0 && (
                <ToggleComponent
                  checked={allCustomEnabled}
                  onChange={() => handleToggleAllCustom()}
                  size="mini"
                />
              )}
              <ButtonComponent variant="primary" icon={Plus} onClick={handleCreate}>
                New Tool
              </ButtonComponent>
            </div>
          </div>

          {tools.length === 0 && (
            <div className={styles.emptyCustom}>
              Create a tool to run custom JavaScript.
            </div>
          )}

          {tools.map((tool: CustomTool | CustomToolFormState) => {
            const id = (tool.id || tool._id || "").toString();
            const isExpanded = expandedId === id;
            return (
              <div
                key={id}
                className={`${styles.toolCard} ${!tool.enabled ? styles.toolDisabled : ""}`}
                style={{ marginBottom: "8px" }}
              >
                <div
                  className={styles.toolCardHeader}
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                >
                  <button className={styles.expandButton}>
                    {isExpanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>
                  <div className={styles.toolCardInfo}>
                    <span className={styles.toolCardName}>{tool.name}</span>
                    <span className={styles.toolCardMeta}>
                      <span className={styles.methodBadge} data-http-method="JS">
                        JS
                      </span>
                      {tool.parameters && tool.parameters.length > 0 && (
                        <span>{tool.parameters.length} params</span>
                      )}
                    </span>
                  </div>
                  <div className={styles.toolCardActions}>
                    <ToggleComponent
                      checked={tool.enabled}
                      onChange={() => handleToggle(tool)}
                      size="mini"
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div className={styles.toolCardBody}>
                    <p className={styles.toolCardDesc}>
                      {tool.description || "No description"}
                    </p>
                    {tool.code && (
                      <div className={styles.toolCardEndpoint}>
                        <Code2 size={11} />
                        <code style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>
                          {tool.code.length > 120
                            ? tool.code.slice(0, 120) + "…"
                            : tool.code}
                        </code>
                      </div>
                    )}
                    {!tool.code && tool.endpoint && (
                      <div className={styles.toolCardEndpoint}>
                        <Globe size={11} />
                        <code>{tool.endpoint}</code>
                      </div>
                    )}
                    {tool.parameters && tool.parameters.length > 0 && (
                      <div className={styles.toolCardParams}>
                        {tool.parameters.map((p: any, i: number) => (
                          <div key={i} className={styles.toolCardParam}>
                            <code>{p.name}</code>
                            <span className={styles.paramType}>{p.type}</span>
                            {p.required && (
                              <span className={styles.paramRequired}>
                                required
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={styles.toolCardFooter}>
                      <ButtonComponent
                        variant="secondary"
                        icon={Edit3}
                        onClick={() => handleEdit(tool)}
                      >
                        Edit
                      </ButtonComponent>
                      {confirmingDeleteId === id ? (
                        <div className={styles.deleteConfirm}>
                          <span className={styles.deleteConfirmLabel}>
                            Delete?
                          </span>
                          <ButtonComponent
                            variant="destructive"
                            onClick={() => confirmDelete(id)}
                          >
                            Yes
                          </ButtonComponent>
                          <ButtonComponent
                            variant="secondary"
                            onClick={() => setConfirmingDeleteId(null)}
                          >
                            No
                          </ButtonComponent>
                        </div>
                      ) : (
                        <ButtonComponent
                          variant="destructive"
                          icon={Trash2}
                          onClick={() => handleDelete(id)}
                        >
                          Delete
                        </ButtonComponent>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
