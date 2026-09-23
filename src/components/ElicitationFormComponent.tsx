"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { ButtonComponent } from "@rodrigo-barraza/components-library";
import type { McpElicitationField, McpElicitationRequest } from "@/types/types";
import styles from "./ElicitationFormComponent.module.css";

/**
 * The body of a question card when an MCP server asks for input mid-call.
 *
 * A form request is rendered from the server's (flat) JSON schema: text,
 * number, checkbox, a select for an enum, checkboxes for a multi-select. A
 * URL request shows the address before the link, because the server chose
 * it. Every answer is one of accept (with the values), decline, or cancel.
 */

export interface ElicitationAnswer {
  answer: "accept" | "decline" | "cancel";
  content?: Record<string, string | number | boolean | string[]>;
}

type FieldValue = string | boolean | string[];

function choicesOf(field: McpElicitationField): Array<{ value: string; label: string }> | null {
  if (field.enum) {
    return field.enum.map((value, index) => ({ value, label: field.enumNames?.[index] ?? value }));
  }
  if (field.oneOf) return field.oneOf.map((option) => ({ value: option.const, label: option.title ?? option.const }));
  return null;
}

function itemChoicesOf(field: McpElicitationField): Array<{ value: string; label: string }> {
  if (field.items?.enum) return field.items.enum.map((value) => ({ value, label: value }));
  return (field.items?.anyOf ?? []).map((option) => ({ value: option.const, label: option.title ?? option.const }));
}

function initialValue(field: McpElicitationField): FieldValue {
  if (field.type === "boolean") return field.default === true;
  if (field.type === "array") return Array.isArray(field.default) ? (field.default as string[]) : [];
  return field.default === undefined || field.default === null ? "" : String(field.default);
}

function inputTypeOf(field: McpElicitationField): string {
  if (field.type === "number" || field.type === "integer") return "number";
  if (field.format === "email") return "email";
  if (field.format === "uri") return "url";
  if (field.format === "date") return "date";
  return "text";
}

/** Check and convert the form's values; the server validates them again. */
export function collectElicitationContent(
  request: McpElicitationRequest,
  values: Record<string, FieldValue>,
): { content: Record<string, string | number | boolean | string[]> } | { error: string } {
  const properties = request.requestedSchema?.properties ?? {};
  const required = new Set(request.requestedSchema?.required ?? []);
  const content: Record<string, string | number | boolean | string[]> = {};
  for (const [name, field] of Object.entries(properties)) {
    const label = field.title ?? name;
    const value = values[name];
    if (field.type === "boolean") {
      content[name] = value === true;
      continue;
    }
    if (field.type === "array") {
      const list = Array.isArray(value) ? value : [];
      if (list.length === 0 && required.has(name)) return { error: `Choose at least one ${label}.` };
      if (list.length > 0) content[name] = list;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      if (required.has(name)) return { error: `${label} is required.` };
      continue;
    }
    if (field.type === "number" || field.type === "integer") {
      const number = Number(text);
      if (!Number.isFinite(number) || (field.type === "integer" && !Number.isInteger(number))) {
        return { error: `${label} must be ${field.type === "integer" ? "a whole number" : "a number"}.` };
      }
      if (field.minimum !== undefined && number < field.minimum) return { error: `${label} must be at least ${field.minimum}.` };
      if (field.maximum !== undefined && number > field.maximum) return { error: `${label} must be at most ${field.maximum}.` };
      content[name] = number;
      continue;
    }
    if (field.minLength !== undefined && text.length < field.minLength) {
      return { error: `${label} needs at least ${field.minLength} characters.` };
    }
    content[name] = text;
  }
  return { content };
}

