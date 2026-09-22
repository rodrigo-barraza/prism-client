/**
 * The tab title carries "(N) " while N conversations wait on the user.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNeedsYouTabTitle } from "../useNeedsYouTabTitle";

describe("useNeedsYouTabTitle", () => {
  beforeEach(() => {
    document.head.innerHTML = "<title>Prism Playground</title>";
  });

  it("prefixes the count, follows it, and restores the title at zero and on unmount", () => {
    const { rerender, unmount } = renderHook(
      ({ count }: { count: number }) => useNeedsYouTabTitle(count),
      { initialProps: { count: 2 } },
    );
    expect(document.title).toBe("(2) Prism Playground");

    rerender({ count: 3 });
    expect(document.title).toBe("(3) Prism Playground");

    rerender({ count: 0 });
    expect(document.title).toBe("Prism Playground");

    rerender({ count: 1 });
    unmount();
    expect(document.title).toBe("Prism Playground");
  });

  it("re-applies the prefix when the page rewrites its title (navigation)", async () => {
    renderHook(() => useNeedsYouTabTitle(4));
    document.title = "Settings · Prism";
    await Promise.resolve();
    expect(document.title).toBe("(4) Settings · Prism");
  });

  it("leaves the title alone when disabled (the admin view)", () => {
    renderHook(() => useNeedsYouTabTitle(5, false));
    expect(document.title).toBe("Prism Playground");
  });
});
