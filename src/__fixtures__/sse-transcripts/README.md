# Agent-turn event transcripts

One JSON event per line, in the wire shape prism-service emits on the `/agent`
SSE stream and mirrors to `/ws/chat` subscribers. `data: ` framing is added by
the test harness, not stored here.

Consumers:
- `src/services/__tests__/transcriptReplay.test.ts` pins how `PrismService._dispatchSSE` routes events;
- `src/components/__tests__/chat-characterization/` replays them through the real `AgentChatComponent`, over both the SSE and the live-viewer socket (`docs/chat-characterization.md`).

## Where the shapes come from

Nothing here was captured from a live run. The `agent-turn-*` files are
assembled from prism-service's emitters on master `d601401a`, field for field.
These are the sources:

| Event | Emitter (prism-service) |
|---|---|
| `tool_execution` streaming / calling | `src/services/harnesses/lifecycle/StreamChunkRouter.ts` |
| `tool_execution` done / error (durations inside `tool`) | `src/services/harnesses/lifecycle/PostExecutionEmitter.ts` |
| `approval_required`, `approval_decided` | `src/services/harnesses/lifecycle/ApprovalGate.ts` |
| `plan_proposal` | `src/services/harnesses/lifecycle/PlanModeController.ts` |
| `user_question` | `src/services/tool-definitions/AskUserQuestionTool.ts` |
| `sub_agent_*` | `src/services/orchestrator/SubAgentTelemetryEmitter.ts` and `SubAgentLifecycleService.ts` |
| `status` compaction | `src/services/compact/CompactionService.ts` |
| `turn_input`, `status` turn_input_applied | `src/services/harnesses/lifecycle/TurnInputDrain.ts` |
| `goal_update` | `src/services/ConversationGoalService.ts` |
| `done` | `src/services/harnesses/lifecycle/Finalizer.ts` |
| `user_message` | `src/routes/ChatRoutes.ts` |
| `seq` stamping and replay | `src/utils/DirectViewerBroadcast.ts` |

`approvals/approval-required-write-file.json` looks like a live capture: it has a Google-style `toolCallId` and a real `seq`.

`agent-turn-with-tools.jsonl` and `turn-side-channels.jsonl` are older and
hand-written, and they drift from the wire. They carry no `seq`. Their
`tool_execution` done events put `durationMilliseconds` at the top level. Their
`context_budget` is `{used, total}`, which the chat cannot read: it renders
"undefined / undefined tokens (NaN%)". Their todo items have no `id`. They
stay as they are because `transcriptReplay.test.ts` pins them.

## Conventions

- **`seq`:** every event carries one, starting at `1790078400001`, the same
  as the harness clock's epoch. The service seeds each conversation's counter
  from `Date.now()` and adds one per event. The only exceptions are
  `conversation_state_update`, a `subscribed` ack, and the
  `GENERATION_IN_PROGRESS` error.
- **`conversationId`:** `user_message` and `done` carry the placeholder
  `conv-fixture`. The chat ignores the id on both.
- **A turn begins with `user_message`.** The exception is
  `agent-turn-error-before-loop.jsonl`: context preparation failed, so no
  turn started.

## The files

| File | What it covers |
|---|---|
| `agent-turn-with-tools.jsonl` | Thinking, text, and a read_file call. A sub-agent with one tool. Usage and a (stale-shaped) context budget. |
| `turn-side-channels.jsonl` | The checklist (`todo_update`), the brief, web search sources, a code run. |
| `agent-turn-approval.jsonl` | Two write_file calls in one batch get two cards. One is allowed and one denied, and the denied call returns `USER_REJECTED`. |
| `agent-turn-budget-pause.jsonl` | Two read_file passes against a $1.50 cap: the second crosses it and the turn pauses (`status: budget_reached`, the call not run) until the cap is raised (`budget_resolved`), then finishes. Emitters: `harnesses/lifecycle/BudgetPauseGate.ts` (prompt 13 Landing 3). |
| `agent-turn-plan.jsonl` | A `plan_proposal` the user approves, then `plan_mode_exited`. |
| `agent-turn-question-blocking.jsonl` | A blocking `user_question` that the turn waits on. |
| `agent-turn-question-nonblocking.jsonl` | A `blocking: false` question and `question_pending`. The agent keeps working, and the answer returns as a `turn_input` of kind `question_answer`. |
| `agent-turn-subagents.jsonl` | Two sub-agents. It covers every `sub_agent_status` message, tool execution and output, one complete with usage, one failed. |
| `agent-turn-compaction.jsonl` | Compaction started, its usage, and complete. The context budget goes from estimated to reported, and a `generation_progress` arrives. |
| `agent-turn-error-before-loop.jsonl` | Context preparation failed: the stream holds only `error`. |
| `agent-turn-error-in-loop.jsonl` | The loop threw. It persists and emits `done`, and then the route emits `error`, in that order. |
| `agent-turn-iteration-limit.jsonl` | Command stdout and stderr, then `iteration_limit_reached` before `done`. |
| `agent-turn-steering.jsonl` | A `user_update` turn input applied at the `after_tools` boundary. |
| `agent-turn-goal.jsonl` | A goal is set and progresses. Then `done`. Then the goal completes and a hook system message arrives, both after `done`, as the afterResponse hooks send them. |
| `agent-turn-reconnect.jsonl` | A plain turn used to replay after a drop, from `afterSeq`. |
