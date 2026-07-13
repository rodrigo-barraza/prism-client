# Prism Client → Service: Business-Logic Audit

**Date:** 2026-07-13
**Question:** Is there business logic in `prism-client` that should be moved to `prism-service`?
**Method:** Five parallel investigators swept the client's services, utils, hooks/analytics, model-catalog usage, and the large orchestration components, cross-referencing `prism-service/src` for existing equivalents. Key findings were spot-verified against source.

## Bottom line

The client is **in good architectural shape**. The heavy lifting is already server-side and correctly so: the agentic tool-call loop (`/agent` + `AgenticLoopService`), token **estimation** and per-request **cost/pricing** math (`CostCalculator`), system-prompt assembly (`SystemPromptAssembler`), benchmark/workflow execution, and the model catalog/pricing/capabilities served by `GET /config`. There is **no** client-side "detect tool_calls → execute → re-POST" loop, and no OpenAI-vs-Anthropic payload shaping in the chat path.

What leaked into the client falls into three buckets: (1) a handful of **verbatim/near-verbatim duplications** of backend logic that will silently drift, (2) **provider/model capability rules hardcoded** as `provider === "x"` branches or model-name pattern matches instead of being driven by service capability flags, and (3) **one genuine orchestration pipeline** (multi-model synthesis) that runs entirely in the browser against CRUD-only backend routes.

Nothing here is on fire. The High items are about **correctness-under-drift** and **single-source-of-truth**, not current outages.

---

## High severity

