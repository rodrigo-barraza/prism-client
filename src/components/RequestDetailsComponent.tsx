"use client";

import { DrawerComponent } from "@rodrigo-barraza/components-library";

/**
 * RequestDetailsComponent — a slide-in drawer for displaying request detail views.
 *
 * Thin wrapper around the shared DrawerComponent, preserving the existing API
 * so all consumers continue to work without changes.
 *
 * @param {boolean} open — whether the drawer is visible
 * @param {Function} onClose — callback to close the drawer
 * @param {string} title — drawer header title
 * @param {Array<{title: string, items: Array<{label: string, value: React.ReactNode}>}> sections
 * @param {React.ReactNode} [children] — additional content rendered after sections
 */
export default function RequestDetailsComponent({
  open,
  onClose,
  title = "Detail",
  sections = [],
  children,
}: any) {
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
