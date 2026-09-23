/**
 * SSEManager — Singleton multiplexer for Server-Sent Events.
 *
 * Browsers enforce a ~6 connection limit per origin under HTTP/1.1.
 * EventSource connections are persistent and count against this limit.
 * Opening multiple EventSource instances to the same URL quickly exhausts
 * the budget, causing all subsequent fetch() calls to queue as "pending".
 *
 * This manager maintains ONE shared EventSource per unique URL and fans out
 * messages to all registered listeners. When the last listener unsubscribes,
 * the underlying connection is closed.
 *
 * A stream's `{ type: "status" }` message (e.g. /admin/changes/stream saying
 * whether change streams exist) is sent once per connection, so it is kept
 * and replayed to a listener that joins an open connection — otherwise that
 * listener never learns it must fall back to polling.
 */

type SSEListener = (_data: unknown) => void;

interface PoolEntry {
  eventSource: EventSource;
  listeners: Set<SSEListener>;
  lastStatus?: unknown;
}

function isStatusMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "status"
  );
}

const pools = new Map<string, PoolEntry>();

/**
 * Subscribe to an SSE endpoint. Returns an unsubscribe function.
 */
export function subscribe(
  url: string,
  onMessage: SSEListener,
): { unsubscribe: () => void } {
  let entry = pools.get(url);

  if (!entry) {
    const eventSource = new EventSource(url);

    entry = { eventSource, listeners: new Set() };
    pools.set(url, entry);

    eventSource.onmessage = (event: MessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // ignore parse errors
      }
      if (isStatusMessage(data)) entry!.lastStatus = data;
      // Fan out to all listeners (copy the set to avoid mutation during iteration)
      for (const listener of entry!.listeners) {
        try {
          listener(data);
        } catch {
          /* listener errors shouldn't break the pool */
        }
      }
    };

    eventSource.onerror = () => {
      // EventSource auto-reconnects; nothing extra needed here.
    };
  }

  entry.listeners.add(onMessage);
  const { lastStatus } = entry;
  if (lastStatus !== undefined) {
    const joined = entry;
    queueMicrotask(() => {
      if (!joined.listeners.has(onMessage)) return;
      try {
        onMessage(lastStatus);
      } catch {
        /* listener errors shouldn't break the pool */
      }
    });
  }

  return {
    unsubscribe() {
      const existingPool = pools.get(url);
      if (!existingPool) return;
      existingPool.listeners.delete(onMessage);
      if (existingPool.listeners.size === 0) {
        existingPool.eventSource.close();
        pools.delete(url);
      }
    },
  };
}

const SSEManager = { subscribe };

export default SSEManager;
