"use client";

import { Suspense } from "react";
import AdminAgentViewerComponent from "../../../components/AdminAgentViewerComponent";

export default function AdminAgentsPage() {
  return (
    <Suspense>
      <AdminAgentViewerComponent />
    </Suspense>
  );
}
