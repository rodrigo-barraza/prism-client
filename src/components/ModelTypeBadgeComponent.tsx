"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface ModelTypeBadgeProps {
  modelType?: string;
  className?: string;
  mini?: boolean;
}

export default function ModelTypeBadgeComponent({
  modelType,
  className,
  mini,
}: ModelTypeBadgeProps) {
  return (
    <BadgeComponent
      type="model-type"
      modelType={modelType}
      className={className}
      mini={mini}
    />
  );
}
