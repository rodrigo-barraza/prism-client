"use client";

/**
 * /benchmarks — runs, the cross-run leaderboard, the arena and the suite
 * library, one tab each (the tab rides the URL: ?tab=).
 */
import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Gauge, Play, Plus } from "lucide-react";
import { ButtonComponent, PageHeroComponent, TabBarComponent } from "@rodrigo-barraza/components-library";
import RunsListComponent from "./RunsListComponent";
import LeaderboardMatrixComponent from "./LeaderboardMatrixComponent";
import ArenaComponent from "./ArenaComponent";
import SuitesLibraryComponent from "./SuitesLibraryComponent";
import styles from "./Benchmarks.module.css";

const TABS = [
  { key: "runs", label: "Runs" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "arena", label: "Arena" },
  { key: "suites", label: "Suites" },
];

export default function BenchmarksHubComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = TABS.some((candidate) => candidate.key === searchParams.get("tab")) ? (searchParams.get("tab") as string) : "runs";
  const setTab = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === "runs") params.delete("tab");
      else params.set("tab", key);
      router.replace(`/benchmarks${params.size > 0 ? `?${params}` : ""}`);
    },
    [router, searchParams],
  );

  return (
    <div className={`${styles["theme"]} ${styles["page"]}`}>
      <PageHeroComponent
        variant="row"
        icon={Gauge}
        title="Benchmarks"
        subtitle="Compare models and agents on suites of test cases — with confidence intervals, paired significance tests, pass^k reliability, cost and latency — or pit them against each other in a blind arena."
        actions={
          <div className={styles["row"]}>
            <ButtonComponent variant="secondary" icon={Play} onClick={() => router.push("/benchmarks/new?preset=quick")}>
              Quick model check
            </ButtonComponent>
            <ButtonComponent variant="primary" icon={Plus} onClick={() => router.push("/benchmarks/new")}>
              New run
            </ButtonComponent>
          </div>
        }
      />
      <TabBarComponent tabs={TABS} activeTab={tab} onChange={setTab} ariaLabel="Benchmark sections" />
      {tab === "runs" && <RunsListComponent />}
      {tab === "leaderboard" && <LeaderboardMatrixComponent />}
      {tab === "arena" && <ArenaComponent />}
      {tab === "suites" && <SuitesLibraryComponent />}
    </div>
  );
}
