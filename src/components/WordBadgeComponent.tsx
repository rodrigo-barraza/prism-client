"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface WordBadgeProps {
  count: number;
  className?: string;
  mini?: boolean;
}

export default function WordBadgeComponent({
  count,
  className,
  mini,
}: WordBadgeProps) {
  return (
    <BadgeComponent
      type="words"
      count={count}
      className={className}
      mini={mini}
    />
  );
}
