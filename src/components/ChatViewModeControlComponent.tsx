"use client";

import { Network } from "lucide-react";
import { SegmentedControlComponent } from "@rodrigo-barraza/components-library";
import chatStyles from "./ChatAreaComponent.module.css";

export type ChatViewMode = "clean" | "raw" | "nodes";

interface ChatViewModeControlComponentProps {
  viewMode: ChatViewMode;
  onViewModeChange: (mode: ChatViewMode) => void;
}

export default function ChatViewModeControlComponent({
  viewMode,
  onViewModeChange,
}: ChatViewModeControlComponentProps) {
  return (
    <div className={`chat-view-mode-control-component ${chatStyles['debug-toggle-container']}`}>
      <SegmentedControlComponent
        value={viewMode}
        onChange={(segment: string) => onViewModeChange(segment as ChatViewMode)}
        compact
        segments={[
          { value: "clean", label: "Clean" },
          { value: "raw", label: "Raw" },
          { value: "nodes", icon: <Network size={12} />, label: "Nodes" },
        ]}
      />
    </div>
  );
}
