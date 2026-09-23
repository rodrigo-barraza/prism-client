"use client";

import { useState } from "react";
import { Plug } from "lucide-react";
import PrismService from "../services/PrismService";
import type { MCPPrompt, MCPResource } from "@/types/types";
import styles from "./McpComposerMenuItemsComponent.module.css";

/**
 * MCP entries in the composer's menus. They render inside the existing
 * dropdowns, so they take that dropdown's item class.
 */

/**
 * `/` menu: an MCP server's prompts. Choosing one fills it (asking for its
 * arguments first, when it has any) and puts the text in the composer to
 * read and send.
 */
export function McpPromptSlashItems({
  prompts,
  itemClassName,
  onInsert,
}: {
  prompts: MCPPrompt[];
  itemClassName: string;
  onInsert: (_text: string) => void;
}) {
  const [active, setActive] = useState<MCPPrompt | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fill = async (prompt: MCPPrompt, promptArguments: Record<string, string>) => {
    setLoading(true);
    setError(null);
    try {
      const { text } = await PrismService.getMCPPrompt(prompt.server, prompt.name, promptArguments);
      setActive(null);
      setValues({});
      onInsert(text);
    } catch {
      setError("Couldn't load that prompt.");
    } finally {
      setLoading(false);
    }
  };

  if (active) {
    const missing = active.arguments.some((argument) => argument.required && !values[argument.name]?.trim());
    const submit = () => {
      if (!missing && !loading) void fill(active, values);
    };
    // Not a <form>: this renders inside the composer's form, and a nested
    // form's submit button would send the chat message instead.
    return (
      <div
        className={styles['arguments']}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            submit();
          }
        }}
      >
        <div className={styles['arguments-title']}>
          /{active.server}:{active.name}
        </div>
        {active.arguments.map((argument) => (
          <label key={argument.name} className={styles['argument']}>
            <span>
              {argument.name}
              {argument.required && " *"}
            </span>
            <input
              value={values[argument.name] ?? ""}
              placeholder={argument.description ?? ""}
              onChange={(event) => setValues((previous) => ({ ...previous, [argument.name]: event.target.value }))}
            />
          </label>
        ))}
        {error && <div className={styles['error']}>{error}</div>}
        <div className={styles['actions']}>
          <button type="button" disabled={missing || loading} onClick={submit}>
            {loading ? "Loading…" : "Insert"}
          </button>
          <button type="button" onClick={() => setActive(null)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {prompts.map((prompt) => (
        <button
          key={`${prompt.server}:${prompt.name}`}
          type="button"
          className={itemClassName}
          onMouseDown={(event) => {
            event.preventDefault();
            if (prompt.arguments.length > 0) setActive(prompt);
            else void fill(prompt, {});
          }}
        >
          <Plug size={12} />
          <span className={styles['name']}>
            /{prompt.server}:{prompt.name}
          </span>
          {(prompt.title || prompt.description) && (
            <span className={styles['description']}>{prompt.title ?? prompt.description}</span>
          )}
        </button>
      ))}
      {error && <div className={styles['error']}>{error}</div>}
    </>
  );
}

/** `@` menu: an MCP server's resources. */
export function McpResourceMentionItems({
  resources,
  itemClassName,
  onPick,
}: {
  resources: MCPResource[];
  itemClassName: string;
  onPick: (_resource: MCPResource) => void;
}) {
  return (
    <>
      {resources.map((resource) => (
        <button
          key={`${resource.server}:${resource.uri}`}
          type="button"
          className={itemClassName}
          title={`${resource.server}: ${resource.uri}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(resource);
          }}
        >
          <Plug size={12} />
          <span className={styles['name']}>{resource.name}</span>
          <span className={styles['description']}>{resource.server}</span>
        </button>
      ))}
    </>
  );
}