### H1 — `getTotalInputTokens` is duplicated byte-for-byte (billing math)
- **Client:** [src/utils/utilities.ts:59-68](prism-client/src/utils/utilities.ts#L59-L68)
- **Service:** `prism-service/src/utils/CostCalculator.ts:46-55`
- Identical name, body, and doc comment. It encodes a billing-adjacent rule — how Anthropic/Google split prompt tokens across `inputTokens + cacheReadInputTokens + cacheCreationInputTokens`. If a provider later adds another cache bucket, the two copies diverge and the client's token/cost display disagrees with the server's billing.
- **Fix:** Have the service emit the pre-summed value on the usage object, or share the helper via the common `utilities-library`. The client should not re-derive billing token composition.

### H2 — Admin per-provider rollups are recomputed in the browser
- **Client:** [src/app/admin/page.tsx:307-404](prism-client/src/app/admin/page.tsx#L307-L404) and [src/app/admin/providers/page.tsx:88-123](prism-client/src/app/admin/providers/page.tsx#L88-L123)
- Both pages fetch **per-model** stats (`/stats/models`) and re-group them into **per-provider** rollups client-side — summing cost and computing request-weighted average latency and tok/s by hand.
- The service **already returns this exact rollup**: `AdminStatsRoutes` `/stats/costs` emits a `providers` facet with `totalCost`, `totalInputTokens`, `totalOutputTokens`, `totalRequests`, `avgTokensPerSec`, built from shared `COST_SUMMATION_EXPRESSION` / `AVERAGE_TOKENS_PER_SECOND_EXPRESSION`. A request-weighted average of per-model averages (what the client does) is **not** arithmetically identical to a true aggregate, so the admin UI can report numbers that drift from the authoritative `/stats/costs`.
- **Fix:** Consume the `providers` facet from `/stats/costs` instead of re-aggregating `/stats/models`.

### H3 — Multi-model synthesis orchestration runs entirely client-side
- **Client:** [src/components/SynthesisComponent.tsx:382-694](prism-client/src/components/SynthesisComponent.tsx#L382-L694) (`handleGenerate`), `streamTurn` 1240-1316, `buildUserSimulationPrompt` 1323-1350
- The browser drives a full synthetic-conversation loop: a turn loop alternating assistant/user turns to `targetTurns` (one raw `/chat` call each), **client-side persona/system-prompt construction** ("You are simulating a human user…"), a **selected user-simulator model**, and **provider-specific chat-template shaping** — it role-swaps messages so the simulator sees assistant turns as "user," then patches ordering because "many local models require messages to alternate user → assistant → user." Only the finished artifact is persisted via `createSynthesisRun`.
- **Verified:** `SynthesisRoutes.ts` is CRUD only (GET/GET/POST/PATCH/DELETE) — the server never sees the orchestration. Meanwhile `OrchestratorService` / `/coordinator` already does multi-model coordination server-side, and personas/system-prompt/harness logic already lives in the service.
- **Fix:** Add a synthesis-orchestration endpoint (or fold into `OrchestratorService`) that owns the turn loop, persona prompt, model selection, and template alternation. Keep only token streaming + optimistic render in the client.

---

## Medium severity

### M1 — Provider/model capability rules hardcoded across the UI
The client repeatedly decides model capabilities from **provider strings** and **model-name substrings** instead of service-provided flags. These duplicate each other (drift risk) and second-guess the authoritative catalog:
- **Google always-on thinking:** `provider === "google" && modelDef.thinking` — [ChatConversationComponent.tsx:1618](prism-client/src/components/ChatConversationComponent.tsx#L1618)
- **LM Studio name-based thinking:** `provider === "lm-studio" && isNameBasedThinkingModel` (pattern-match on model name) — [ChatConversationComponent.tsx:2653-2662](prism-client/src/components/ChatConversationComponent.tsx#L2653-L2662), duplicated in [SettingsPanelComponent.tsx:1105](prism-client/src/components/SettingsPanelComponent.tsx#L1105) and [SynthesisComponent.tsx:1278](prism-client/src/components/SynthesisComponent.tsx#L1278)
- **OpenAI reasoning detection:** `model.includes("o1") || model.includes("o3")` — [ParametersPanelComponent.tsx:107-110](prism-client/src/components/ParametersPanelComponent.tsx#L107-L110) (the `.thinking` half is correctly config-driven; the substring fallback isn't)
- **Anthropic temperature lock:** hardcoded `currentProvider === "anthropic"` branch that locks temperature while thinking is on — [ParametersPanelComponent.tsx:200-207](prism-client/src/components/ParametersPanelComponent.tsx#L200-L207)
- The name-based thinking inference is even used to **gate a tool** (locking the `think` tool, ChatConversationComponent 2665) — that's tool-availability *policy* in the presentation layer.
- **Fix:** Express these as per-model capability flags / `parameterDescriptors.providerOverrides` in `/config`. The plumbing already exists and is consumed right beside these branches (`descriptor.providerOverrides?.[provider].locked`, `model.thinking`, `model.adaptiveThinking`); the Anthropic/Google/lm-studio cases simply weren't modeled server-side.

### M2 — `prepareDisplayMessages` normalization duplicated
- **Client:** [src/utils/messageHelpers.ts:12-169](prism-client/src/utils/messageHelpers.ts#L12-L169)
- **Service:** `prism-service/src/services/conversation/prepareDisplayMessages.ts` (near line-for-line twin, with its own test)
- The client re-implements provider tool-call normalization: `tool_calls → toolCalls`, `JSON.parse`-ing stringified `function.arguments`, keying tool results by `tool_call_id`, merging durations, extracting base64/`audioRef` audio from tool-result JSON. The file header notes the backend now returns pre-joined `displayMessages` and this remains for "edge cases," but it's still actively used by `requestDetailHelpers.tsx` (`reconstructChatMessages`).
- **Fix:** Have the request-detail endpoint also return `displayMessages`, then delete the client copy.

### M3 — Hardcoded model-ID → label catalog
- **Client:** [src/components/BadgeComponent.tsx:222-278](prism-client/src/components/BadgeComponent.tsx#L222-L278) (`STATIC_MODEL_LABELS`, ~60 entries)
- A full snapshot of the catalog's `label` field (`"gpt-5.2": "GPT 5.2"`, `"claude-opus-4-8": "Opus 4.8"`, …) that `/config` already provides per model. A dynamic override (`registerModelLabels`) takes priority, but this static map is what renders before config loads and drifts as models are added/renamed server-side.
- **Fix:** Seed from `/config` labels; keep at most a tiny hardcoded fallback for the pre-load flash.

### M4 — `deriveAgentConversationState` lifecycle state machine
- **Client:** [src/utils/agentConversationStates.ts:57-81](prism-client/src/utils/agentConversationStates.ts#L57-L81)
- A priority-ordered reducer (`generating → orchestrating → completed → completed-with-errors → sub-agents-running → …`) derived from raw Mongo fields (`isActive`, `isGenerating`, `pendingBackgroundTasks`, `hasSubAgents`, `requestErrorCount`). The service owns all these fields and their transitions but exposes no single derived `state` enum, so any consumer must re-derive the same ladder. (The color/label/pulse mapping below it is correctly client-side.)
- **Fix:** Compute a canonical `state` enum server-side and send it.

### M5 — LM Studio load-option key mapping duplicated
- **Client:** [src/utils/utilities.ts](prism-client/src/utils/utilities.ts) `buildLmStudioLoadBody` (~33-52), consumed by `PrismService.tsx` / `IrisService.ts`
- Maps camelCase options to LM Studio's snake_case provider keys (`offloadKvCache → offload_kv_cache_to_gpu`, etc.). `prism-service/src/routes/LmStudioRoutes.ts:53-75` already destructures these exact snake_case keys — the client shouldn't know provider load-option vocabulary.
- **Fix:** Accept the camelCase form at the backend and own the mapping there.

### M6 — Benchmark tok/s recomputed as tokens ÷ latency
- **Client:** [src/utils/tableColumns.tsx:1138-1163](prism-client/src/utils/tableColumns.tsx#L1138-L1163) (`benchmarkTokPerSecColumn`)
- `outputTokens / latency` is a second, inconsistent definition of throughput (round-trip latency as denominator) versus the server's authoritative `tokensPerSecond` / `AVERAGE_TOKENS_PER_SECOND_EXPRESSION`.
- **Fix:** Render the server-persisted per-request `tokensPerSecond`.

### M7 — Hardcoded default model IDs as reset fallbacks
- **Client:** [src/components/SettingsPageComponent.tsx:678-684](prism-client/src/components/SettingsPageComponent.tsx#L678-L684)
- `handleResetCreative` falls back to literal IDs (`gemini-3-pro-image-preview`, `gemini-3.5-flash`, …) when `defaults.creative.*` is absent. `/config` already serves per-modality `defaults` / `recommendedDefault`; these will drift when the recommended default changes server-side.
- **Fix:** Resolve from `/config` defaults.

### M8 — MinIO file-reference resolution + IPv6 scrub in the client
- **Client:** [src/services/PrismService.tsx:81-89](prism-client/src/services/PrismService.tsx#L81-L89) (`resolveFileReference`)
- Parses `minio://` refs, strips a `::ffff:` IPv6-mapped prefix, and reconstructs the bucket URL — storage addressing the backend owns and already resolves internally (`MediaResolutionService`, `FileService`). The `::ffff:` scrub is the client patching malformed keys the backend emitted.
- **Fix:** Have the backend hand the client a clean, renderable URL (and fix the key at the source).

---

## Low severity / cleanup

- **Client self-elevates to admin:** `IrisService.getAdminHeaders` stamps `x-username: "admin"` on every admin call ([IrisService.ts:27-29](prism-client/src/services/IrisService.ts#L27-L29)). An access-control decision in the presentation layer (trivially spoofable) — a **security** note, not business logic to relocate. Should become real server-side auth.
- **Plan proposal re-parsed from prose:** [ChatConversationComponent.tsx:6182-6194](prism-client/src/components/ChatConversationComponent.tsx#L6182-L6194) reconstructs `planSteps` by regex-splitting rendered assistant text. `PlanningModeService` produces the plan; the structured steps should arrive as API data.
- **Graph topology/sequence inference:** [useConversationGraphData.ts:143-291, 691-871](prism-client/src/hooks/useConversationGraphData.ts#L143-L291) re-reasons about topology/layout and infers next sequence/turn numbers, duplicating what the graph endpoint owns. The optimistic "pending" placeholder node is legitimately client-side; the surrounding layout math is the concern.
- **Coordinator sub-agent field normalization:** `PrismService.tsx:1031-1047` renames server fields and applies a `toolCallCount ?? toolUses` canonical-count fallback — finalize server-side.
- **`ModelOption` type drift:** [src/types/types.ts:57-99](prism-client/src/types/types.ts#L57-L99) mixes real `/config` fields with a stale parallel set (`inputCostPer1M`, `supportsVision`, `contextLength`, …) that has no producer in `/config`. Type-only, but invites reading always-`undefined` fields.
- **VRAM leaderboard thresholds:** `VramBenchmarkComponent.tsx` bakes domain policy constants (`CHAT_TPS_THRESHOLD = 30`, `LARGE_VRAM_THRESHOLD = 8`, efficiency ranking) into presentation. Defensible dashboard analytics over server data; cleaner as a server leaderboard endpoint.
- **Synthetic load-progress telemetry:** `loadLmStudioModelStream` invents an asymptotic progress curve because `/lm-studio/load` is non-streaming — acceptable UX affordance, or add a streaming load endpoint.
- **Image-generation payload assembly:** `generateImage` builds a chat `messages` array client-side, though `ChatRoutes` re-derives prompt+images server-side anyway — a thin adapter; a `{prompt, images}` endpoint would remove it.

---

## Confirmed correct (checked, not flagged)

To be clear about what is **rightly** client-side:
- **Agentic loop** — single `/agent` call per user message; no client tool-call loop, no local tool execution (approvals only *signal* the server).
- **Cost & token estimation** — computed server-side; the client renders server-provided `estimatedCost` / `totalCost` and only sums already-authoritative numbers for live display.
- **System-prompt assembly** — sent as an empty placeholder, filled by `SystemPromptAssembler`; preview fetched via `/config/system-prompt-preview`.
- **Model catalog/pricing/capabilities** — driven by `GET /config` (labels, arena, modalities, defaults, voices, `parameterDescriptors`, `thinkingPatterns`).
- **Benchmark & workflow execution** — delegated to `/benchmark` and `/workflows/:id/run` (WorkflowExecutor is a thin SSE client; DAG orchestration already moved server-side).
- **Live streaming metrics** (`useTokenRate`, `useTtft`) — real-time tok/s and TTFT that must be client-side and defer to server values post-hoc.
- **Renderer-coupled transforms** (`latexSanitizer`, `xmlTagEscaper`), SSE/WebSocket plumbing, `mentionUtils` DOM handling, localStorage/toggle/filter state — all correctly presentation-scoped.

---

## Suggested order of attack

1. **H1 / H2** — kill the two verbatim duplications (`getTotalInputTokens`, admin provider rollup). Small changes, direct correctness/consistency payoff.
2. **M1** — model the provider/name-based capability rules as `/config` flags + `providerOverrides`; removes the largest cluster of drift-prone `provider === "x"` branches and de-duplicates the thinking logic across four components.
3. **H3** — the bigger project: give synthesis a server-side orchestration endpoint.
4. **M2–M8 / Low** — incremental cleanup as those areas are touched.
