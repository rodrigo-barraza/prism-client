# Prism Client — Agentic Harness Improvement Plan

Date: 2026-07-13
Scope: the main agentic flow in prism-client (`ChatConversationComponent` → `PrismService._streamSSE` → SSE callbacks → tool/sub-agent state → render), plus business logic that should migrate to prism-service.
Constraint: every phase is independently shippable and must not break current functionality. Client and service deploy independently (`npm run deploy` each), so all protocol changes are **additive-first**: server emits old + new shapes during transition, client switches, old shape removed last.

---

## Current architecture (as verified)

```
User send
  └─ handleSend (ChatConversationComponent.tsx:5255)
       └─ runOrchestrationLoop (:3605)                 ← builds /chat or /agent payload (two divergent literals)
            └─ PrismService.streamAgentText (PrismService.tsx:1561)
                 └─ _streamSSE (:1252)                 ← fetch + ReadableStream, "data: " line filter
                      └─ _dispatchSSE (:1342)          ← switch on type → ~35 optional callbacks
                           └─ 20+ inline callbacks in runOrchestrationLoop (:3752–5201)
                                ├─ setMessages / setToolActivity / setSubAgentToolActivity / …
                                └─ toolCallStateUpdaters.ts (pure, tested reducers)
       └─ attemptPostStreamRefresh (:5450)             ← polls DB, races backend appendMessages
Parallel pipeline: sub-agent WebSocket effect (:6713–6957) — re-implements the same callbacks with drift.
```

Verified strengths worth preserving:
- Shared event taxonomy in `@rodrigo-barraza/utilities-library/taxonomy/events.ts` consumed by both sides.
- Pure, unit-tested reducers in `toolCallStateUpdaters.ts` (change-detection, placeholder messages for out-of-order events).
- Data-driven tool renderer registry with safe `GenericRenderer` fallback (`ToolResultRenderers/index.tsx`).
- Single-source phase visuals (`statusBarPhaseTokens.ts`).
- `WorkflowExecutor.tsx` is already a thin client — the target shape for everything else.
- SSE dispatch mapping, SSEManager, toolCallStateUpdaters, agentConversationStates all have solid tests.

Headline problems:
1. `ChatConversationComponent.tsx` is 8,993 lines with ~95 `useState` / ~44 `useRef`, no reducer, admin mode interleaved (~580 lines), and two parallel streaming pipelines.
2. The SSE layer is a non-spec-compliant line filter with no validation, no heartbeat, no timeout, no reconnect/resume, silent drops of unknown events, and trailing-buffer loss.
3. Six classes of business logic live client-side that the server should own (rule injection, title derivation, tool policy, payload defaults, state ladder mirror, post-stream persistence race).
4. Type safety collapses at the wire boundary: callbacks receive an `[key: string]: unknown` bag; 32 `as any` in the component, concentrated exactly where contract drift happens (`durationMs` vs `durationMilliseconds` is live drift today).

---

## Phase 0 — Safety net (do first, ~1–2 days)

Nothing else lands without this. Inspired by harness "golden transcript" replay testing.

0.1 **Record golden SSE transcripts.** Add a dev-only tap in `_streamSSE` (behind `localStorage.PRISM_RECORD_SSE`) that appends every raw parsed event to an in-memory log downloadable as JSONL. Capture 4–6 real turns: plain chat, agent turn with tools, sub-agent orchestration, approval pause, ask-user pause, task-notification turn, error turn.
   Store under `src/__fixtures__/sse-transcripts/*.jsonl`.

0.2 **Replay harness test.** A test utility `replayTranscript(events, callbacks)` that pushes fixture events through `_dispatchSSE` and (later) the reducer. Assert final message shape, tool call attachment, sub-agent map. These become the regression net for every later phase.

0.3 **Frame-level tests for `_streamSSE`** (currently untested, PrismService.tsx:1252–1335): partial line across chunks, multi-byte UTF-8 split, event split mid-JSON, trailing unterminated buffer, stream close without `done`, HTTP error body, abort mid-stream. Use a scripted `ReadableStream`.

0.4 **Contract exhaustiveness test.** Iterate `Object.values(SERVER_SENT_EVENT_TYPES)` and assert each has a `_dispatchSSE` case (or an explicit allowlist of intentionally unhandled types). This converts silent `default: break` drops into test failures. Today it would immediately flag `TEXT` and `TOKEN`.

Exit criteria: `npm run test && npm run typecheck` green; fixtures replay deterministically.

---

## Phase 1 — Wire protocol hardening (transport, ~3–5 days)

