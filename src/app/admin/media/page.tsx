"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import AdminFiltersCardComponent from "../../../components/AdminFiltersCardComponent";
import MediaPageComponent from "../../../components/MediaPageComponent";

export default function AdminMediaPage() {
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get("project") || null;
  const { setTitleBadge, dateRange, agentFilter } = useAdminHeader();

  useEffect(() => {
    return () => {
      setTitleBadge(null);
    };
  }, [setTitleBadge]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AdminFiltersCardComponent
        show={{ provider: false, model: false, workspace: false }}
      />
      <MediaPageComponent
        mode="admin"
        project={projectFilter}
        dateRange={dateRange}
        agent={agentFilter}
        onCountChange={setTitleBadge}
      />
    </div>
  );
}
