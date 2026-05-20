"use client";

import { DrawerComponent } from "@rodrigo-barraza/components-library";

/**
 * RequestDetailsComponent — a slide-in drawer for displaying request detail views.
 *
 * Thin wrapper around the shared DrawerComponent, preserving the existing API
 * so all consumers continue to work without changes.
 */
export default function RequestDetailsComponent({
  open,
  onClose,
  title = "Detail",
  sections = [],
  children,
}: unknown) {
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
