# Chat characterization suite

This suite is the safety net under the agent chat refactor
(`prism-service/docs/prompts/26-client-chat-architecture.md`). Landing 1 wrote
it against master `1cbdff4c`, with no behaviour change. Landing 2 (one event
reducer and one transport) keeps it green, and Landing 3 (the component split
and virtualization) must too. Where a snapshot has to change, the landing
states why in its report.

**Re-cut 2026-09-22** when it landed with `event-protocol-v1` and
`permission-modes`. Nothing a person sees in the chat changed by accident:

- The fixtures follow the real wire now. `tool_execution` durations sit inside
  `tool`, so a row shows the server's 4 ms instead of the harness clock's
  50 ms. `webSearchResult` items carry `pageAge`, not a `snippet`. The context
  budget and usage events carry their real fields, so the budget shows numbers
  instead of `NaN`.
- The two error fixtures are v1 `error` events with `code` and `retryable`.
- The `/agent` body sends `permissionMode` in place of `autoApprove`
  (`permission-modes`).

**Re-cut 2026-09-22 by Landing 2 (`chat-event-reducer`).** Every SSE-driven
snapshot is unchanged except one, which records a fixed bug. The live-viewer
snapshots changed on purpose: the viewer now goes through the same reducer as
the SSE. [What Landing 2 unified](#what-landing-2-unified) lists each change.

```bash
WT=<your worktree>
"$WT"/node_modules/.bin/vitest run --root "$WT" src/components/__tests__/chat-characterization/
```

It has 39 tests and takes about 15 s.

## What it does

The suite mounts the **real** `AgentChatComponent` in jsdom and replays
recorded event transcripts (`src/__fixtures__/sse-transcripts/`, see its
README) through both transports:

- **`sseDriving.characterization.test.tsx`** covers the turn the chat drives
  itself. The test types into the composer and presses Enter. `fetch("/agent")`
  answers with a stream that the test writes one event at a time. Where the
  user acts mid-turn (Allow, Execute Plan, answering a question, steering,
  Stop), the test clicks through the real card and snapshots the request it
  sent.
- **`liveViewer.characterization.test.tsx`** covers a turn driven elsewhere.
  The chat opens a conversation the list reports as active, subscribes over
  `/ws/chat`, and receives the same transcripts as socket frames. It also
  covers a drop and resubscribe from `afterSeq`, a truncated replay, and a
  service restart.
- **`rowRenders.characterization.test.tsx`** counts how many rows re-render
  for each streamed token.
- **`urlAndRootSync.characterization.test.tsx`** covers what the chat and its
  page's URL hand each other: URL changes through `onUrlChange`, a
  `?conversation=` link, and the live phase's colours on `:root`.

Only the network is fake: `fetch`, `WebSocket` and `EventSource`
(`chatHarness.tsx`). The transport (`services/agentStream.ts`: the SSE
reader, `liveViewerSocket` and its cursor) and the reducer are the real code.

Every scenario snapshots three things:

- **trace:** one line per event, digesting the message count, the last
  bubble, the tools, the sub-agents and the pending cards;
- **state:** the chat's state after the turn;
- **dom:** the visible text of the key regions.

Some scenarios add a checkpoint taken mid-turn, the requests an action sent,
or the toasts that were shown.

### Determinism

- **Time** is a manual clock. `Date` and `performance.now()` advance 25 ms per
  replayed event. `TZ=UTC` is pinned in `vi.hoisted`, because the formatters
  are built at import time. Timers are real.
- **Minted ids** are normalized: generated UUIDs become `<uuid:N>`, and
  `tc-<Date.now()>-<random>` becomes `tc-<minted>`. Sets are sorted after that
  replacement.
- **Toasts** dismiss themselves after 3.5 s of real time, so the snapshots
  read `ChatHarness.toastLog`, which records every toast shown. The live
  `toasts` field is left out of the state snapshot.
- **Animation text** is blanked in the DOM digests: the streaming cursor's
  random glyph (`.scramble-char`) and the status bar's percentage
  (`.status-bar-progress`), which a real-time interval moves. The phase label
  beside the percentage is kept.
- **Requests after `done`** are listed as a set, because the memory poll
  repeats on a real 2 s timer. Document fetches are counted exactly.

## Where the chat's turn state lives (Landing 2)

- **`services/agentStream.ts`** is the transport. It has three sources, one
  iterator each. `openTurnStream` is the SSE the chat sends on.
  `watchConversation` is the viewer socket. `followTurn` follows a turn after
  its SSE dropped. Each yields `event` items: parsed, normalized, and never
  already delivered, because every transport shares the conversation's
  cursor. The sockets also yield `connection`, `subscribed` and `turn-lost`.
- **`utils/agentConversationReducer.ts`** is the one reducer.
  - It is pure: time and the random part of minted ids come in on the action.
  - It holds the transcript, the cards, the live activity and `stream`, the
    turn in progress. `stream` records what has streamed so far, the
    text/tool/plan segments, the tok/s burst, and whether the trailing bubble
    is the turn's.
  - A turn this chat sent owns its placeholder bubble. A turn joined over the
    socket owns only a bubble it created, and never writes into a completed
    reply from the stored document.
- **`utils/agentConversationEffects.ts`** maps an event to the side effects
  the chat runs, both of them pure: refreshing a panel, a toast, a sub-agent
  in the sidebar, the goal / permission-mode / budget-pause / question hooks.
- **`hooks/useAgentConversation.ts`** holds the reducer in `useReducer`.
  - `ingest(event, conversationId)` dispatches an event and returns its
    effects.
  - `getState()` is always current, even ahead of a render.
  - The setters change one field, for code that edits outside a stream.
- **In the component:**
  - `driveTurnStream` follows the SSE. It resolves at `done` and keeps
    delivering what follows `done`.
  - The viewer effect follows the socket.
  - `routeTurnEvent` sends an event to the chat, or into the background
    snapshot of a conversation the user switched away from mid-turn.
  - Only each turn's lifecycle (refreshes, `isGenerating`) is
    transport-specific.

**Adding an event type:**

1. Add it to `events.ts` in both repos (see its header).
2. The reducer's exhaustive `switch` then fails to compile until the type is
   handled or deliberately ignored.
3. Add its side effects in `effectsOfEvent`.

## The contract a refactor keeps

1. **`utils/chatDebugProbe.ts`.**
   - The chat publishes a `ChatDebugState` after every commit, through the
     effect just above `// -- Layout` in `AgentChatComponent`.
   - The fields come from the reducer's state, the component's own state and
     the hooks. They are typed `unknown` on purpose: the suite does not care
     how the chat stores them.
   - A field that disappears breaks every snapshot. Rename one only together
     with its snapshots.
2. **`noteMessageRowRender(message, index)`.**
   - It is called once for each message row that renders. Today that is the
     top of `MessageList`'s `displayMessages.map`.
   - A row component memoized by message id calls it at the top of its render.
3. **`REGION_SELECTORS` in `chatHarness.tsx`.**
   - These are where the digests look. A split that moves a region updates the
     selector, not the snapshots.
   - Each message row keeps `data-message-index`. Rows are read in DOM order.
   - The composer stays a `[contenteditable][role='textbox']`, and Enter sends.
4. **The mock block.** Each test file repeats it: the `TZ` pin, `@/config`
   pointing at `http://prism.test` and `ws://prism.test`, and `next-auth/react`.
   `vi.mock` is hoisted per file, so it cannot live in the harness.

## Scenarios

| | SSE (driving) | Live viewer |
|---|---|---|
| tools and a sub-agent; side channels | ✓ | ✓ |
| the `/agent` request body; the post-stream refresh | ✓ | — |
| approvals (two cards, one allowed from its card) | ✓ | ✓ (decided elsewhere) |
| plan mode (Execute Plan) | ✓ | ✓ |
| question: blocking (answered) and non-blocking (answered, then returned as a `turn_input`) | ✓ | ✓ |
| sub-agents: spawned, phases, tools, complete, failed | ✓ | ✓ |
| compaction; context budget estimated, then reported | ✓ | ✓ |
| error before the loop; error in the loop (`done` then `error`); iteration limit | ✓ | ✓ |
| steering: applied, and refused (409) so it queues and sends after the turn | ✓ | ✓ (from another tab) |
| goals: set, progress, completed after `done` | ✓ | ✓ |
| reconnect from `afterSeq`; the cursor drops repeats | ✓ (SSE drops, recovery socket) | ✓ (socket drops) |
| truncated replay; service restarted | — | ✓ |
| Stop mid-turn, then the next send | ✓ | — |
| a server `error` that mentions the network | ✓ | — |
| a `?conversation=` link opened before the agent personas load | — | ✓ |

## Row-render baseline

These counts come from `rowRenders.characterization.test.tsx`: send in a long
conversation, then stream chunks one SSE frame at a time.

| Conversation | Measured on | Row renders per token | Old rows re-rendered per token | React commits per token | jsdom ms per token |
|---|---|---|---|---|---|
| 200 messages (the default run) | master `1cbdff4c` | 202 | 200 | 3.1 | 175 |
| 2,000 messages | master `1cbdff4c` | 2,002 | 2,000 | 3.5 | 2,315 |
| 2,000 messages | master `f3bbfa29` | 2,002 | 2,000 | 3.3 | 2,008 |
| 2,000 messages | Landing 2 | 2,002 | 2,000 | 3.0–3.7 | 1,369–2,118 |

The milliseconds were measured on the 32-core WSL box at a load of about 20.

Every token re-renders every row once. Rows are inline JSX in
`MessageList`'s map, and the list re-renders whenever `messages` changes.
Landing 2 changed who produces `messages` (one reducer action per event, as
one `setMessages` was before), not how the list renders it. The test asserts
ceilings at that baseline: at most one render of each old row per token, and
at most the rows on screen in total. Landing 3 aims for 0 old rows per token.
When it gets there, it lowers the ceilings to match.

```bash
PRISM_ROW_RENDER_REPORT=1 PRISM_ROW_RENDER_MESSAGES=2000 PRISM_ROW_RENDER_TOKENS=10 \
  "$WT"/node_modules/.bin/vitest run --root "$WT" src/components/__tests__/chat-characterization/rowRenders.characterization.test.tsx
```

The commit count is information, not an assertion: the status bar's real-time
ticker adds one now and then (the table's range is two runs of the same
tree). The milliseconds are dev React in jsdom, so compare them only with
each other.

## What Landing 2 unified

Landing 1 pinned a viewer with its own handler set that diverged from the SSE
one. The viewer now goes through the SSE's reducer, so each divergence
became the SSE behaviour, and the viewer snapshots changed to match:

- **Sub-agents:** the viewer shows sub-agent activity (phases, tools, output,
  usage, TTFT) and adds the optimistic sidebar entries. Those entries are
  settled when a sub-agent completes or fails.
- **Approvals and plans:** the viewer shows the approval cards and the in-flow
  plan. `approval_decided` settles a card whoever decided it, and now also
  settles the plan whose call it names, so a plan decided in another tab
  reads "Approved" instead of offering Execute Plan.
- **Usage and status:**
  - The viewer shows usage, the context budget, the "Compacting
    conversation…" bubble, termination notices and live generation progress.
  - `iteration_progress` hands the status bar its own timer, on both
    transports.
- **Errors:** an `error` appends the "⚠️ Error:" bubble on the viewer too.
- **Bubble ownership:** a tool event now claims the bubble it creates, so the
  chunk after a tool extends that bubble instead of opening a second one. The
  side-channel, non-blocking-question and goal traces show 4 messages on both
  transports.
- **Thinking and segments:** the viewer builds `contentSegments` and the
  text/thinking fragments, so tool-versus-text order shows while the turn
  streams. A thinking chunk no longer stamps `statusPhase: "thinking"` on the
  bubble; the phase comes from status events on both transports.
- **Normalization:** socket frames are normalized like SSE frames
  (`normalizeStreamEvent`), so a viewer's tool durations are the server's
  instead of the client's wall clock.
- **Tool output:** `tool_output` streams stdout/stderr into
  `streamingOutputs` on the viewer too. Before, it overwrote the tool call's
  result with the output chunk and marked the call complete.
- **Mid-turn inputs:** a `turn_input` goes just above the bubble the turn is
  streaming into, and what follows extends that bubble: the driving tab's
  layout. With no such bubble it is appended, and what follows opens a new
  one.
- **Hook messages:** `hook_system_message` shows its toast on the viewer too.

**Differences kept on purpose:**

- **Blocking questions:** only the driving client answers one.
  - The reducer shows a blocking `user_question` only when this chat sent the
    turn.
  - A viewing tab's card would stay up after the sender answered, and a late
    click would send the answer as a new message.
  - The stored document's pending question still hydrates on load, as before.
- **The turn's lifecycle is the transport's.** The reducer finalizes the
  bubble on `done` for both. Then:
  - the SSE keeps its transcript and runs the post-stream refresh;
  - the viewer replaces the transcript with the stored document.
  - `isGenerating` is raised by the send (SSE), or by content arriving on the
    viewer socket.

## SSE behaviour that looks wrong

These are pinned, not fixed, unless marked fixed.

- **Error in the loop:** the service emits `done` and then `error`.
  - The error is not shown; the persisted document is all the user sees.
  - This is now a rule in the reducer, not an accident of the SSE promise: an
    `error` after the turn's `done` belongs to the finished turn. It holds on
    the viewer too, and across the document refresh after `done`, until the
    next turn starts.
- **Error before the loop:** the empty assistant placeholder stays above the
  "⚠️ Error:" bubble. The error is a continuation row of that empty bubble.
- **Recovery after a dropped SSE (fixed by Landing 2).**
  - Landing 1 pinned `followLiveTurn` passing only `onChunk`, so tool events
    during recovery were dropped until the document refresh, and the status
    bar stuck on "Running tool…".
  - Recovery (`followTurn`) now feeds the same reducer. The SSE reconnect
    snapshot shows the recovered `read_file` result, and "Generating…" in the
    status bar.
- **Stop left the send hanging (fixed by Landing 2).**
  - The aborted SSE never settled `runOrchestrationLoop`, so `handleSend`
    never reached its `finally`.
  - The conversation kept its generating dot in the sidebar, and stayed
    marked as driven by this client (the viewer socket and change-stream
    refreshes skipped it) until a reload.
  - `close()` now ends the stream. The scenario "Stop ends the turn here" was
    red on master `f3bbfa29`.
- **An `error` event whose message mentioned "network", "fetch" or "aborted"
  (fixed by Landing 2).** Such an error was taken for a dropped connection:
  it started recovery and never showed. A server `error` event is now always
  shown. Only transport failures start recovery. The scenario "a server error
  that mentions the network" was red on master `f3bbfa29`.
- **A `?conversation=` link opened an empty chat (fixed by Landing 2's live
  check).**
  - The link loaded once, at mount, under the agent's project, which is a
    guess until the page's personas arrive: the guess for Coding is `coding`,
    while the Coding persona keeps its conversations in `prism-chat`.
  - The lookup 404'd and was never retried, so a reload or a push-notification
    link to a Coding conversation showed a blank chat, and the next send
    started a new conversation.
  - The load now tries again when the project resolves. The scenario "opens a
    ?conversation= link once the agent's project is known" was red on master
    `80adb7a5`.

## For Landing 3: the post-stream poller

The service persists the turn **before** it emits `done`.
`finalizeTextGeneration` awaits `appendAndFinalize` (prism-service
`src/services/harnesses/lifecycle/Finalizer.ts` ~552–566), then emits `done`
(~576–605). Two caveats:

- `appendAndFinalize` catches its own errors, so `done` still goes out when
  persisting failed.
- The afterResponse and turn-end hooks run after `done`. `goal_update` and
  `hook_system_message` can arrive after it; `agent-turn-goal.jsonl` models
  that.

The scenario "the request a send makes, and the refresh from the persisted
turn after done" pins two document fetches after `done` today: conversation
stats, and `attemptPostStreamRefresh` (still in `handleSend`, after
`runOrchestrationLoop` resolves). Deleting the poller changes
`documentFetchesAfterDone`, and that scenario is where the "done arrives, then
no poll" test belongs.

Virtualizing in jsdom: jsdom lays nothing out, so every element measures 0 px.
A windowing library that sizes from `getBoundingClientRect` renders no rows at
all, and every `rows` digest goes empty. Either render a fallback window when
nothing is measured, or stub the measurement in the harness. Do not drop rows
from the snapshots.

## Wire facts for the typed event union

These come from prism-service master `d601401a`; the fixtures README cites
each emitter.

- **`seq`:** every `/agent` event carries one. The counter is seeded from
  `Date.now()` and increases by one per event. `conversation_state_update` and
  the `subscribed` ack carry none.
- **The `subscribed` ack** has `lastSeq`, `replayedCount` and `droppedCount`,
  and no `truncated` field: `droppedCount > 0` means the replay was truncated.
- **`tool_execution` durations** sit inside `tool`, as both
  `durationMilliseconds` and `durationMs`. Streaming and calling events carry
  `timestamp`; done and error events do not.
- **`sub_agent_status` `complete`** carries `durationMilliseconds`, never
  `durationMs`. The transport's `normalizeStreamEvent` adds `durationMs` on
  every transport.
- **`approval_required`** is keyed by `toolCallId`. The tool's name and
  arguments are in `toolCall`. A card forwarded from a sub-agent adds
  `approvalConversationId`.
- **`plan_proposal`** carries the plan's `toolCallId`; the `approval_decided`
  that settles it names the same id.
- **`user_message`** opens every `/agent` and `/chat` stream (ChatRoutes, at
  turn start), including the sender's own. The reducer treats the sender's as
  the echo of its prompt.
- **`goal_update`** has `change`: `set`, `progress`, `status` or `cleared`.
  The goal's own `status` is `active`, `paused`, `completed` or `blocked`.
- **Forwarded sub-agent events used to carry the sub-agent's `seq`.**
  - `SubAgentTelemetryEmitter` forwards the sub-agent's `usage_update`,
    `approval_required` and `approval_decided`, and grandchildren's
    `sub_agent_*` events, to the parent stream.
  - They carried the `seq` the sub-agent's own counter had stamped. Whenever
    the parent had emitted more events, that number ran backwards, and the
    cursor dropped the event as already seen.
  - prism-service `forwarded-events-own-seq` (landed 2026-09-22) makes the
    parent stamp its own `seq` on these events.
