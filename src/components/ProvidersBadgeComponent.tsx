"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface ProvidersBadgeProps {
  providers?: string[];
  className?: string;
  mini?: boolean;
}

export default function ProvidersBadgeComponent({
  providers,
  className,
  mini,
}: ProvidersBadgeProps) {
  return (
    <BadgeComponent
      type="providers"
      providers={providers}
      className={className}
      mini={mini}
    />
  );
}
