import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import CitationsComponent from "../CitationsComponent";

const citations = {
  sources: [
    { url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/A", title: "formula1.com" },
    { url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/B", title: "usatoday.com" },
  ],
  queries: ["most recent Formula 1 race 2026 result"],
  supports: [{ text: "Antonelli won", sources: [0, 1] }],
};

describe("CitationsComponent", () => {
  it("renders each cited source as a numbered link that opens in a new tab", () => {
    render(<CitationsComponent citations={citations} />);
    const row = screen.getByLabelText("Sources");
    expect(row.getAttribute("title")).toBe("Searched: most recent Formula 1 race 2026 result");
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["1formula1.com", "2usatoday.com"]);
    expect(links[0].getAttribute("href")).toBe(citations.sources[0].url);
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toContain("noopener");
  });

  it("renders nothing without sources", () => {
    const { container } = render(<CitationsComponent citations={{ sources: [] }} />);
    expect(container.firstChild).toBeNull();
    const { container: none } = render(<CitationsComponent citations={undefined} />);
    expect(none.firstChild).toBeNull();
  });
});
