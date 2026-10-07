/**
 * An EventSource for prism-service's streams, read with fetch() so the
 * request carries the signed-in user's token (prismFetch): the browser's
 * EventSource cannot set a header, and prism-service accepts nothing but
 * `Authorization: Bearer …` on HTTP.
 *
 * It keeps the surface SSEManager uses (`onmessage`, `onerror`, `close()`)
 * and EventSource's rules: `data:` lines make up one message, ended by a
 * blank line; `:` comments (the server's pings) are skipped; a stream that
 * drops — a network error, or the body ends — reconnects after `retry`
 * (3 s unless the server sends a `retry:` field); a request prism-service
 * refuses — an HTTP error, after prismFetch's one token renewal — closes
 * it for good.
 */

import { prismFetch } from "./prismFetch";
import { PrismSignInRequiredError } from "./prismTokenManager";

export const DEFAULT_RECONNECT_MILLISECONDS = 3_000;

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

/** A line ends at CR, LF or CRLF; a CR that ends the buffer may be half a CRLF. */
const LINE_END = /\r\n|\r|\n/;

export class PrismEventSource {
  readonly url: string;
  readyState: number = CONNECTING;
  onmessage: ((_event: MessageEvent) => void) | null = null;
  onerror: ((_event: Event) => void) | null = null;
  private readonly controller = new AbortController();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private reconnectMilliseconds = DEFAULT_RECONNECT_MILLISECONDS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
    void this.connect();
  }

  close(): void {
    this.readyState = CLOSED;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.controller.abort();
    this.reader?.cancel().catch(() => {});
    this.reader = null;
  }

  private async connect(): Promise<void> {
    let response: Response;
    try {
      response = await prismFetch(this.url, {
        headers: { Accept: "text/event-stream" },
        cache: "no-store",
        signal: this.controller.signal,
      });
    } catch (connectError: unknown) {
      // Signed out: there is nothing to reconnect to.
      if (connectError instanceof PrismSignInRequiredError) this.fail();
      else this.drop();
      return;
    }
    if (this.readyState === CLOSED) return;
    if (!response.ok || !response.body) {
      this.fail();
      return;
    }
    this.readyState = OPEN;
    try {
      await this.read(response.body);
    } catch {
      // Dropped mid-stream — or closed by its owner, which drop() ignores.
    }
    this.drop();
  }

  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    this.reader = reader;
    const decoder = new TextDecoder();
    let buffer = "";
    let dataLines: string[] = [];
    let eventType = "";

    const takeLine = (line: string) => {
      if (line === "") {
        if (
          this.readyState !== CLOSED &&
          dataLines.length > 0 &&
          (eventType === "" || eventType === "message")
        ) {
          this.onmessage?.(new MessageEvent("message", { data: dataLines.join("\n") }));
        }
        dataLines = [];
        eventType = "";
        return;
      }
      if (line.startsWith(":")) return;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      let value = separator === -1 ? "" : line.slice(separator + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") dataLines.push(value);
      else if (field === "event") eventType = value;
      else if (field === "retry" && /^\d+$/.test(value)) this.reconnectMilliseconds = Number(value);
    };

    while (this.readyState !== CLOSED) {
      const { done, value } = await reader.read();
      if (done || this.readyState === CLOSED) break;
      buffer += decoder.decode(value, { stream: true });
      let lineEnd = LINE_END.exec(buffer);
      while (lineEnd && !(lineEnd[0] === "\r" && lineEnd.index === buffer.length - 1)) {
        takeLine(buffer.slice(0, lineEnd.index));
        buffer = buffer.slice(lineEnd.index + lineEnd[0].length);
        lineEnd = LINE_END.exec(buffer);
      }
    }
    // A message without its closing blank line is incomplete: dropped, as
    // EventSource drops it.
  }

  /** The stream dropped: tell the owner, then reconnect after `retry`. */
  private drop(): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CONNECTING;
    this.onerror?.(new Event("error"));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.readyState !== CLOSED) void this.connect();
    }, this.reconnectMilliseconds);
  }

  /** Refused: closed for good. */
  private fail(): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.onerror?.(new Event("error"));
  }
}
