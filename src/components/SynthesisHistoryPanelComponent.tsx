"use client";

import { FlaskConical } from "lucide-react";
import HistoryPanel from "./HistoryPanelComponent.js";

/**
 * Thin wrapper around HistoryPanel with synthesis-specific labels.
 * Shares the same base component, styling, and HistoryList as the
 * conversations panel for full visual consistency.
 */
export default function SynthesisHistoryPanel({
  // @ts-ignore
  // @ts-ignore
  conversations: any,
  // @ts-ignore
  // @ts-ignore
  activeId: any,
  // @ts-ignore
  // @ts-ignore
  onSelect: any,
  // @ts-ignore
  // @ts-ignore
  onDelete: any,
}) {
  return (
    <HistoryPanel
      // @ts-ignore
      // @ts-ignore
      conversations={conversations}
      // @ts-ignore
      activeId={activeId}
      // @ts-ignore
      onSelect={onSelect}
      // @ts-ignore
      onDelete={onDelete}
      readOnly={false}
      newLabel="New Synthesis"
      emptyText="No synthesis runs"
      searchText="Search synthesis..."
      itemIcon={FlaskConical}
    />
  );
}
