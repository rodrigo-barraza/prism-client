"use client";

import { useEffect } from "react";
import { SelectComponent } from "@rodrigo-barraza/components-library";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import useProjectFilter from "../../../hooks/useProjectFilter";
import ModelsPageComponent from "../../../components/ModelsPageComponent";

export default function AdminModelsPage() {
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const { setControls, setTitleBadge } = useAdminHeader();

  useEffect(() => {
    setControls(
      // @ts-ignore
      <SelectComponent
        value={projectFilter || ""}
        options={projectOptions}
        onChange={handleProjectChange}
        placeholder="All Projects"
      />,
    );
  }, [setControls, projectFilter, projectOptions, handleProjectChange]);

  useEffect(() => {
    return () => {
      // @ts-ignore
      setControls(null);
      // @ts-ignore
      setTitleBadge(null);
    };
  }, [setControls, setTitleBadge]);

  // @ts-ignore
  return <ModelsPageComponent mode="admin" project={projectFilter} onCountChange={setTitleBadge} />;
}
