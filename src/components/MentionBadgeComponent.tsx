"use client";

import React from "react";
import BadgeComponent from "./BadgeComponent";

export interface MentionBadgeProps {
  path: string;
  name?: string;
  mentionType?: "file" | "directory";
  lineStart?: number | null;
  lineEnd?: number | null;
  stale?: boolean;
  knownPaths?: Set<string> | null;
  onFileOpen?: (path: string) => void;
}

export default function MentionBadgeComponent({
  path,
  name,
  mentionType,
  lineStart,
  lineEnd,
  stale,
  knownPaths,
  onFileOpen,
}: MentionBadgeProps) {
  return (
    <BadgeComponent
      type="mention"
      path={path}
      name={name}
      mentionType={mentionType}
      lineStart={lineStart}
      lineEnd={lineEnd}
      stale={stale}
      knownPaths={knownPaths}
      onFileOpen={onFileOpen}
    />
  );
}
