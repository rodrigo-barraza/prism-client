"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface ThroughputBadgeProps {
  liveTokPerSec: number | null;
  avgTokPerSec?: number | null;
  isActivelyGenerating?: boolean;
  turnActive?: boolean;
}

export default function ThroughputBadgeComponent({
  liveTokPerSec,
  avgTokPerSec,
  isActivelyGenerating,
  turnActive,
}: ThroughputBadgeProps) {
  return (
    <BadgeComponent
      type="throughput"
      liveTokPerSec={liveTokPerSec}
      avgTokPerSec={avgTokPerSec}
      isActivelyGenerating={isActivelyGenerating}
      turnActive={turnActive}
    />
  );
}
