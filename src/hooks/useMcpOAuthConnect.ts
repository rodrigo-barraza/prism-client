"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PrismService from "../services/PrismService";

/**
 * The OAuth "Connect" flow for an MCP server.
 *
 * Connecting a server that has no tokens yet returns an authorization URL.
 * It opens in a popup; the authorization server sends the browser back to
 * prism-service's callback, which finishes the connect and posts a message
 * to this window. The message is only a nudge — the state shown is always
 * the server's (`GET /mcp-servers/:id/oauth`), polled every two seconds in
 * case the message never arrives, and until the popup is closed.
 */

export type McpOAuthFlowState =
  | { status: "authorizing" }
  | { status: "connected" }
  | { status: "failed"; message: string };

const POLL_MILLISECONDS = 2000;

export function useMcpOAuthConnect(onChange: () => void) {
  const [flows, setFlows] = useState<Record<string, McpOAuthFlowState>>({});
  const popups = useRef(new Map<string, Window | null>());
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const settle = useCallback((serverId: string, state: McpOAuthFlowState) => {
    popups.current.delete(serverId);
    setFlows((previous) => ({ ...previous, [serverId]: state }));
    onChangeRef.current();
  }, []);

  const check = useCallback(
    async (serverId: string) => {
      if (!popups.current.has(serverId)) return;
      try {
        const status = await PrismService.getMCPServerOAuth(serverId);
        if (status.authorized && status.connected) {
          settle(serverId, { status: "connected" });
        } else if (status.status === "failed") {
          settle(serverId, { status: "failed", message: status.error || "Authorization failed." });
        } else if (popups.current.get(serverId)?.closed) {
          settle(serverId, { status: "failed", message: "The authorization window was closed." });
        }
      } catch {
        /* keep polling */
      }
    },
    [settle],
  );

  const start = useCallback((serverId: string, authorizationUrl: string) => {
    const popup = window.open(authorizationUrl, `prism-mcp-oauth-${serverId}`, "popup,width=520,height=720");
    popups.current.set(serverId, popup);
    setFlows((previous) => ({ ...previous, [serverId]: { status: "authorizing" } }));
  }, []);

  const dismiss = useCallback((serverId: string) => {
    popups.current.delete(serverId);
    setFlows((previous) => {
      const next = { ...previous };
      delete next[serverId];
      return next;
    });
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; serverId?: string } | null;
      if (data?.type === "prism-mcp-oauth" && typeof data.serverId === "string") {
        void check(data.serverId);
      }
    };
    window.addEventListener("message", onMessage);
    const timer = window.setInterval(() => {
      for (const serverId of popups.current.keys()) void check(serverId);
    }, POLL_MILLISECONDS);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(timer);
    };
  }, [check]);

  return { flows, start, dismiss };
}
