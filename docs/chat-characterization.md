# Chat characterization suite

This suite is the safety net under the agent chat refactor
(`prism-service/docs/prompts/26-client-chat-architecture.md`). Landing 1 wrote
it against master `1cbdff4c`, with no behaviour change. Landing 2 (one event
reducer and one transport) and Landing 3 (the component split and
virtualization) must keep it green. Where a snapshot has to change, the
landing states why in its report.

```bash
WT=<your worktree>
"$WT"/node_modules/.bin/vitest run --root "$WT" src/components/__tests__/chat-characterization/
```

It has 34 tests and takes about 15 s.

## What it does

The suite mounts the **real** `AgentChatComponent` in jsdom and replays
recorded event transcripts (`src/__fixtures__/sse-transcripts/`, see its
README) through both transports:

- **`sseDriving.characterization.test.tsx`** covers the turn the chat drives
  itself. The test types into the composer and presses Enter. `fetch("/agent")`
  answers with a stream that the test writes one event at a time. Where the
  user acts mid-turn (Allow, Execute Plan, answering a question, steering), the
  test clicks through the real card and snapshots the request it sent.
- **`liveViewer.characterization.test.tsx`** covers a turn driven elsewhere.
  The chat opens a conversation the list reports as active, subscribes over
  `/ws/chat`, and receives the same transcripts as socket frames. It also
  covers a drop and resubscribe from `afterSeq`, a truncated replay, and a
  service restart.
- **`rowRenders.characterization.test.tsx`** counts how many rows re-render
  for each streamed token.

Only the network is fake: `fetch`, `WebSocket` and `EventSource`
(`chatHarness.tsx`). PrismService, the SSE framing, `liveViewerSocket` and its
cursor are the real code, so Landing 2's `agentStream.ts` runs through the
same harness.

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

## The contract a refactor keeps

1. **`utils/chatDebugProbe.ts`.**
   - The chat publishes a `ChatDebugState` after every commit, through the
     effect just above `// -- Layout` in `AgentChatComponent`.
   - When the state moves into a reducer, publish the same fields from it.
     They are typed `unknown` on purpose: the suite does not care how the chat
     stores them.
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

## Row-render baseline

These counts come from `rowRenders.characterization.test.tsx`: send in a long
conversation, then stream chunks one SSE frame at a time. Measured on master
`1cbdff4c`:

| Conversation | Row renders per token | Old rows re-rendered per token | React commits per token | jsdom ms per token |
|---|---|---|---|---|
| 200 messages (the default run) | 202 | 200 | 3.1 | 175 |
| 2,000 messages | 2,002 | 2,000 | 3.5 | 2,315 |

The milliseconds were measured on the 32-core WSL box at a load of about 20.

Every token re-renders every row once. Rows are inline JSX in
`MessageList`'s map, and the list re-renders whenever `messages` changes. The
test asserts ceilings at that baseline: at most one render of each old row per
token, and at most the rows on screen in total. Landing 3 aims for 0 old rows
per token. When it gets there, it lowers the ceilings to match.

```bash
PRISM_ROW_RENDER_REPORT=1 PRISM_ROW_RENDER_MESSAGES=2000 PRISM_ROW_RENDER_TOKENS=10 \
  "$WT"/node_modules/.bin/vitest run --root "$WT" src/components/__tests__/chat-characterization/rowRenders.characterization.test.tsx
```

The commit count is information, not an assertion: the status bar's real-time
ticker adds one now and then. The milliseconds are dev React in jsdom, so
compare them only with each other.

## What the snapshots pin that a refactor may change on purpose

**The viewer's handlers differ from the SSE handlers.** Unifying them
(Landing 2) changes these snapshot lines, and each one is a difference to
state in the report:

- **Sub-agents:** the viewer ignores `sub_agent_*`. It shows no sub-agent
  activity and adds no optimistic sidebar entries.
- **Approvals and plans:** it ignores `approval_required`, `approval_decided`
  and `plan_proposal`, so a viewer shows no cards and no in-flow plan.
- **Blocking questions:** it ignores a blocking `user_question`, on purpose,
  because only the driving client answers one. It opens non-blocking ones.
- **Usage and status:** it ignores `usage_update` and `context_budget`, and it
  ignores the `generation_started`, `generation_progress`, compaction and
  termination statuses. So it shows no usage, no budget, no "Compacting
  conversation…" bubble and no iteration-limit notice.
- **Errors:** `error` stops the viewer (`isGenerating: false`). The SSE path
  instead appends a "⚠️ Error:" bubble.
- **Bubble ownership:** a tool event creates the assistant bubble without
  claiming it, so the chunk after a tool call opens a second assistant bubble.
  The side-channel, non-blocking-question and goal traces show 5 messages
  where SSE has 4. The SSE path extends one bubble.
- **Thinking and segments:** the viewer builds no `contentSegments` or text
  and thinking fragments, so tool-versus-text order is lost until the refresh
  on `done`.
- **Normalization:** the socket path skips `_normalizeSSEData`, and the
  viewer's tool handler reads `durationMs || durationMilliseconds` itself.
- **Hook messages:** `hook_system_message` shows a toast on SSE only.
- **`done`:** the SSE path completes the bubble with usage, cost and timings.
  The viewer replaces the whole transcript with the persisted document.

**SSE behaviour that looks wrong** (pinned, not fixed; Landing 1 changes no
behaviour):

- **Error in the loop:** the service emits `done` and then `error`. The client
  resolves on `done`, so the error is dropped: no bubble and no toast. The
  persisted document is all the user sees.
- **Error before the loop:** the empty assistant placeholder stays above the
  "⚠️ Error:" bubble. The error is a continuation row of that empty bubble.
- **Recovery after a dropped SSE:** `followLiveTurn` passes only `onChunk`, so
  tool events that arrive during recovery are dropped until the document
  refresh.

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
stats, and `attemptPostStreamRefresh`. Deleting the poller changes
`documentFetchesAfterDone`, and that scenario is where the "done arrives, then
no poll" test belongs.

Virtualizing in jsdom: jsdom lays nothing out, so every element measures 0 px.
A windowing library that sizes from `getBoundingClientRect` renders no rows at
all, and every `rows` digest goes empty. Either render a fallback window when
nothing is measured, or stub the measurement in the harness. Do not drop rows
from the snapshots.

## Wire facts for the typed event union (Landing 2)

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
  `durationMs`. On SSE, `_normalizeSSEData` adds `durationMs`; the socket path
  does not.
- **`approval_required`** is keyed by `toolCallId`. The tool's name and
  arguments are in `toolCall`. A card forwarded from a sub-agent adds
  `approvalConversationId`.
- **`goal_update`** has `change`: `set`, `progress`, `status` or `cleared`.
  The goal's own `status` is `active`, `paused`, `completed` or `blocked`.
- **Forwarded sub-agent events used to carry the sub-agent's `seq`.**
  `SubAgentTelemetryEmitter` forwards the sub-agent's `usage_update`,
  `approval_required` and `approval_decided`, and grandchildren's `sub_agent_*`
  events, to the parent stream. They carried the `seq` the sub-agent's own
  counter had stamped. Whenever the parent had emitted more events, that
  number ran backwards, and the cursor dropped the event as already seen.
  prism-service branch `forwarded-events-own-seq` makes the parent stamp its
  own `seq` on these events. Until it lands, a parent stream can still run
  backwards.
