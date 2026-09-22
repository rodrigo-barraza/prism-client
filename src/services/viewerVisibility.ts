/**
 * Keep prism-service told whether this page is visible, on one live viewer
 * socket (`/ws/chat`). The service counts only VISIBLE viewers as someone
 * watching a conversation: a viewer in a background tab keeps streaming,
 * but a conversation that needs its user then gets a browser push instead
 * of going unnoticed. Sent on open and on every visibilitychange.
 *
 * Returns the function that stops reporting (call it when the socket is
 * closed for good).
 */
/** `WebSocket.OPEN` — spelled out so socket stand-ins need not carry it. */
const WEBSOCKET_OPEN = 1;

export function reportViewerVisibility(websocket: WebSocket): () => void {
  const report = () => {
    if (websocket.readyState !== WEBSOCKET_OPEN) return;
    websocket.send(
      JSON.stringify({ type: "visibility", hidden: document.visibilityState === "hidden" }),
    );
  };
  // Beside the caller's own `onopen`, which this must not replace.
  websocket.addEventListener?.("open", report);
  document.addEventListener("visibilitychange", report);
  return () => {
    websocket.removeEventListener?.("open", report);
    document.removeEventListener("visibilitychange", report);
  };
}
