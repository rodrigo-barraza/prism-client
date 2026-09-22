import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import React from "react";
import useQuestionAnswerSender from "../useQuestionAnswerSender";
import NonBlockingQuestionsComponent from "../../components/NonBlockingQuestionsComponent";
import PrismService from "../../services/PrismService";
import type { NonBlockingQuestionCard } from "../useNonBlockingQuestions";

/**
 * An answer to an agent question reaches the agent exactly once:
 * `/agent/answer` carries the conversation id AND the card's questionId;
 * a 404 (the turn or card is gone) falls back to ONE normal message; a
 * second click on the same card sends nothing.
 *
 * The fallback is wired the way AgentChatComponent's `handleSend` routes a
 * message while the turn runs in "update" mode: `PrismService.sendTurnInput`
 * (`POST /agent/input`).
 */

interface RecordedRequest {
  path: string;
  body: Record<string, unknown>;
}

let requests: RecordedRequest[] = [];
let answerStatus = 200;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  requests = [];
  answerStatus = 200;
  vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
    const path = new URL(String(url), "http://localhost").pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ path, body });
    if (path.endsWith("/agent/answer")) {
      return answerStatus === 200
        ? jsonResponse(200, { ok: true, questionId: body.questionId, blocking: false })
        : jsonResponse(answerStatus, { error: "No pending question", reason: "no_pending_question" });
    }
    if (path.endsWith("/agent/input")) return jsonResponse(200, { ok: true, inputId: "input-1", position: 1 });
    return jsonResponse(200, {});
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const toPath = (suffix: string) => requests.filter((request) => request.path.endsWith(suffix));

function renderSender(conversationId = "conv-root-1") {
  const notify = vi.fn();
  const sendAsMessage = vi.fn((text: string) => {
    void PrismService.sendTurnInput(conversationId, text);
  });
  const { result } = renderHook(() =>
    useQuestionAnswerSender({ getConversationId: () => conversationId, sendAsMessage, notify }),
  );
  return { send: result.current, sendAsMessage, notify };
}

describe("useQuestionAnswerSender", () => {
  it("answers with the conversationId and the card's questionId", async () => {
    const { send } = renderSender("conv-root-1");
    let via: string | undefined;
    await act(async () => {
      via = await send([{ answer: "green" }], "q-green-1");
    });
    expect(via).toBe("answer");
    expect(toPath("/agent/answer")).toEqual([
      { path: expect.stringMatching(/\/agent\/answer$/), body: { conversationId: "conv-root-1", questionId: "q-green-1", answers: [{ answer: "green" }] } },
    ]);
    expect(toPath("/agent/input")).toHaveLength(0);
  });

  it("on a 404 sends exactly ONE /agent/input message, even when the card is clicked twice", async () => {
    answerStatus = 404;
    const { send, sendAsMessage, notify } = renderSender("conv-root-2");
    let vias: string[] = [];
    await act(async () => {
      vias = await Promise.all([
        send([{ answer: "blue" }], "q-blue-1"),
        send([{ answer: "blue" }], "q-blue-1"),
      ]);
    });
    expect(vias.sort()).toEqual(["duplicate", "message"]);
    expect(toPath("/agent/answer")).toHaveLength(1);
    expect(sendAsMessage).toHaveBeenCalledTimes(1);
    expect(toPath("/agent/input")).toEqual([
      { path: expect.stringMatching(/\/agent\/input$/), body: expect.objectContaining({ conversationId: "conv-root-2", text: "blue" }) },
    ]);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("sent your answer as a message"), "info");

    // And a later click on the delivered card still sends nothing.
    await act(async () => {
      expect(await send([{ answer: "blue" }], "q-blue-1")).toBe("duplicate");
    });
    expect(toPath("/agent/answer")).toHaveLength(1);
    expect(toPath("/agent/input")).toHaveLength(1);
  });

  it("a failed send can be retried (the card is not burned by a network error)", async () => {
    answerStatus = 500;
    const { send, notify } = renderSender();
    await act(async () => {
      expect(await send([{ answer: "red" }], "q-red-1")).toBe("failed");
    });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Could not send the answer"), "error");
    answerStatus = 200;
    await act(async () => {
      expect(await send([{ answer: "red" }], "q-red-1")).toBe("answer");
    });
    expect(toPath("/agent/answer")).toHaveLength(2);
  });
});

describe("NonBlockingQuestionsComponent + useQuestionAnswerSender", () => {
  it("a second click on an option does not double-send", async () => {
    const card: NonBlockingQuestionCard = {
      questionId: "q-theme-1",
      questions: [{ question: "Light or dark?", options: [{ label: "Light" }, { label: "Dark" }] }],
      context: null,
      status: "open",
      receivedAt: Date.now(),
    };
    function Harness() {
      const send = useQuestionAnswerSender({
        getConversationId: () => "conv-root-3",
        sendAsMessage: () => undefined,
        notify: () => undefined,
      });
      return (
        <NonBlockingQuestionsComponent
          cards={[card]}
          onAnswer={(questionId, answers) => {
            void send(answers, questionId);
          }}
        />
      );
    }
    render(<Harness />);
    const dark = screen.getByRole("button", { name: /Dark/ });
    await act(async () => {
      fireEvent.click(dark);
      fireEvent.click(dark);
    });
    expect(toPath("/agent/answer")).toEqual([
      { path: expect.stringMatching(/\/agent\/answer$/), body: { conversationId: "conv-root-3", questionId: "q-theme-1", answers: [{ answer: "Dark" }] } },
    ]);
  });
});
