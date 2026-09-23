import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import GoalPanelComponent from "../GoalPanelComponent";
import useConversationGoal from "../../hooks/useConversationGoal";
import type { ConversationGoal, ModelsMap } from "../../types/types";

// ─────────────────────────────────────────────────────────────
// Goals as verified outcomes (prompt 21), client side: the goal form
// (validation and the exact PUT / PATCH body), the rubric with each
// criterion's last verdict, why a goal paused, and the card for a goal
// the agent proposed.
// ─────────────────────────────────────────────────────────────

const MODELS: ModelsMap = {
  anthropic: [{ name: "claude-sonnet-5", label: "Sonnet 5" }],
  google: [{ name: "gemini-3.8-flash", label: "Gemini 3.8 Flash" }],
};

const GOAL: ConversationGoal = {
  objective: "Create report.md with exactly 3 bullet points summarizing the files in the workspace.",
  rubric: [
    { id: "c1", criterion: "report.md exists" },
    { id: "c2", criterion: "exactly 3 bullets" },
    { id: "c3", criterion: "each bullet names a real file" },
  ],
  verifier: { provider: "anthropic", model: "claude-sonnet-5" },
  maxIterations: 3,
  progress: { summary: "Working", percent: 40, updatedAt: "2026-09-22T10:00:00Z" },
  blockedOn: null,
  status: "active",
  pause: null,
  verification: null,
  spentDollars: 0.12,
  turnsUsed: 1,
  createdAt: "2026-09-22T09:00:00Z",
  updatedAt: "2026-09-22T10:00:00Z",
};

interface Request {
  method: string;
  path: string;
  body: unknown;
}

let requests: Request[] = [];
let responder: (request: Request) => unknown = () => ({});

