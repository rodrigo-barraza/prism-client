import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useNextTurnQueue,
  useNextTurnQueueDrain,
  type QueuedTurn,
} from "../useNextTurnQueue";

/** The composer's queue + drain, wired the way AgentChatComponent wires them. */
function renderQueue(initialProps: { conversationId: string; isGenerating: boolean }) {
  const pendingSends: Array<() => void> = [];
  const send = vi.fn(
    (_turn: QueuedTurn) => new Promise<void>((resolve) => pendingSends.push(resolve)),
  );
  const hook = renderHook(
    ({ conversationId, isGenerating }) => {
      const queue = useNextTurnQueue(conversationId);
      useNextTurnQueueDrain(queue, { isGenerating, send });
      return queue;
    },
    { initialProps },
  );
  const sentTexts = () => send.mock.calls.map(([turn]) => turn.text);
  /** Finish the in-flight send (the generation it started has ended). */
  const finishSend = async (index: number) => {
    await act(async () => {
      pendingSends[index]();
    });
  };
  return { ...hook, send, sentTexts, finishSend };
}

describe("next-turn queue", () => {
  it("sends every message queued during a generation, in order, one at a time", async () => {
    const { result, rerender, send, sentTexts, finishSend } = renderQueue({
      conversationId: "conv-1",
      isGenerating: true,
    });

    act(() => {
      result.current.enqueue({ text: "first", images: [] });
    });
    act(() => {
      result.current.enqueue({ text: "second", images: [] });
    });

    // The generation ends: the first goes out, the second waits for it.
    rerender({ conversationId: "conv-1", isGenerating: false });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(sentTexts()).toEqual(["first"]);

    // The first queued turn generates and finishes — then the second goes.
    rerender({ conversationId: "conv-1", isGenerating: true });
    rerender({ conversationId: "conv-1", isGenerating: false });
    await finishSend(0);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(sentTexts()).toEqual(["first", "second"]);
  });
});
