"use client";

import { Suspense } from "react";
import AgentsPageComponent from "../../components/AgentsPageComponent";

export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsPageComponent />
    </Suspense>
  );
}
