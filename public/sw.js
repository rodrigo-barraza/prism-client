/**
 * Prism service worker — "needs you" notifications.
 *
 * Registered only when the user opts in (Settings → Notifications), as
 * `/sw.js?api=<prism-service origin>`. prism-service pushes when a
 * conversation waits on its user (an approval, a question) or its turn
 * ends, and nobody is watching it. This worker:
 *
 *   - push: shows the notification — unless a visible window already shows
 *     that conversation. A single-call approval gets Approve / Deny actions.
 *   - notificationclick: an action posts the decision to /agent/approve and
 *     reports the result in a follow-up notification; a click on the body
 *     focuses a window already on the conversation, or opens one.
 *
 * Notification actions are exactly as trusted as this browser profile.
 */

const API_BASE = (new URL(self.location.href).searchParams.get("api") || "").replace(/\/+$/, "");

const APPROVE_ACTION = "approve";
const DENY_ACTION = "deny";
const WAITING_KINDS = new Set(["approval_required", "question_asked"]);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** True when a window URL is showing the conversation. */
function showsConversation(windowUrl, conversationId) {
  try {
    const url = new URL(windowUrl);
    return (
      url.searchParams.get("conversation") === conversationId ||
      url.pathname.endsWith(`/chat/${conversationId}`)
    );
  } catch {
    return false;
  }
}

async function windowClients() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

function readPayload(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    return null;
  }
}

async function handlePush(event) {
  const payload = readPayload(event);
  if (!payload || !payload.conversationId) return;

  // Someone is looking at it right now — the page shows the card itself.
  const windows = await windowClients();
  const isWatched = windows.some(
    (client) =>
      client.visibilityState === "visible" &&
      showsConversation(client.url, payload.conversationId),
  );
  if (isWatched) return;

  const canDecide = payload.kind === "approval_required" && Boolean(payload.toolCallId);
  await self.registration.showNotification(payload.title || "Prism", {
    body: payload.body || "",
    tag: payload.tag || `prism:${payload.conversationId}`,
    renotify: true,
    requireInteraction: WAITING_KINDS.has(payload.kind),
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    timestamp: payload.timestamp ? Date.parse(payload.timestamp) : Date.now(),
    data: payload,
    actions: canDecide
      ? [
          { action: APPROVE_ACTION, title: "Approve" },
          { action: DENY_ACTION, title: "Deny" },
        ]
      : [],
  });
}

/** Post the decision for the one pending call, then say how it went. */
async function decide(payload, action) {
  const isAllow = action === APPROVE_ACTION;
  const identity = payload.identity || {};
  let failure = null;
  try {
    const response = await fetch(`${API_BASE}/agent/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(identity.username ? { "x-username": identity.username } : {}),
        ...(identity.project ? { "x-project": identity.project } : {}),
        ...(identity.profileId ? { "x-profile-id": identity.profileId } : {}),
      },
      body: JSON.stringify({
        conversationId: payload.conversationId,
        toolCallId: payload.toolCallId,
        decision: isAllow ? "allow" : "deny",
        // Services before per-call approvals read only this strict boolean.
        approved: isAllow,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      failure = body.error || `The service answered ${response.status}.`;
    }
  } catch (error) {
    failure = error && error.message ? error.message : "The service could not be reached.";
  }

  await self.registration.showNotification(
    failure ? "Approval not sent" : isAllow ? "Approved" : "Denied",
    {
      body:
        failure ||
        (isAllow ? "The agent carries on with the call." : "The agent was told you declined the call."),
      tag: payload.tag || `prism:${payload.conversationId}`,
      renotify: Boolean(failure),
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      data: { ...payload, kind: "decision_result", toolCallId: undefined },
    },
  );
}

/** Focus a window already on the conversation; otherwise open one. */
async function openConversation(payload) {
  const target = new URL(
    payload.url || `/chat?conversation=${encodeURIComponent(payload.conversationId || "")}`,
    self.location.origin,
  ).href;
  const windows = await windowClients();
  const existing = windows.find((client) =>
    showsConversation(client.url, payload.conversationId),
  );
  if (existing) return existing.focus();
  return self.clients.openWindow(target);
}

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

self.addEventListener("notificationclick", (event) => {
  const payload = event.notification.data || {};
  event.notification.close();
  if (
    (event.action === APPROVE_ACTION || event.action === DENY_ACTION) &&
    payload.toolCallId
  ) {
    event.waitUntil(decide(payload, event.action));
    return;
  }
  event.waitUntil(openConversation(payload));
});
