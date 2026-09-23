/**
 * A change the page's URL mirrors — the conversation on screen, the model,
 * the sidebar tabs, the view mode, the agent. The page applies it with its
 * router (`/chat`); a page that keeps no chat state in its URL passes none.
 */
export type ChatUrlChange =
  | { kind: "conversation"; conversationId: string | null }
  | { kind: "model"; provider: string; model: string }
  | { kind: "tab"; tab: string }
  | { kind: "tabBottom"; tabBottom: string }
  | { kind: "viewMode"; viewMode: string }
  | { kind: "agent"; agentId: string };

export type ReportUrlChange = (_change: ChatUrlChange) => void;
