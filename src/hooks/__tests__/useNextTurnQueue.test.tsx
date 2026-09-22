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

  it("holds a turn for the conversation it was queued in", async () => {
    const { result, rerender, send } = renderQueue({
      conversationId: "conv-1",
      isGenerating: true,
    });
    act(() => {
      result.current.enqueue({ text: "for conv-1", images: [] });
    });

    // Switched to another conversation, idle there: nothing drains into it.
    rerender({ conversationId: "conv-2", isGenerating: false });
    expect(result.current.items).toEqual([]);
    await act(async () => {});
    expect(send).not.toHaveBeenCalled();

    // Back in conv-1: it goes out there.
    rerender({ conversationId: "conv-1", isGenerating: false });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0]).toMatchObject({ text: "for conv-1", conversationId: "conv-1" });
  });

  it("a removed turn is never sent", async () => {
    const { result, rerender, sentTexts, finishSend } = renderQueue({
      conversationId: "conv-1",
      isGenerating: true,
    });
    act(() => {
      result.current.enqueue({ text: "keep", images: [] });
      result.current.enqueue({ text: "drop", images: [] });
      result.current.enqueue({ text: "keep too", images: [] });
    });
    act(() => {
      result.current.remove(result.current.items[1].id);
    });
    expect(result.current.items.map((turn) => turn.text)).toEqual(["keep", "keep too"]);

    rerender({ conversationId: "conv-1", isGenerating: false });
    await waitFor(() => expect(sentTexts()).toEqual(["keep"]));
    await finishSend(0);
    await waitFor(() => expect(sentTexts()).toEqual(["keep", "keep too"]));
  });
});
