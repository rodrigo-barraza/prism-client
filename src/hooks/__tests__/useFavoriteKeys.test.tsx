import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import useFavoriteKeys from "../useFavoriteKeys";
import PrismService from "../../services/PrismService";

describe("useFavoriteKeys", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the type's favorites and toggles them through the service", async () => {
    const getFavorites = vi
      .spyOn(PrismService, "getFavorites")
      .mockResolvedValue([{ key: "conv-a" }] as Awaited<ReturnType<typeof PrismService.getFavorites>>);
    const addFavorite = vi.spyOn(PrismService, "addFavorite").mockResolvedValue({} as never);
    const removeFavorite = vi
      .spyOn(PrismService, "removeFavorite")
      .mockResolvedValue({ success: true });

    const { result } = renderHook(() => useFavoriteKeys("conversation"));
    await waitFor(() => expect(result.current.keys).toEqual(["conv-a"]));
    expect(getFavorites).toHaveBeenCalledWith("conversation");

    act(() => result.current.toggle("conv-b"));
    expect(result.current.keys).toEqual(["conv-a", "conv-b"]);
    expect(addFavorite).toHaveBeenCalledWith("conversation", "conv-b");

    act(() => result.current.toggle("conv-a"));
    expect(result.current.keys).toEqual(["conv-b"]);
    expect(removeFavorite).toHaveBeenCalledWith("conversation", "conv-a");
  });

  it("rolls a toggle back when the service refuses it", async () => {
    vi.spyOn(PrismService, "getFavorites").mockResolvedValue([]);
    vi.spyOn(PrismService, "addFavorite").mockRejectedValue(new Error("500"));

    const { result } = renderHook(() => useFavoriteKeys("conversation"));
    await act(async () => {});
    act(() => result.current.toggle("conv-a"));
    expect(result.current.keys).toEqual(["conv-a"]);
    await waitFor(() => expect(result.current.keys).toEqual([]));
  });
});
