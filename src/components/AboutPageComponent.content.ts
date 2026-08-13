/* ════════════════════════════════════════════════════════════
   AboutPageComponent.content — Research paper implementation data
   Static dataset rendered by AboutPageComponent. Badge tones map to
   theme color tokens (see AboutPageComponent.module.css).
   ════════════════════════════════════════════════════════════ */

import { Brain, Cog, PawPrint, Puzzle, Shield, Waypoints } from "lucide-react";
import type { AlignmentStatus } from "./AlignmentStatusIndicatorComponent";

/** Theme color token names available as category badge tones. */
export type BadgeTone =
  | "indigo"
  | "info"
  | "violet"
  | "warning"
  | "emerald"
  | "cyan"
  | "rose"
  | "purple"
  | "teal"
  | "danger"
  | "success"
  | "orange";

export interface AlignmentEntry {
  component: string;
  status: AlignmentStatus;
  detail: string;
}

export interface ResearchPaper {
  title: string;
  authors: string;
  year: number | null;
  arxivUrl: string | null;
  /** Docs/GitHub link for industry (non-arXiv) sources — rendered like arxivUrl but excluded from the academic-paper count. */
  sourceUrl?: string | null;
  description: string;
  implementationFile: string;
  categoryLabel: string;
  badgeTone: BadgeTone;
  alignment?: AlignmentEntry[];
}

export interface PaperCategory {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  papers: ResearchPaper[];
}

