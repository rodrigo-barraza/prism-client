"use client";

import { Suspense } from "react";
import ChatSessionComponent from "../../../components/ChatSessionComponent";

export default function AdminChatPage() {
  return (
    <Suspense>
      <ChatSessionComponent isAdmin />
    </Suspense>
  );
}
