"use client";

import NavigationSidebarComponent from "../../../components/NavigationSidebarComponent";
import BenchmarkPageComponent from "../../../components/BenchmarkPageComponent";
import BenchmarkSidebarComponent from "../../../components/BenchmarkSidebarComponent";

export default function NewBenchmarkPage() {
  return (
    <BenchmarkPageComponent
      // @ts-ignore
      navSidebar={<NavigationSidebarComponent mode="user" />}
      // @ts-ignore
      rightSidebar={<BenchmarkSidebarComponent />}
    />
  );
}
