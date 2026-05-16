"use client";

import { use } from "react";
import ConversationsPage from "../page";

// @ts-ignore
export default function ConversationDetailPage({ params: any }) {
  // @ts-ignore
  // @ts-ignore
  const { id } = use(params);
  return <ConversationsPage initialId={id} />;
}
