"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import NavigationSidebarComponent from "../../../components/NavigationSidebarComponent";
import BenchmarkDetailPageComponent from "../../../components/BenchmarkDetailPageComponent";
import BenchmarkSidebarComponent from "../../../components/BenchmarkSidebarComponent";

export default function BenchmarkDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const [isRunning, setIsRunning] = useState(false);
  return (
    <BenchmarkDetailPageComponent
      benchmarkId={id}
      onRunningChange={setIsRunning}
      navSidebar={
        <NavigationSidebarComponent mode="user" isGenerating={isRunning} />
      }
      rightSidebar={<BenchmarkSidebarComponent activeBenchmarkId={id} />}
    />
  );
}
