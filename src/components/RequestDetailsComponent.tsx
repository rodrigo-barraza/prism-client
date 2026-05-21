"use client";

import { DrawerComponent } from "@rodrigo-barraza/components-library";

/**
 * RequestDetailsComponent — a slide-in drawer for displaying request detail views.
 *
 * Thin wrapper around the shared DrawerComponent, preserving the existing API
 * so all consumers continue to work without changes.
 */
export interface RequestDetailsProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  sections?: any[];
  children?: React.ReactNode;
}

export default function RequestDetailsComponent({
  open,
  onClose,
  title = "Detail",
  sections = [],
  children,
}: RequestDetailsProps) {
  return (
    <DrawerComponent
      open={open}
      onClose={onClose}
      title={title}
      sections={sections}
    >
      {children}
    </DrawerComponent>
  );
}
