import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import SettingsPanel from "../src/components/SettingsPanelComponent";
import { PRISM_SERVICE_URL } from "../src/config";
import type { PrismSettings } from "../src/types/types";

vi.mock(
  "../src/components/SettingsPanelComponent.module.css",
  () => ({
    default: new Proxy(
      {},
      {
        get: (_target, property: string) => property,
      },
    ),
  }),
);

const mockCopyToClipboardHandler = vi.fn();
vi.mock("@rodrigo-barraza/components-library", () => ({
  SelectComponent: () => <div data-testid="mock-select" />,
  ToggleComponent: () => <input type="checkbox" data-testid="mock-toggle" />,
  TextAreaComponent: () => <textarea data-testid="mock-textarea" />,
  useClipboard: () => ({
    copy: mockCopyToClipboardHandler,
    copied: false,
  }),
}));

const mockPrismSettings: PrismSettings = {
  provider: "google",
  model: "gemini-3.5-flash",
  systemPrompt: "You are a helpful assistant.",
  temperature: 0.7,
  maxTokens: 4096,
  thinkingEnabled: true,
};

describe("SettingsPanelComponent - Copy cURL", () => {
  it("should render the Copy cURL button", () => {
    render(
      <SettingsPanel
        config={null}
        settings={mockPrismSettings}
        onChange={vi.fn()}
      />
    );

    const copyButtonElement = screen.getByText("Copy cURL");
    expect(copyButtonElement).toBeTruthy();
  });

  it("should trigger copy function on click", () => {
    render(
      <SettingsPanel
        config={null}
        settings={mockPrismSettings}
        onChange={vi.fn()}
        conversationType="agent"
      />
    );

    const copyButtonElement = screen.getByText("Copy cURL");
    fireEvent.click(copyButtonElement);

    expect(mockCopyToClipboardHandler).toHaveBeenCalled();
    const copiedCommandText = mockCopyToClipboardHandler.mock.calls[0][0];
    expect(copiedCommandText).toContain("curl -X POST");
    expect(copiedCommandText).toContain("https://api.prism.rod.dev/agent");
    expect(copiedCommandText).toContain("gemini-3.5-flash");
  });
});
