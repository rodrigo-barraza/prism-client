export * from "./FileAndSearchRenderers";
export * from "./TerminalAndGitRenderers";
export * from "./BrowserMediaAndVisualRenderers";
export * from "./VisualAndEmojiRenderers";
export * from "./CoordinatorAndMiscRenderers";

import { RendererProps } from "../types";
import { RawResultToggle } from "../SharedComponents";
import React from "react";

// Add missing renderers that were referenced but not fully implemented in the monolith
// or were using GenericRenderer as a placeholder.

export const GenericRenderer: React.FC<RendererProps> = ({ result }) => {
  return <RawResultToggle result={result} />;
};

export const FetchUrlRenderer: React.FC<RendererProps> = ({ result }) => {
  // Placeholder for fetch/read_web_page results
  return <GenericRenderer result={result} />;
};

export const ScheduleRenderer: React.FC<RendererProps> = ({ result }) => {
  // Placeholder for schedule results
  return <GenericRenderer result={result} />;
};
