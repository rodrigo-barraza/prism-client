"use client";

import { SessionTrackerComponent as LibrarySessionTracker } from "@rodrigo-barraza/components-library";
import { useSession } from "next-auth/react";
import { PROJECT_NAME } from "@/config";

export default function SessionTrackerComponent() {
  const { data: userSession } = useSession();
  const userId = userSession?.user?.email || userSession?.user?.name || null;

  return <LibrarySessionTracker projectId={PROJECT_NAME} userId={userId} />;
}
