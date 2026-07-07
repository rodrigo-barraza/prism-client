"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import ChatConversationComponent from "../../../../components/ChatConversationComponent";

export default function AdminChatDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  return (
    <Suspense>
      <ChatConversationComponent isAdmin initialId={id} />
    </Suspense>
  );
}
