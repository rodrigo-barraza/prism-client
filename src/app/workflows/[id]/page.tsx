"use client";

import { useParams } from "next/navigation";
import WorkflowsPage from "../page";

export default function WorkflowByIdPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  return <WorkflowsPage initialWorkflowId={id} />;
}
