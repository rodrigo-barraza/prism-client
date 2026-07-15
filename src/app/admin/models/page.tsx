"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import AdminFiltersCardComponent from "../../../components/AdminFiltersCardComponent";
import ModelsPageComponent from "../../../components/ModelsPageComponent";

export default function AdminModelsPage() {
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get("project") || null;
  const { setTitleBadge } = useAdminHeader();

  useEffect(() => {
    return () => {
      setTitleBadge(null);
    };
  }, [setTitleBadge]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AdminFiltersCardComponent
        show={{
          provider: false,
          model: false,
          agent: false,
          workspace: false,
          date: false,
        }}
      />
      <ModelsPageComponent
        mode="admin"
        project={projectFilter}
        onCountChange={setTitleBadge}
      />
    </div>
  );
}
