"use client";

import { Suspense } from "react";
import AgentChatComponent from "../../../components/AgentChatComponent";

export default function AdminChatPage() {
  return (
    <Suspense>
      <AgentChatComponent isAdmin />
    </Suspense>
  );
}
