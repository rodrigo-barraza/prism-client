"use client";

import { Suspense, use } from "react";
import ChatSessionComponent from "../../../../components/ChatSessionComponent";

export default function AdminChatDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense>
      <ChatSessionComponent isAdmin initialId={id} />
    </Suspense>
  );
}
