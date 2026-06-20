"use client";

import { Suspense, use } from "react";
import ChatConversationComponent from "../../../../components/ChatConversationComponent";

export default function AdminChatDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense>
      <ChatConversationComponent isAdmin initialId={id} />
    </Suspense>
  );
}