beforeEach(() => {
  requests = [];
  responder = (request) =>
    request.method === "GET" ? { goal: null, proposal: null } : { goal: null };
  vi.spyOn(global, "fetch").mockImplementation((async (url: string, init?: RequestInit) => {
    const request = {
      method: init?.method ?? "GET",
      // The service base URL is unset under test; keep the route.
      path: new URL(String(url), "http://prism.test").pathname.replace(/^.*?(?=\/conversations\/)/, ""),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    requests.push(request);
    const payload = responder(request);
    return { ok: true, status: 200, json: async () => payload } as Response;
  }) as typeof fetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The panel as AgentChatComponent mounts it, over the real hook. */
function Harness({ initialGoal = null }: { initialGoal?: ConversationGoal | null }) {
  const goal = useConversationGoal("conv-1");
  React.useEffect(() => {
    goal.hydrate(initialGoal);
    // Hydrate once, like the conversation loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <GoalPanelComponent
      goal={goal.goal}
      proposal={goal.proposal}
      onPause={() => void goal.pause()}
      onResume={() => void goal.resume()}
      onClear={() => void goal.clear()}
      onSave={goal.save}
      onApproveProposal={() => void goal.approveProposal()}
      onDeclineProposal={() => void goal.declineProposal()}
      models={MODELS}
      canCreate
      isBusy={goal.isBusy}
      error={goal.error}
    />
  );
}

function writes() {
  return requests.filter((request) => request.method !== "GET");
}

describe("the goal form", () => {
  it("validates before anything is sent", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Set goal" }));
    const form = screen.getByRole("form", { name: "New goal" });

    fireEvent.change(within(form).getByLabelText("Max spend ($)"), { target: { value: "-2" } });
    fireEvent.change(within(form).getByLabelText("Max turns"), { target: { value: "1.5" } });
    fireEvent.change(within(form).getByLabelText("Max revisions"), { target: { value: "40" } });
    fireEvent.click(within(form).getByRole("button", { name: "Set goal" }));

    const alerts = within(form).getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toEqual([
      "Describe what done means.",
      "Add at least one criterion the verifier can check.",
      "A dollar budget must be a positive number.",
      "Max turns must be a whole number of 1 or more.",
      "Max revisions must be a whole number from 1 to 20.",
    ]);
    expect(within(form).getByLabelText("Goal")).toHaveAttribute("aria-invalid", "true");
    expect(writes()).toHaveLength(0);
  });

  it("creates the goal with one PUT carrying the rubric, budgets, verifier and max iterations", async () => {
    responder = (request) =>
      request.method === "PUT"
        ? { goal: { ...GOAL, rubric: (request.body as { rubric: unknown }).rubric } }
        : { goal: null, proposal: null };
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Set goal" }));
    const form = screen.getByRole("form", { name: "New goal" });

    fireEvent.change(within(form).getByLabelText("Goal"), {
      target: { value: "  Create report.md with exactly 3 bullets  " },
    });
    fireEvent.change(within(form).getByLabelText("Criterion 1"), { target: { value: "report.md exists" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add criterion" }));
    fireEvent.change(within(form).getByLabelText("Criterion 2"), { target: { value: "exactly 3 bullets" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add criterion" }));
    fireEvent.change(within(form).getByLabelText("Criterion 3"), { target: { value: "a throwaway" } });
    fireEvent.click(within(form).getByRole("button", { name: "Remove criterion 3" }));
    fireEvent.change(within(form).getByLabelText("Max spend ($)"), { target: { value: "0.5" } });
    fireEvent.change(within(form).getByLabelText("Max turns"), { target: { value: "4" } });
    fireEvent.change(within(form).getByLabelText("Max revisions"), { target: { value: "2" } });
    fireEvent.change(within(form).getByLabelText("Verifier"), {
      target: { value: "anthropic::claude-sonnet-5" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Set goal" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: "PUT",
      path: "/conversations/conv-1/goal",
      body: {
        objective: "Create report.md with exactly 3 bullets",
        rubric: [{ criterion: "report.md exists" }, { criterion: "exactly 3 bullets" }],
        verifier: { provider: "anthropic", model: "claude-sonnet-5" },
        maxIterations: 2,
        budget: { maxCostDollars: 0.5, maxTurns: 4 },
      },
    });
    // Saved: the form closes onto the goal.
    expect(await screen.findByRole("region", { name: "Conversation goal" })).toBeInTheDocument();
  });

  it("the default verifier and no budget are left out of a new goal", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Set goal" }));
    const form = screen.getByRole("form", { name: "New goal" });
    fireEvent.change(within(form).getByLabelText("Goal"), { target: { value: "Ship it" } });
    fireEvent.change(within(form).getByLabelText("Criterion 1"), { target: { value: "CI green" } });
    fireEvent.click(within(form).getByRole("button", { name: "Set goal" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toEqual({
      objective: "Ship it",
      rubric: [{ criterion: "CI green" }],
      maxIterations: 3,
    });
  });

  it("edits the goal in place with a PATCH that keeps criterion ids", async () => {
    responder = (request) =>
      request.method === "PATCH" ? { goal: { ...GOAL, objective: "Edited" } } : { goal: null, proposal: null };
    render(<Harness initialGoal={GOAL} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit goal" }));
    const form = screen.getByRole("form", { name: "Edit goal" });
    expect(within(form).getByLabelText("Criterion 3")).toHaveValue("each bullet names a real file");
    expect(within(form).getByLabelText("Verifier")).toHaveValue("anthropic::claude-sonnet-5");

    fireEvent.change(within(form).getByLabelText("Criterion 2"), { target: { value: "exactly three bullets" } });
    fireEvent.change(within(form).getByLabelText("Verifier"), { target: { value: "" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save goal" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: "PATCH",
      path: "/conversations/conv-1/goal",
      body: {
        objective: GOAL.objective,
        rubric: [
          { id: "c1", criterion: "report.md exists" },
          { id: "c2", criterion: "exactly three bullets" },
          { id: "c3", criterion: "each bullet names a real file" },
        ],
        verifier: null,
        maxIterations: 3,
        budget: null,
      },
    });
  });
});

describe("the goal panel after a verification", () => {
  it("shows each criterion's status and the evidence gap of the ones not met", () => {
    render(
      <GoalPanelComponent
        goal={{
          ...GOAL,
          verification: {
            verdict: "needs_revision",
            criteria: [
              { id: "c1", pass: true, evidence: "read_file shows report.md" },
              { id: "c2", pass: false, evidence: "read_file shows 4 bullets, not 3" },
              { id: "c3", pass: true, evidence: "each bullet names a listed file" },
            ],
            iteration: 1,
            verifier: { provider: "anthropic", model: "claude-sonnet-5" },
            costDollars: 0.05,
            at: "2026-09-22T10:01:00Z",
          },
        }}
      />,
    );
    const rubric = screen.getByRole("list", { name: "Rubric" });
    const items = within(rubric).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("data-state"))).toEqual(["met", "unmet", "met"]);
    expect(within(items[0]).getByRole("img", { name: "Met" })).toBeInTheDocument();
    expect(within(items[1]).getByRole("img", { name: "Not met" })).toBeInTheDocument();
    expect(items[1]).toHaveTextContent("exactly 3 bullets");
    expect(items[1]).toHaveTextContent("read_file shows 4 bullets, not 3");
    expect(items[0]).not.toHaveTextContent("read_file shows report.md");
    expect(items[0]).toHaveAttribute("title", "read_file shows report.md");
    expect(screen.getByLabelText("Last verification")).toHaveTextContent(
      "Needs revision · round 1 of 3 · claude-sonnet-5 · $0.05",
    );
  });

  it("marks criteria not checked yet before the first verdict", () => {
    render(<GoalPanelComponent goal={GOAL} />);
    const items = within(screen.getByRole("list", { name: "Rubric" })).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("data-state"))).toEqual(["unchecked", "unchecked", "unchecked"]);
    expect(screen.queryByLabelText("Last verification")).toBeNull();
  });

  it("says why a goal paused", () => {
    const { rerender } = render(
      <GoalPanelComponent
        goal={{
          ...GOAL,
          status: "paused",
          pause: { reason: "budget", detail: "budget exhausted: $0.5100 spent of $0.5 allowed", at: "t" },
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Budget reached — budget exhausted: $0.5100 spent of $0.5 allowed",
    );
    rerender(
      <GoalPanelComponent goal={{ ...GOAL, status: "paused", pause: { reason: "empty_continuations", at: "t" } }} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Stopped making progress");
    rerender(<GoalPanelComponent goal={{ ...GOAL, status: "completed", verification: null }} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("a goal the agent proposed", () => {
  const PROPOSAL: ConversationGoal = {
    ...GOAL,
    objective: "Proposed: write the report",
    status: "proposed",
    budget: { maxCostDollars: 1 },
    progress: { summary: "Proposed", percent: 0, updatedAt: "t" },
  };

  it("is shown as a card to approve — not as the goal", async () => {
    responder = (request) => {
      if (request.method === "GET") return { goal: null, proposal: PROPOSAL };
      if (request.path.endsWith("/approve")) return { goal: { ...PROPOSAL, status: "active" }, proposal: null };
      return {};
    };
    render(<Harness />);
    const card = await screen.findByRole("region", { name: "Proposed goal" });
    expect(card).toHaveTextContent("Proposed: write the report");
    expect(within(card).getByRole("list", { name: "Proposed rubric" })).toHaveTextContent("exactly 3 bullets");
    expect(card).toHaveTextContent("up to $1 · 3 revisions");
    expect(screen.queryByRole("region", { name: "Conversation goal" })).toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Proposed goal" })).toBeNull());
    expect(writes()).toEqual([
      { method: "POST", path: "/conversations/conv-1/goal/proposal/approve", body: undefined },
    ]);
    expect(await screen.findByRole("region", { name: "Conversation goal" })).toHaveTextContent("Active");
  });

  it("declines", async () => {
    responder = (request) =>
      request.method === "GET" ? { goal: null, proposal: PROPOSAL } : { success: true };
    render(<Harness />);
    const card = await screen.findByRole("region", { name: "Proposed goal" });
    fireEvent.click(within(card).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Proposed goal" })).toBeNull());
    expect(writes()).toEqual([
      { method: "POST", path: "/conversations/conv-1/goal/proposal/decline", body: undefined },
    ]);
  });

  it("can be edited before it is approved — saving sets it as the goal", async () => {
    responder = (request) => {
      if (request.method === "GET") return { goal: null, proposal: PROPOSAL };
      return { goal: { ...PROPOSAL, status: "active", objective: "Tweaked" } };
    };
    render(<Harness />);
    const card = await screen.findByRole("region", { name: "Proposed goal" });
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "New goal" });
    expect(within(form).getByLabelText("Goal")).toHaveValue("Proposed: write the report");
    fireEvent.change(within(form).getByLabelText("Goal"), { target: { value: "Tweaked" } });
    fireEvent.click(within(form).getByRole("button", { name: "Set goal" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: "PUT", body: { objective: "Tweaked", budget: { maxCostDollars: 1 } } });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Proposed goal" })).toBeNull());
  });

  it("a goal_update 'proposed' event shows the card; 'set' replaces it with the goal", async () => {
    const captured: { api: ReturnType<typeof useConversationGoal> | null } = { api: null };
    function EventHarness() {
      const goal = useConversationGoal("conv-1");
      React.useEffect(() => {
        captured.api = goal;
      });
      return <GoalPanelComponent goal={goal.goal} proposal={goal.proposal} />;
    }
    render(<EventHarness />);
    await waitFor(() => expect(requests).toHaveLength(1));
    React.act(() => captured.api!.applyEvent({ type: "goal_update", change: "proposed", goal: PROPOSAL } as never));
    expect(screen.getByRole("region", { name: "Proposed goal" })).toBeInTheDocument();
    React.act(() =>
      captured.api!.applyEvent({ type: "goal_update", change: "set", goal: { ...PROPOSAL, status: "active" } } as never),
    );
    expect(screen.queryByRole("region", { name: "Proposed goal" })).toBeNull();
    expect(screen.getByRole("region", { name: "Conversation goal" })).toBeInTheDocument();
  });
});
