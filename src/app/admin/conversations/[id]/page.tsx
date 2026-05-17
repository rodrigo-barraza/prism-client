"use client";

import { use } from "react";
import ConversationsPage from "../page";

export default function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ConversationsPage initialId={id} />;
}
