"use client";

import { Suspense, use } from "react";
import AdminChatViewerComponent from "../../../../components/AdminChatViewerComponent";

export default function AdminChatDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense>
      <AdminChatViewerComponent initialId={id} />
    </Suspense>
  );
}
