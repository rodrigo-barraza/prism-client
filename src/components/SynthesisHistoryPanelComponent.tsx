"use client";

import { FlaskConical } from "lucide-react";
import HistoryPanel from "./HistoryPanelComponent";
import type { SynthesisRun, Conversation } from "../types/types";

interface SynthesisHistoryPanelProps {
  conversations?: SynthesisRun[];
  activeId?: string | null;
  onSelect?: (conversation: SynthesisRun) => void | Promise<void>;
  onDelete?: (id: string) => void;
}

export default function SynthesisHistoryPanel({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: SynthesisHistoryPanelProps) {
  return (
    <HistoryPanel
      className="synthesis-history-panel-component"
      conversations={conversations as unknown as Conversation[]}
      activeId={activeId}
      onSelect={onSelect as ((conversation: Conversation) => void | Promise<void>) | undefined}
      onDelete={onDelete}
      readOnly={false}
      newLabel="New Synthesis"
      emptyText="No synthesis runs"
      searchText="Search synthesis..."
      itemIcon={FlaskConical}
    />
  );
}
