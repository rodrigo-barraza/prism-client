"use client";

import { use } from "react";
import WorkflowsPage from "../page";

export default function WorkflowByIdPage({ params }: any) {
  const { id } = use<any>(params);
  return <WorkflowsPage initialWorkflowId={id} />;
}
