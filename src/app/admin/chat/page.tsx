"use client";

import { Suspense } from "react";
import AdminChatViewerComponent from "../../../components/AdminChatViewerComponent";

export default function AdminChatPage() {
  return (
    <Suspense>
      <AdminChatViewerComponent />
    </Suspense>
  );
}
