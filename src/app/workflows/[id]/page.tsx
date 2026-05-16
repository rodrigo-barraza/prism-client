"use client";

import { use } from "react";
import WorkflowsPage from "../page";

// @ts-ignore
export default function WorkflowByIdPage({ params: any }) {
  // @ts-ignore
  // @ts-ignore
  const { id } = use(params);
  return <WorkflowsPage initialWorkflowId={id} />;
}
