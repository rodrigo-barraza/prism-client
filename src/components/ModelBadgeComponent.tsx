"use client";

import React from "react";
import BadgeComponent, { cleanModelName } from "./BadgeComponent";

export { cleanModelName };

export interface ModelBadgeProps {
  models?: string[];
  provider?: string;
  providers?: string[];
  className?: string;
  mini?: boolean;
  noHover?: boolean;
}

export default function ModelBadgeComponent({
  models,
  provider,
  providers,
  className,
  mini,
  noHover,
}: ModelBadgeProps) {
  return (
    <BadgeComponent
      type="model"
      models={models}
      provider={provider}
      providers={providers}
      className={className}
      mini={mini}
      noHover={noHover}
    />
  );
}
