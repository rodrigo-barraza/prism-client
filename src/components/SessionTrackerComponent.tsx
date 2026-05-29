"use client";

import { SessionTrackerComponent as LibrarySessionTracker } from "@rodrigo-barraza/components-library";
import { PROJECT_NAME } from "@/config";

export default function SessionTrackerComponent() {
  return <LibrarySessionTracker projectId={PROJECT_NAME} />;
}
