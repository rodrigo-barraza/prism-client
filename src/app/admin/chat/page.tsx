"use client";

import { Suspense } from "react";
import ChatConversationComponent from "../../../components/ChatConversationComponent";

export default function AdminChatPage() {
  return (
    <Suspense>
      <ChatConversationComponent isAdmin />
    </Suspense>
  );
}