Target file: extract `_streamSSE`/`_dispatchSSE` into `src/services/streaming/agentStream.ts` (PrismService keeps delegating — no import churn).

1.1 **Spec-compliant SSE framing.** Accumulate records on `\n\n` (tolerate `\r\n`), concatenate multi-line `data:` fields, parse `event:`/`id:`/`retry:` fields, skip `:` comment lines *explicitly* (they become the heartbeat channel in 1.3). Flush the trailing buffer on reader-done so a final unterminated event is not lost (currently discarded at :1282–1286).

1.2 **Terminal-state guarantee.** If the reader completes without a `done` event, synthesize `onStreamClosed({ reason: "eof-without-done" })` (new callback; adapter maps it to `onError` initially). If aborted, invoke `onAborted()` instead of silently swallowing (AbortError currently vanishes at :1325). Consumers must never hang waiting for `onDone` — this is the root cause of several "stuck generating" states.

1.3 **Heartbeat + watchdog.**
   - Server: `SseUtilities.ts` emits a `: ping` comment frame every 15s (cheap, spec-standard; TCP keep-alive at :193 does not detect half-open connections).
   - Client: watchdog timer resets on any byte; if no bytes for 60s, abort + surface `onStreamClosed({ reason: "stalled" })`. `await reader.read()` can currently hang forever.

1.4 **Event validation + normalization at the boundary.** One `normalizeEvent(raw): AgentStreamEvent | null` function (zod or hand-rolled guards):
   - Normalizes `durationMilliseconds` → `durationMs` once (kills the casts at ChatConversationComponent.tsx:3981, 4026, 4664, ToolCallsBlockComponent.tsx:101).
   - Backfills missing tool-call `id` deterministically (`{turnId}-{toolName}-{ordinal}`) so `calling`/`done` correlate — replacing the `tc-${Date.now()}-${Math.random()}` fallback (:3966) that breaks result attachment when both events lack ids.
   - Logs unknown event types **once per type** instead of silently dropping.

1.5 **Discriminated-union event API.** Replace the 35-optional-callback `SSECallbacks` with `onEvent(event: AgentStreamEvent)` where `AgentStreamEvent` is a discriminated union derived from the existing `SSEEvent` types (types.ts:655–669, currently defined but bypassed by the `SSEData` bag). Ship a `callbacksAdapter(callbacks): (event) => void` so every existing call site keeps working; migrate call sites incrementally. This is the same shape as the Anthropic streaming API and Claude Code's internal event stream — one typed pipe, exhaustive switch, compiler-checked.

1.6 **Taxonomy hygiene** (client + server, additive):
   - Client: use `SERVER_SENT_EVENT_TYPES.TASK_NOTIFICATION` / `.CONVERSATION_STATE_UPDATE` constants (raw literals at PrismService.tsx:1449, 1452); add `SYNTHESIS_START`/`TURN_START`/`TURN_COMPLETE` constants to the taxonomy (currently undocumented literals at :1485–1491).
   - Server: `SubAgentTelemetryEmitter.ts`, `TournamentRouter.ts`, `HierarchicalAggregationRouter.ts` emit `"sub_agent_status"` etc. as raw strings — switch to the constants so renames break at compile time on both sides.
   - Decide `TEXT`/`TOKEN`: either delete from the taxonomy or handle them.

1.7 **Resumable streams (foundation for Phase 3.6).** Server stamps a monotonically increasing `seq` on every event and keeps a short per-conversation ring buffer; emits SSE `id:` fields. Client reconnect sends `Last-Event-ID`; server replays missed events. Turns a mid-stream network drop from "turn lost, hope polling recovers" into a transparent resume. (Client-side auto-reconnect with capped backoff: 3 attempts, 1s/2s/4s, only while `isGenerating`.)

Rollout: 1.1–1.6 are pure client + additive server changes. 1.7 needs a coordinated deploy — ship server ring buffer first (harmless), client reconnect second.

---

## Phase 2 — One reducer, one store (state architecture, ~1–2 weeks)

The single biggest structural fix. All streaming events — from the fetch-SSE pipeline *and* the sub-agent WebSocket pipeline (:6713–6957) — feed one pure reducer. This is how Claude Code's UI works: the model loop emits typed events; a single state projection renders them.

