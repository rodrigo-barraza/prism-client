"use client";

import { useEffect } from "react";
import { SelectComponent } from "@rodrigo-barraza/components-library";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import useProjectFilter from "../../../hooks/useProjectFilter";
import MediaPageComponent from "../../../components/MediaPageComponent";

export default function AdminMediaPage() {
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const { setControls, setTitleBadge, dateRange } = useAdminHeader();

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

  return <MediaPageComponent mode="admin" project={projectFilter} dateRange={dateRange} onCountChange={setTitleBadge} />;
}