export const PAPER_CATEGORIES: PaperCategory[] = [
  {
    title: "Thought Structures",
    icon: Brain,
    papers: [
      {
        title: "ReAct: Synergizing Reasoning and Acting in Language Models",
        authors: "Yao et al.",
        year: 2022,
        arxivUrl: "https://arxiv.org/abs/2210.03629",
        description:
          "The foundational Reason→Act→Observe tool-use loop that powers the core agentic harness. Interleaves chain-of-thought reasoning with action execution and observation grounding.",
        implementationFile: "ReActHarness.ts",
        categoryLabel: "Core Harness",
        badgeTone: "indigo",
      },
      {
        title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models",
        authors: "Wei et al.",
        year: 2022,
        arxivUrl: "https://arxiv.org/abs/2201.11903",
        description:
          "Single-pass sequential reasoning per iteration. The agent reasons, selects tool calls, observes results, and iterates — one step at a time. The default and most efficient thought structure, with each iteration's output feeding the next in a single sequential chain.",
        implementationFile: "ReActHarness.ts",
        categoryLabel: "Sequential Reasoning",
        badgeTone: "info",
        alignment: [
          { component: "Linear reasoning chain", status: "aligned", detail: "Each iteration produces one reasoning step that feeds the next — a sequential chain with no branching, matching CoT's linear decomposition" },
          { component: "Single-pass generation", status: "aligned", detail: "One LLM call per iteration — no branching or parallel exploration" },
          { component: "Execution pattern (ReAct)", status: "aligned", detail: "The tool-use loop follows the ReAct pattern (Yao et al. 2022): interleaved reasoning traces with actions and observations" },
          { component: "Few-shot exemplars (paper)", status: "simplified", detail: "Not implemented — the paper injects step-by-step exemplar chains into the prompt; this relies on the model's native reasoning" },
        ],
      },
      {
        title: "Tree of Thoughts: Deliberate Problem Solving with Large Language Models",
        authors: "Yao et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2305.10601",
        description:
          "Parallel branching strategy that explores multiple reasoning paths simultaneously, scores each branch against evaluation criteria, then selects the highest-scoring trajectory to continue.",
        implementationFile: "TreeOfThoughtsStrategy.ts",
        categoryLabel: "Thought Structure",
        badgeTone: "violet",
        alignment: [
          { component: "Thought generation", status: "aligned", detail: "Generates N parallel branches with structured diversity descriptors — maps to the paper's thought generator G(pθ, s, k)" },
          { component: "Deliberate evaluation", status: "extended", detail: "Uses a fixed 4-criteria weighted rubric (correctness×0.4 + risk×0.25 + efficiency×0.15 + completeness×0.2) — paper uses categorical heuristics" },
          { component: "BFS search", status: "aligned", detail: "BFS generates N branches in parallel, retains top-b as frontier candidates — mirrors the paper's 'b best states' (Algorithm 1)" },
          { component: "DFS search", status: "aligned", detail: "DFS explores siblings sequentially with value-threshold pruning — mirrors the paper's depth-first pruning (Algorithm 2)" },
          { component: "Proactive backtracking", status: "aligned", detail: "Value-threshold pruning before tool execution — matches the paper's state evaluator V(s) pruning" },
          { component: "Reactive backtracking", status: "extended", detail: "Validation-triggered backtracking with Reflexion-style self-correction prompts (Shinn et al. 2023) — paper does not include post-execution validation" },
          { component: "Sandbox checkpointing", status: "extended", detail: "Git-based filesystem state capture and rollback on backtrack — novel engineering, not in paper" },
        ],
      },
      {
        title: "Graph of Thoughts: Solving Elaborate Problems with Large Language Models",
        authors: "Besta et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2308.09687",
        description:
          "Extends Tree of Thoughts into a directed acyclic graph where branches can merge, aggregate, and synthesize — enabling complex multi-path reasoning with GoT-style aggregation passes.",
        implementationFile: "GraphOfThoughtsStrategy.ts",
        categoryLabel: "Thought Structure",
        badgeTone: "violet",
        alignment: [
          { component: "Thought generation", status: "aligned", detail: "Generates N parallel branches with structured diversity descriptors — maps to the paper's Generate operation" },
          { component: "Aggregation / synthesis", status: "aligned", detail: "Synthesis pass merges best aspects of all branches — the core GoT differentiator, directly mapping to the paper's Aggregate operation" },
          { component: "Graph structure (DAG)", status: "simplified", detail: "Not implemented — paper defines thoughts as a DAG with typed transformations; implementation is branch → score → synthesize per iteration" },
          { component: "Typed operations (paper)", status: "simplified", detail: "Not implemented — paper defines Generate, Aggregate, Refine, Score as explicit graph operations; these are bundled implicitly in the loop" },
        ],
      },
      {
        title: "Reflexion: Language Agents with Verbal Reinforcement Learning",
        authors: "Shinn et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2303.11366",
        description:
          "Self-correction via verbal reflection. When a branch fails validation, the system restores a checkpoint and injects a reflexion prompt describing what went wrong for self-corrective retry.",
        implementationFile: "TreeOfThoughtsStrategy.ts",
        categoryLabel: "Self-Correction",
        badgeTone: "warning",
      },
    ],
  },
  {
    title: "Multi-Agent Topologies",
    icon: Waypoints,
    papers: [
      {
        title: "Mixture-of-Agents Enhances Large Language Model Capabilities",
        authors: "Wang et al.",
        year: 2024,
        arxivUrl: "https://arxiv.org/abs/2406.04692",
        description:
          "Multi-layer Mixture-of-Agents architecture where proposer agents run in parallel, then an aggregator LLM synthesizes all outputs into a unified result. Supports configurable layer stacking for iterative refinement — each layer's synthesis feeds the next as context.",
        implementationFile: "HierarchicalAggregationRouter.ts",
        categoryLabel: "Synthesis",
        badgeTone: "teal",
        alignment: [
          { component: "Layered architecture", status: "aligned", detail: "Multi-layer stacking via layerCount config" },
          { component: "Proposer/Aggregator roles", status: "aligned", detail: "Members are proposers, synthesis LLM is the aggregator" },
          { component: "Collaborativeness", status: "aligned", detail: "Aggregator sees all proposer outputs as auxiliary information" },
          { component: "Model diversity", status: "aligned", detail: "Warning logged when all proposers share same model" },
          { component: "Iterative refinement", status: "aligned", detail: "Each layer's synthesis feeds into next layer as context" },
        ],
      },
      {
        title: "Large Language Monkeys: Scaling Inference Compute with Repeated Sampling",
        authors: "Brown et al.",
        year: 2024,
        arxivUrl: "https://arxiv.org/abs/2407.21787",
        description:
          "Best-of-N selection where multiple sub-agents solve the same task independently in parallel, then an LLM judge evaluates all outputs and selects the single best result. Optionally runs automated verification (tsc, tests) on each candidate before judging.",
        implementationFile: "TournamentRouter.ts",
        categoryLabel: "Selection",
        badgeTone: "purple",
        alignment: [
          { component: "Repeated sampling", status: "aligned", detail: "Fan-out N sub-agents in parallel" },
          { component: "Verification", status: "aligned", detail: "Automated verifiers (tsc, tests) run on each candidate when enabled; falls back to LLM judge" },
          { component: "Coverage scaling", status: "aligned", detail: "Theoretical finding — N/A for implementation" },
          { component: "Selection", status: "aligned", detail: "Judge selects best result verbatim, informed by verification outcomes" },
        ],
      },
      {
        title: "Self-Refine: Iterative Refinement with Self-Feedback",
        authors: "Madaan et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2303.17651",
        description:
          "Iterative actor→critic refinement loop where actor agent(s) produce output and critic agent(s) evaluate with structured improvement instructions. Supports solo, council, and jury critic modes with degeneration-of-thought detection and stateful session continuity.",
        implementationFile: "CriticLoopRouter.ts",
        categoryLabel: "Iterative Refinement",
        badgeTone: "rose",
        alignment: [
          { component: "Generate (initial output)", status: "aligned", detail: "Actor agent produces initial output" },
          { component: "Feedback (critic)", status: "extended", detail: "Separate critic agent(s), not same-LLM self-critique" },
          { component: "Refine (incorporate)", status: "aligned", detail: "Actor continues with aggregated critic feedback" },
          { component: "Iterative loop", status: "aligned", detail: "Loops until unanimous PASS or maxRounds" },
          { component: "Council / Jury modes", status: "extended", detail: "Original extensions beyond paper scope — multiple critics with consensus gating" },
        ],
      },
      {
        title: "Improving Factuality and Reasoning through Multi-Agent Debate",
        authors: "Du et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2305.14325",
        description:
          "Stateful peer-to-peer mesh where agents take turns on a shared discussion board. Each agent preserves session state across turns, seeing all prior messages from every other agent. Includes stall detection and git-based worktree merges for collaborative file editing.",
        implementationFile: "PeerToPeerRouter.ts",
        categoryLabel: "Multi-Agent Debate",
        badgeTone: "info",
        alignment: [
          { component: "Multiple agents", status: "aligned", detail: "Multiple agents with configurable models/prompts" },
          { component: "Multi-round debate", status: "aligned", detail: "Turn-based mesh with shared discussion thread" },
          { component: "Convergence", status: "aligned", detail: "Stall detection terminates early when agents stop contributing" },
          { component: "Symmetric design", status: "aligned", detail: "All agents are equal participants in the mesh" },
          { component: "Stateful sessions", status: "extended", detail: "Stateful session reuse via continueSubAgent — paper uses stateless agents" },
          { component: "Worktree merging", status: "extended", detail: "Agents can edit files and see each other's edits — novel engineering" },
        ],
      },
      {
        title: "Recursive Decomposition with Dependencies for Generic Divide-and-Conquer Reasoning",
        authors: "Boussioux et al.",
        year: 2025,
        arxivUrl: "https://arxiv.org/abs/2505.02576",
        description:
          "Recursive decompose→solve→merge framework where the LLM planner breaks complex tasks into subtasks with dependency ordering. Subtasks are grouped into execution tiers via topological sort — each tier runs in parallel, with a final synthesis merge.",
        implementationFile: "DivideAndConquerRouter.ts",
        categoryLabel: "Task Decomposition",
        badgeTone: "cyan",
        alignment: [
          { component: "Recursive decomposition", status: "aligned", detail: "LLM planner decomposes task into subtasks" },
          { component: "Dependency DAG", status: "aligned", detail: "Planner outputs dependsOn indices; topological sort groups into tiers" },
          { component: "Sub-task execution", status: "aligned", detail: "Each subtask dispatched to a sub-agent (tier-parallel)" },
          { component: "Recomposition", status: "aligned", detail: "Synthesis pass merges all subtask results" },
          { component: "Recursive depth", status: "aligned", detail: "Subtasks exceeding complexity threshold are recursively decomposed (configurable depth, max 3)" },
        ],
      },
      {
        title: "Language Agent Tree Search (LATS)",
        authors: "Zhou et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2310.04406",
        description:
          "True Monte Carlo Tree Search with UCB1-guided node selection. Each iteration selects the most promising unexpanded leaf via recursive UCB1 traversal, expands it into parallel branches, evaluates with an LLM judge, and backpropagates scores up the ancestor chain.",
        implementationFile: "MCTSRouter.ts",
        categoryLabel: "Tree Search",
        badgeTone: "emerald",
        alignment: [
          { component: "Selection (UCB1)", status: "aligned", detail: "Recursive UCB1 tree walk selects most promising unexpanded leaf" },
          { component: "Expansion", status: "aligned", detail: "Spawns branchFactor sub-agents in parallel from selected leaf" },
          { component: "Evaluation", status: "aligned", detail: "LLM judge scores branches on correctness/completeness/quality with per-branch feedback" },
          { component: "Simulation (rollout)", status: "aligned", detail: "LATS paper replaces classical rollouts with LLM value-function evaluation — implemented as specified" },
          { component: "Backpropagation", status: "aligned", detail: "Running-average V(s) update along parent chain after each expansion" },
          { component: "Tree structure", status: "aligned", detail: "Full tree maintained with UCB1-guided re-visitation of unexplored siblings" },
        ],
      },
      {
        title: "THREAD: Thinking Deeper with Recursive Spawning",
        authors: "Schroeder et al.",
        year: 2024,
        arxivUrl: "https://arxiv.org/abs/2405.17402",
        description:
          "Recursive hierarchical delegation — any sub-agent can itself spawn child sub-agents down to a bounded depth. The parent's depth is tracked so each child runs at depth + 1, with coordinator-vs-worker roles assigned per level and the iteration budget attenuated at every delegation hop.",
        implementationFile: "OrchestratorService.ts",
        categoryLabel: "Recursive Delegation",
        badgeTone: "indigo",
        alignment: [
          { component: "Recursive spawning", status: "aligned", detail: "Any agent can spawn child sub-agents; each child runs at parentDepth + 1" },
          { component: "Bounded depth", status: "aligned", detail: "childRecursionDepth is gated against maxRecursionDepth to prevent unbounded fan-out (off-by-one guarded)" },
          { component: "Coordinator/Worker roles", status: "extended", detail: "Per-level role assignment — coordinators delegate, workers execute (RAH-style)" },
          { component: "Hierarchical aggregation", status: "aligned", detail: "Child results bubble up and are aggregated at each parent via SubAgentResultBuilder" },
          { component: "Scope attenuation", status: "extended", detail: "Iteration budget shrinks by a fixed factor at every hop, with a minimum floor" },
        ],
      },
    ],
  },
  {
    title: "Harness Lifecycle & Reliability",
    icon: Cog,
    papers: [
      {
        title: "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering",
        authors: "Yang et al.",
        year: 2024,
        arxivUrl: "https://arxiv.org/abs/2405.15793",
        description:
          "Git-based filesystem checkpointing and rollback. Before a batch of destructive tool calls the harness captures a `git stash create` checkpoint; if validation fails or a Tree-of-Thoughts branch is rejected, the working tree is restored — complementing conversation-level backtracking with filesystem-level backtracking.",
        implementationFile: "SandboxExecutor.ts",
        categoryLabel: "Checkpointing",
        badgeTone: "info",
        alignment: [
          { component: "Filesystem checkpoint", status: "aligned", detail: "`git stash create` snapshots the working tree without polluting the user's stash reflog" },
          { component: "Surgical restore", status: "aligned", detail: "`git checkout <ref> -- .` replaces the working tree without touching HEAD" },
          { component: "Pairs with ToT backtracking", status: "extended", detail: "Restores filesystem state alongside conversation state on branch rejection — a gap ToT alone leaves open" },
          { component: "Fails open", status: "extended", detail: "Verifies a git repo first and never blocks execution on checkpoint failure" },
        ],
      },
      {
        title: "Event-Driven System Reminders",
        authors: "Reliability Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Counteracts instruction fade-out in long sessions: as a loop grows past ~10 iterations the system prompt recedes into the distant context prefix and constraint adherence degrades. An LLM distills a condensed (~300-token) behavioral summary that is re-injected on a fixed interval and cached thereafter.",
        implementationFile: "SystemReminderInjector.ts",
        categoryLabel: "Reliability",
        badgeTone: "teal",
      },
      {
        title: "Structured Tool-Error Recovery",
        authors: "Reliability Pattern",
        year: null,
        arxivUrl: null,
        description:
          "When a tool call errors, instead of surfacing only the raw error the harness injects a structured system message naming the failed tool, its arguments, and the error — then prompts the model to diagnose which argument caused the failure and retry. Recovery is guided, not forced.",
        implementationFile: "ToolRetryInterceptor.ts",
        categoryLabel: "Error Recovery",
        badgeTone: "orange",
      },
      {
        title: "Automatic Validation Feedback Loop",
        authors: "Reliability Pattern",
        year: null,
        arxivUrl: null,
        description:
          "The “linter loop”: after file-mutating tool calls the harness runs language-aware linter/AST validation and, on error, injects the structured feedback as a synthetic message so the model self-corrects on the next iteration without spending another tool call.",
        implementationFile: "ValidationInterceptor.ts",
        categoryLabel: "Validation",
        badgeTone: "success",
      },
      {
        title: "Output-Truncation Recovery",
        authors: "Reliability Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Auto-continues when a response is cut short by the max-output-tokens limit. Rather than discarding the partial output, it is appended and a continuation prompt injected so the model resumes where it left off — retried with escalating token limits, clamped to the model's physical ceiling.",
        implementationFile: "OutputTruncationRecovery.ts",
        categoryLabel: "Continuation",
        badgeTone: "cyan",
      },
      {
        title: "Semantic Stall Detection",
        authors: "Reliability Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Iteration-level loop detection. Compares entire tool-call sets across consecutive iterations to catch zero-progress behavior — exact repeats, cyclical alternation between a few states, or identical text output — complementing token-level repetition detection within a single generation.",
        implementationFile: "SemanticStallDetector.ts",
        categoryLabel: "Loop Detection",
        badgeTone: "rose",
      },
      {
        title: "Per-Session Cost Budget Enforcement",
        authors: "Reliability Pattern",
        year: null,
        arxivUrl: null,
        description:
          "A cost ceiling for agentic loops. Cumulative estimated spend is checked after every iteration and, once the configured maxCostDollars is exceeded, the loop breaks into exhaustion recovery. A shared budget accumulates spend across an agent and every sub-agent it transitively spawns.",
        implementationFile: "CostBudgetEnforcer.ts",
        categoryLabel: "Cost Control",
        badgeTone: "warning",
      },
      {
        title: "Recursive Delegation Guardrails",
        authors: "Safety Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Bounds on recursive sub-agent spawning: a hard circuit breaker on total concurrent agents per conversation to prevent exponential fan-out, plus scope attenuation that shrinks each child's iteration budget by a fixed factor at every delegation hop.",
        implementationFile: "constants.ts",
        categoryLabel: "Guardrails",
        badgeTone: "danger",
      },
      {
        title: "Rich Code-Interpreter Results (Jupyter/e2b Result Model)",
        authors: "e2b — code-interpreter",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/e2b-dev/code-interpreter",
        description:
          "execute_python returns figures, not just text: an injected epilogue auto-saves open matplotlib figures (plus any image files the script writes into its sandbox working directory), which are uploaded and attached as image displays. Includes the enabling fix — the memory cap moved from RLIMIT_AS to RLIMIT_DATA with single-threaded BLAS, because numpy/OpenBLAS address-space reservations made `import matplotlib` hang under the old cap.",
        implementationFile: "PythonInterpreterService.ts",
        categoryLabel: "Tool Results",
        badgeTone: "violet",
        alignment: [
          { component: "Figure auto-capture", status: "aligned", detail: "A script epilogue saves open figures (pyplot's own atexit hook destroys them before a preamble-registered atexit can run — LIFO order), plus a working-directory scan collects savefig() output" },
          { component: "Rich result envelope", status: "simplified", detail: "Images only — e2b also captures DataFrame/HTML/LaTeX reprs of the last expression; print(df) covers tables in a script (non-REPL) sandbox" },
          { component: "Display contract", status: "extended", detail: "Figures ride the self-describing display{kind:'image'} result convention, so web and Discord render them with zero client changes" },
        ],
      },
      {
        title: "Language-Server Diagnostics as an Agent Tool",
        authors: "isaacphi — mcp-language-server; oraios — serena",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/isaacphi/mcp-language-server",
        description:
          "code_intel exposes the LSP subsystem (goToDefinition, findReferences, hover, documentSymbol — and now diagnostics) as a single agent tool, following mcp-language-server and serena (https://github.com/oraios/serena). Diagnostics close the edit-verify loop: after editing a file the agent gets real tsserver/pyright errors instead of editing blind. LSP pushes diagnostics rather than answering requests, so the server manager captures publishDiagnostics notifications and waiters block for a fresh publish, with a settle window for servers that publish syntax and semantic passes separately.",
        implementationFile: "AgenticLspService.ts",
        categoryLabel: "Code Intelligence",
        badgeTone: "cyan",
        alignment: [
          { component: "Diagnostics after edit", status: "aligned", detail: "didChange with a monotonically increasing document version, then wait for a publish newer than the request — stale results are flagged rather than passed off as current" },
          { component: "Full LSP surface", status: "aligned", detail: "One modal tool exposes definition/references/hover/outline alongside diagnostics, like serena's language-server toolbox" },
          { component: "Multi-pass settle window", status: "extended", detail: "After the first fresh publish the waiter lingers briefly and returns the latest entry — resolving on the first publish would miss tsserver's separate semantic pass" },
        ],
      },
      {
        title: "Unified-Diff apply_patch Tool",
        authors: "OpenAI — Codex CLI",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/openai/codex",
        description:
          "A patch-application editing tool in the shape of Codex's apply_patch: the agent submits a unified diff (@@ hunks with context lines) against one file, applied atomically via jsdiff (https://github.com/kpdecker/jsdiff) — context mismatch rejects the whole patch with no partial writes. Complements exact-string replace_in_file for multi-hunk edits and for applying diffs the agent already has (e.g. from run_git diff).",
        implementationFile: "AgenticFileService.ts",
        categoryLabel: "Editing",
        badgeTone: "orange",
      },
      {
        title: "Atomic Multi-Edit Transactions (MultiEdit)",
        authors: "Anthropic — Claude Code",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://docs.anthropic.com/en/docs/claude-code",
        description:
          "replace_in_file gained Claude Code's MultiEdit contract: an ordered edits[] batch validated and folded against an in-memory buffer — later edits see earlier edits' output — then written to disk exactly once. Any failed match aborts the entire batch with zero changes, killing the half-applied-file failure class of issuing several single edits in a row.",
        implementationFile: "AgenticFileService.ts",
        categoryLabel: "Editing",
        badgeTone: "info",
        alignment: [
          { component: "Sequential fold semantics", status: "aligned", detail: "Edit N+1 matches against the buffer produced by edit N, exactly like MultiEdit — error messages explain this when a later edit misses" },
          { component: "All-or-nothing write", status: "aligned", detail: "One atomic write at the end; every validation failure names the offending edit index and guarantees the file is untouched" },
          { component: "Per-edit allowMultiple", status: "extended", detail: "Each edit can opt into replace-all with the same ambiguity guard as single edits (non-overlapping match counting)" },
        ],
      },
    ],
  },
  {
    title: "Memory & Context",
    icon: Puzzle,
    papers: [
      {
        title: "Agent Workflow Memory",
        authors: "Wang et al.",
        year: 2024,
        arxivUrl: "https://arxiv.org/abs/2409.07429",
        description:
          "Extracts reusable workflow templates from successful sessions and replays them as procedural memory on analogous future tasks. On completion (≥3 tool calls, no circuit-breaker errors) the tool trajectory is compressed, embedded, and persisted; similar past workflows are later retrieved by cosine similarity and injected as procedural context.",
        implementationFile: "WorkflowMemoryService.ts",
        categoryLabel: "Procedural Memory",
        badgeTone: "violet",
        alignment: [
          { component: "Workflow extraction", status: "aligned", detail: "Successful sessions compressed into ordered tool-name + key-arg workflow summaries" },
          { component: "Embedding + persistence", status: "aligned", detail: "Summaries embedded and stored in the workflow_memories collection" },
          { component: "Similarity retrieval", status: "aligned", detail: "Top-K similar past workflows retrieved by embedding cosine similarity at prompt-assembly time" },
          { component: "Replay as procedural memory", status: "aligned", detail: "Retrieved workflows injected as procedural context for adaptation on new tasks" },
        ],
      },
      {
        title: "Memory Consolidation: Embedding-Based Clustering and Dedup",
        authors: "Memory Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Periodic batch consolidation of agent memories using cosine similarity clustering, stale memory detection, and LLM-powered merge/invalidate decisions — non-destructive (sources are soft-closed, never deleted), lock-protected against concurrent runs, sanity-capped, and rollback-able per run, preserving source attribution chains.",
        implementationFile: "MemoryConsolidationService.ts",
        categoryLabel: "Memory",
        badgeTone: "violet",
      },
      {
        title: "TOKI: A Bitemporal Operator Algebra for Contradiction Resolution in LLM-Agent Persistent Memory",
        authors: "Wang",
        year: 2026,
        arxivUrl: "https://arxiv.org/abs/2606.06240",
        description:
          "Formalizes contradiction resolution as operations over a bitemporal memory schema: a superseded fact's valid-time window is closed rather than the row deleted, keeping history queryable. Prism's memories carry validTo/supersededBy/closedReason; every read path filters to current rows.",
        implementationFile: "MemoryService.ts",
        categoryLabel: "Memory",
        badgeTone: "violet",
        alignment: [
          { component: "Valid-time close on supersession", status: "aligned", detail: "invalidate() sets validTo + supersededBy + closedReason instead of deleteOne; reopen() reverses it" },
          { component: "History stays queryable", status: "aligned", detail: "Soft-closed rows remain in the collection; list(includeSuperseded) exposes them" },
          { component: "Dual-row current+audit schema (paper)", status: "simplified", detail: "Single collection with validity fields rather than the paper's separate current/audit rows" },
          { component: "Operator algebra (paper)", status: "simplified", detail: "Not implemented — consolidation LLM + write-time policy stand in for the formal operators" },
        ],
      },
      {
        title: "Graphiti: Bi-Temporal Knowledge-Graph Memory",
        authors: "Zep",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/getzep/graphiti",
        description:
          "On contradiction, Graphiti closes the old edge's valid-time window and opens a new edge — never deleting, so \"moved cities\" updates don't destroy history. Prism's consolidation merges/invalidations follow the same close-don't-delete rule, making every run reversible.",
        implementationFile: "MemoryConsolidationService.ts",
        categoryLabel: "Memory",
        badgeTone: "violet",
        alignment: [
          { component: "Edge invalidation on contradiction", status: "aligned", detail: "Consolidation invalidate action soft-closes the older memory with supersededById pointing at the newer one" },
          { component: "Non-destructive merge", status: "aligned", detail: "Merge stores the combined memory first, then soft-closes sources pointing at it — rollbackRun() can undo the whole run" },
          { component: "Knowledge graph structure (source)", status: "simplified", detail: "Flat document memories with supersession links, not a full temporal graph with entities and edges" },
        ],
      },
      {
        title: "Mem0: State of AI Agent Memory 2026",
        authors: "Mem0",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://mem0.ai/blog/state-of-ai-agent-memory-2026",
        description:
          "Two shipped Mem0 v3 changes: single-pass ADD-only extraction (near-duplicate new facts are stored, not dropped — conflict resolution moves to read time) and hybrid retrieval fusing semantic, BM25 keyword, and entity matching into one score (LoCoMo 71.4→91.6). Prism implements both: ADD-only write-time dedup above an exact bar, and RRF-fused semantic + BM25 + exact + recency search.",
        implementationFile: "HybridRetrieval.ts",
        categoryLabel: "Memory",
        badgeTone: "violet",
        alignment: [
          { component: "Single-pass ADD-only extraction", status: "aligned", detail: "store() keeps similar-but-different memories (0.92–0.97 band) instead of dropping them; only verbatim re-extractions are skipped" },
          { component: "Hybrid multi-signal retrieval", status: "aligned", detail: "search() fuses cosine, BM25 (in-house Bm25ToolIndex), exact/entity hits, and recency via reciprocal-rank fusion" },
          { component: "Drop the consolidation pass (source)", status: "extended", detail: "Prism keeps a background consolidation LLM — but made non-destructive, locked, and rollback-able — rather than fully deferring conflicts to read time" },
        ],
      },
      {
        title: "Memory Extraction: CC-Style 4-Type Taxonomy",
        authors: "Memory Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Post-conversation memory extraction using a 4-type taxonomy (user, feedback, project, reference) with explicit negative constraints preventing storage of code-derivable information. Includes mutual exclusion with explicit save_memory tool calls.",
        implementationFile: "MemoryExtractor.ts",
        categoryLabel: "Memory",
        badgeTone: "violet",
      },
      {
        title: "Context Pressure Management: Rubric-Gated Compaction",
        authors: "Context Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Auto-compaction where the pressure threshold is permission, not a command: compaction defers while the model has unread tool results or is recovering from a stall (up to hard ceilings), can be invoked by the model itself at safe boundaries via compact_context, and every summary is proofread by a judge pass before adoption.",
        implementationFile: "CompactionService.ts",
        categoryLabel: "Context Management",
        badgeTone: "cyan",
      },
      {
        title: "Self-Compacting Language Model Agents",
        authors: "Li, Zhang, Jurayj et al.",
        year: 2026,
        arxivUrl: "https://arxiv.org/abs/2606.23525",
        description:
          "Gives the model a compact tool paired with a natural-language rubric — fire when a sub-task resolves, suppress mid-derivation or when stuck. Matches or beats fixed-interval summarization at 30–70% lower per-question cost while raising accuracy; ablations show the tool and rubric are only effective together. Prism ships both halves: the compact_context tool with its rubric, and harness-side deferral guards that suppress threshold compaction mid-derivation.",
        implementationFile: "CompactionDeferralGuard.ts",
        categoryLabel: "Context Management",
        badgeTone: "cyan",
        alignment: [
          { component: "Model-invoked compact tool", status: "aligned", detail: "compact_context returns a REQUEST_COMPACTION directive consumed at the next iteration boundary; bypasses the token threshold, keeps the minimum-message floor" },
          { component: "Fire/suppress rubric", status: "aligned", detail: "Tool description carries the rubric (fire at sub-task resolution; never mid-derivation, while stuck, or on short conversations)" },
          { component: "Harness-side suppression", status: "extended", detail: "Threshold compaction also defers on unread tool results or a recent stall warning, with hard pressure ceilings as the safety valve — the paper leaves suppression to the model alone" },
        ],
      },
      {
        title: "Slipstream: Trajectory-Grounded Compaction Validation for Long-Horizon Agents",
        authors: "Chen, Pan, Dai & Netravali",
        year: 2026,
        arxivUrl: "https://arxiv.org/abs/2605.08580",
        description:
          "Validates candidate compaction summaries against the agent's actual next steps with a judge that patches omissions before adoption (+8.8 pts on SWE-bench Verified + BrowseComp). Prism adopts the synchronous judge slice only — one cheap utility call per compaction that appends missing critical facts — and deliberately skips the async parallel compactor, which spends extra tokens for a latency win that doesn't fit a single-GPU deployment.",
        implementationFile: "CompactionService.ts",
        categoryLabel: "Context Management",
        badgeTone: "cyan",
        alignment: [
          { component: "Trajectory-grounded judge", status: "aligned", detail: "Judge checks the summary against the verbatim recent tail the agent continues from and appends flagged omissions; fail-open on any error" },
          { component: "Async parallel compactor (paper)", status: "simplified", detail: "Not implemented — deliberately skipped: it spends more tokens in the overlap window and contends for the single local GPU" },
        ],
      },
      {
        title: "Micro-Compaction: Lossless Tool-Result Eviction",
        authors: "Context Pattern",
        year: null,
        arxivUrl: null,
        description:
          "The lightest compaction layer — no LLM call required. Before sending to the model, large tool results from compactable read-only tools in old, unprotected turns are evicted, with recent turns always protected. Each evicted result is offloaded verbatim and replaced inline with a pointer stub (offload id + first-lines preview) that the model can dereference later — eviction is recoverable, not destructive.",
        implementationFile: "MicroCompactionService.ts",
        categoryLabel: "Context Management",
        badgeTone: "cyan",
      },
      {
        title: "LCM: Lossless Context Management",
        authors: "Ehrlich & Blackman",
        year: 2026,
        arxivUrl: "https://arxiv.org/abs/2605.04050",
        description:
          "Argues reduced context must retain lossless pointers to every original payload rather than destructively summarizing. Prism applies the lossless-pointer principle to tool-result eviction: micro-compacted results are persisted verbatim and replaced with retrievable pointer stubs.",
        implementationFile: "ToolResultOffloadService.ts",
        categoryLabel: "Context Management",
        badgeTone: "cyan",
        alignment: [
          { component: "Lossless pointers to originals", status: "aligned", detail: "Every evicted tool result is persisted verbatim (Mongo, keyed by offload id) and its inline stub carries the dereferenceable pointer" },
          { component: "Hierarchical summary DAG (paper)", status: "simplified", detail: "Not implemented — the paper builds a summary DAG over all messages; Prism offloads flat per-tool-result payloads only" },
        ],
      },
      {
        title: "LLM Agents Are Latent Context Managers (VISTA)",
        authors: "Xu, Li & Zhang",
        year: 2026,
        arxivUrl: "https://arxiv.org/abs/2606.30005",
        description:
          "Shows recoverable eviction — archive a context block behind a stable handle, restore on demand — beats deletion, masking, and compression baselines, letting agents evict aggressively without acting on missing data. Prism's offload stubs + retrieve_offloaded_content implement the recoverable-eviction half.",
        implementationFile: "RetrieveOffloadedContentTool.ts",
        categoryLabel: "Context Management",
        badgeTone: "cyan",
        alignment: [
          { component: "Recoverable eviction", status: "aligned", detail: "Evicted results stay byte-identical behind a stable offload id; retrieve_offloaded_content restores any slice on demand" },
          { component: "Model-controlled archive/restore", status: "simplified", detail: "Restore is model-invoked, but eviction is automatic (pressure-gated micro-compaction) rather than a model-invoked archive_block tool" },
          { component: "Proprioceptive per-block dashboard", status: "aligned", detail: "ContextLedgerInjector periodically renders total pressure, the largest inline tool results with token weights, and every offloaded stub with its recovery id as a tail system message — derived live from the message array, no LLM call" },
        ],
      },
      {
        title: "Context Offloading: Pointer Stubs with Grep & Line-Range Retrieval",
        authors: "AWS Strands Agents · LangChain DeepAgents",
        year: 2026,
        arxivUrl: null,
        sourceUrl:
          "https://strandsagents.com/docs/user-guide/concepts/plugins/context-offloader/",
        description:
          "Industry-converged offload pattern: content blocks above a token threshold move to a storage backend and are replaced inline with a truncated preview plus a per-block reference, retrievable via regex search with context lines, line-range random access, or head-N — mirroring Strands' ContextOffloader and DeepAgents' FilesystemMiddleware (github.com/langchain-ai/deepagents).",
        implementationFile: "ToolResultOffloadService.ts",
        categoryLabel: "Context Management",
        badgeTone: "cyan",
        alignment: [
          { component: "Threshold-gated offload", status: "aligned", detail: "Reuses micro-compaction's existing eviction trigger (compactable tools, >500-token results, outside the protected recent window)" },
          { component: "Preview + per-block reference", status: "aligned", detail: "Inline stub carries the offload id, line/token totals, and a first-lines preview" },
          { component: "Regex / line-range / head retrieval", status: "aligned", detail: "retrieve_offloaded_content supports pattern + contextLines, startLine/endLine, and headLines with a bounded response size" },
          { component: "Pluggable storage backends", status: "simplified", detail: "Single backend (MongoDB fronted by an in-memory stash) rather than Strands' pluggable backend interface" },
        ],
      },
      {
        title: "Context Engineering: KV-Cache-Stable Prompt Prefix",
        authors: "Manus",
        year: 2025,
        arxivUrl: null,
        sourceUrl:
          "https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus",
        description:
          "Manus's first production lesson: KV-cache hit rate is the most important metric for an agent in production — one volatile byte early in the prompt re-prices everything after it. Prism keeps the cached prefix byte-stable: per-turn runtime state (clock crew, stickers, emotion, visual appearance, lights) is tail-injected as a self-context system message just before the latest user input instead of being appended to the cached system prompt, and cache breakpoints pin the stable system and tool-definition blocks.",
        implementationFile: "system-prompt/index.ts",
        categoryLabel: "Context Management",
        badgeTone: "cyan",
        alignment: [
          { component: "Volatile state out of the cached prefix", status: "aligned", detail: "clockCrew/stickers/emotion/visual/lights context rides the tail-injected SELF_CONTEXT message, so the system-prompt hash is identical turn-to-turn" },
          { component: "Cache breakpoints on stable blocks", status: "aligned", detail: "applyCacheBreakpoints pins the last tool definition and the system block, with a moving marker on the latest message" },
          { component: "Mask, don't remove, tools (source)", status: "simplified", detail: "Not adopted — mid-conversation tool enable/disable still rebuilds the native tool array; KVCacheReporter measures the invalidation cost instead of preventing it" },
        ],
      },
      {
        title: "Plan Mode: Tool-Based Planning State Machine",
        authors: "Workflow Pattern",
        year: null,
        arxivUrl: null,
        description:
          "A “plan first” workflow: the loop starts with tools stripped, the model designs a plan and calls exit_plan_mode for approval, then continues with full tools once approved. The planning instruction is injected as a standalone message to keep the system-prompt hash stable for prefix caching.",
        implementationFile: "PlanningModeService.ts",
        categoryLabel: "Planning",
        badgeTone: "purple",
      },
      {
        title: "Conversation Embedding: Cross-Session Semantic Search",
        authors: "Search Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Generates and persists summary embeddings on agent conversation documents by combining titles, compaction summaries, and linked memories — enabling cross-session semantic search with zero additional LLM cost.",
        implementationFile: "ConversationEmbeddingService.ts",
        categoryLabel: "Semantic Search",
        badgeTone: "cyan",
      },
    ],
  },
  {
    title: "Infrastructure & Safety",
    icon: Shield,
    papers: [
      {
        title: "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena",
        authors: "Zheng et al.",
        year: 2023,
        arxivUrl: "https://arxiv.org/abs/2306.05685",
        description:
          "Rubric-based LLM-judge grading for benchmark runs: a judge model scores responses against a natural-language rubric (strict JSON verdict, 0–10 score, reasoning), enabling quality benchmarks that string matching can't express.",
        implementationFile: "BenchmarkJudge.ts",
        categoryLabel: "Evaluation",
        badgeTone: "indigo",
      },
      {
        title: "Critic Gate: Multi-Model Safety Review",
        authors: "Safety Pattern",
        year: null,
        arxivUrl: null,
        description:
          "A lightweight second-opinion gate that uses a fast model to review high-risk (DANGER tier) tool calls before execution — catching catastrophic commands like rm -rf or DROP TABLE.",
        implementationFile: "CriticGate.ts",
        categoryLabel: "Safety",
        badgeTone: "danger",
      },
      {
        title: "Auto-Approval Engine: Tiered Tool Permission System",
        authors: "Safety Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Deterministic three-tier permission system — AUTO (read-only), WRITE (file mutations), DANGER (shell execution and third-party MCP tools) — with declarative policy evaluation and full-auto override support.",
        implementationFile: "AutoApprovalEngine.ts",
        categoryLabel: "Safety",
        badgeTone: "danger",
      },
      {
        title: "VIPER-MCP: Detecting and Exploiting Taint-Style Vulnerabilities in Model Context Protocol Servers",
        authors: "Sun, Jin, Huang et al.",
        year: 2026,
        arxivUrl: "https://arxiv.org/abs/2605.21392",
        description:
          "Found 106 zero-days across ~40k MCP server repos via static taint analysis — establishing that MCP packages must be treated as untrusted code. Prism hardens accordingly: stdio MCP children receive only a safe-inheritance environment (never prism-service's secrets — the process.env spread that leaked MONGO_URI and provider keys is gone), and MCP-namespaced tools default to the DANGER approval tier instead of auto-approvable WRITE. Motivated jointly by Unit 42's OpenClaw supply-chain incident report.",
        implementationFile: "MCPClientService.ts",
        categoryLabel: "Safety",
        badgeTone: "danger",
        alignment: [
          { component: "MCP as untrusted code", status: "aligned", detail: "stdio children get the SDK's safe-inheritance env (PATH/HOME/...) plus only their own configured vars — secrets never cross the process boundary" },
          { component: "Approval gating", status: "extended", detail: "mcp__ tools default to DANGER tier (human gate + CriticGate review) with per-tool overrides for trusted servers — beyond the paper's detection scope" },
          { component: "Static taint scanning (paper)", status: "simplified", detail: "Not implemented — no pre-connect scan of MCP server code; the mitigation is containment rather than detection" },
        ],
      },
      {
        title: "SSRF Guard: Deny-by-Default Egress into Private Address Space",
        authors: "Anthropic sandbox-runtime · Claude Code sandboxing",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/anthropic-experimental/sandbox-runtime",
        description:
          "Agent-controlled URLs are fed by untrusted inputs (web pages, Discord messages, marketplace listings), so a prompt-injected link must not reach loopback services, the LAN, or cloud metadata endpoints. Every web fetch validates protocol and DNS resolution against private/reserved ranges (RFC1918, loopback, 169.254 metadata, CGNAT, IPv6 ULA/link-local, IPv4-mapped forms) and follows redirects manually, re-validating each hop — the network-egress slice of sandbox-runtime's deny-by-default model.",
        implementationFile: "SsrfGuard.ts",
        categoryLabel: "Safety",
        badgeTone: "danger",
        alignment: [
          { component: "Private/metadata range denial", status: "aligned", detail: "validatePublicWebUrl rejects any hostname whose A/AAAA records land outside public address space, including IPv4-mapped IPv6 bypass forms" },
          { component: "Per-hop redirect re-validation", status: "aligned", detail: "fetchPublicUrl follows redirects manually and re-validates each Location — a public URL redirecting to an internal one is the classic bypass" },
          { component: "Interactive browser carve-out", status: "extended", detail: "The user-driven browser tool blocks only link-local/metadata ranges so LAN browsing stays possible; the auto-tier read_web_page gets the full guard" },
          { component: "Proxy-enforced egress + domain allowlist (source)", status: "simplified", detail: "Validation happens in-process at fetch time, not via sandbox-runtime's OS-level proxy; DNS-rebinding (TOCTOU) needs a pinned-socket dispatcher and is a known residual" },
        ],
      },
      {
        title: "DAG-Based Workflow Orchestration",
        authors: "Workflow Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Topologically-sorted execution of multi-node workflows. Nodes can be text, image, audio, embedding, or agent-mode, with typed edges routing outputs between nodes.",
        implementationFile: "WorkflowExecutionService.ts",
        categoryLabel: "Workflow",
        badgeTone: "success",
      },
      {
        title: "Dead-Man's-Switch Heartbeat with Queue-Wedge Detection",
        authors: "Healthchecks.io ops pattern",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://healthchecks.io/docs/",
        description:
          "Push-based liveness for the Discord bot: a per-minute ping to an external monitor that alerts when pings STOP — catching what a pull-based /health probe can't, a silently wedged process. The ping is gated on a reply-queue self-check, so one hung reply freezing the global serial queue signals the /fail endpoint like a crash.",
        implementationFile: "HeartbeatService.ts",
        categoryLabel: "Ops Reliability",
        badgeTone: "warning",
        alignment: [
          { component: "Push pings + missed-ping alerting", status: "aligned", detail: "Per-minute POST to HEARTBEAT_URL; the external monitor owns the silence alarm — a wedged bot can't report its own silence" },
          { component: "Failure signalling (/fail)", status: "aligned", detail: "A detected queue wedge pings the Healthchecks /fail variant with the reason, alerting immediately instead of waiting out the grace period" },
          { component: "Liveness gating", status: "extended", detail: "Ping is gated on a queue-progress self-check (drain-start / per-item activity stamps), so a WEDGE trips the switch, not just a crash" },
        ],
      },
      {
        title: "Chromakey Alpha Recovery for Image Cut-Outs",
        authors: "philschmid.de technique",
        year: 2025,
        arxivUrl: null,
        sourceUrl: "https://www.philschmid.de/generate-stickers",
        description:
          "Gemini image models output flat RGB with no alpha channel, so transparent cut-outs are recovered mathematically: the model is instructed to render the subject on a pure chromakey-green (#00FF00) background, which is then keyed out in HSV space — a hue-windowed mask, one-pixel dilation to swallow anti-aliased fringe, and a despill pass that strips the green cast from edge pixels. Powers generate_image's transparentBackground flag. Its pixel-faithful sibling, remove_background, skips generation entirely: Gemini vision segmentation masks (per-box base64 PNG probability maps) are resized, unioned into a soft alpha canvas, and applied to the ORIGINAL pixels.",
        implementationFile: "ImageService.ts",
        categoryLabel: "Creative Tools",
        badgeTone: "success",
      },
      {
        title: "Code-to-Image Cards (carbon.now.sh pattern)",
        authors: "Shiki; charmbracelet/freeze; Aloxaf/silicon",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/shikijs/shiki",
        description:
          "render_code turns any snippet into a shareable syntax-highlighted PNG card: Shiki tokenizes with real TextMate grammars (~200 languages plus ANSI terminal output), a macOS-style window card wraps the result, and the shared warm Playwright Chromium rasterizes it at 2× for retina crispness. Deterministic and free — no external API. Pattern popularized by carbon.now.sh and its CLI kin freeze (https://github.com/charmbracelet/freeze) and silicon (https://github.com/Aloxaf/silicon).",
        implementationFile: "CodeImageService.ts",
        categoryLabel: "Creative Tools",
        badgeTone: "violet",
        alignment: [
          { component: "Syntax highlighting", status: "aligned", detail: "Shiki bundled grammars and themes load on demand from node_modules — no CDN at render time, unknown languages fall back to plaintext with an honest note in the result" },
          { component: "Rasterization", status: "extended", detail: "Reuses the warm Chromium singleton from the browser-automation tools instead of a bespoke HTML renderer — full CSS fidelity for window chrome, shadows, and gradients at a per-call cost of one throwaway context" },
          { component: "Window chrome + themes", status: "aligned", detail: "Traffic-light title bar, 8 curated themes, gradient/plain/transparent backdrops — the carbon.now.sh look, including transparent cards for compositing" },
        ],
      },
      {
        title: "Barcode & QR Decoding (ZXing-C++ via WASM)",
        authors: "Sec-ant — zxing-wasm",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/Sec-ant/zxing-wasm",
        description:
          "scan_barcode is the inverse of generate_qr_code: it decodes QR, Aztec, DataMatrix, PDF417, and 1D retail barcodes (EAN/UPC/Code 128/39) from any photo or screenshot — multiple symbols per image, rotated or inverted included — fully local via the ZXing-C++ engine compiled to WebAssembly. Node cannot fetch() the module's wasm from disk, so the binary is read from the package and handed over once at first use, then cached for the process lifetime.",
        implementationFile: "ImageService.ts",
        categoryLabel: "Data Extraction",
        badgeTone: "cyan",
      },
      {
        title: "FIGlet ASCII Banners",
        authors: "patorjk — figlet.js",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/patorjk/figlet.js",
        description:
          "generate_ascii_banner renders short text as large ASCII-art lettering across 328 FIGfonts — the inverse of the existing image→ASCII converter. figlet.js implements the full FIGfont spec including kerning and smushing layout modes, pure JS with no native bindings; banners return as text and render in fenced code blocks in both web and Discord.",
        implementationFile: "ComputeRoutes.ts",
        categoryLabel: "Creative Tools",
        badgeTone: "teal",
      },
      {
        title: "Photo → Lighting Scene (Palette Transfer)",
        authors: "Vibrant-Colors — node-vibrant",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/Vibrant-Colors/node-vibrant",
        description:
          "paint_lights_from_image sets the room to match a photo: node-vibrant extracts six semantic swatches (Vibrant/Muted/Dark/Light, weighted by pixel population), zero-population derived swatches are filtered out, and the top colors are distributed round-robin across the individually-addressed LIFX bulbs through the existing batch states endpoint — a sunset photo becomes a sunset room. A palette-strip PNG returns as a visual receipt of what was applied.",
        implementationFile: "LightPainterService.ts",
        categoryLabel: "Smart Home",
        badgeTone: "warning",
        alignment: [
          { component: "Population-weighted palette", status: "aligned", detail: "Swatches sort by pixel coverage so the room reflects what the photo is mostly made of, not its accent colors" },
          { component: "Per-bulb distribution", status: "extended", detail: "Lights are enumerated and addressed individually (id: selectors) so a multi-bulb room becomes the palette rather than one averaged color — node-vibrant only provides the swatches" },
        ],
      },
      {
        title: "Email as a First-Class Assistant Channel (SMTP + IMAP)",
        authors: "nodemailer / postalsys — imapflow",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/nodemailer/nodemailer",
        description:
          "send_email, search_email, and read_email close the last core-communication gap: Prism could text and push-notify but never touch a mailbox. nodemailer handles SMTP send and its sibling imapflow (https://github.com/postalsys/imapflow) handles IMAP search/read — a same-author pairing proven by codefuturist/email-mcp (https://github.com/codefuturist/email-mcp). Bodies are parsed with mailparser and HTML is stripped before reaching the LLM; the read tool's description explicitly marks email content as untrusted input. Tools are key-gated: without vault SMTP/IMAP credentials they are never advertised to the model.",
        implementationFile: "EmailService.ts",
        categoryLabel: "Communication",
        badgeTone: "indigo",
      },
      {
        title: "Verbatim OCR (Tesseract WASM)",
        authors: "naptha — tesseract.js",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/naptha/tesseract.js",
        description:
          "read_image_text extracts the exact text from screenshots, signs, and scanned pages — the verbatim complement to the semantic describe_image. Tesseract compiled to WASM runs free on CPU with 100+ languages (packs download once and cache), returns a 0-100 confidence score the agent can act on, and can hand back the image annotated with word bounding boxes (green = confident, amber = uncertain). Structured so hard cases (tables, handwriting) can later route to olmOCR (https://github.com/allenai/olmocr) on the vLLM box.",
        implementationFile: "OcrService.ts",
        categoryLabel: "Data Extraction",
        badgeTone: "purple",
      },
      {
        title: "Server-Side Chart Engine (Apache ECharts SSR)",
        authors: "Apache ECharts",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://echarts.apache.org",
        description:
          "generate_chart's renderer swapped from chartjs-node-canvas (native canvas dependency, three chart types) to Apache ECharts server-side SVG rendering rasterized via sharp — no browser, no native canvas. The catalog grew from bar/line/pie to twelve types including scatter, radar, heatmap, funnel, stacked variants, and candlestick (which pairs with the historical-prices tool). Every new type reuses the existing {labels, datasets} contract — heatmap rows are simply datasets — so the iterative chartId merge kept working unchanged.",
        implementationFile: "ChartService.ts",
        categoryLabel: "Data Viz",
        badgeTone: "success",
        alignment: [
          { component: "SSR SVG rendering", status: "aligned", detail: "echarts.init(null, null, {renderer:'svg', ssr:true}) → renderToSVGString → sharp PNG, per the official server-side rendering guide" },
          { component: "Uniform data contract", status: "extended", detail: "Exotic types were mapped onto the existing labels/datasets shape (heatmap rows-as-datasets, candlestick OHLC arrays, scatter pairs) instead of new payloads — legacy charts and the iterative merge needed zero migration" },
        ],
      },
      {
        title: "Deterministic Seed Avatars (DiceBear)",
        authors: "DiceBear — Florian Körner",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://github.com/dicebear/dicebear",
        description:
          "generate_avatar hashes any seed string into an avatar assembled from artist-drawn part libraries — 37 styles from pixel-art sprites to bottts robots to identicon marks. The same seed + style reproduces the identical face forever, so a name alone is a stable visual identity: custom agents, roleplay NPCs, and project icons get faces with nothing stored and nothing to pay. SVG is assembled in-process (DiceBear v10 core + JSON style packs) and rasterized to PNG via sharp for Discord-reliable embeds.",
        implementationFile: "AvatarService.ts",
        categoryLabel: "Creative Tools",
        badgeTone: "emerald",
        alignment: [
          { component: "Deterministic assembly", status: "aligned", detail: "Seed → PRNG → part selection, DiceBear's core contract; determinism is verified by a byte-identity test in CI" },
          { component: "v10 JSON style packs", status: "aligned", detail: "Styles load on demand from @dicebear/styles JSON exports and cache per-process — the legacy @dicebear/collection API is gone in v10" },
          { component: "Style-list drift guard", status: "extended", detail: "The tool's 37-style enum is asserted against the installed package's dist listing in tests, so a DiceBear version bump that renames styles fails CI instead of erroring live" },
        ],
      },
      {
        title: "Sampling the GGX Distribution of Visible Normals (PMREM prefiltering)",
        authors: "Heitz, Journal of Computer Graphics Techniques 7(4), 1–13; three.js r185 PMREMGenerator",
        year: 2018,
        arxivUrl: "https://jcgt.org/published/0007/04/01/",
        sourceUrl:
          "https://github.com/mrdoob/three.js/blob/dev/src/renderers/common/extras/PMREMGenerator.js",
        description:
          "The prefilter behind Paper Harvest's glass curios: one HDR panorama convolved into eleven roughnesses of the same room, so a gelatin cube reflects a sharp hall and the weathered plinth beside it reflects a smear. Heitz's VNDF sampling is what makes 512 taps enough — it draws half-vectors from the microfacets a viewer can actually see, so the estimate converges where uniform sampling would still be grainy. Ported off three's WebGPU PMREMGenerator onto raw WebGPU and hand-written WGSL (shaders/world/glass/curioPrefilter.wgsl): eleven render passes recorded straight onto the device, no node graph, nothing per-frame. The arithmetic is three's on purpose and the port is credited at both files' heads — the atlas is read back by a shader whose addressing is already three's cubeUV layout, so a writer that packed it differently would be wrong about every texel.",
        implementationFile: "paper-harvest/world/glass/pmrem.ts",
        categoryLabel: "Real-Time Rendering",
        badgeTone: "orange",
        alignment: [
          { component: "GGX VNDF importance sampling", status: "aligned", detail: "Heitz §4.1–4.3 transcribed as written, view direction kept as a parameter rather than specialised to +Z so the WGSL still diffs against the paper" },
          { component: "cubeUV atlas layout", status: "aligned", detail: "three r185's WebGPU packing — 3×2 face blocks per level, 1px gutters, six extra 16px lobe blocks marching right, and its non-identity face permutation, which the WebGL generator beside it does not share" },
          { component: "One addressing function, not two", status: "extended", detail: "The prefilter samples the atlas through the same WGSL the material reads it with, compiled as one module; three keeps that property internally and a port is the moment it is usually lost" },
          { component: "Pass orchestration", status: "simplified", detail: "A command encoder per level instead of a renderer driving throwaway materials — load-time only, and the schedule is what the Rust client compiles when it grows an environment prefilter of its own" },
        ],
      },
    ],
  },
  {
    title: "Persona & Affect",
    icon: PawPrint,
    papers: [
      {
        title: "Somatic State Engine: Plutchik's Wheel of Emotions",
        authors: "Affect Pattern",
        year: null,
        arxivUrl: null,
        description:
          "Continuous emotional state machine based on Plutchik's 8 primary emotions with dyad detection, opposite suppression, personality-driven decay rates, emotional inertia, and baseline pull — enabling affective computing in agent interactions.",
        implementationFile: "EmotionalStateEngine.ts",
        categoryLabel: "Affect",
        badgeTone: "rose",
      },
      {
        title:
          "From Triggers to Emotions: A CPM-Grounded Appraisal Multi-Agent for Dynamic Emotional Evolution in Persona-Based Dialogue",
        authors: "Cai et al.",
        year: 2026,
        arxivUrl: "https://arxiv.org/abs/2607.07824",
        description:
          "Grounds persona emotion in Scherer's Component Process Model: instead of mirroring the emotion a message expresses, the agent APPRAISES how the event bears on its own goals and standing before feeling anything. Prism's background emotion classifier is an appraisal call returning {emotion, why}, and the somatic prompt captions mood shifts with their trigger (\"anger — because they mocked my favorite game\").",
        implementationFile: "SomaticStateService.ts",
        categoryLabel: "Affect",
        badgeTone: "rose",
        alignment: [
          { component: "Appraisal over surface emotion", status: "aligned", detail: "The classifier judges goal/standing relevance for the character (relevance → implication → norms) rather than classifying the text's own sentiment" },
          { component: "Multi-agent appraisal recursion (paper)", status: "simplified", detail: "Downscoped to a single cheap background call per message — the paper runs a 4-agent recursive appraisal loop" },
          { component: "Legible emotion causes", status: "extended", detail: "The appraised trigger is threaded into the prompt's mood-shift line; decay-driven drift stays caption-free so the \"because\" clause is honest" },
        ],
      },
      {
        title: "Human-Texting Cadence Rules (Poke Guidelines)",
        authors: "Interaction Co. — leaked product guidelines",
        year: 2025,
        arxivUrl: null,
        sourceUrl:
          "https://github.com/EliFuzz/awesome-system-prompts/blob/main/leaks/poke/2025-09-15_prompt_guidelines.md",
        description:
          "Cadence rules from a shipped AI-texting product, cherry-picked into the Lupos persona where they fit a loud group-chat wolf: never end with assistant postamble (\"let me know if you need anything else\"), one joke per message maximum, an explicit anti-sycophancy line, and optional lowercase mirroring of the room's typing energy.",
        implementationFile: "LuposPersona.ts",
        categoryLabel: "Persona Voice",
        badgeTone: "orange",
      },
      {
        title:
          "Beiträge zur Sozialpsychologie des Haushuhns (Contributions to the Social Psychology of the Domestic Fowl)",
        authors: "Schjelderup-Ebbe, Zeitschrift für Psychologie 88, 225–252",
        year: 1922,
        arxivUrl:
          "https://en.wikipedia.org/wiki/Thorleif_Schjelderup-Ebbe",
        description:
          "The paper the phrase \"pecking order\" was coined in — and it was never a metaphor there: Schjelderup-Ebbe recorded who pecked whom in real flocks and found the relation near-transitive (the birds line up almost linearly), stable while the flock is, re-fought whenever a bird is added or removed, and tracking temperament more closely than size. Paper Harvest's coop implements it literally: each bird's standing is earned from temper, age, mass and time in the flock, ranks are derived by sorting rather than stored, higher ranks eat first and take the better perch, and the bird at the bottom of an overcrowded coop eats less, stops laying and loses condition — which is the mechanism that teaches coop density. Predates arXiv; the link is the biographical record of the 1922 journal article.",
        implementationFile: "paper-harvest/farming/barn/pecking.ts",
        categoryLabel: "Social Hierarchy",
        badgeTone: "teal",
        alignment: [
          {
            component: "Order emerges rather than being assigned",
            status: "aligned",
            detail:
              "Standing is computed from the bird's own make (temper, age, mass, arrival order); nothing is handed a rank, and rank is simply where a bird lands when the flock is sorted",
          },
          {
            component: "Re-fought on any roster change",
            status: "aligned",
            detail:
              "Seniority is measured against the flock as it stands today, so buying or losing a bird moves every seed and the order re-settles over the following nights — his most-repeated observation",
          },
          {
            component: "Near-transitivity",
            status: "simplified",
            detail:
              "Real flocks contain triangles; we model a strictly linear order and let contests between birds within a narrow band go either way, which is where a triangle would show as instability",
          },
          {
            component: "Crowding as the dominant variable",
            status: "extended",
            detail:
              "The paper observes the cost to the bottom bird; the game makes density the single lever — at or under the coop's perch count the order is display only, and every punitive term is multiplied by crowding pressure",
          },
        ],
      },
      {
        title: "Reference-Conditioned Self-Portraits (Nano Banana)",
        authors: "Google — Gemini Image Generation",
        year: 2026,
        arxivUrl: null,
        sourceUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
        description:
          "Character-consistent self-portraits: a canonical reference image (a pinned still of the bot's Discord avatar) is attached whenever Lupos is asked to draw himself, so the image model keeps him the SAME recognizable wolf across renders — with persona rules folding his live somatic state (drunk, starving, smug) into every selfie.",
        implementationFile: "ImageIntent.ts",
        categoryLabel: "Media Consistency",
        badgeTone: "purple",
      },
    ],
  },
];

export const TOTAL_PAPER_COUNT = PAPER_CATEGORIES.reduce(
  (sum, category) => sum + category.papers.length,
  0,
);

export const ACADEMIC_PAPER_COUNT = PAPER_CATEGORIES.reduce(
  (sum, category) =>
    sum + category.papers.filter((paper) => paper.arxivUrl !== null).length,
  0,
);

export const CATEGORY_COUNT = PAPER_CATEGORIES.length;