2.1 **`agentTurnReducer(state, event)`** in `src/state/agentTurn/` — pure, fixture-tested via Phase 0 transcripts. State shape:
```ts
interface AgentTurnState {
  messages: ClientMessage[];          // content-block model, see 2.2
  toolActivity: ToolCallEvent[];
  subAgents: Record<string, SubAgentActivityEntry>;
  streamingOutputs: Map<string, string>;
  pendingApprovals: PendingApproval[];
  pendingUserQuestion: UserQuestion | null;
  planProposal: PlanProposal | null;
  agenticProgress: AgenticProgress | null;
  contextBudget: ContextBudget | null;
  phase: TurnPhase;                   // idle | sending | streaming | paused-approval | paused-question | done | error
}
```
   These ten values are already reset together in 3 places and snapshotted whole in `ConversationSnapshot` (:410–428) — they are one state object in denial. `useReducer` (or a tiny external store, see 2.4) replaces ~10 `useState` + the mutable closure accumulators (`streamedText`, `contentSegments`, `prevCleanLen`, …).

2.2 **Content-block message model.** Replace the parallel arrays (`contentSegments` + `textFragments` + `thinkingFragments` + `toolIds` + dedup sets) with ordered blocks per message:
```ts
type ContentBlock =
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tools"; toolIds: string[] }
  | { kind: "plan"; proposal: PlanProposal };
```
   Same information, one array, no index bookkeeping, no `snapshotSegments()` deep-copies per token. Write a `toLegacySegments(blocks)` adapter so `MessageListComponent` renders unchanged until it migrates. The reducer merges the three near-identical ~50-line updaters in `toolCallStateUpdaters.ts` behind one shared helper, and fixes two live bugs while at it:
   - done/error matching falls back only to `status === "calling"`, not `"streaming"` (toolCallStateUpdaters.ts:103, :190) — a tool completing from `streaming` with no id silently drops its result.
   - the double state-write per tool event (`setToolActivity` + `setMessages`, :3971/:4016) becomes one dispatch.

2.3 **Throttled render commits.** Today every token does `setMessages(prev => [...prev])` plus fragment/segment copies — O(messages) allocation per token. Instead: reducer state lives in a ref, deltas accumulate, and a rAF-aligned flush (~30–60ms) commits to React. On long conversations this is the difference between smooth streaming and GC stutter. (This mirrors how Claude Code batches terminal repaints rather than repainting per token.)

2.4 **Kill the dual pipeline.** `useAgentTurn()` hook owns: start(payload) → stream events → dispatch; the WebSocket auto-response/sub-agent effect dispatches into the *same* reducer instead of its own hand-rolled setState logic. Also merge the `onToolExecution` / `onToolCall` twins (:3960–4123 vs :4125–4271, ~150 duplicated lines) — after Phase 1.4 normalization they are the same event.

2.5 **Component decomposition** (mechanical, each PR independently shippable; extraction order = lowest risk first):
   1. Pure helpers out of the file: glitch text (:198–277), `normalizeSubAgentStatusToPhase` (:385–398).
   2. `buildChatPayload` / `buildAgentPayload` sharing a common base (today two divergent ~30-line literals, :3614–3715).
   3. `useMentionAutocomplete` (:3251–3473), `useFileAttachments` (:1329–1378, :3475–3602), `useFileViewer` (:699–710, :7118–7133, dedup the 4× repeated close logic), `useMessageNavigation` (:1390–1510), `useModelConfiguredFlags` (9 booleans + one effect → one object, :861–870, :2587–2632).
   4. `conversationStats` builder (:7357–7636, ~280 lines rebuilt every render) → memoized util; move the `tokenHwmRef` write out of render (:7469, :7588 — state mutation during render).
   5. StatusBar phase derivation IIFE (:8206–8502, ~300 lines) → memoized component; move `document.documentElement.style` writes into an effect (:8406–8422).
   6. Admin mode (~580 gated lines, :1940–2524) → `useAdminChat` hook or sibling component.
   7. Magic numbers → named constants module (CHUNK_GAP_THRESHOLD, poll intervals, retry counts, iteration step arrays duplicated at :7307/:7326, etc.).

