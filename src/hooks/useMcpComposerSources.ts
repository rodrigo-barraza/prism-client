"use client";

import { useCallback, useRef, useState } from "react";
import PrismService from "../services/PrismService";
import type { MCPPrompt, MCPResource } from "@/types/types";

/** How long a loaded list is reused before the next menu opening refreshes it. */
const FRESH_MILLISECONDS = 30_000;

/**
 * The connected MCP servers' prompts and resources, for the composer's `/`
 * and `@` menus. Loaded when a menu first opens, then refreshed at most
 * every 30 seconds; a failure leaves the menus with what they had.
 */
export function useMcpComposerSources() {
  const [prompts, setPrompts] = useState<MCPPrompt[]>([]);
  const [resources, setResources] = useState<MCPResource[]>([]);
  const loadedAt = useRef({ prompts: 0, resources: 0 });

  const ensurePrompts = useCallback(() => {
    if (Date.now() - loadedAt.current.prompts < FRESH_MILLISECONDS) return;
    loadedAt.current.prompts = Date.now();
    PrismService.getMCPPrompts()
      .then(setPrompts)
      .catch(() => {
        loadedAt.current.prompts = 0;
      });
  }, []);

  const ensureResources = useCallback(() => {
    if (Date.now() - loadedAt.current.resources < FRESH_MILLISECONDS) return;
    loadedAt.current.resources = Date.now();
    PrismService.getMCPResources()
      .then(setResources)
      .catch(() => {
        loadedAt.current.resources = 0;
      });
  }, []);

  return { prompts, resources, ensurePrompts, ensureResources };
}
