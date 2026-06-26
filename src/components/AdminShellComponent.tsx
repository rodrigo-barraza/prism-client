"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  POLL_SLOW,
  POLL_STANDARD,
  POLL_FAST,
} from "@rodrigo-barraza/utilities-library";
import IrisService from "../services/IrisService";

import NavigationSidebarComponent from "./NavigationSidebarComponent";
import { LayoutHeaderComponent } from "@rodrigo-barraza/components-library";
import { resolvePageIcon } from "../utils/PageIconMap";
import {
  AdminHeaderProvider,
  useAdminHeader,
} from "./AdminHeaderContextComponent";
import styles from "./AdminShellComponent.module.css";

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const [newCount, setNewCount] = useState(0);
  const [newTracesCount, setNewTracesCount] = useState(0);
  const [newRequestsCount, setNewRequestsCount] = useState(0);
  const [newMediaCount, setNewMediaCount] = useState(0);
  const [newTextCount, setNewTextCount] = useState(0);
  const [generatingCount, setGeneratingCount] = useState(0);
  const [systemStatus, setSystemStatus] = useState("connected");
  const pathname = usePathname();
  const router = useRouter();

  // Track conversations by ID → messageCount to detect both new convos and updates
  const knownConvsRef = useRef<Map<string, number> | null>(null);
  const knownSessionsRef = useRef<Set<string> | null>(null);
  const knownRequestsRef = useRef<Set<string> | null>(null);
  const knownMediaRef = useRef<number | null>(null);
  const knownTextRef = useRef<number | null>(null);
  const isOnConversationsRef = useRef<boolean>(
    pathname.startsWith("/admin/chat"),
  );
  const isOnSessionsRef = useRef<boolean>(pathname.startsWith("/admin/traces"));
  const isOnRequestsRef = useRef<boolean>(
    pathname.startsWith("/admin/requests"),
  );
  const isOnMediaRef = useRef<boolean>(pathname.startsWith("/admin/media"));
  const isOnTextRef = useRef<boolean>(pathname.startsWith("/admin/text"));

  // Keep refs in sync with pathname
  useEffect(() => {
    const onConvs = pathname.startsWith("/admin/chat");
    const onSessions = pathname.startsWith("/admin/traces");
    const onRequests = pathname.startsWith("/admin/requests");
    const onMedia = pathname.startsWith("/admin/media");
    const onText = pathname.startsWith("/admin/text");
    isOnConversationsRef.current = onConvs;
    isOnSessionsRef.current = onSessions;
    isOnRequestsRef.current = onRequests;
    isOnMediaRef.current = onMedia;
    isOnTextRef.current = onText;
    if (onConvs) setNewCount(0);
    if (onSessions) setNewTracesCount(0);
    if (onRequests) setNewRequestsCount(0);
    if (onMedia) setNewMediaCount(0);
    if (onText) setNewTextCount(0);
  }, [pathname]);

  // SSE subscription for real-time generatingCount across all projects
  // Minimum visual duration: keep the rainbow animation alive for at least 3s
  // so it's visible (Change Streams push transitions faster than old polling).
  const generatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const es = IrisService.subscribeConversationStats((raw) => {
      const data = raw as { generatingCount?: number };
      const count = data.generatingCount || 0;
      if (count > 0) {
        // Clear any pending "stop generating" timer
        if (generatingTimerRef.current) {
          clearTimeout(generatingTimerRef.current);
          generatingTimerRef.current = null;
        }
        setGeneratingCount(count);
      } else {
        // Delay clearing to give the animation time to ramp up
        if (!generatingTimerRef.current) {
          generatingTimerRef.current = setTimeout(() => {
            setGeneratingCount(0);
            generatingTimerRef.current = null;
          }, POLL_FAST);
        }
      }
    });
    return () => {
      es.close();
      if (generatingTimerRef.current) clearTimeout(generatingTimerRef.current);
    };
  }, []);

  // -- Change Stream SSE: detect new conversations in real time ----
  // Falls back to polling if Change Streams aren't available.
  useEffect(() => {
    let tracesAbortController: AbortController | null = null;
    let requestsAbortController: AbortController | null = null;

    async function fetchSessions() {
      if (tracesAbortController) tracesAbortController.abort();
      tracesAbortController = new AbortController();
      try {
        const data = await IrisService.getTraces({ page: 1, limit: 50 }, tracesAbortController.signal);
        const list = data.data || [];
        const currentIds = new Set(
          list.map(
            (state) => (state as { id?: string }).id || (state as { _id: string })._id,
          ),
        );

        if (knownSessionsRef.current === null) {
          knownSessionsRef.current = currentIds;
        } else if (!isOnSessionsRef.current) {
          let newOnes = 0;
          for (const id of currentIds) {
            if (!knownSessionsRef.current.has(id as string)) newOnes++;
          }
          if (newOnes > 0) setNewTracesCount((previousCount) => previousCount + newOnes);
          knownSessionsRef.current = currentIds;
        } else {
          knownSessionsRef.current = currentIds;
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    async function fetchConversations() {
      try {
        const data = await IrisService.getConversations({
          page: 1,
          limit: 50,
          sort: "updatedAt",
          order: "desc",
        });
        const list = data.data || [];
        const currentMap = new Map();
        for (const conversation of list) {
          currentMap.set(conversation.id, conversation.messages?.length || conversation.messageCount || 0);
        }

        if (knownConvsRef.current === null) {
          knownConvsRef.current = currentMap;
        } else if (!isOnConversationsRef.current) {
          let changes = 0;
          for (const [id, messageCount] of currentMap) {
            const known = knownConvsRef.current.get(id);
            if (known === undefined) {
              changes++;
            } else if (messageCount > known) {
              changes++;
            }
          }
          if (changes > 0) {
            setNewCount((previousCount) => previousCount + changes);
          }
          knownConvsRef.current = currentMap;
        } else {
          knownConvsRef.current = currentMap;
        }
      } catch {
        // ignore
      }
    }

    async function fetchHealth() {
      try {
        const health = await IrisService.getHealth();
        setSystemStatus(health.mongo || "connected");
      } catch {
        setSystemStatus("disconnected");
      }
    }

    async function fetchRequests() {
      if (requestsAbortController) requestsAbortController.abort();
      requestsAbortController = new AbortController();
      try {
        const data = await IrisService.getRequests({
          limit: 50,
          sort: "timestamp",
          order: "desc",
        }, requestsAbortController.signal);
        const list = data.data || [];
        const currentIds = new Set(list.map((response) => response.requestId || response._id));

        if (knownRequestsRef.current === null) {
          knownRequestsRef.current = currentIds;
        } else if (!isOnRequestsRef.current) {
          let newOnes = 0;
          for (const id of currentIds) {
            if (!knownRequestsRef.current.has(id as string)) newOnes++;
          }
          if (newOnes > 0) setNewRequestsCount((previousCount) => previousCount + newOnes);
          knownRequestsRef.current = currentIds;
        } else {
          knownRequestsRef.current = currentIds;
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    async function fetchMedia() {
      try {
        const data = await IrisService.getMedia({ limit: 1 });
        const total = data.total || 0;

        if (knownMediaRef.current === null) {
          knownMediaRef.current = total;
        } else if (!isOnMediaRef.current && total > knownMediaRef.current) {
          setNewMediaCount(
            (previousCount) => previousCount + (total - (knownMediaRef.current ?? 0)),
          );
          knownMediaRef.current = total;
        } else {
          knownMediaRef.current = total;
        }
      } catch {
        // ignore
      }
    }

    async function fetchText() {
      try {
        const data = await IrisService.getText({ limit: 1 });
        const total = data.total || 0;

        if (knownTextRef.current === null) {
          knownTextRef.current = total;
        } else if (!isOnTextRef.current && total > knownTextRef.current) {
          setNewTextCount(
            (previousCount) => previousCount + (total - (knownTextRef.current ?? 0)),
          );
          knownTextRef.current = total;
        } else {
          knownTextRef.current = total;
        }
      } catch {
        // ignore
      }
    }

    // Initial loads
    fetchConversations();
    fetchSessions();
    fetchRequests();
    fetchMedia();
    fetchText();
    fetchHealth();

    // Health check on a long interval (doesn't need real-time)
    const healthInterval = setInterval(fetchHealth, POLL_SLOW);

    // Subscribe to change stream SSE
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const es = IrisService.subscribeCollectionChanges({
      onStatus: (data) => {
        if (!data.changeStreams) {
          // No Change Streams — fall back to polling
          if (!pollInterval) {
            pollInterval = setInterval(fetchConversations, POLL_STANDARD);
          }
        }
      },
      onChange: (event) => {
        if (event.collection === "conversations") {
          fetchConversations();
          fetchMedia();
          fetchText();
        }
        if (event.collection === "requests") {
          fetchRequests();
          fetchSessions(); // traces are derived from requests
        }
      },
    });

    return () => {
      es.close();
      clearInterval(healthInterval);
      if (pollInterval) clearInterval(pollInterval);
      if (tracesAbortController) tracesAbortController.abort();
      if (requestsAbortController) requestsAbortController.abort();
    };
  }, []);

  const handleNavClick = useCallback((href: string) => {
    if (href.startsWith("/admin/chat")) setNewCount(0);
    if (href.startsWith("/admin/traces")) setNewTracesCount(0);
    if (href.startsWith("/admin/requests")) setNewRequestsCount(0);
    if (href.startsWith("/admin/media")) setNewMediaCount(0);
    if (href.startsWith("/admin/text")) setNewTextCount(0);
  }, []);

  const {
    controls,
    titleBadge,
    traceFilter,
    setTraceFilter,
  } = useAdminHeader();

  const hasTraceFilter = !!traceFilter;

  const handleClearTrace = useCallback(() => {
    setTraceFilter(null);
    router.push("/admin/chat");
  }, [setTraceFilter, router]);

  // Derive page title from pathname (first segment only)
  const pageTitle = (() => {
    const segment = pathname.replace("/admin", "").replace(/^\//, "");
    if (!segment) return "Dashboard";
    const first = segment.split("/")[0];
    // Convert "tool-requests" -> "Tool Requests"
    return first
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  })();

  const resolvedTitleIcon = resolvePageIcon(pageTitle);

  return (
    <div className={`admin-shell-component ${styles['shell']}`}>
      <NavigationSidebarComponent
        mode="admin"
        liveCount={newCount}
        tracesCount={newTracesCount}
        requestsCount={newRequestsCount}
        mediaCount={newMediaCount}
        textCount={newTextCount}
        systemStatus={systemStatus}
        isGenerating={generatingCount > 0}
        onNavClick={handleNavClick}
      />
      <div className={styles['main-area']}>
        <LayoutHeaderComponent
          title={pageTitle}
          titleIcon={resolvedTitleIcon ?? undefined}
          controls={controls}
        >
          {hasTraceFilter && (
            <button
              type="button"
              className={styles['trace-badge']}
              onClick={handleClearTrace}
              title="Clear trace filter and show all conversations"
            >
              <span className={styles['trace-badge-label']}>Trace</span>
              <span className={styles['trace-badge-id']}>
                {(traceFilter as string).slice(0, 8)}
              </span>
              <X size={12} className={styles['trace-badge-x']} />
            </button>
          )}
        </LayoutHeaderComponent>
        <div
          className={`${styles['main']} ${
            pathname.startsWith("/admin/chat") ||
            pathname.startsWith("/admin/workflows") ||
            pathname.startsWith("/admin/tools")
              ? styles['no-scroll']
              : ""
          } ${pathname.startsWith("/admin/tools") || pathname.startsWith("/admin/chat") ? styles["no-padding"] : ""}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminHeaderProvider>
      <AdminShellInner>{children}</AdminShellInner>
    </AdminHeaderProvider>
  );
}