2.6 **Types.** Delete the `[key: string]: unknown` index signatures (`TransformedSSEData` types.ts:756, `SubAgentActivityEntry` :361–368); unify the three overlapping sub-agent activity types (`SubAgentActivityEntry` / `SubAgentToolActivityItem` / `SubAgentActivity`) into one; type tool status as `"streaming" | "calling" | "done" | "error"` and use the existing `EXECUTION_STATUS` constants in the reducers. Goal: `as any` count in the component from 32 → 0 (Phase 1.5's typed events do most of the work).

Exit criteria per PR: golden-transcript replay produces identical rendered output (snapshot the projected state); typecheck clean.

---

## Phase 3 — Business logic → prism-service (~1 week, coordinated deploys)

Ranked by value/risk. Each item: server change ships first (accepting both shapes), client simplification second.

3.1 **Rule injection → SystemPromptAssembler.** *(HIGH)*
   Client currently rewrites the user message into `[Active Rules]\n…\n[User Message]\n…` (ChatConversationComponent.tsx:5371–5387) — a delimiter the server doesn't know: `PROMPT_DELIMITERS` (prism-service/src/constants.ts:274–285) has no `ACTIVE_RULES`, and `Finalizer.ts:119–133` only recovers clean text from `[System Context]`-prefixed messages; today it survives only because the client also ships `rawContent`. Rules already have full server CRUD (`RulesRoutes.ts`) but nothing server-side injects them.
   - Server: add `PROMPT_DELIMITERS.ACTIVE_RULES`; `SystemPromptAssembler` resolves `activeRuleNames: string[]` from the payload (or enabled rules for the agent) and injects the section; `Finalizer` handles the delimiter.
   - Client: send raw text + `activeRuleNames`; keep only the badge UI. Delete the prompt-building block.

3.2 **Title derivation → server only.** *(HIGH value, trivial effort)*
   Client truncates to 57+"…" (:5334–5340); server has its own 100-char rule (`ChatRoutes.ts:594–600`) that is dead on the main path because the client always wins. Delete the client rule; render an optimistic placeholder locally but never persist it. The backend `ConversationSummarizer` rewrite already arrives via change stream.

3.3 **Tool locking policy → AgenticToolResolver.** *(HIGH)*
   `lockedOffTools` (:2636–2714) encodes real capability policy client-side (memory tools need configured models, `think` disabled on native-thinking models incl. an lm-studio name heuristic, workspace tools need a live connector) — and `AgenticToolResolver.ts:132–193` blindly trusts the client's `disabledTools`. Any stale UI or replayed request can enable tools whose prerequisites don't exist.
   - Server: compute the locked set (it already has model config, capabilities, workspace status); return `lockedTools: [{ name, reason }]` from config/conversation endpoints; treat client `disabledTools` as user preference (union with server locks, never authority).
   - Client: render toggles + tooltips from the server list. Keep `WORKSPACE_FS_TOOLS` client-side (it only triggers a UI tree refresh — presentation).

3.4 **Payload policy defaults → server.** *(MED, quick deletions)*
   Delete from the client: `minContextLength: 120_000` (:3690 — duplicates `TIMERS.MINIMUM_CONTEXT_LENGTH`, prism-service/src/constants.ts:659), harness `"standard"` fallback (:3696), `agent || AGENT_IDS.CODING` fallback baked into the transport (PrismService.tsx:1199, :1567), the empty system-message placeholder (:3670). Server applies defaults when fields are absent; client sends only explicit user overrides. (Topology/iteration defaults already import shared taxonomy symbols — fine as-is.)

3.5 **`deriveAgentConversationState` → shared library.** *(MED)*
   Mirror confirmed at prism-service/src/services/conversation/utils.ts:504–533. Promote the ladder into `@rodrigo-barraza/utilities-library` so both sides import one implementation; keep client-side calls only for the live SSE-patched sidebar (documented exception). Color mapping stays client-side.

3.6 **Kill the post-stream race with a `persisted` event.** *(MED, pairs with 1.7)*
   `attemptPostStreamRefresh` (:5450–5535) exists because `done` fires before `appendMessages` commits. Server: after commit, emit `{ type: "persisted", conversationId, messageCount, revision }` (and include `revision` in `done` once available). Client: apply authoritative state once on `persisted`; delete ~85 lines of retry/backoff/content-matching heuristics and the 5-minute network-recovery poll loop becomes a plain reconnect (1.7).

Verified clean — do not move: cost/token math (server-owned; client only formats), xml/latex sanitizers (render-time presentation), messageHelpers/historyItemMapper (already thin), WorkflowExecutor (already migrated).

---

## Phase 4 — Harness features inspired by Claude Code (~1–2 weeks, optional/incremental)

4.1 **Permission modes instead of a boolean.** Replace `autoApprove: boolean` with `permissionMode: "ask" | "acceptEdits" | "acceptAll"` plus a persisted per-tool allowlist ("Always allow `read_file` for this agent/project"), editable in settings. The approval prompt gains "Approve", "Approve all this turn" (exists), and "Always allow this tool". Server enforces (ApprovalGate already exists); client renders. This is Claude Code's permission-rules model and removes most approval friction without going full YOLO.

4.2 **Turn transcript / replay devtool.** Persist the raw event stream per turn (server already persists requests; add the SSE event log or reconstruct from it). Admin "Replay" button re-runs a recorded stream through the reducer at 10× speed — turns "streaming looked wrong once" into a reproducible fixture. Directly leverages Phase 0/2 infrastructure and complements the requests-collection forensics workflow you already use.

4.3 **Streaming tool-input rendering.** The registry renders results well; while a tool call is in `streaming` status, show live partial args (e.g. the file path as it streams) via an optional `renderStreamingArgs` per registry entry. Claude Code does this and it makes long tool calls feel alive. The `tool_output` → `streamingOutputs` channel already exists for progressive output — surface it in `ToolCallsBlockComponent` uniformly instead of per-renderer hacks.

4.4 **Interrupt with context.** On stop, inject a visible "⏹ interrupted by user" marker block into the message (instead of just finalizing), and — server-side — append a system-reminder-style note so the next turn knows the previous one was cut short. `handleStop` already coordinates abort + `/agent/stop` + sub-agent termination; this only adds the marker semantics.

4.5 **Rejoinable background turns.** The pieces exist (backend continues on disconnect via `persistOnDisconnect`, `getConversationLiveStatus` polling, WS auto-response). With 1.7 seq/resume, unify into: navigating away never loses a turn; opening a conversation with `isGenerating` attaches to the live stream via `Last-Event-ID` replay instead of the current polling patchwork (:6589–6700).

4.6 **Registry cleanup (small).** Delete placeholder `FetchUrlRenderer`/`ScheduleRenderer` indirection; wire or drop the dead `subAgentStartIndex` (hardcoded 0 at ToolCallsBlockComponent.tsx:243); replace `description.includes()` sub-agent correlation fallback (CoordinatorAndMiscRenderers.tsx:198) with `agent_id`-only matching once the id is guaranteed by 1.4.

---

## Phase 5 — PrismService decomposition (~2–3 days, mechanical)

2,441 lines mixing SSE transport, WebSocket, TTS binary fetch, LM Studio management, benchmarks, and ~40 CRUD groups.
- `src/services/http.ts` — one shared fetch helper (headers, error-body parse, timeout); the ok-check/`.catch(() => ({}))` pattern is currently copy-pasted 4×.
- `src/services/streaming/agentStream.ts` — from Phase 1.
- `src/services/api/{conversations,agents,models,workflows,benchmarks,media,…}.ts` — domain modules.
- `PrismService` remains as a facade re-exporting everything (zero import churn); new code imports domain modules directly. Silent catches get logs or typed error results (`getLlamaCppServerProps`, `generateSpeech`, SSEManager parse/listener swallows).

---

## Quick wins (can land this week, independent of phases)

| Fix | Where | Effort |
|---|---|---|
| done/error matcher also accepts `"streaming"` | toolCallStateUpdaters.ts:103, :190 | XS — real dropped-result bug |
| Normalize `durationMilliseconds`→`durationMs` at dispatch | PrismService `_dispatchSSE` | XS |
| Use taxonomy constants for `task_notification`, `conversation_state_update` | PrismService.tsx:1449, :1452 | XS |
| Flush trailing SSE buffer + synthesize close callback | PrismService.tsx:1282–1286 | S |
| Contract exhaustiveness test (0.4) | new test | S |
| Delete client title truncation (3.2) | ChatConversationComponent.tsx:5334–5340 | S (server rule already exists) |
| Merge `onToolExecution`/`onToolCall` bodies via shared handler | :3960–4271 | S |
| Move `tokenHwmRef` + `document.style` writes out of render | :7469, :8406 | S |

---

## Sequencing & risk summary

| Phase | Depends on | Deploy coupling | Risk |
|---|---|---|---|
| 0 Safety net | — | client only | none |
| 1 Protocol | 0 | additive server (heartbeat, seq) | low |
| 2 Reducer/store | 0, 1.4–1.5 | client only | medium — mitigated by transcript replay snapshots |
| 3 Business logic | 1 (for 3.6) | server-first, additive | medium — rule injection (3.1) needs prompt-output diffing before/after |
| 4 Features | 1, 2 | mixed | low, incremental |
| 5 Service split | — | client only | low, mechanical |

Verification gate for every PR: `npm run test && npm run typecheck && npm run lint`, golden-transcript replay snapshots unchanged (or intentionally updated), and a manual smoke of one agent turn with tools + one sub-agent turn. Remember the deploy split: a stale client bundle mimics a broken fix — deploy both halves when testing protocol changes end-to-end.
