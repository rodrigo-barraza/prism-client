import {
  PROTOCOL_VERSION,
  SYNTHESIS_EVENT_TYPES,
  isTurnEventType,
  validateTurnEvent,
  type SynthesisEvent,
  type TurnEvent,
} from "../types/protocol/events";
import type { StreamEvent } from "../types/types";

/**
 * The wire boundary of prism-service's event protocol
 * (prism-service/docs/protocol.md): every parsed frame of a turn stream
 * (SSE /agent, /chat; /ws/chat) or of the synthesis stream goes through
 * `parseStreamEvent` before anything dispatches it.
 *
 * - An unknown `type` is REJECTED: dropped and logged with console.error
 *   (once per type), so a server newer than this client is visible rather
 *   than silently half-working.
 * - A known type is passed on as its typed member. Unknown FIELDS are not
 *   an error (a compatible server change adds optional fields); outside
 *   production the event is also validated against its schema and any
 *   violation is logged with console.warn, so drift shows up in dev.
 * - `hello` announcing a newer protocol version logs a warning.
 */

/** Which stream a frame came from — each has its own event types. */
export type StreamProtocol = "turn" | "synthesis";

const SYNTHESIS_TYPES = new Set<string>(SYNTHESIS_EVENT_TYPES);
const reportedUnknownTypes = new Set<string>();
const reportedViolations = new Set<string>();
let reportedNewerVersion = false;

function isKnownType(protocol: StreamProtocol, type: string): boolean {
  switch (protocol) {
    case "turn":
      return isTurnEventType(type);
    case "synthesis":
      return SYNTHESIS_TYPES.has(type);
  }
}

function checkShape(event: TurnEvent): void {
  if (process.env.NODE_ENV === "production") return;
  const result = validateTurnEvent(event);
  if (result.success) return;
  const summary = result.error.issues
    .map((issue) => `${issue.path.join(".") || "(event)"}: ${issue.message}`)
    .join("; ");
  const key = `${event.type}|${summary}`;
  if (reportedViolations.has(key)) return;
  reportedViolations.add(key);
  console.warn(`[protocol] "${event.type}" event does not match protocol v${PROTOCOL_VERSION}: ${summary}`, event);
}

export function parseStreamEvent(_raw: unknown, _protocol: "turn"): TurnEvent | null;
export function parseStreamEvent(_raw: unknown, _protocol: "synthesis"): SynthesisEvent | null;
export function parseStreamEvent(_raw: unknown, _protocol: StreamProtocol): StreamEvent | null;
export function parseStreamEvent(raw: unknown, protocol: StreamProtocol): StreamEvent | null {
  const type = raw && typeof raw === "object" ? (raw as { type?: unknown }).type : undefined;
  if (typeof type !== "string") {
    console.error(`[protocol] dropped a frame with no event type`, raw);
    return null;
  }
  if (!isKnownType(protocol, type)) {
    const key = `${protocol}:${type}`;
    if (!reportedUnknownTypes.has(key)) {
      reportedUnknownTypes.add(key);
      console.error(
        `[protocol] dropped an event of unknown type "${type}" on the ${protocol} stream — ` +
          `this client speaks protocol v${PROTOCOL_VERSION}; the server may be newer`,
        raw,
      );
    }
    return null;
  }
  if (type === "hello") {
    const { protocolVersion } = raw as { protocolVersion?: unknown };
    if (typeof protocolVersion === "number" && protocolVersion > PROTOCOL_VERSION && !reportedNewerVersion) {
      reportedNewerVersion = true;
      console.warn(
        `[protocol] the server speaks protocol v${protocolVersion}; this client knows v${PROTOCOL_VERSION} — reload for the newest client`,
      );
    }
  }
  if (protocol === "turn") checkShape(raw as TurnEvent);
  return raw as StreamEvent;
}

/** A stream that multiplexes several models tags each forwarded event with the model that produced it. */
export function sourceModelOf(event: StreamEvent): string | undefined {
  const sourceModel = (event as { _sourceModel?: unknown })._sourceModel;
  return typeof sourceModel === "string" ? sourceModel : undefined;
}

/** Tests: forget which unknown types and violations were already reported. */
export function _resetProtocolReports(): void {
  reportedUnknownTypes.clear();
  reportedViolations.clear();
  reportedNewerVersion = false;
}
