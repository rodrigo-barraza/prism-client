import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import UserQuestionCardComponent from "../UserQuestionCardComponent";
import ElicitationFormComponent, { collectElicitationContent } from "../ElicitationFormComponent";
import type { McpElicitationRequest } from "../../types/types";

vi.mock("../ElicitationFormComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));
vi.mock("../UserQuestionCardComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));
vi.mock("@rodrigo-barraza/components-library", () => ({
  ButtonComponent: ({ children, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  TextAreaComponent: (props: any) => <textarea {...props} />,
}));

const TRIP: McpElicitationRequest = {
  server: "travel",
  mode: "form",
  requestedSchema: {
    type: "object",
    properties: {
      city: { type: "string", title: "City" },
      nights: { type: "integer", title: "Nights", minimum: 1 },
      seat: { type: "string", title: "Seat", enum: ["window", "aisle"] },
      window: { type: "boolean", title: "Window seat" },
      extras: { type: "array", title: "Extras", items: { enum: ["breakfast", "parking"] } },
    },
    required: ["city", "nights"],
  },
};

describe("ElicitationFormComponent", () => {
  it("renders the requested fields and submits typed values", () => {
    const onAnswer = vi.fn();
    render(<ElicitationFormComponent request={TRIP} message="Where to?" isPending onAnswer={onAnswer} />);

    expect(screen.getByText("Where to?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/City/), { target: { value: "Lisbon" } });
    fireEvent.change(screen.getByLabelText(/Nights/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/Seat/), { target: { value: "aisle" } });
    fireEvent.click(screen.getByLabelText(/Window seat/));
    fireEvent.click(screen.getByLabelText("breakfast"));
    fireEvent.click(screen.getByText("Submit"));

    expect(onAnswer).toHaveBeenCalledWith({
      answer: "accept",
      content: { city: "Lisbon", nights: 3, seat: "aisle", window: true, extras: ["breakfast"] },
    });
  });

  it("keeps a submit with a missing required field from reaching the server", () => {
    const onAnswer = vi.fn();
    render(<ElicitationFormComponent request={TRIP} message="Where to?" isPending onAnswer={onAnswer} />);
    fireEvent.click(screen.getByText("Submit"));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByText("City is required.")).toBeTruthy();
  });

  it("declines and cancels", () => {
    const onAnswer = vi.fn();
    render(<ElicitationFormComponent request={TRIP} message="Where to?" isPending onAnswer={onAnswer} />);
    fireEvent.click(screen.getByText("Decline"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onAnswer.mock.calls).toEqual([[{ answer: "decline" }], [{ answer: "cancel" }]]);
  });

  it("shows a URL request's address before the link", () => {
    const onAnswer = vi.fn();
    render(
      <ElicitationFormComponent
        request={{ server: "docs", mode: "url", url: "https://example.com/sign?x=1" }}
        message="Sign the form"
        isPending
        onAnswer={onAnswer}
      />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://example.com/sign?x=1");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("example.com")).toBeTruthy();
    fireEvent.click(screen.getByText("Done"));
    expect(onAnswer).toHaveBeenCalledWith({ answer: "accept" });
  });

  it("refuses a non-web link", () => {
    render(
      <ElicitationFormComponent
        request={{ server: "docs", mode: "url", url: "javascript:alert(1)" }}
        message="Click"
        isPending
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("checks number bounds", () => {
    expect(collectElicitationContent(TRIP, { city: "Rome", nights: "0" })).toEqual({
      error: "Nights must be at least 1.",
    });
    expect(collectElicitationContent(TRIP, { city: "Rome", nights: "1.5" })).toEqual({
      error: "Nights must be a whole number.",
    });
  });
});

describe("UserQuestionCardComponent with an MCP elicitation", () => {
  it("renders the form in place of options and answers with the values", () => {
    const onAnswer = vi.fn();
    render(
      <UserQuestionCardComponent
        questions={[{ question: "Where to?", header: "travel", options: [], elicitation: TRIP }]}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByText("travel asks")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/City/), { target: { value: "Oslo" } });
    fireEvent.change(screen.getByLabelText(/Nights/), { target: { value: "2" } });
    fireEvent.click(screen.getByText("Submit"));
    expect(onAnswer).toHaveBeenCalledWith([
      { answer: "accept", content: { city: "Oslo", nights: 2, window: false } },
    ]);
  });
});
