/**
 * public/sw.js — the push and notificationclick handlers, run against a
 * fake service-worker scope (`self.registration`, `self.clients`) and a
 * mocked fetch. The worker file itself is evaluated, not a copy of it.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const WORKER_SOURCE = readFileSync(path.resolve(__dirname, "../../../public/sw.js"), "utf8");
const WORKER_URL = "https://prism.test/sw.js?api=https%3A%2F%2Fapi.prism.test%2F";

interface FakeWindowClient {
  url: string;
  visibilityState: "visible" | "hidden";
  focus: ReturnType<typeof vi.fn>;
}

type Listener = (_event: Record<string, unknown>) => void;

function loadWorker({
  windows = [],
  fetchImplementation = vi.fn(),
}: {
  windows?: FakeWindowClient[];
  fetchImplementation?: ReturnType<typeof vi.fn>;
} = {}) {
  const listeners: Record<string, Listener> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(null);
  const matchAll = vi.fn().mockResolvedValue(windows);
  const scope = {
    location: new URL(WORKER_URL),
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
    registration: { showNotification },
    clients: { matchAll, openWindow, claim: vi.fn().mockResolvedValue(undefined) },
    skipWaiting: vi.fn(),
  };
  new Function("self", "fetch", WORKER_SOURCE)(scope, fetchImplementation);

  /** Dispatch an ExtendableEvent and wait for everything it waitUntil'd. */
  async function dispatch(type: string, event: Record<string, unknown>) {
    const pending: Promise<unknown>[] = [];
    listeners[type]({ ...event, waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
    await Promise.all(pending);
  }

  return { dispatch, showNotification, openWindow, matchAll, fetch: fetchImplementation };
}

function pushEvent(payload: Record<string, unknown>) {
  return { data: { json: () => payload } };
}

function windowClient(url: string, visibilityState: "visible" | "hidden" = "visible"): FakeWindowClient {
  return { url, visibilityState, focus: vi.fn().mockResolvedValue(undefined) };
}

const SINGLE_APPROVAL = {
  kind: "approval_required",
  conversationId: "c-1",
  title: "Approval needed · Refactor the parser",
  body: "write_file is waiting for your approval.",
  url: "/chat?agent=CODING&conversation=c-1",
  tag: "prism:c-1",
  toolCallId: "call-1",
  approvalCount: 1,
  identity: { username: "rodrigo", project: "prism-chat", profileId: "default" },
  timestamp: "2026-09-22T12:00:00.000Z",
};

function notificationClick(action: string, data: Record<string, unknown>) {
  return { action, notification: { data, close: vi.fn() } };
}

describe("sw.js — push", () => {
  it("shows the notification with Approve / Deny for a single-call approval", async () => {
    const worker = loadWorker();
    await worker.dispatch("push", pushEvent(SINGLE_APPROVAL));

    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = worker.showNotification.mock.calls[0];
    expect(title).toBe(SINGLE_APPROVAL.title);
    expect(options).toMatchObject({
      body: SINGLE_APPROVAL.body,
      tag: "prism:c-1",
      requireInteraction: true,
      data: SINGLE_APPROVAL,
      actions: [
        { action: "approve", title: "Approve" },
        { action: "deny", title: "Deny" },
      ],
    });
  });

  it("offers no actions for a multi-call batch (no toolCallId) or a finished turn", async () => {
    const worker = loadWorker();
    const { toolCallId: _dropped, ...batch } = SINGLE_APPROVAL;
    await worker.dispatch("push", pushEvent({ ...batch, approvalCount: 3 }));
    await worker.dispatch(
      "push",
      pushEvent({ kind: "turn_completed", conversationId: "c-2", title: "Done · x", body: "…" }),
    );
    expect(worker.showNotification.mock.calls[0][1].actions).toEqual([]);
    expect(worker.showNotification.mock.calls[1][1]).toMatchObject({
      actions: [],
      requireInteraction: false,
    });
  });

  it("stays silent while a visible window shows the conversation", async () => {
    const worker = loadWorker({
      windows: [windowClient("https://prism.test/chat?agent=CODING&conversation=c-1")],
    });
    await worker.dispatch("push", pushEvent(SINGLE_APPROVAL));
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it("notifies when that window is in the background, or shows another conversation", async () => {
    const worker = loadWorker({
      windows: [
        windowClient("https://prism.test/chat?conversation=c-1", "hidden"),
        windowClient("https://prism.test/chat?conversation=other", "visible"),
      ],
    });
    await worker.dispatch("push", pushEvent(SINGLE_APPROVAL));
    expect(worker.showNotification).toHaveBeenCalledTimes(1);
  });

  it("ignores a push without a readable payload", async () => {
    const worker = loadWorker();
    await worker.dispatch("push", { data: { json: () => { throw new SyntaxError("bad"); } } });
    await worker.dispatch("push", { data: null });
    expect(worker.showNotification).not.toHaveBeenCalled();
  });
});

describe("sw.js — notificationclick", () => {
  it("Approve posts the call's decision to /agent/approve with the owner's identity, then reports it", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const worker = loadWorker({ fetchImplementation });
    const click = notificationClick("approve", SINGLE_APPROVAL);
    await worker.dispatch("notificationclick", click);

    expect(click.notification.close).toHaveBeenCalled();
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe("https://api.prism.test/agent/approve");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "x-username": "rodrigo",
      "x-project": "prism-chat",
      "x-profile-id": "default",
    });
    expect(JSON.parse(init.body)).toEqual({
      conversationId: "c-1",
      toolCallId: "call-1",
      decision: "allow",
      approved: true,
    });

    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = worker.showNotification.mock.calls[0];
    expect(title).toBe("Approved");
    expect(options.tag).toBe("prism:c-1");
    expect(options.data.toolCallId).toBeUndefined();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("Deny posts decision deny / approved false, and a refused POST says so", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "No pending approval for this conversation" }), {
          status: 404,
        }),
      );
    const worker = loadWorker({ fetchImplementation });
    await worker.dispatch("notificationclick", notificationClick("deny", SINGLE_APPROVAL));

    expect(JSON.parse(fetchImplementation.mock.calls[0][1].body)).toMatchObject({
      decision: "deny",
      approved: false,
    });
    const [title, options] = worker.showNotification.mock.calls[0];
    expect(title).toBe("Approval not sent");
    expect(options.body).toBe("No pending approval for this conversation");
  });

  it("an unreachable service is reported, not thrown", async () => {
    const worker = loadWorker({
      fetchImplementation: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    });
    await worker.dispatch("notificationclick", notificationClick("approve", SINGLE_APPROVAL));
    expect(worker.showNotification.mock.calls[0][0]).toBe("Approval not sent");
    expect(worker.showNotification.mock.calls[0][1].body).toBe("Failed to fetch");
  });

  it("a click focuses a window already on the conversation instead of opening a new one", async () => {
    const onConversation = windowClient("https://prism.test/chat?agent=CODING&conversation=c-1", "hidden");
    const elsewhere = windowClient("https://prism.test/settings");
    const worker = loadWorker({ windows: [elsewhere, onConversation] });
    await worker.dispatch("notificationclick", notificationClick("", SINGLE_APPROVAL));

    expect(onConversation.focus).toHaveBeenCalledTimes(1);
    expect(elsewhere.focus).not.toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it("opens the conversation's deep link when no window shows it", async () => {
    const worker = loadWorker({ windows: [windowClient("https://prism.test/settings")] });
    await worker.dispatch("notificationclick", notificationClick("", SINGLE_APPROVAL));
    expect(worker.openWindow).toHaveBeenCalledWith(
      "https://prism.test/chat?agent=CODING&conversation=c-1",
    );
  });

  it("an action on a notification without a call (a batch) just opens the conversation", async () => {
    const worker = loadWorker();
    const { toolCallId: _dropped, ...batch } = SINGLE_APPROVAL;
    await worker.dispatch("notificationclick", notificationClick("approve", batch));
    expect(worker.fetch).not.toHaveBeenCalled();
    expect(worker.openWindow).toHaveBeenCalledTimes(1);
  });
});
