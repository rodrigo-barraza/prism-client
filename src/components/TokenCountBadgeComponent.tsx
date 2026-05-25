"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface TokenCountBadgeProps {
  value: number;
  label?: string;
  showIcon?: boolean;
  className?: string;
  mini?: boolean;
}

export default function TokenCountBadgeComponent({
  value,
  label,
  showIcon,
  className,
  mini,
}: TokenCountBadgeProps) {
  return (
    <BadgeComponent
      type="tokens"
      value={value}
      label={label}
      showIcon={showIcon}
      className={className}
      mini={mini}
    />
  );
}
