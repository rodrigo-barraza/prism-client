// @ts-nocheck
"use client";

import { use } from "react";
import WorkflowsPage from "../page";

export default function WorkflowByIdPage({ params }: any) {
  const { id } = use(params);
  return <WorkflowsPage initialWorkflowId={id} />;
}
