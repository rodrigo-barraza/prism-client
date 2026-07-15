"use client";

import { useEffect } from "react";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import AdminFiltersCardComponent from "../../../components/AdminFiltersCardComponent";
import TextPageComponent from "../../../components/TextPageComponent";

export default function AdminTextPage() {
  const { setTitleBadge, dateRange, agentFilter } = useAdminHeader();

  useEffect(() => {
    return () => {
      setTitleBadge(null);
    };
  }, [setTitleBadge]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AdminFiltersCardComponent
        show={{
          project: false,
          provider: false,
          model: false,
          workspace: false,
        }}
      />
      <TextPageComponent
        mode="admin"
        dateRange={dateRange}
        agent={agentFilter ?? undefined}
        onCountChange={setTitleBadge}
      />
    </div>
  );
}
