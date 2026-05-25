"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface UserBadgeProps {
  username?: string;
  className?: string;
}

export default function UserBadgeComponent({
  username,
  className,
}: UserBadgeProps) {
  return (
    <BadgeComponent
      type="user"
      username={username}
      className={className}
    />
  );
}
