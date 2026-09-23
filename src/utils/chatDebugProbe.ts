/**
 * Test-only window into the agent chat's live state and row renders.
 *
 * The characterization suite (src/components/__tests__/chat-characterization)
 * replays recorded event transcripts through the real AgentChatComponent and
 * snapshots what the chat holds after each event, and counts how many
 * message rows re-render per streamed token. Both read through this module,
 * so the suite does not depend on how the component stores its state —
 * `useState` today, a reducer after the event-reducer refactor. Whatever
 * replaces the state must keep publishing the same `ChatDebugState`, and
 * whatever renders a message row must keep calling `noteMessageRowRender`.
 *
 * Nothing is installed outside tests: publishing is a null check.
 */

/** The chat's state as the characterization snapshots see it. */
export interface ChatDebugState {
  conversationId: string;
  activeId: string | null;
  title: string;
  isGenerating: boolean;
  isConversationRunning: boolean;
  liveConnectionState: string;
  messages: readonly unknown[];
  toolActivity: readonly unknown[];
  subAgentToolActivity: Record<string, unknown>;
  streamingOutputs: ReadonlyMap<string, string>;
  pendingApprovals: readonly unknown[];
  pendingUserQuestion: unknown;
  nonBlockingQuestions: readonly unknown[];
  planProposal: unknown;
  agenticProgress: unknown;
  contextBudget: unknown;
  goal: unknown;
  turnActivity: unknown;
  queuedTurns: readonly unknown[];
  conversations: readonly unknown[];
  generatingConversationIds: ReadonlySet<unknown>;
  toasts: readonly unknown[];
}

type StateListener = (_state: ChatDebugState) => void;
type RowRenderListener = (_message: unknown, _index: number) => void;

let stateListener: StateListener | null = null;
let rowRenderListener: RowRenderListener | null = null;

/** True while a test listens — lets the chat skip building the state object. */
export function isChatDebugProbeInstalled(): boolean {
  return stateListener !== null;
}

/** Receive the chat's state after every commit. Returns the uninstaller. */
export function installChatDebugProbe(listener: StateListener): () => void {
  stateListener = listener;
  return () => {
    if (stateListener === listener) stateListener = null;
  };
}

export function publishChatDebugState(state: ChatDebugState): void {
  stateListener?.(state);
}

/** Receive one call per message row render. Returns the uninstaller. */
export function installMessageRowRenderProbe(listener: RowRenderListener): () => void {
  rowRenderListener = listener;
  return () => {
    if (rowRenderListener === listener) rowRenderListener = null;
  };
}

export function noteMessageRowRender(message: unknown, index: number): void {
  rowRenderListener?.(message, index);
}
