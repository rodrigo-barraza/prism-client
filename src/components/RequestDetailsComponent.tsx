"use client";

import { DrawerComponent } from "@rodrigo-barraza/components-library";
import type { ReactNode } from "react";

export interface DrawerSectionItem {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
}

export interface DrawerSection {
  title: string;
  items: DrawerSectionItem[];
}

export interface RequestDetailsProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  sections?: DrawerSection[];
  contentKey?: string | number | null;
  children?: ReactNode;
}

export default function RequestDetailsComponent({
  open,
  onClose,
  title = "Detail",
  sections = [],
  contentKey,
  children,
}: RequestDetailsProps) {
  return (
    <DrawerComponent
      className="request-details-component"
      open={open}
      onClose={onClose}
      title={title}
      sections={sections}
      contentKey={contentKey}
    >
      {children}
    </DrawerComponent>
  );
}
