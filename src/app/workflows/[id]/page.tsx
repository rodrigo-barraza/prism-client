"use client";

import { use } from "react";
import WorkflowsPage from "../page";

interface WorkflowByIdPageProps {
  params: Promise<{ id: string }>;
}

export default function WorkflowByIdPage({ params }: WorkflowByIdPageProps) {
  const { id } = use(params);
  return <WorkflowsPage initialWorkflowId={id} />;
}