function safeUrl(url: string | undefined): URL | null {
  try {
    const parsed = new URL(url ?? "");
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}

export default function ElicitationFormComponent({
  request,
  message,
  isPending,
  onAnswer,
}: {
  request: McpElicitationRequest;
  message: string;
  isPending: boolean;
  onAnswer?: (_answer: ElicitationAnswer) => void;
}) {
  const properties = useMemo(() => request.requestedSchema?.properties ?? {}, [request]);
  const required = useMemo(() => new Set(request.requestedSchema?.required ?? []), [request]);
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    Object.fromEntries(Object.entries(properties).map(([name, field]) => [name, initialValue(field)])),
  );
  const [error, setError] = useState<string | null>(null);

  const setValue = (name: string, value: FieldValue) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setError(null);
  };

  if (request.mode === "url") {
    const url = safeUrl(request.url);
    return (
      <div className={styles['elicitation']}>
        <p className={styles['message']}>{message}</p>
        {url ? (
          <a className={styles['url-link']} href={url.href} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={12} />
            <span className={styles['url-host']}>{url.host}</span>
            <span className={styles['url-path']}>{url.pathname}</span>
          </a>
        ) : (
          <p className={styles['error']}>The server sent a link that isn&apos;t a web address.</p>
        )}
        {isPending && (
          <div className={styles['actions']}>
            <ButtonComponent variant="primary" size="small" onClick={() => onAnswer?.({ answer: "accept" })}>
              Done
            </ButtonComponent>
            <ButtonComponent variant="secondary" size="small" onClick={() => onAnswer?.({ answer: "decline" })}>
              Decline
            </ButtonComponent>
          </div>
        )}
      </div>
    );
  }

  const submit = () => {
    const collected = collectElicitationContent(request, values);
    if ("error" in collected) {
      setError(collected.error);
      return;
    }
    onAnswer?.({ answer: "accept", content: collected.content });
  };

  // Not a <form>: a card can render inside another form, where a nested
  // form's submit would reach the outer one.
  return (
    <div
      className={styles['elicitation']}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type !== "checkbox") {
          event.preventDefault();
          event.stopPropagation();
          if (isPending) submit();
        }
      }}
    >
      <p className={styles['message']}>{message}</p>
      {Object.entries(properties).map(([name, field]) => {
        const id = `elicitation-${name}`;
        const label = (
          <>
            {field.title ?? name}
            {required.has(name) && <span className={styles['required']}> *</span>}
          </>
        );
        const choices = choicesOf(field);
        const value = values[name];
        let control;
        if (field.type === "boolean") {
          control = (
            <input
              id={id}
              type="checkbox"
              checked={value === true}
              disabled={!isPending}
              onChange={(event) => setValue(name, event.target.checked)}
            />
          );
        } else if (field.type === "array") {
          const selected = Array.isArray(value) ? value : [];
          control = (
            <div className={styles['choices']} role="group" aria-labelledby={`${id}-label`}>
              {itemChoicesOf(field).map((choice) => (
                <label key={choice.value} className={styles['choice']}>
                  <input
                    type="checkbox"
                    checked={selected.includes(choice.value)}
                    disabled={!isPending}
                    onChange={(event) =>
                      setValue(
                        name,
                        event.target.checked
                          ? [...selected, choice.value]
                          : selected.filter((entry) => entry !== choice.value),
                      )
                    }
                  />
                  {choice.label}
                </label>
              ))}
            </div>
          );
        } else if (choices) {
          control = (
            <select
              id={id}
              className={styles['input']}
              value={typeof value === "string" ? value : ""}
              disabled={!isPending}
              onChange={(event) => setValue(name, event.target.value)}
            >
              <option value="">Choose…</option>
              {choices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          );
        } else {
          control = (
            <input
              id={id}
              className={styles['input']}
              type={inputTypeOf(field)}
              value={typeof value === "string" ? value : ""}
              disabled={!isPending}
              min={field.minimum}
              max={field.maximum}
              step={field.type === "integer" ? 1 : undefined}
              maxLength={field.maxLength}
              onChange={(event) => setValue(name, event.target.value)}
            />
          );
        }
        return (
          <div key={name} className={styles['field']}>
            {field.type === "boolean" ? (
              // A checkbox sits beside its label, not stretched under it.
              <label htmlFor={id} className={styles['choice']}>
                {control}
                <span className={styles['label']}>{label}</span>
              </label>
            ) : (
              <>
                <label id={`${id}-label`} htmlFor={id} className={styles['label']}>
                  {label}
                </label>
                {control}
              </>
            )}
            {field.description && <span className={styles['hint']}>{field.description}</span>}
          </div>
        );
      })}
      {error && <p className={styles['error']}>{error}</p>}
      {isPending && (
        <div className={styles['actions']}>
          <ButtonComponent variant="primary" size="small" onClick={submit}>
            Submit
          </ButtonComponent>
          <ButtonComponent variant="secondary" size="small" onClick={() => onAnswer?.({ answer: "decline" })}>
            Decline
          </ButtonComponent>
          <ButtonComponent variant="disabled" size="small" onClick={() => onAnswer?.({ answer: "cancel" })}>
            Cancel
          </ButtonComponent>
        </div>
      )}
    </div>
  );
}
