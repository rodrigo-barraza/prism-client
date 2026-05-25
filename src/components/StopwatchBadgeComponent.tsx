"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface StopwatchBadgeProps {
  seconds?: number;
  startTime?: string | number | null;
  live?: boolean;
  className?: string;
}

export default function StopwatchBadgeComponent({
  seconds,
  startTime,
  live,
  className,
}: StopwatchBadgeProps) {
  return (
    <BadgeComponent
      type="stopwatch"
      seconds={seconds}
      startTime={startTime}
      live={live}
      className={className}
    />
  );
}
