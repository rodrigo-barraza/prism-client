"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Fragment,
} from "react";
import { usePersistedState } from "../hooks/usePersistedState";

import {
  Cpu,
  Zap,
  BarChart3,
  TrendingUp,
  HardDrive,
  RefreshCw,
  Layers,
  Clock,
  Target,
  Gauge,
  Crosshair,
  MessageSquare,
  ArrowDownToLine,
  Crown,
  Rocket,
  BrainCircuit,
  Grid3x3,
  ThumbsDown,
  AlertTriangle,
  Ruler,
  Search,
} from "lucide-react";
import Chart from "chart.js/auto";
import type {
  TooltipOptions,
  ScaleOptionsByType,
  LegendOptions,
} from "chart.js";
import PrismService from "../services/PrismService";
import { VramBenchmarkEntry, VramBenchmarkMachine } from "../types/types";

import {
  FilterBarComponent,
  FilterSelectComponent,
} from "./FilterBarComponent";
import {
  InputComponent,
  PageHeaderComponent,
  SelectComponent,
  StatsCardComponent as StatsCard,
  TabBarComponent,
} from "@rodrigo-barraza/components-library";
import type { SelectOption as SelectOptionType } from "@rodrigo-barraza/components-library";
import { LoadingMessage, ErrorMessage } from "./StateMessageComponent";
import styles from "./VramBenchmarkComponent.module.css";

export interface CustomChartDataPoint {
  model?: VramBenchmarkEntry;
  entry?: VramBenchmarkEntry;
  ctx?: VramBenchmarkEntry;
}

export const isCustomPoint = (pt: unknown): pt is CustomChartDataPoint =>
  typeof pt === "object" && pt !== null;

// --- Local helper types (file-scoped) ----------------------

/** Valid chart view keys — one per tab. */
type ChartViewKey =
  | "scatter"
  | "bar"
  | "efficiency"
  | "quantDist"
  | "ctxLeaderboard"
  | "context";

/** Range stats computed per model name for VRAM/TPS/Context charts. */
interface RangeStats {
  min: number;
  max: number;
  count: number;
  values: number[];
  entries: VramBenchmarkEntry[];
}

/** Aggregation bucket for the Quantization Distribution chart. */
interface QuantGroupStats {
  count: number;
  totalVram: number;
  totalTps: number;
  totalBpw: number;
  minVram: number;
  maxVram: number;
  minTps: number;
  maxTps: number;
  avgVram?: number;
  avgTps?: number;
  avgBpw?: number;
}

/** Per-dataset original colour snapshot for search highlighting. */
interface ColorSnapshot {
  bg: string | string[];
  border: string | string[];
}

/** Mapping of dataset index → snapshot. */
type ChartColorCache = Record<number, ColorSnapshot>;

/** Palette entry for chart color lookups. */
interface PaletteEntry {
  bg: string;
  border: string;
}

/** Settings info entry describing a VRAM benchmark configuration. */
interface SettingsInfoEntry {
  flash: boolean;
  kv: string;
  batch: number;
  parallel: number;
  purpose: string;
}

const QUANT_COLORS: Record<string, PaletteEntry> = {
  Q4_0: { bg: "rgba(34,211,238,0.55)", border: "#22d3ee" },
  Q4_K_M: { bg: "rgba(99,102,241,0.55)", border: "#6366f1" },
  Q4_K_S: { bg: "rgba(139,92,246,0.55)", border: "#8b5cf6" },
  Q4_1: { bg: "rgba(59,130,246,0.55)", border: "#3b82f6" },
  Q5_K_S: { bg: "rgba(16,185,129,0.55)", border: "#10b981" },
  Q5_K_M: { bg: "rgba(20,184,166,0.55)", border: "#14b8a6" },
  Q6_K: { bg: "rgba(234,179,8,0.55)", border: "#eab308" },
  Q6_K_L: { bg: "rgba(245,158,11,0.55)", border: "#f59e0b" },
  Q8_0: { bg: "rgba(244,63,94,0.55)", border: "#f43f5e" },
  Q3_K_L: { bg: "rgba(249,115,22,0.55)", border: "#f97316" },
  FP16: { bg: "rgba(236,72,153,0.55)", border: "#ec4899" },
  F16: { bg: "rgba(236,72,153,0.55)", border: "#ec4899" },
  BF16: { bg: "rgba(217,70,239,0.55)", border: "#d946ef" },
};

const GPU_COLORS: Record<string, PaletteEntry> = {
  "NVIDIA GeForce RTX 4090": {
    bg: "rgba(99,102,241,0.6)",
    border: "#6366f1",
  },
  "NVIDIA GeForce RTX 5070 Ti": {
    bg: "rgba(16,185,129,0.6)",
    border: "#10b981",
  },
};

// Fallback rainbow for unknown quant/GPU
const PALETTE: PaletteEntry[] = [
  { bg: "rgba(99,102,241,0.55)", border: "#6366f1" },
  { bg: "rgba(16,185,129,0.55)", border: "#10b981" },
  { bg: "rgba(245,158,11,0.55)", border: "#f59e0b" },
  { bg: "rgba(244,63,94,0.55)", border: "#f43f5e" },
  { bg: "rgba(59,130,246,0.55)", border: "#3b82f6" },
  { bg: "rgba(139,92,246,0.55)", border: "#8b5cf6" },
  { bg: "rgba(236,72,153,0.55)", border: "#ec4899" },
  { bg: "rgba(34,211,238,0.55)", border: "#22d3ee" },
];

let paletteIndex = 0;
function getQuantColor(q: string): PaletteEntry {
  if (QUANT_COLORS[q]) return QUANT_COLORS[q];
  const fallbackColor = PALETTE[paletteIndex % PALETTE.length];
  paletteIndex++;
  return fallbackColor;
}

function getGPUColor(gpuName: string): PaletteEntry {
  return (
    GPU_COLORS[gpuName] || { bg: "rgba(107,114,128,0.5)", border: "#6b7280" }
  );
}

function shortGPU(name?: string) {
  return (name || "Unknown")
    .replace("NVIDIA GeForce ", "")
    .replace("NVIDIA ", "");
}

function shortModelName(name: string, max = 18) {
  if (!name) return "";
  // Strip common prefixes for brevity
  let short = name
    .replace(/^(lmstudio-community|lmstudio-ai|bartowski|unsloth)\//, "")
    .replace(/-GGUF$/i, "")
    .replace(/-[A-Z]\d+.*$/, ""); // strip quant suffix like -Q4_K_M
  if (short.length > max) short = short.slice(0, max - 1) + "…";
  return short;
}

// -- Chart defaults -------------------------------------------

const CHART_FONT = "'Inter', sans-serif";

const TOOLTIP_STYLE: Partial<TooltipOptions> = {
  backgroundColor: "rgba(10, 10, 15, 0.92)",
  titleColor: "#f8f8f8",
  bodyColor: "#8e95ae",
  borderColor: "rgba(99, 102, 241, 0.25)",
  borderWidth: 1,
  padding: 14,
  cornerRadius: 2,
  titleFont: { family: CHART_FONT, weight: 600, size: 13 },
  bodyFont: { family: CHART_FONT, size: 12 },
  displayColors: true,
  boxPadding: 4,
};

const GRID_STYLE = {
  color: "rgba(255,255,255,0.04)",
};

const TICK_STYLE = {
  font: { family: CHART_FONT, size: 11, weight: 500 },
  color: "#6b728e",
  padding: 6,
};

const AXIS_TITLE_STYLE = {
  display: true,
  font: { family: CHART_FONT, weight: 600, size: 12 },
  color: "#8e95ae",
  padding: { top: 8 },
};

const LEGEND_STYLE = {
  position: "top" as const,
  labels: {
    usePointStyle: true,
    pointStyle: "circle",
    padding: 16,
    font: { family: CHART_FONT, size: 11, weight: 500 },
    color: "#8e95ae",
    boxWidth: 8,
    boxHeight: 8,
  },
} as const;

// -- Custom inline datalabels plugin --------------------------
// Draws model name labels directly on chart data points.
// Works per-chart without global registration issues.

function makeDatalabelsPlugin({
  getLabel,
  anchor = "end",
  align = "top",
  offset = 4,
  filterFn,
  maxLabels = 60,
}: {
  getLabel: (
    raw: import("chart.js").BubbleDataPoint & {
      model?: VramBenchmarkEntry;
      entry?: VramBenchmarkEntry;
    },
    i: number,
    di: number,
  ) => string | null | undefined;
  anchor?: "start" | "center" | "end";
  align?: "top" | "bottom" | "left" | "right" | "center";
  offset?: number;
  filterFn?: (di: number, chart: Chart) => boolean;
  maxLabels?: number;
}) {
  return {
    id: "customDatalabels",
    afterDatasetsDraw(chart: Chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = `500 9px ${CHART_FONT}`;
      ctx.fillStyle = "rgba(142, 149, 174, 0.85)";
      ctx.textBaseline = align === "top" ? "bottom" : "middle";

      let labelCount = 0;
      for (let di = 0; di < chart.data.datasets.length; di++) {
        if (filterFn && !filterFn(di, chart)) continue;
        const meta = chart.getDatasetMeta(di);
        if (!meta.visible) continue;
        for (let i = 0; i < meta.data.length; i++) {
          if (labelCount >= maxLabels) break;
          const element = meta.data[i] as import("chart.js").Element & {
            x: number;
            y: number;
            height?: number;
            options?: { radius?: number };
          };
          const raw = chart.data.datasets[di].data[i];
          const label = getLabel(
            raw as import("chart.js").BubbleDataPoint & {
              model?: VramBenchmarkEntry;
            },
            i,
            di,
          );
          if (!label) continue;

          let x = element.x;
          let y = element.y;

          if (anchor === "end" && align === "top") {
            y = y - (element.height || element.options?.radius || 6) - offset;
            ctx.textAlign = "center";
          } else if (anchor === "end" && align === "right") {
            x = x + offset;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
          }

          ctx.fillText(label, x, y);
          labelCount++;
        }
      }
      ctx.restore();
    },
  };
}

// -- Connector highlight plugin -------------------------------
// When hovering a bubble, highlights its connector line and sibling
// bubbles across GPUs with a glow ring + solid bold line.

function makeConnectorHighlightPlugin() {
  return {
    id: "connectorHighlight",
    afterEvent(
      chart: Chart,
      args: { event: import("chart.js").ChartEvent; changed?: boolean },
    ) {
      const event = args.event;
      if (!event.native) return;
      const elements = chart.getElementsAtEventForMode(
        event.native as Event,
        "nearest",
        { intersect: true },
        false,
      );
      let hoveredModel = null;

      if (elements.length > 0) {
        const element = elements[0];
        const ds = chart.data.datasets[element.datasetIndex];
        // Only trigger on bubble datasets, not connector lines
        if (ds.type !== "line") {
          const raw = ds.data[element.index];
          hoveredModel = isCustomPoint(raw)
            ? raw.model?.displayName || null
            : null;
        }
      }

      const previousHoveredModel = (
        chart as import("chart.js").Chart & {
          _hoveredConnectorModel?: string | null;
        }
      )._hoveredConnectorModel;
      (
        chart as import("chart.js").Chart & {
          _hoveredConnectorModel?: string | null;
        }
      )._hoveredConnectorModel = hoveredModel;
      if (previousHoveredModel !== hoveredModel) args.changed = true;
    },
    afterDraw(chart: Chart) {
      const hoveredModel = (
        chart as import("chart.js").Chart & {
          _hoveredConnectorModel?: string | null;
        }
      )._hoveredConnectorModel;
      if (!hoveredModel) return;

      const context = chart.ctx;
      context.save();

      // Collect pixel positions for all bubbles matching this model
      const bubblePoints: Array<{
        x: number;
        y: number;
        r: number;
        borderColor: string | CanvasPattern | CanvasGradient | undefined;
      }> = [];

      for (let di = 0; di < chart.data.datasets.length; di++) {
        const ds = chart.data.datasets[di];
        if (ds.type === "line") continue;
        const meta = chart.getDatasetMeta(di);
        if (!meta.visible) continue;

        for (let i = 0; i < ds.data.length; i++) {
          const raw = ds.data[i];
          if (!isCustomPoint(raw) || raw.model?.displayName !== hoveredModel)
            continue;
          const element = meta.data[i];
          if (!element) continue;
          bubblePoints.push({
            x: element.x,
            y: element.y,
            r:
              element.options?.radius ||
              ("r" in raw ? (raw as { r: number }).r : 0) ||
              5,
            borderColor: ds.borderColor as string | undefined,
          });
        }
      }

      if (bubblePoints.length < 2) {
        context.restore();
        return;
      }

      // Sort by x for consistent line direction
      bubblePoints.sort((a, b) => a.x - b.x);

      // Draw bold solid connector line
      context.beginPath();
      context.strokeStyle = "rgba(255, 255, 255, 0.55)";
      context.lineWidth = 2.5;
      context.setLineDash([]);
      context.moveTo(bubblePoints[0].x, bubblePoints[0].y);
      for (let i = 1; i < bubblePoints.length; i++) {
        context.lineTo(bubblePoints[i].x, bubblePoints[i].y);
      }
      context.stroke();

      // Draw glow rings around sibling bubbles
      for (const p of bubblePoints) {
        // Outer glow
        context.beginPath();
        context.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
        context.strokeStyle = "rgba(255, 255, 255, 0.15)";
        context.lineWidth = 4;
        context.stroke();

        // Inner ring
        context.beginPath();
        context.arc(p.x, p.y, p.r + 2, 0, Math.PI * 2);
        context.strokeStyle = "rgba(255, 255, 255, 0.6)";
        context.lineWidth = 1.5;
        context.stroke();
      }

      context.restore();
    },
  };
}

// -- Settings info for tooltips ------------------------------

const SETTINGS_INFO: Record<string, SettingsInfoEntry> = {
  "no-flash-attn": {
    flash: false,
    kv: "GPU",
    batch: 512,
    parallel: 4,
    purpose:
      "Worst-case VRAM. FP32 KV cache (~2× size) + 4 concurrent slots. Stress test ceiling.",
  },
  "max-quality": {
    flash: false,
    kv: "GPU",
    batch: 512,
    parallel: 1,
    purpose:
      "Maximum precision, single user. FP32 KV cache, all VRAM for one request.",
  },
  default: {
    flash: true,
    kv: "GPU",
    batch: 512,
    parallel: 4,
    purpose:
      "Standard config. Flash attention (Q8 KV, ~50% savings). What most people use.",
  },
  "small-batch": {
    flash: true,
    kv: "GPU",
    batch: 128,
    parallel: 4,
    purpose:
      "Lower peak VRAM during prefill. Slightly slower TTFT but gentler on memory spikes.",
  },
  "single-slot": {
    flash: true,
    kv: "GPU",
    batch: 512,
    parallel: 1,
    purpose: "Default quality, single user. Shows per-slot KV cache overhead.",
  },
  "kv-on-cpu": {
    flash: true,
    kv: "CPU",
    batch: 512,
    parallel: 4,
    purpose:
      "KV cache in system RAM. Massive VRAM savings but attention crosses PCIe — hurts latency.",
  },
  "min-vram": {
    flash: true,
    kv: "CPU",
    batch: 128,
    parallel: 1,
    purpose:
      'Everything minimized. Absolute floor for running a model — "can it even load?" testing.',
  },
};

function SettingsTooltipContent({ settingsKey }: { settingsKey: string }) {
  const info = SETTINGS_INFO[settingsKey];
  if (!info) return settingsKey;
  return (
    <span
      style={{
        display: "block",
        whiteSpace: "normal",
        maxWidth: 320,
        lineHeight: 1.5,
      }}
    >
      <span
        style={{
          fontWeight: 700,
          fontSize: 12,
          marginBottom: 4,
          display: "block",
        }}
      >
        {settingsKey}
      </span>
      <span
        style={{
          display: "block",
          fontSize: 11,
          opacity: 0.7,
          marginBottom: 6,
        }}
      >
        {info.purpose}
      </span>
      <span
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "2px 12px",
          fontSize: 10.5,
          opacity: 0.55,
        }}
      >
        <span>Flash Attn: {info.flash ? "✓" : "✗"}</span>
        <span>KV Cache: {info.kv}</span>
        <span>Batch: {info.batch}</span>
        <span>Parallel: {info.parallel}</span>
      </span>
    </span>
  );
}

const SETTINGS_EMOJI: Record<string, string> = {
  "no-flash-attn": "🔥",
  "max-quality": "💎",
  default: "⚡",
  "small-batch": "📦",
  "single-slot": "🎯",
  "kv-on-cpu": "🧊",
  "min-vram": "🪶",
};

function SettingsMatrixTooltip() {
  const rows = Object.entries(SETTINGS_INFO);
  return (
    <span
      style={{
        display: "block",
        whiteSpace: "normal",
        maxWidth: 420,
        lineHeight: 1.6,
      }}
    >
      <span
        style={{
          fontWeight: 700,
          fontSize: 12,
          marginBottom: 6,
          display: "block",
        }}
      >
        Settings Configuration Matrix
      </span>
      <span
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto auto auto auto",
          gap: "2px 10px",
          fontSize: 10,
          opacity: 0.8,
        }}
      >
        <span style={{ fontWeight: 700, opacity: 0.5 }}>Setting</span>
        <span style={{ fontWeight: 700, opacity: 0.5 }}>Flash</span>
        <span style={{ fontWeight: 700, opacity: 0.5 }}>KV</span>
        <span style={{ fontWeight: 700, opacity: 0.5 }}>Batch</span>
        <span style={{ fontWeight: 700, opacity: 0.5 }}>Parallel</span>
        {rows.map(([key, info]) => (
          <Fragment key={key}>
            <span>
              {SETTINGS_EMOJI[key] || "🛠️"} {key}
            </span>
            <span>{info.flash ? "✓" : "✗"}</span>
            <span>{info.kv}</span>
            <span>{info.batch}</span>
            <span>{info.parallel}</span>
          </Fragment>
        ))}
      </span>
    </span>
  );
}

// -- Scatter axis modes ---------------------------------------
// Each mode maps different data dimensions to the X/Y axes of the
// bubble chart, turning the sort dropdown into a dimension explorer.

const SCATTER_MODES = [
  {
    key: "vram_vs_speed",
    label: "VRAM vs Speed",
    desc: "Position reveals the VRAM/throughput trade-off.",
    getX: (entry: VramBenchmarkEntry) => entry.modelVramGiB,
    getY: (entry: VramBenchmarkEntry) => entry.tokensPerSecond,
    xLabel: "VRAM Usage (GiB)",
    yLabel: "Tokens / sec",
    xMin: 0,
    yMin: -30,
  },
  {
    key: "vram_vs_efficiency",
    label: "VRAM vs Efficiency",
    desc: "How many tokens each GiB of VRAM produces — higher is better.",
    getX: (entry: VramBenchmarkEntry) => entry.modelVramGiB,
    getY: (entry: VramBenchmarkEntry) =>
      entry.modelVramGiB && entry.tokensPerSecond
        ? entry.tokensPerSecond / entry.modelVramGiB
        : 0,
    xLabel: "VRAM Usage (GiB)",
    yLabel: "Efficiency (TPS / GiB)",
    xMin: 0,
    yMin: -2,
  },
  {
    key: "vram_vs_ttft",
    label: "VRAM vs TTFT",
    desc: "Time to First Token — critical for interactive chat responsiveness.",
    getX: (entry: VramBenchmarkEntry) => entry.modelVramGiB,
    getY: (entry: VramBenchmarkEntry) => entry.ttft?.ms,
    xLabel: "VRAM Usage (GiB)",
    yLabel: "Time to First Token (ms)",
    xMin: 0,
    yMin: -50,
    filter: (entry: VramBenchmarkEntry) =>
      !!entry.ttft?.ms && entry.ttft.ms > 0,
  },
  {
    key: "filesize_vs_speed",
    label: "File Size vs Speed",
    desc: "Disk footprint against inference speed — find the sweet spot for your storage.",
    getX: (entry: VramBenchmarkEntry) => entry.fileSizeGB,
    getY: (entry: VramBenchmarkEntry) => entry.tokensPerSecond,
    xLabel: "File Size (GB)",
    yLabel: "Tokens / sec",
    xMin: 0,
    yMin: -30,
  },
  {
    key: "vram_vs_loadtime",
    label: "VRAM vs Load Time",
    desc: "Model load time — important for cold-start and multi-model switching.",
    getX: (entry: VramBenchmarkEntry) => entry.modelVramGiB,
    getY: (entry: VramBenchmarkEntry) =>
      entry.loadTimeMs ? entry.loadTimeMs / 1000 : null,
    xLabel: "VRAM Usage (GiB)",
    yLabel: "Load Time (sec)",
    xMin: 0,
    yMin: -1,
    filter: (entry: VramBenchmarkEntry) =>
      !!entry.loadTimeMs && entry.loadTimeMs > 0,
  },
  {
    key: "bpw_vs_speed",
    label: "Quantization vs Speed",
    desc: "Bits per weight against throughput — see how quantization affects performance.",
    getX: (entry: VramBenchmarkEntry) => entry.bitsPerWeight,
    getY: (entry: VramBenchmarkEntry) => entry.tokensPerSecond,
    xLabel: "Bits per Weight",
    yLabel: "Tokens / sec",
    xMin: 0,
    yMin: -30,
    filter: (entry: VramBenchmarkEntry) =>
      !!entry.bitsPerWeight && entry.bitsPerWeight > 0,
  },
];

// -- View tabs ------------------------------------------------
// Scatter label is dynamic — replaced in a memo inside the component.

const VIEW_TABS = [
  { key: "scatter", label: "VRAM vs Speed", icon: <TrendingUp size={12} /> },
  { key: "bar", label: "VRAM Usage", icon: <BarChart3 size={12} /> },
  { key: "efficiency", label: "Tokens per Second", icon: <Zap size={12} /> },
  { key: "quantDist", label: "Quantization", icon: <Layers size={12} /> },
  { key: "ctxLeaderboard", label: "Context Length", icon: <Ruler size={12} /> },
  { key: "context", label: "Context Scaling", icon: <HardDrive size={12} /> },
];

// ═════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════

export default function VramBenchmarkComponent() {
  const [rawData, setRawData] = useState<VramBenchmarkEntry[]>([]);
  const [machines, setMachines] = useState<VramBenchmarkMachine[]>([]);
  const [settingsLabels, setSettingsLabels] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [machineFilter, setMachineFilter] = usePersistedState("vram-benchmark:machine-filter", "all");
  const [providerFilter, setProviderFilter] = usePersistedState("vram-benchmark:provider-filter", "all");
  const [settingsFilter, setSettingsFilter] = usePersistedState("vram-benchmark:settings-filter", "all");
  const [parallelFilter, setParallelFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [ctxMin, setCtxMin] = useState("");
  const [ctxMax, setCtxMax] = useState("");
  const [sortBy, setSortBy] = usePersistedState("vram-benchmark:sort-by", "vram");
  const [scatterMode, setScatterMode] = usePersistedState("vram-benchmark:scatter-mode", "vram_vs_speed");
  const [vramClipMin, setVramClipMin] = useState("");
  const [vramClipMax, setVramClipMax] = useState("");
  const [tpsClipMin, setTpsClipMin] = useState("");
  const [tpsClipMax, setTpsClipMax] = useState("");
  const [scatterClipXMin, setScatterClipXMin] = useState("");
  const [scatterClipXMax, setScatterClipXMax] = useState("");
  const [activeView, setActiveView] = usePersistedState<ChartViewKey>("vram-benchmark:active-view", "scatter");
  const [chartSearch, setChartSearch] = useState("");

  // Parsed clip values — undefined means "auto" (Chart.js default)
  const clipMin = useMemo(() => {
    const parsedValue = parseFloat(vramClipMin);
    return isNaN(parsedValue) || parsedValue < 0 ? undefined : parsedValue;
  }, [vramClipMin]);
  const clipMax = useMemo(() => {
    const parsedValue = parseFloat(vramClipMax);
    return isNaN(parsedValue) || parsedValue <= 0 ? undefined : parsedValue;
  }, [vramClipMax]);
  const tpsClipMinVal = useMemo(() => {
    const parsedValue = parseFloat(tpsClipMin);
    return isNaN(parsedValue) || parsedValue < 0 ? undefined : parsedValue;
  }, [tpsClipMin]);
  const tpsClipMaxVal = useMemo(() => {
    const parsedValue = parseFloat(tpsClipMax);
    return isNaN(parsedValue) || parsedValue <= 0 ? undefined : parsedValue;
  }, [tpsClipMax]);
  const scatterClipXMinVal = useMemo(() => {
    const parsedValue = parseFloat(scatterClipXMin);
    return isNaN(parsedValue) || parsedValue < 0 ? undefined : parsedValue;
  }, [scatterClipXMin]);
  const scatterClipXMaxVal = useMemo(() => {
    const parsedValue = parseFloat(scatterClipXMax);
    return isNaN(parsedValue) || parsedValue <= 0 ? undefined : parsedValue;
  }, [scatterClipXMax]);

  // Parsed context range values (in thousands → multiply by 1024 for actual ctx)
  const ctxMinVal = useMemo(() => {
    const parsedValue = parseFloat(ctxMin);
    return isNaN(parsedValue) || parsedValue < 0
      ? undefined
      : parsedValue * 1024;
  }, [ctxMin]);
  const ctxMaxVal = useMemo(() => {
    const parsedValue = parseFloat(ctxMax);
    return isNaN(parsedValue) || parsedValue <= 0
      ? undefined
      : parsedValue * 1024;
  }, [ctxMax]);

  const parallelOptions = useMemo(() => {
    const set = new Set(Object.values(SETTINGS_INFO).map((s) => s.parallel));
    return [...set].sort((a, b) => a - b);
  }, []);
  const batchOptions = useMemo(() => {
    const set = new Set(Object.values(SETTINGS_INFO).map((s) => s.batch));
    return [...set].sort((a, b) => a - b);
  }, []);

  // Active scatter mode config
  const activeScatterMode = useMemo(
    () => SCATTER_MODES.find((m) => m.key === scatterMode) || SCATTER_MODES[0],
    [scatterMode],
  );

  // Dynamic tab labels — scatter tab reflects current axis mode
  const viewTabs = useMemo(
    () =>
      VIEW_TABS.map((tab) =>
        tab.key === "scatter"
          ? { ...tab, label: activeScatterMode.label }
          : tab,
      ),
    [activeScatterMode],
  );

  // Canvas refs — one per chart type
  const chartRefs = {
    scatter: useRef<HTMLCanvasElement>(null),
    bar: useRef<HTMLCanvasElement>(null),
    efficiency: useRef<HTMLCanvasElement>(null),
    quantDist: useRef<HTMLCanvasElement>(null),
    ctxLeaderboard: useRef<HTMLCanvasElement>(null),
    context: useRef<HTMLCanvasElement>(null),
  };
  const chartInstances = useRef<Record<string, import("chart.js").Chart>>({});
  const searchOrigColors = useRef<Record<string, ChartColorCache>>({});

  // -- Fetch data -------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [benchRes, machinesRes, settingsRes] = await Promise.all([
        PrismService.getVramBenchmarks({
          ...(settingsFilter !== "all" ? { settings: settingsFilter } : {}),
        }),
        PrismService.getVramBenchmarkMachines(),
        PrismService.getVramBenchmarkSettings(),
      ]);
      setRawData(benchRes.data || []);
      setMachines(machinesRes || []);
      setSettingsLabels(settingsRes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [settingsFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -- Distinct providers from data ------------------------

  const providerOptions = useMemo(() => {
    const set = new Set(
      rawData.map((d: VramBenchmarkEntry) => d.provider).filter(Boolean),
    );
    return [...set].sort();
  }, [rawData]);

  // -- Process data -----------------------------------------

  const models = useMemo(() => {
    let filtered = rawData.filter(
      (d: VramBenchmarkEntry) => d.modelVramGiB && d.modelVramGiB > 0,
    );

    if (machineFilter !== "all") {
      filtered = filtered.filter(
        (d: VramBenchmarkEntry) =>
          (d.system?.hostname || "unknown") === machineFilter,
      );
    }

    if (providerFilter !== "all") {
      filtered = filtered.filter(
        (d: VramBenchmarkEntry) => d.provider === providerFilter,
      );
    }

    // Context range filter (min-max in actual context length units)
    if (ctxMinVal !== undefined) {
      filtered = filtered.filter(
        (d: VramBenchmarkEntry) => d.contextLength >= ctxMinVal,
      );
    }
    if (ctxMaxVal !== undefined) {
      filtered = filtered.filter(
        (d: VramBenchmarkEntry) => d.contextLength <= ctxMaxVal,
      );
    }

    // Parallel filter — match via SETTINGS_INFO lookup
    if (parallelFilter !== "all") {
      const pVal = parseInt(parallelFilter);
      filtered = filtered.filter((d: VramBenchmarkEntry) => {
        const info = (SETTINGS_INFO as Record<string, { parallel: number }>)[
          d.settings?.label || ""
        ];
        return info?.parallel === pVal;
      });
    }

    // Batch filter — match via SETTINGS_INFO lookup
    if (batchFilter !== "all") {
      const bVal = parseInt(batchFilter);
      filtered = filtered.filter((d: VramBenchmarkEntry) => {
        const info = SETTINGS_INFO[d.settings?.label || ""];
        return info?.batch === bVal;
      });
    }

    // Deduplicate: one per model+context combo
    // When "All Settings" is loaded, prefer "default" setting as representative
    const byKey: Record<string, VramBenchmarkEntry> = {};
    for (const d of filtered) {
      const key = `${d.displayName}__${d.contextLength}`;
      const existing = byKey[key];
      if (!existing) {
        byKey[key] = d;
      } else {
        // Prefer "default" setting over others, then latest run
        const dIsDefault = d.settings?.label === "default";
        const existingIsDefault = existing.settings?.label === "default";
        if (dIsDefault && !existingIsDefault) {
          byKey[key] = d;
        } else if (!dIsDefault && existingIsDefault) {
          // keep existing
        } else if ((d.createdAt || "") > (existing.createdAt || "")) {
          byKey[key] = d;
        }
      }
    }

    // Further deduplicate to one per model for chart views (prefer default context)
    const byModel: Record<string, VramBenchmarkEntry> = {};
    for (const d of Object.values(byKey)) {
      const mKey = d.displayName || d.model;
      if (!byModel[mKey] || d.contextLength > byModel[mKey].contextLength) {
        byModel[mKey] = d;
      }
    }

    const result = Object.values(byModel);

    switch (sortBy) {
      case "tps":
        result.sort(
          (a, b) => (b.tokensPerSecond || 0) - (a.tokensPerSecond || 0),
        );
        break;
      case "efficiency":
        result.sort(
          (a, b) =>
            (b.tokensPerSecond || 0) / (b.modelVramGiB || 1) -
            (a.tokensPerSecond || 0) / (a.modelVramGiB || 1),
        );
        break;
      case "filesize":
        result.sort((a, b) => (a.fileSizeGB || 0) - (b.fileSizeGB || 0));
        break;
      case "ttft":
        result.sort(
          (a, b) => (a.ttft?.ms || Infinity) - (b.ttft?.ms || Infinity),
        );
        break;
      case "loadTime":
        result.sort(
          (a, b) => (a.loadTimeMs || Infinity) - (b.loadTimeMs || Infinity),
        );
        break;
      default:
        result.sort((a, b) => (a.modelVramGiB || 0) - (b.modelVramGiB || 0));
    }

    return result;
  }, [
    rawData,
    machineFilter,
    providerFilter,
    ctxMinVal,
    ctxMaxVal,
    parallelFilter,
    batchFilter,
    sortBy,
  ]);

  // -- All filtered data (including all context per model for context chart) -

  const allFilteredData = useMemo(() => {
    let filtered = rawData.filter(
      (d: VramBenchmarkEntry) => d.modelVramGiB && d.modelVramGiB > 0,
    );
    if (machineFilter !== "all") {
      filtered = filtered.filter(
        (d: VramBenchmarkEntry) =>
          (d.system?.hostname || "unknown") === machineFilter,
      );
    }
    if (providerFilter !== "all") {
      filtered = filtered.filter(
        (d: VramBenchmarkEntry) => d.provider === providerFilter,
      );
    }
    // Context range filter
    if (ctxMinVal !== undefined) {
      filtered = filtered.filter(
        (d: VramBenchmarkEntry) => d.contextLength >= ctxMinVal,
      );
    }
    if (ctxMaxVal !== undefined) {
      filtered = filtered.filter(
        (d: VramBenchmarkEntry) => d.contextLength <= ctxMaxVal,
      );
    }
    // Parallel filter
    if (parallelFilter !== "all") {
      const pVal = parseInt(parallelFilter);
      filtered = filtered.filter((d: VramBenchmarkEntry) => {
        const info = SETTINGS_INFO[d.settings?.label || ""];
        return info?.parallel === pVal;
      });
    }
    // Batch filter
    if (batchFilter !== "all") {
      const bVal = parseInt(batchFilter);
      filtered = filtered.filter((d: VramBenchmarkEntry) => {
        const info = (SETTINGS_INFO as Record<string, { batch: number }>)[
          d.settings?.label || ""
        ];
        return info?.batch === bVal;
      });
    }
    return filtered;
  }, [
    rawData,
    machineFilter,
    providerFilter,
    ctxMinVal,
    ctxMaxVal,
    parallelFilter,
    batchFilter,
  ]);

  // -- Stats ------------------------------------------------

  const stats = useMemo(() => {
    if (models.length === 0) return null;
    const modelCount = models.length;

    // VRAM range — min→max across profiled models
    const vramValues = models.map(
      (entry: VramBenchmarkEntry) => entry.modelVramGiB || 0,
    );
    const minVram = Math.min(...vramValues).toFixed(1);
    const maxVram = Math.max(...vramValues).toFixed(1);

    // Best throughput — fastest model by raw TPS
    const fastest = models.reduce(
      (best: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
        (m.tokensPerSecond || 0) > (best.tokensPerSecond || 0) ? m : best,
    );

    // Median TTFT — more meaningful than average (resistant to outliers)
    const ttftModels = models.filter(
      (entry: VramBenchmarkEntry) => entry.ttft?.ms && entry.ttft.ms > 0,
    );
    let medianTtft = null;
    if (ttftModels.length > 0) {
      const sorted = ttftModels
        .map((entry: VramBenchmarkEntry) => entry.ttft?.ms || 0)
        .sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianTtft =
        sorted.length % 2 !== 0
          ? (sorted[mid] || 0).toFixed(0)
          : (((sorted[mid - 1] || 0) + (sorted[mid] || 0)) / 2).toFixed(0);
    }

    // Estimation accuracy — mean absolute error between measured and estimated VRAM
    const avgDelta = (
      models.reduce(
        (s, m) =>
          s +
          Math.abs((m.modelVramGiB || 0) - ((m.estimatedGiB as number) || 0)),
        0,
      ) / modelCount
    ).toFixed(2);

    // Count how many don't fit in GPU VRAM
    const oomCount = models.filter(
      (entry: VramBenchmarkEntry) => entry.fitsInVram === false,
    ).length;

    // Scope stats — distinct quant formats & providers
    const quantCount = new Set(
      models
        .map((entry: VramBenchmarkEntry) => entry.quantization)
        .filter(Boolean),
    ).size;
    const providerCount = new Set(
      models.map((entry: VramBenchmarkEntry) => entry.provider).filter(Boolean),
    ).size;

    // -- Best Model cards for practical LLM usage --

    // 1. Fastest Response — lowest TTFT (critical for interactive chat)
    const fastestResponse =
      ttftModels.length > 0
        ? ttftModels.reduce(
            (best: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
              m.ttft!.ms < best.ttft!.ms ? m : best,
          )
        : null;

    // 2. Best for Chat — largest model (by VRAM) that still runs ≥30 TPS
    const CHAT_TPS_THRESHOLD = 30;
    const chatCandidates = models.filter(
      (entry: VramBenchmarkEntry) =>
        (entry.tokensPerSecond || 0) >= CHAT_TPS_THRESHOLD &&
        entry.fitsInVram !== false,
    );
    const bestForChat =
      chatCandidates.length > 0
        ? chatCandidates.reduce(
            (best: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
              (m.modelVramGiB || 0) > (best.modelVramGiB || 0) ? m : best,
          )
        : null;

    // 3. Largest Runnable — biggest model by VRAM that fits in GPU
    const fittingModels = models.filter(
      (entry: VramBenchmarkEntry) => entry.fitsInVram !== false,
    );
    const largestRunnable =
      fittingModels.length > 0
        ? fittingModels.reduce(
            (best: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
              (m.modelVramGiB || 0) > (best.modelVramGiB || 0) ? m : best,
          )
        : null;

    // 4. Lowest Footprint — smallest VRAM model (multi-model serving / sidecar)
    const lowestFootprint = models.reduce(
      (best: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
        (m.modelVramGiB || 0) < (best.modelVramGiB || 0) ? m : best,
    );

    // 5. Best Prefill — highest prefill tokens/sec (prompt processing for RAG)
    const prefillModels = models.filter(
      (entry: VramBenchmarkEntry) =>
        entry.ttft?.prefillTokPerSec && entry.ttft.prefillTokPerSec > 0,
    );
    const bestPrefill =
      prefillModels.length > 0
        ? prefillModels.reduce(
            (best: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
              (m.ttft?.prefillTokPerSec || 0) >
              (best?.ttft?.prefillTokPerSec || 0)
                ? m
                : best,
            prefillModels[0]!,
          )
        : null;

    // 6. Best Large Model — highest TPS among models ≥8 GiB VRAM
    const LARGE_VRAM_THRESHOLD = 8;
    const largeModels = models.filter(
      (entry: VramBenchmarkEntry) =>
        (entry.modelVramGiB || 0) >= LARGE_VRAM_THRESHOLD &&
        entry.fitsInVram !== false,
    );
    const bestLargeModel =
      largeModels.length > 0
        ? largeModels.reduce(
            (best: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
              (m.tokensPerSecond || 0) > (best.tokensPerSecond || 0) ? m : best,
          )
        : null;

    // -- Worst Model cards (counterparts) --

    // W1. Slowest Throughput — lowest TPS
    const slowest = models.reduce(
      (worst: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
        (m.tokensPerSecond || 0) < (worst.tokensPerSecond || 0) ? m : worst,
    );

    // W2. Slowest Response — highest TTFT
    const slowestResponse =
      ttftModels.length > 0
        ? ttftModels.reduce(
            (worst: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
              m.ttft!.ms > worst.ttft!.ms ? m : worst,
          )
        : null;

    // W3. Worst for Chat — smallest model that still meets ≥30 TPS threshold
    const worstForChat =
      chatCandidates.length > 0
        ? chatCandidates.reduce(
            (worst: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
              (m.modelVramGiB || 0) < (worst.modelVramGiB || 0) ? m : worst,
          )
        : null;

    // W4. Smallest Runnable — smallest fitting model (lowest capability that runs)
    const smallestRunnable =
      fittingModels.length > 0
        ? fittingModels.reduce(
            (worst: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
              (m.modelVramGiB || 0) < (worst.modelVramGiB || 0) ? m : worst,
          )
        : null;

    // W5. Heaviest Footprint — largest VRAM consumer
    const heaviestFootprint = models.reduce(
      (worst: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
        (m.modelVramGiB || 0) > (worst.modelVramGiB || 0) ? m : worst,
    );

    // W6. Worst Large Model — slowest TPS among models ≥8 GiB
    const worstLargeModel =
      largeModels.length > 0
        ? largeModels.reduce(
            (worst: VramBenchmarkEntry, m: VramBenchmarkEntry) =>
              (m.tokensPerSecond || 0) < (worst.tokensPerSecond || 0)
                ? m
                : worst,
          )
        : null;

    // -- Build sorted card arrays by model name --

    // Helper — short settings tag for card subtitles
    const stag = (entry: VramBenchmarkEntry) =>
      entry.settings?.label ? ` · ⚙ ${entry.settings.label}` : "";
    // Helper — context length tag for card subtitles
    const ctag = (entry: VramBenchmarkEntry) =>
      entry.contextLength
        ? ` · ${(entry.contextLength / 1024).toFixed(0)}K ctx`
        : "";

    const bestCards = [
      fastest && {
        key: "best-throughput",
        label: "🏆 Best Throughput",
        value: shortModelName(fastest.displayName || fastest.model, 28),
        subtitle: `${(fastest.tokensPerSecond || 0).toFixed(0)} t/s · ${fastest.quantization} · ${(fastest.modelVramGiB || 0).toFixed(1)}G${ctag(fastest)}${stag(fastest)}`,
        icon: Zap,
        variant: "success",
        sortName: fastest.displayName || fastest.model,
      },
      fastestResponse && {
        key: "fastest-response",
        label: "⚡ Fastest Response",
        value: shortModelName(
          fastestResponse.displayName || fastestResponse.model,
          28,
        ),
        subtitle: `${fastestResponse.ttft!.ms.toFixed(0)} ms TTFT · ${(fastestResponse.tokensPerSecond || 0).toFixed(0)} t/s · ${(fastestResponse.modelVramGiB || 0).toFixed(1)}G${ctag(fastestResponse)}${stag(fastestResponse)}`,
        icon: Crown,
        variant: "success",
        sortName: fastestResponse.displayName || fastestResponse.model,
      },
      bestForChat && {
        key: "best-chat",
        label: "💬 Best for Chat",
        value: shortModelName(bestForChat.displayName || bestForChat.model, 28),
        subtitle: `${(bestForChat.tokensPerSecond || 0).toFixed(0)} t/s · ${(bestForChat.modelVramGiB || 0).toFixed(1)}G · largest ≥30 t/s${ctag(bestForChat)}${stag(bestForChat)}`,
        icon: MessageSquare,
        variant: "accent",
        sortName: bestForChat.displayName || bestForChat.model,
      },
      largestRunnable && {
        key: "largest-runnable",
        label: "🐘 Largest Runnable",
        value: shortModelName(
          largestRunnable.displayName || largestRunnable.model,
          28,
        ),
        subtitle: `${(largestRunnable.modelVramGiB || 0).toFixed(1)}G VRAM · ${(largestRunnable.tokensPerSecond || 0).toFixed(0)} t/s · ${largestRunnable.quantization}${ctag(largestRunnable)}${stag(largestRunnable)}`,
        icon: ArrowDownToLine,
        variant: "info",
        sortName: largestRunnable.displayName || largestRunnable.model,
      },
      lowestFootprint && {
        key: "lowest-footprint",
        label: "🪶 Lowest Footprint",
        value: shortModelName(
          lowestFootprint.displayName || lowestFootprint.model,
          28,
        ),
        subtitle: `${(lowestFootprint.modelVramGiB || 0).toFixed(1)}G VRAM · ${(lowestFootprint.tokensPerSecond || 0).toFixed(0)} t/s · ${lowestFootprint.quantization}${ctag(lowestFootprint)}${stag(lowestFootprint)}`,
        icon: HardDrive,
        variant: "success",
        sortName: lowestFootprint.displayName || lowestFootprint.model,
      },
      bestPrefill && {
        key: "best-prefill",
        label: "🚀 Best Prefill",
        value: shortModelName(bestPrefill.displayName || bestPrefill.model, 28),
        subtitle: `${(bestPrefill.ttft?.prefillTokPerSec || 0).toFixed(0)} tok/s prefill · ${(bestPrefill.modelVramGiB || 0).toFixed(1)}G${ctag(bestPrefill)}${stag(bestPrefill)}`,
        icon: Rocket,
        variant: "success",
        sortName: bestPrefill.displayName || bestPrefill.model,
      },
      bestLargeModel && {
        key: "best-large",
        label: "🧠 Best Large Model",
        value: shortModelName(
          bestLargeModel.displayName || bestLargeModel.model,
          28,
        ),
        subtitle: `${(bestLargeModel.tokensPerSecond || 0).toFixed(0)} t/s · fastest ≥8G · ${(bestLargeModel.modelVramGiB || 0).toFixed(1)}G${ctag(bestLargeModel)}${stag(bestLargeModel)}`,
        icon: BrainCircuit,
        variant: "accent",
        sortName: bestLargeModel.displayName || bestLargeModel.model,
      },
    ].filter(Boolean);

    const worstCards = [
      slowest && {
        key: "slowest-throughput",
        label: "🐌 Slowest Throughput",
        value: shortModelName(slowest.displayName || slowest.model, 28),
        subtitle: `${(slowest.tokensPerSecond || 0).toFixed(0)} t/s · ${slowest.quantization} · ${(slowest.modelVramGiB || 0).toFixed(1)}G${ctag(slowest)}${stag(slowest)}`,
        icon: ThumbsDown,
        variant: "destructive",
        sortName: slowest.displayName || slowest.model,
      },
      slowestResponse && {
        key: "slowest-response",
        label: "🐢 Slowest Response",
        value: shortModelName(
          slowestResponse.displayName || slowestResponse.model,
          28,
        ),
        subtitle: `${slowestResponse.ttft!.ms.toFixed(0)} ms TTFT · ${(slowestResponse.tokensPerSecond || 0).toFixed(0)} t/s · ${(slowestResponse.modelVramGiB || 0).toFixed(1)}G${ctag(slowestResponse)}${stag(slowestResponse)}`,
        icon: AlertTriangle,
        variant: "destructive",
        sortName: slowestResponse.displayName || slowestResponse.model,
      },
      worstForChat && {
        key: "worst-chat",
        label: "💬 Worst for Chat",
        value: shortModelName(
          worstForChat.displayName || worstForChat.model,
          28,
        ),
        subtitle: `${(worstForChat.tokensPerSecond || 0).toFixed(0)} t/s · ${(worstForChat.modelVramGiB || 0).toFixed(1)}G · smallest ≥30 t/s${ctag(worstForChat)}${stag(worstForChat)}`,
        icon: ThumbsDown,
        variant: "destructive",
        sortName: worstForChat.displayName || worstForChat.model,
      },
      smallestRunnable && {
        key: "smallest-runnable",
        label: "🔬 Smallest Runnable",
        value: shortModelName(
          smallestRunnable.displayName || smallestRunnable.model,
          28,
        ),
        subtitle: `${(smallestRunnable.modelVramGiB || 0).toFixed(1)}G VRAM · ${(smallestRunnable.tokensPerSecond || 0).toFixed(0)} t/s · ${smallestRunnable.quantization}${ctag(smallestRunnable)}${stag(smallestRunnable)}`,
        icon: AlertTriangle,
        variant: "warning",
        sortName: smallestRunnable.displayName || smallestRunnable.model,
      },
      heaviestFootprint && {
        key: "heaviest-footprint",
        label: "🏋️ Heaviest Footprint",
        value: shortModelName(
          heaviestFootprint.displayName || heaviestFootprint.model,
          28,
        ),
        subtitle: `${(heaviestFootprint.modelVramGiB || 0).toFixed(1)}G VRAM · ${(heaviestFootprint.tokensPerSecond || 0).toFixed(0)} t/s · ${heaviestFootprint.quantization}${ctag(heaviestFootprint)}${stag(heaviestFootprint)}`,
        icon: ThumbsDown,
        variant: "destructive",
        sortName: heaviestFootprint.displayName || heaviestFootprint.model,
      },
      worstLargeModel && {
        key: "worst-large",
        label: "🧠 Worst Large Model",
        value: shortModelName(
          worstLargeModel.displayName || worstLargeModel.model,
          28,
        ),
        subtitle: `${(worstLargeModel.tokensPerSecond || 0).toFixed(0)} t/s · slowest ≥8G · ${(worstLargeModel.modelVramGiB || 0).toFixed(1)}G${ctag(worstLargeModel)}${stag(worstLargeModel)}`,
        icon: AlertTriangle,
        variant: "destructive",
        sortName: worstLargeModel.displayName || worstLargeModel.model,
      },
    ].filter(Boolean);

    // Merge best + worst and sort all 12 cards together by model name
    const modelCards = [...bestCards, ...worstCards].sort((a, b) =>
      a!.sortName!.localeCompare(b!.sortName!),
    );

    return {
      n: modelCount,
      minVram,
      maxVram,
      fastest,
      medianTtft,
      avgDelta,
      oomCount,
      quantCount,
      providerCount,
      modelCards,
    };
  }, [models]);

  // -- HW label ---------------------------------------------

  const hwLabel = useMemo(() => {
    if (machineFilter === "all") {
      return machines
        .map(
          (m: VramBenchmarkMachine) =>
            `${shortGPU(m.gpu || "Unknown")} ${m.gpuVramGB || 0} GB`,
        )
        .join(" · ");
    }
    const matchedMachine = machines.find(
      (x: VramBenchmarkMachine) => x.hostname === machineFilter,
    );
    return matchedMachine
      ? `${shortGPU(matchedMachine.gpu || "Unknown")} ${matchedMachine.gpuVramGB || 0} GB`
      : "Unknown";
  }, [machines, machineFilter]);

  // -- Chart render helpers ---------------------------------

  function destroyChart(key: ChartViewKey) {
    if (chartInstances.current[key]) {
      chartInstances.current[key]!.destroy();
      delete chartInstances.current[key];
    }
  }

  // -- Programmatic chart highlight on card hover ----------
  // Uses Chart.js's setActiveElements API to emulate a hover
  // on the data point(s) that match `displayName`.

  const highlightModelInChart = useCallback(
    (displayName: string | null | undefined) => {
      const chart = chartInstances.current[activeView];
      if (!chart) return;

      if (!displayName) {
        // Clear highlight
        chart.setActiveElements([]);
        chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
        chart.update("none");
        return;
      }

      const activeEls = [];

      for (let di = 0; di < chart.data.datasets.length; di++) {
        const ds = chart.data.datasets[di];
        const data = ds.data;

        for (let index = 0; index < data.length; index++) {
          let match = false;
          const pt = data[index];

          if (isCustomPoint(pt)) {
            // Scatter / bubble: raw has .model.displayName
            if (pt.model?.displayName === displayName) {
              match = true;
            }

            // Scatter overlay entries on bar/efficiency charts: raw has .entry.displayName
            if (pt.entry?.displayName === displayName) {
              match = true;
            }

            // Context scaling: raw has .ctx.displayName
            if (pt.ctx?.displayName === displayName) {
              match = true;
            }
          }

          // Index-axis bar charts (bar, efficiency, ctxLeaderboard):
          // match against chart labels — check if displayName starts with (or equals) the label
          if (!match && chart.data.labels?.[index]) {
            const label = chart.data.labels[index] as string;
            if (
              displayName === label ||
              displayName.startsWith(label.replace("…", ""))
            ) {
              match = true;
            }
          }

          // Context scaling: dataset label contains model name
          if (!match && activeView === "context" && ds.label) {
            const dsLabel = ds.label.replace("…", "").split(" · ")[0];
            if (
              displayName.startsWith(dsLabel) ||
              dsLabel.startsWith(displayName.slice(0, 20))
            ) {
              match = true;
            }
          }

          if (match) {
            activeEls.push({ datasetIndex: di, index: index });
          }
        }
      }

      if (activeEls.length > 0) {
        chart.setActiveElements(activeEls);
        // Position tooltip near the first highlighted element
        const meta = chart.getDatasetMeta(activeEls[0].datasetIndex);
        const element = meta.data[activeEls[0].index];
        if (element) {
          chart.tooltip?.setActiveElements(activeEls, {
            x: element.x,
            y: element.y,
          });
        }
      } else {
        chart.setActiveElements([]);
        chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
      }
      chart.update("none");
    },
    [activeView],
  );

  // -- Scatter (dynamic axes) -------------------------------

  const renderScatter = useCallback(() => {
    const canvas = chartRefs.scatter.current;
    if (!canvas || models.length === 0) return;

    // If the canvas element changed (e.g. remount after loading), destroy stale instance
    const existing = chartInstances.current.scatter;
    if (existing && existing.canvas !== canvas) {
      existing.destroy();
      delete chartInstances.current.scatter;
    }

    const context = canvas.getContext("2d");
    if (!context) return;
    const mode = activeScatterMode;
    // With range-based context filter, check if multiple distinct contexts exist
    const distinctContextLengths = new Set(
      allFilteredData.map((d) => d.contextLength),
    );
    const hasMultipleContextLengths = distinctContextLengths.size > 1;
    let datasets: import("chart.js").ChartDataset[] = [];

    // Helper to build bubble data point from a model entry
    const toPoint = (
      m: VramBenchmarkEntry,
    ):
      | (import("chart.js").BubbleDataPoint & { model: VramBenchmarkEntry })
      | undefined => {
      const x = mode.getX(m);
      const y = mode.getY(m);
      if (x == null || y == null || isNaN(x) || isNaN(y)) return undefined;
      return {
        x,
        y,
        r: Math.max(5, Math.min(20, Math.sqrt(m.fileSizeGB || 0) * 4.5)),
        model: m,
      };
    };

    // Helper to fade an rgba() color
    const fadeBg = (rgba: string) => rgba.replace(/[\d.]+\)$/, "0.12)");
    // Helper to fade a #hex border color
    const fadeBorder = (hex: string) => {
      const hexClean = hex.replace("#", "");
      const r = parseInt(hexClean.substring(0, 2), 16);
      const g = parseInt(hexClean.substring(2, 4), 16);
      const b = parseInt(hexClean.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, 0.22)`;
    };

    // Compute bestKeys: for "all contexts", find the highest-TPS entry per group
    const computeBestKeys = (
      entries: VramBenchmarkEntry[],
      groupKeyFn: (entry: VramBenchmarkEntry) => string,
    ) => {
      if (!hasMultipleContextLengths) return null;
      const bestByGroup: Record<string, VramBenchmarkEntry> = {};
      for (const m of entries) {
        const gk = groupKeyFn(m);
        if (
          !bestByGroup[gk] ||
          (m.tokensPerSecond || 0) > (bestByGroup[gk].tokensPerSecond || 0)
        ) {
          bestByGroup[gk] = m;
        }
      }
      const set = new Set<string>();
      for (const m of Object.values(bestByGroup)) {
        set.add(
          `${m.displayName}__${m.system?.gpu?.name || "Unknown"}__${m.contextLength}`,
        );
      }
      return set;
    };

    const entryKey = (entry: VramBenchmarkEntry) =>
      `${entry.displayName}__${entry.system?.gpu?.name || "Unknown"}__${entry.contextLength}`;

    if (machineFilter === "all") {
      let source = allFilteredData;
      if (mode.filter) {
        source = source.filter(mode.filter);
      }

      // Dedup: one per model+GPU (+context when showing all)
      const byKey: Record<string, VramBenchmarkEntry> = {};
      for (const d of source) {
        const gpu = d.system?.gpu?.name || "Unknown";
        const key = hasMultipleContextLengths
          ? `${d.displayName}__${gpu}__${d.contextLength}`
          : `${d.displayName}__${gpu}`;
        if (!byKey[key] || (d.createdAt || "") > (byKey[key].createdAt || "")) {
          byKey[key] = d;
        }
      }
      const scatterModels = Object.values(byKey);

      const bestKeys = computeBestKeys(
        scatterModels,
        (entry: VramBenchmarkEntry) =>
          `${entry.displayName}__${entry.system?.gpu?.name || "Unknown"}`,
      );

      // Group by GPU for bubble coloring
      const gpuGroups: Record<string, VramBenchmarkEntry[]> = {};
      for (const m of scatterModels) {
        const gpu = m.system?.gpu?.name || "Unknown";
        if (!gpuGroups[gpu]) gpuGroups[gpu] = [];
        gpuGroups[gpu].push(m);
      }

      datasets = Object.entries(gpuGroups).map(
        ([gpu, items]: [string, VramBenchmarkEntry[]]) => {
          const color = getGPUColor(gpu);
          const points = items.map(toPoint).filter(Boolean) as {
            x: number;
            y: number;
            r: number;
            model: VramBenchmarkEntry;
          }[];

          // Per-point opacity when showing all contexts
          if (bestKeys) {
            return {
              type: "bubble",
              label: shortGPU(gpu),
              data: points,
              backgroundColor: points.map(
                (
                  p: import("chart.js").BubbleDataPoint & {
                    model: VramBenchmarkEntry;
                  },
                ) =>
                  bestKeys.has(entryKey(p.model)) ? color.bg : fadeBg(color.bg),
              ),
              borderColor: points.map(
                (
                  p: import("chart.js").BubbleDataPoint & {
                    model: VramBenchmarkEntry;
                  },
                ) =>
                  bestKeys.has(entryKey(p.model))
                    ? color.border
                    : fadeBorder(color.border),
              ),
              borderWidth: points.map(
                (
                  p: import("chart.js").BubbleDataPoint & {
                    model: VramBenchmarkEntry;
                  },
                ) => (bestKeys.has(entryKey(p.model)) ? 1.5 : 0.5),
              ),
              hoverBorderWidth: 2.5,
              hoverBorderColor: "#f8f8f8",
              order: 2,
            };
          }

          return {
            type: "bubble",
            label: shortGPU(gpu),
            data: points,
            backgroundColor: color.bg,
            borderColor: color.border,
            borderWidth: 1.5,
            hoverBorderWidth: 2.5,
            hoverBorderColor: "#f8f8f8",
            order: 2,
          };
        },
      );

      // Connector lines — only link "best" bubbles across GPUs
      const modelToPoints: Record<
        string,
        Array<
          import("chart.js").BubbleDataPoint & { model: VramBenchmarkEntry }
        >
      > = {};
      for (const m of scatterModels) {
        if (bestKeys && !bestKeys.has(entryKey(m))) continue;
        const pt = toPoint(m);
        if (!pt) continue;
        const key = m.displayName || m.model || "unknown";
        if (!modelToPoints[key]) modelToPoints[key] = [];
        modelToPoints[key].push(pt);
      }

      for (const [, points] of Object.entries(modelToPoints)) {
        if (points.length < 2) continue;
        points.sort((a, b) => (a.x || 0) - (b.x || 0));
        datasets.push({
          type: "line",
          label: "_connector",
          data: points.map(
            (
              p: import("chart.js").BubbleDataPoint & {
                model: VramBenchmarkEntry;
              },
            ) => ({ x: p.x, y: p.y, model: p.model }),
          ),
          borderColor: "rgba(255, 255, 255, 0.18)",
          borderWidth: 1.5,
          borderDash: [6, 3],
          pointRadius: 0,
          pointHitRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0,
          order: 3,
        });
      }
    } else {
      // Single machine — use allFilteredData when showing all contexts
      let source;
      if (hasMultipleContextLengths) {
        source = allFilteredData.filter(
          (d) => (d.system?.hostname || "unknown") === machineFilter,
        );
      } else {
        source = models.map((m) => m); // clone so filter doesn't mutate
      }
      if (mode.filter) source = source.filter(mode.filter);

      // Dedup per model (+context when showing all)
      const byKey: Record<string, VramBenchmarkEntry> = {};
      for (const d of source) {
        const key = hasMultipleContextLengths
          ? `${d.displayName || "unknown"}__${d.contextLength}`
          : d.displayName || "unknown";
        const existing = byKey[key];
        if (
          !existing ||
          (d.createdAt &&
            existing.createdAt &&
            d.createdAt > existing.createdAt)
        ) {
          byKey[key] = d;
        }
      }
      const scatterData = Object.values(byKey);

      const bestKeys = computeBestKeys(
        scatterData as VramBenchmarkEntry[],
        (entry: VramBenchmarkEntry) => entry.displayName || "unknown",
      );

      const quantGroups: Record<string, VramBenchmarkEntry[]> = {};
      for (const m of scatterData) {
        const quantizationKey = m.quantization || "unknown";
        if (!quantGroups[quantizationKey]) quantGroups[quantizationKey] = [];
        quantGroups[quantizationKey].push(m);
      }
      datasets = Object.entries(quantGroups).map(([q, items]) => {
        const color = getQuantColor(q);
        const points = items
          .map(toPoint)
          .filter(
            (
              p,
            ): p is import("chart.js").BubbleDataPoint & {
              model: VramBenchmarkEntry;
            } => Boolean(p),
          );

        if (bestKeys) {
          return {
            label: q,
            data: points,
            backgroundColor: points.map(
              (
                p: import("chart.js").BubbleDataPoint & {
                  model: VramBenchmarkEntry;
                },
              ) =>
                bestKeys.has(entryKey(p.model)) ? color.bg : fadeBg(color.bg),
            ),
            borderColor: points.map(
              (
                p: import("chart.js").BubbleDataPoint & {
                  model: VramBenchmarkEntry;
                },
              ) =>
                bestKeys.has(entryKey(p.model))
                  ? color.border
                  : fadeBorder(color.border),
            ),
            borderWidth: points.map(
              (
                p: import("chart.js").BubbleDataPoint & {
                  model: VramBenchmarkEntry;
                },
              ) => (bestKeys.has(entryKey(p.model)) ? 1.5 : 0.5),
            ),
            hoverBorderWidth: 2.5,
            hoverBorderColor: "#f8f8f8",
          } as import("chart.js").ChartDataset<
            "scatter",
            (import("chart.js").BubbleDataPoint & {
              model: VramBenchmarkEntry;
            })[]
          >;
        }

        return {
          label: q,
          data: points,
          backgroundColor: color.bg,
          borderColor: color.border,
          borderWidth: 1.5,
          hoverBorderWidth: 2.5,
          hoverBorderColor: "#f8f8f8",
        } as import("chart.js").ChartDataset<
          "scatter",
          (import("chart.js").BubbleDataPoint & { model: VramBenchmarkEntry })[]
        >;
      });
    }

    // -- Reuse or create chart --
    const currentChart = chartInstances.current.scatter;
    if (currentChart) {
      // Update data — instant swap, no misleading slide-from-bottom
      currentChart.data.datasets = datasets;
      if (
        (
          currentChart.options.scales
            ?.x as import("chart.js").ScaleOptionsByType<"linear">
        )?.title
      ) {
        (
          currentChart.options.scales!
            .x as import("chart.js").ScaleOptionsByType<"linear">
        ).title!.text = mode.xLabel;
      }
      if (
        (
          currentChart.options.scales
            ?.y as import("chart.js").ScaleOptionsByType<"linear">
        )?.title
      ) {
        (
          currentChart.options.scales!
            .y as import("chart.js").ScaleOptionsByType<"linear">
        ).title!.text = mode.yLabel;
      }
      if (currentChart.options.scales?.x) {
        currentChart.options.scales.x.min =
          scatterClipXMinVal ?? mode.xMin ?? 0;
        if (scatterClipXMaxVal !== undefined) {
          currentChart.options.scales.x.max = scatterClipXMaxVal;
        } else {
          delete currentChart.options.scales.x.max;
        }
      }
      if (currentChart.options.scales?.y) {
        currentChart.options.scales.y.min = mode.yMin ?? 0;
      }
      currentChart.update("none");
    } else {
      chartInstances.current.scatter = new Chart(context, {
        type: "bubble",
        data: { datasets },
        plugins: [
          makeDatalabelsPlugin({
            getLabel: (
              raw: import("chart.js").BubbleDataPoint & {
                model?: VramBenchmarkEntry;
              },
            ) => shortModelName(raw?.model?.displayName || "", 16),
            anchor: "end",
            align: "top",
            offset: 4,
            filterFn: (di: number) => datasets[di]?.type !== "line",
          }),
          makeConnectorHighlightPlugin(),
        ],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 600, easing: "easeInOutQuart" },
          transitions: {
            active: { animation: { duration: 200 } },
            zoom: { animation: { duration: 500, easing: "easeInOutCubic" } },
          },
          interaction: { mode: "nearest", intersect: true },
          scales: {
            x: {
              title: { ...AXIS_TITLE_STYLE, text: mode.xLabel },
              grid: GRID_STYLE,
              ticks: TICK_STYLE,
              min: scatterClipXMinVal ?? mode.xMin ?? 0,
              ...(scatterClipXMaxVal !== undefined
                ? { max: scatterClipXMaxVal }
                : {}),
            },
            y: {
              title: { ...AXIS_TITLE_STYLE, text: mode.yLabel },
              grid: GRID_STYLE,
              ticks: {
                ...TICK_STYLE,
                callback: (v: string | number) => (Number(v) < 0 ? "" : v),
              },
              min: mode.yMin ?? 0,
            },
          },
          plugins: {
            legend: {
              ...LEGEND_STYLE,
              labels: {
                ...LEGEND_STYLE.labels,
                filter: (item: { text?: string }) => item.text !== "_connector",
              },
            },
            tooltip: {
              ...TOOLTIP_STYLE,
              filter: (item: { dataset: { type?: string } }) =>
                item.dataset.type !== "line",
              callbacks: {
                title: (
                  items: import("chart.js").TooltipItem<"line" | "scatter">[],
                ) => {
                  const raw = items[0]?.raw;
                  if (isCustomPoint(raw)) return raw.model?.displayName || "";
                  return "";
                },
                label: (
                  item: import("chart.js").TooltipItem<"line" | "scatter">,
                ) => {
                  const raw = item.raw;
                  if (!isCustomPoint(raw)) return "";
                  const modelName = raw.model;
                  if (!modelName) return "";
                  const sInfo = (
                    SETTINGS_INFO as Record<
                      string,
                      { parallel: number; batch: number }
                    >
                  )[modelName.settings?.label || ""];
                  const lines = [
                    `GPU: ${shortGPU((modelName.system?.gpu?.name as string) || "")}`,
                    `VRAM: ${(modelName.modelVramGiB || 0).toFixed(2)} GiB (est: ${((modelName.estimatedGiB as number) || 0).toFixed(2)})`,
                    `Parallel: ${sInfo?.parallel ?? "?"}`,
                    `Batch: ${sInfo?.batch ?? "?"}`,
                    `Context: ${(modelName.contextLength / 1024).toFixed(0)}K`,
                    `Speed: ${modelName.tokensPerSecond?.toFixed(1) || "0"} tok/s`,
                    `File: ${(modelName.fileSizeGB || 0).toFixed(1)} GB · ${modelName.quantization} (${modelName.bitsPerWeight || "?"} bpw)`,
                    `Efficiency: ${((modelName.tokensPerSecond || 0) / (modelName.modelVramGiB || 1)).toFixed(1)} TPS/GiB`,
                  ];
                  if (modelName.vramDuringGen?.peakGiB)
                    lines.push(
                      `Peak VRAM (gen): ${(modelName.vramDuringGen.peakGiB as number).toFixed(2)} GiB`,
                    );
                  if (modelName.ttft?.ms) {
                    let ttftLine = `TTFT: ${modelName.ttft.ms.toFixed(0)} ms`;
                    if (modelName.ttft.prefillTokPerSec)
                      ttftLine += ` (prefill: ${modelName.ttft.prefillTokPerSec.toFixed(0)} t/s)`;
                    lines.push(ttftLine);
                  }
                  if (modelName.loadTimeMs)
                    lines.push(
                      `Load: ${(modelName.loadTimeMs / 1000).toFixed(1)}s`,
                    );
                  if (
                    (
                      modelName.gpu as {
                        temp?: number;
                        power?: number;
                        utilization?: number;
                      }
                    )?.temp
                  )
                    lines.push(
                      `GPU: ${(modelName.gpu as { temp?: number }).temp}°C · ${(modelName.gpu as { power?: number }).power || "?"}W · ${(modelName.gpu as { utilization?: number }).utilization || "?"}%`,
                    );
                  if (modelName.fitsInVram === false)
                    lines.push(`⚠ Does NOT fit in VRAM`);
                  if (
                    modelName.settings?.label &&
                    modelName.settings.label !== "default"
                  ) {
                    lines.push(`Settings: ${modelName.settings.label}`);
                  }
                  return lines;
                },
              },
            },
          },
        },
      });
    }
  }, [models, machineFilter, allFilteredData, activeScatterMode]);

  // -- Shared range data for bar charts ----------------------

  const { vramRanges, tpsRanges, ctxRanges } = useMemo(() => {
    const vram: Record<string, RangeStats> = {};
    const tps: Record<string, RangeStats> = {};
    const ctxR: Record<string, RangeStats> = {};
    const source =
      allFilteredData.length > 0
        ? allFilteredData
        : rawData.filter(
            (d: VramBenchmarkEntry) => d.modelVramGiB && d.modelVramGiB > 0,
          );
    for (const d of source) {
      const name = d.displayName || d.model;
      const vramValue = d.modelVramGiB || 0;
      const tokensPerSecond = d.tokensPerSecond || 0;
      const contextLength = d.contextLength || 0;
      // VRAM ranges (store full entries for per-dot tooltips)
      if (!vram[name]) {
        vram[name] = {
          min: vramValue,
          max: vramValue,
          count: 1,
          values: [vramValue],
          entries: [d],
        };
      } else {
        vram[name].min = Math.min(vram[name].min, vramValue);
        vram[name].max = Math.max(vram[name].max, vramValue);
        vram[name].count++;
        vram[name].values.push(vramValue);
        vram[name].entries.push(d);
      }
      // TPS ranges (store full entries for per-dot tooltips)
      if (tokensPerSecond > 0) {
        if (!tps[name]) {
          tps[name] = {
            min: tokensPerSecond,
            max: tokensPerSecond,
            count: 1,
            values: [tokensPerSecond],
            entries: [d],
          };
        } else {
          tps[name].min = Math.min(tps[name].min, tokensPerSecond);
          tps[name].max = Math.max(tps[name].max, tokensPerSecond);
          tps[name].count++;
          tps[name].values.push(tokensPerSecond);
          tps[name].entries.push(d);
        }
      }
      // Context length ranges (store full entries for per-dot tooltips)
      if (contextLength > 0) {
        const cK = contextLength / 1024;
        if (!ctxR[name]) {
          ctxR[name] = {
            min: cK,
            max: cK,
            count: 1,
            values: [cK],
            entries: [d],
          };
        } else {
          ctxR[name].min = Math.min(ctxR[name].min, cK);
          ctxR[name].max = Math.max(ctxR[name].max, cK);
          ctxR[name].count++;
          ctxR[name].values.push(cK);
          ctxR[name].entries.push(d);
        }
      }
    }
    return { vramRanges: vram, tpsRanges: tps, ctxRanges: ctxR };
  }, [allFilteredData, rawData]);

  // -- Zoom-update effects: animate x-axis range when clip values change --
  useEffect(() => {
    const chart = chartInstances.current.scatter;
    if (!chart || !chart.options.scales?.x) return;
    const xScale = chart.options.scales.x;
    const mode = activeScatterMode;
    xScale.min = scatterClipXMinVal ?? mode.xMin ?? 0;
    if (scatterClipXMaxVal !== undefined) {
      xScale.max = scatterClipXMaxVal;
    } else {
      delete xScale.max;
    }
    chart.update("none");
  }, [scatterClipXMinVal, scatterClipXMaxVal, activeScatterMode]);

  useEffect(() => {
    const chart = chartInstances.current.bar;
    if (!chart || !chart.options.scales?.x) return;
    const xScale = chart.options.scales.x;
    // Apply or clear min/max
    if (clipMin !== undefined) {
      xScale.min = clipMin;
    } else {
      delete xScale.min;
    }
    if (clipMax !== undefined) {
      xScale.max = clipMax;
    } else {
      delete xScale.max;
    }
    chart.update("none");
  }, [clipMin, clipMax]);

  const renderBar = useCallback(() => {
    const canvas = chartRefs.bar.current;
    if (!canvas || models.length === 0) return;
    destroyChart("bar");

    const context = canvas.getContext("2d");
    if (!context) return;

    const labels = models.map((m) => {
      const name = m.displayName || m.model || "unknown";
      return name.length > 30 ? name.slice(0, 28) + "…" : name;
    });

    if (canvas.parentElement) {
      canvas.parentElement.style.height =
        Math.max(400, models.length * 24 + 80) + "px";
    }

    // Build floating bar data: [min, max] tuples per model
    const rangeData = models.map((m) => {
      const range = (vramRanges as Record<string, RangeStats>)[
        m.displayName || "unknown"
      ];
      if (range && range.count > 1) {
        return [range.min, range.max];
      }
      // Single entry — show a thin bar (give it ±0.05 so it's still visible)
      return [
        Math.max(0, (m.modelVramGiB || 0) - 0.05),
        (m.modelVramGiB || 0) + 0.05,
      ];
    });

    // Cohesive gradient: map VRAM magnitude to a cyan→indigo→rose scale
    const allVram = models.map((m) => m.modelVramGiB || 0);
    const vMin = Math.min(...allVram);
    const vMax = Math.max(...allVram);
    const vSpan = vMax - vMin || 1;

    function vramColor(gib: number, alpha = 0.55) {
      const t = (gib - vMin) / vSpan; // 0 → 1
      // HSL sweep: 190 (cyan) → 250 (indigo) → 330 (rose)
      const hue = 190 + t * 140;
      const sat = 70 + t * 10;
      const lgt = 55 - t * 10;
      return {
        bg: `hsla(${hue}, ${sat}%, ${lgt}%, ${alpha})`,
        border: `hsl(${hue}, ${sat}%, ${lgt}%)`,
      };
    }

    // Build scatter overlay: individual entries as interactive dots
    const scatterData: { x: number; y: string; entry: VramBenchmarkEntry }[] =
      [];
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const range = (vramRanges as Record<string, RangeStats>)[
        model.displayName || "unknown"
      ];
      if (!range || range.count <= 1) continue;
      for (const entry of range.entries) {
        scatterData.push({
          x: entry.modelVramGiB || 0,
          y: labels[i] as unknown as string,
          entry,
        });
      }
    }

    chartInstances.current.bar = new Chart(context, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "VRAM Range (GiB)",
            data: rangeData as [number, number][],
            backgroundColor: models.map(
              (m) => vramColor(m.modelVramGiB || 0, 0.45).bg,
            ),
            borderColor: models.map((m) =>
              m.fitsInVram === false
                ? "#f43f5e"
                : vramColor(m.modelVramGiB || 0, 1).border,
            ),
            borderWidth: 1.5,
            borderSkipped: false,
            borderRadius: 2,
            hoverBorderWidth: 2.5,
            hoverBorderColor: "#f8f8f8",
            order: 2,
          },
          {
            type: "scatter",
            label: "Individual Runs",
            data: scatterData as unknown as [number, number][],
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            borderColor: "rgba(255, 255, 255, 0.3)",
            borderWidth: 0.5,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#fff",
            pointHoverBorderColor: "#6366f1",
            pointHoverBorderWidth: 2,
            order: 1,
          },
        ],
      },
      plugins: [
        makeDatalabelsPlugin({
          getLabel: (
            _raw: import("chart.js").Point & { entry?: VramBenchmarkEntry },
            i: number,
          ) => {
            const model = models[i];
            if (!model) return "";
            const range = vramRanges[model.displayName || ""];
            if (range && range.count > 1) {
              return `${range.min.toFixed(1)}–${range.max.toFixed(1)}G`;
            }
            return `${(model.modelVramGiB || 0).toFixed(1)}G`;
          },
          anchor: "end",
          align: "right",
          offset: 6,
          filterFn: (di: number) => di === 0,
        }),
      ],
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        interaction: { mode: "point", intersect: true },
        scales: {
          x: {
            title: { ...AXIS_TITLE_STYLE, text: "VRAM (GiB)" },
            grid: GRID_STYLE,
            ticks: TICK_STYLE,
            ...(clipMin != null ? { min: clipMin } : {}),
            ...(clipMax != null ? { max: clipMax } : {}),
          },
          y: {
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: { ...TICK_STYLE, padding: 8 },
          },
        },
        transitions: {
          zoom: {
            animation: { duration: 500, easing: "easeInOutCubic" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              title: (
                items: import("chart.js").TooltipItem<"bar" | "scatter">[],
              ) => {
                const item = items[0];
                if (!item) return "";
                // Scatter dot — show entry-specific title
                if (item.datasetIndex === 1) {
                  return (
                    (item.raw as { entry?: VramBenchmarkEntry })?.entry
                      ?.displayName || ""
                  );
                }
                return models[item.dataIndex]?.displayName || "";
              },
              afterTitle: (
                items: import("chart.js").TooltipItem<"bar" | "scatter">[],
              ) => {
                const item = items[0];
                if (!item) return "";
                if (item.datasetIndex === 1) {
                  const e = (item.raw as { entry?: VramBenchmarkEntry })?.entry;
                  if (!e) return "";
                  return `${e.quantization} · ${e.architecture} · ${(e.contextLength / 1024).toFixed(0)}K ctx · ${shortGPU(e.system?.gpu?.name)}`;
                }
                const model = models[item.dataIndex];
                if (!model) return "";
                return `${model.quantization} · ${model.architecture} · ${(model.contextLength / 1024).toFixed(0)}K ctx · ${shortGPU((model.system as { gpu?: { name?: string } })?.gpu?.name || "")}`;
              },
              label: (
                item: import("chart.js").TooltipItem<"bar" | "scatter">,
              ) => {
                // Scatter dot — entry-specific data
                if (item.datasetIndex === 1) {
                  const e = (item.raw as { entry?: VramBenchmarkEntry })?.entry;
                  if (!e) return "";
                  return ` VRAM: ${(e.modelVramGiB || 0).toFixed(2)} GiB`;
                }
                const model = models[item.dataIndex];
                const range = (vramRanges as Record<string, RangeStats>)[
                  model?.displayName || ""
                ];
                if (range && range.count > 1) {
                  return ` VRAM: ${range.min.toFixed(2)}–${range.max.toFixed(2)} GiB (${range.count} runs)`;
                }
                return ` Measured: ${(model?.modelVramGiB || 0).toFixed(2)} GiB`;
              },
              afterBody: (
                items: import("chart.js").TooltipItem<"bar" | "scatter">[],
              ) => {
                const item = items[0];
                if (!item) return "";
                // Use entry-specific data for scatter dots
                const m =
                  item.datasetIndex === 1
                    ? (item.raw as { entry?: VramBenchmarkEntry })?.entry
                    : models[item.dataIndex];
                if (!m) return "";
                const sInfo = m.settings?.label
                  ? SETTINGS_INFO[m.settings.label]
                  : undefined;
                const lines = [
                  "",
                  `Parallel: ${sInfo?.parallel ?? "?"}`,
                  `Batch: ${sInfo?.batch ?? "?"}`,
                  `Context: ${(m.contextLength / 1024).toFixed(0)}K`,
                  `Speed: ${m.tokensPerSecond?.toFixed(1) || "0"} tok/s`,
                  `File: ${(m.fileSizeGB || 0).toFixed(1)} GB · ${m.bitsPerWeight || "?"} bpw`,
                  `Efficiency: ${((m.tokensPerSecond || 0) / (m.modelVramGiB || 1)).toFixed(1)} TPS/GiB`,
                ];
                if (m.vramDuringGen?.peakGiB)
                  lines.push(
                    `Peak VRAM (gen): ${m.vramDuringGen.peakGiB.toFixed(2)} GiB`,
                  );
                if (m.ttft?.ms) {
                  let ttftLine = `TTFT: ${m.ttft.ms.toFixed(0)} ms`;
                  if (m.ttft.prefillTokPerSec)
                    ttftLine += ` (prefill: ${m.ttft.prefillTokPerSec.toFixed(0)} t/s)`;
                  lines.push(ttftLine);
                }
                if (m.loadTimeMs)
                  lines.push(`Load: ${(m.loadTimeMs / 1000).toFixed(1)}s`);

                const systemInfo = m.system;

                if (systemInfo?.cpuRam?.deltaMiB)
                  lines.push(
                    `CPU RAM Δ: ${(systemInfo.cpuRam.deltaMiB / 1024).toFixed(2)} GiB`,
                  );
                if (systemInfo?.gpu?.temp)
                  lines.push(
                    `GPU: ${systemInfo.gpu.temp}°C · ${systemInfo.gpu.power || "?"}W`,
                  );
                if ((m.hysteresis?.leakedMiB ?? 0) > 0)
                  lines.push(`⚠ VRAM leak: ${m.hysteresis!.leakedMiB} MiB`);
                if (m.fitsInVram === false)
                  lines.push(`⚠ Does NOT fit in VRAM`);
                if (m.generation?.outputTokens)
                  lines.push(
                    `Gen: ${m.generation.outputTokens} tokens in ${((m.generation.totalTimeMs ?? 0) / 1000).toFixed(1)}s`,
                  );
                if (m.settings?.label && m.settings.label !== "default")
                  lines.push(`Settings: ${m.settings.label}`);
                return lines;
              },
            },
          },
        },
      },
    });
  }, [models, vramRanges]);

  // -- Tokens per Second (floating range bars) --------------

  const renderEfficiency = useCallback(() => {
    const canvas = chartRefs.efficiency.current;
    if (!canvas || models.length === 0) return;
    destroyChart("efficiency");

    const context = canvas.getContext("2d");
    if (!context) return;

    // Sort by peak TPS descending
    const sorted = [...models].sort(
      (a: VramBenchmarkEntry, b: VramBenchmarkEntry) =>
        (b.tokensPerSecond || 0) - (a.tokensPerSecond || 0),
    );

    const labels = sorted.map((m) => {
      const name = m.displayName || m.model || "unknown";
      return name.length > 30 ? name.slice(0, 28) + "…" : name;
    });

    if (canvas.parentElement) {
      canvas.parentElement.style.height =
        Math.max(400, sorted.length * 24 + 80) + "px";
    }

    // Build floating bar data: [min, max] TPS tuples per model
    const rangeData = sorted.map((m) => {
      const range = (tpsRanges as Record<string, RangeStats>)[
        m.displayName || "unknown"
      ];
      if (range && range.count > 1) {
        return [range.min, range.max];
      }
      const tokensPerSecond = m.tokensPerSecond || 0;
      return [Math.max(0, tokensPerSecond - 0.5), tokensPerSecond + 0.5];
    });

    // Cohesive gradient: map TPS magnitude to green→cyan→indigo
    const allTps = sorted.map((m) => m.tokensPerSecond || 0);
    const tMin = Math.min(...allTps);
    const tMax = Math.max(...allTps);
    const tSpan = tMax - tMin || 1;

    function tpsColor(tps: number, alpha = 0.55) {
      const t = (tps - tMin) / tSpan; // 0 → 1
      // HSL sweep: 340 (rose/slow) → 260 (indigo) → 160 (green/fast)
      const hue = 340 - t * 180;
      const sat = 65 + t * 15;
      const lgt = 50 - t * 5;
      return {
        bg: `hsla(${hue}, ${sat}%, ${lgt}%, ${alpha})`,
        border: `hsl(${hue}, ${sat}%, ${lgt}%)`,
      };
    }

    // Build scatter overlay: individual TPS entries as interactive dots
    const scatterData: (import("chart.js").Point & {
      entry: VramBenchmarkEntry;
    })[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const model = sorted[i];
      const range = (tpsRanges as Record<string, RangeStats>)[
        model.displayName || "unknown"
      ];
      if (!range || range.count <= 1) continue;
      for (const entry of range.entries) {
        scatterData.push({
          x: entry.tokensPerSecond || 0,
          y: labels[i] as unknown as number,
          entry,
        });
      }
    }

    chartInstances.current.efficiency = new Chart(context, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Tokens/sec Range",
            data: rangeData as [number, number][],
            backgroundColor: sorted.map(
              (m) => tpsColor(m.tokensPerSecond || 0, 0.45).bg,
            ),
            borderColor: sorted.map(
              (m) => tpsColor(m.tokensPerSecond || 0, 1).border,
            ),
            borderWidth: 1.5,
            borderSkipped: false,
            borderRadius: 2,
            hoverBorderWidth: 2.5,
            hoverBorderColor: "#f8f8f8",
            order: 2,
          },
          {
            type: "scatter",
            label: "Individual Runs",
            data: scatterData as unknown as [number, number][],
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            borderColor: "rgba(255, 255, 255, 0.3)",
            borderWidth: 0.5,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#fff",
            pointHoverBorderColor: "#6366f1",
            pointHoverBorderWidth: 2,
            order: 1,
          },
        ],
      },
      plugins: [
        makeDatalabelsPlugin({
          getLabel: (
            _raw: import("chart.js").Point & { entry?: VramBenchmarkEntry },
            i: number,
          ) => {
            const model = sorted[i];
            if (!model) return "";
            const range = tpsRanges[model.displayName || ""];
            if (range && range.count > 1) {
              return `${range.min.toFixed(0)}–${range.max.toFixed(0)} t/s`;
            }
            return `${(model.tokensPerSecond || 0).toFixed(0)} t/s`;
          },
          anchor: "end",
          align: "right",
          offset: 6,
          filterFn: (di: number) => di === 0,
        }),
      ],
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        interaction: { mode: "point", intersect: true },
        scales: {
          x: {
            title: { ...AXIS_TITLE_STYLE, text: "Tokens / sec" },
            grid: GRID_STYLE,
            ticks: TICK_STYLE,
            ...(tpsClipMinVal !== undefined ? { min: tpsClipMinVal } : {}),
            ...(tpsClipMaxVal !== undefined ? { max: tpsClipMaxVal } : {}),
          },
          y: {
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: { ...TICK_STYLE, padding: 8 },
          },
        },
        transitions: {
          zoom: {
            animation: { duration: 500, easing: "easeInOutCubic" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              title: (
                items: import("chart.js").TooltipItem<"bar" | "scatter">[],
              ) => {
                const item = items[0];
                if (!item) return "";
                if (item.datasetIndex === 1) {
                  return (
                    (item.raw as { entry?: VramBenchmarkEntry })?.entry
                      ?.displayName || ""
                  );
                }
                return sorted[item.dataIndex]?.displayName || "";
              },
              afterTitle: (
                items: import("chart.js").TooltipItem<"bar" | "scatter">[],
              ) => {
                const item = items[0];
                if (!item) return "";
                if (item.datasetIndex === 1) {
                  const e = (item.raw as { entry?: VramBenchmarkEntry })?.entry;
                  if (!e) return "";
                  return `${e.quantization} · ${e.architecture} · ${(e.contextLength / 1024).toFixed(0)}K ctx · ${shortGPU(e.system?.gpu?.name)}`;
                }
                const model = sorted[item.dataIndex];
                if (!model) return "";
                return `${model.quantization} · ${model.architecture} · ${(model.contextLength / 1024).toFixed(0)}K ctx`;
              },
              label: (
                item: import("chart.js").TooltipItem<"bar" | "scatter">,
              ) => {
                if (item.datasetIndex === 1) {
                  const e = (item.raw as { entry?: VramBenchmarkEntry })?.entry;
                  if (!e) return "";
                  return ` Speed: ${(e.tokensPerSecond || 0).toFixed(1)} tok/s`;
                }
                const model = sorted[item.dataIndex];
                const range = (tpsRanges as Record<string, RangeStats>)[
                  model?.displayName || ""
                ];
                if (range && range.count > 1) {
                  return ` Speed: ${range.min.toFixed(1)}–${range.max.toFixed(1)} tok/s (${range.count} runs)`;
                }
                return ` Speed: ${model.tokensPerSecond?.toFixed(1) || "0"} tok/s`;
              },
              afterBody: (
                items: import("chart.js").TooltipItem<"bar" | "scatter">[],
              ) => {
                const item = items[0];
                if (!item) return "";
                const m =
                  item.datasetIndex === 1
                    ? (item.raw as { entry?: VramBenchmarkEntry })?.entry
                    : sorted[item.dataIndex];
                if (!m) return "";
                const sInfo = m.settings?.label
                  ? SETTINGS_INFO[m.settings.label]
                  : undefined;
                const lines = [
                  "",
                  ` VRAM: ${(m.modelVramGiB || 0).toFixed(2)} GiB`,
                  ` Parallel: ${sInfo?.parallel ?? "?"}`,
                  ` Batch: ${sInfo?.batch ?? "?"}`,
                  ` Context: ${(m.contextLength / 1024).toFixed(0)}K`,
                  ` Efficiency: ${((m.tokensPerSecond || 0) / (m.modelVramGiB || 1)).toFixed(1)} TPS/GiB`,
                  ` Quant: ${m.quantization} (${m.bitsPerWeight || "?"} bpw)`,
                ];
                if (m.ttft?.ms) lines.push(` TTFT: ${m.ttft.ms.toFixed(0)} ms`);
                if (m.loadTimeMs)
                  lines.push(` Load: ${(m.loadTimeMs / 1000).toFixed(1)}s`);
                const systemInfo = m.system;
                if (systemInfo?.gpu?.temp)
                  lines.push(
                    ` GPU: ${systemInfo.gpu.temp}°C · ${systemInfo.gpu.power || "?"}W`,
                  );
                if (m.settings?.label && m.settings.label !== "default")
                  lines.push(` Settings: ${m.settings.label}`);
                return lines;
              },
            },
          },
        },
      },
    });
  }, [models, tpsRanges]);

  // -- TPS zoom-update effect --
  useEffect(() => {
    const chart = chartInstances.current.efficiency;
    if (!chart || !chart.options.scales?.x) return;
    const xScale = chart.options.scales.x;
    if (tpsClipMinVal !== undefined) {
      xScale.min = tpsClipMinVal;
    } else {
      delete xScale.min;
    }
    if (tpsClipMaxVal !== undefined) {
      xScale.max = tpsClipMaxVal;
    } else {
      delete xScale.max;
    }
    chart.update("none");
  }, [tpsClipMinVal, tpsClipMaxVal]);

  // -- Quantization Distribution ----------------------------

  const renderQuantDist = useCallback(() => {
    const canvas = chartRefs.quantDist.current;
    if (!canvas || models.length === 0) return;
    destroyChart("quantDist");

    const context = canvas.getContext("2d");
    if (!context) return;

    // Group by quantization
    const quantGroups: Record<string, QuantGroupStats> = {};
    for (const m of models) {
      const quantizationKey = m.quantization || "unknown";
      if (!quantGroups[quantizationKey]) {
        quantGroups[quantizationKey] = {
          count: 0,
          totalVram: 0,
          totalTps: 0,
          totalBpw: 0,
          minVram: Infinity,
          maxVram: -Infinity,
          minTps: Infinity,
          maxTps: -Infinity,
        };
      }
      const tps = m.tokensPerSecond || 0;
      quantGroups[quantizationKey].count++;
      quantGroups[quantizationKey].totalVram += m.modelVramGiB || 0;
      quantGroups[quantizationKey].totalTps += tps;
      quantGroups[quantizationKey].totalBpw += m.bitsPerWeight || 0;
      if ((m.modelVramGiB || 0) < quantGroups[quantizationKey].minVram)
        quantGroups[quantizationKey].minVram = m.modelVramGiB || 0;
      if ((m.modelVramGiB || 0) > quantGroups[quantizationKey].maxVram)
        quantGroups[quantizationKey].maxVram = m.modelVramGiB || 0;
      if (tps < quantGroups[quantizationKey].minTps)
        quantGroups[quantizationKey].minTps = tps;
      if (tps > quantGroups[quantizationKey].maxTps)
        quantGroups[quantizationKey].maxTps = tps;
    }

    // Sort quant labels by bits-per-weight rank (lowest → highest)
    const QUANT_RANK = {
      IQ1_S: 1,
      IQ1_M: 2,
      IQ2_XXS: 3,
      IQ2_XS: 4,
      IQ2_S: 5,
      IQ2_M: 6,
      Q2_K: 7,
      Q2_K_S: 8,
      IQ3_XXS: 9,
      IQ3_XS: 10,
      IQ3_S: 11,
      IQ3_M: 12,
      Q3_K_S: 13,
      Q3_K_M: 14,
      Q3_K_L: 15,
      IQ4_XS: 16,
      IQ4_NL: 17,
      Q4_0: 18,
      Q4_1: 19,
      Q4_K_S: 20,
      Q4_K_M: 21,
      Q5_0: 22,
      Q5_1: 23,
      Q5_K_S: 24,
      Q5_K_M: 25,
      Q6_K: 26,
      Q6_K_L: 27,
      Q8_0: 28,
      Q8_1: 29,
      F16: 90,
      FP16: 91,
      BF16: 92,
      F32: 99,
      FP32: 100,
      unknown: 999,
    };
    const quantLabels = Object.keys(quantGroups).sort((a, b) => {
      const ra =
        (QUANT_RANK as Record<string, number>)[a] ??
        50 + (quantGroups[a].avgBpw || 50);
      const rb =
        (QUANT_RANK as Record<string, number>)[b] ??
        50 + (quantGroups[b].avgBpw || 50);
      return ra - rb || a.localeCompare(b);
    });
    for (const q of quantLabels) {
      const quantGroup = quantGroups[q];
      quantGroup.avgVram = quantGroup.totalVram / quantGroup.count;
      quantGroup.avgTps = quantGroup.totalTps / quantGroup.count;
      quantGroup.avgBpw = quantGroup.totalBpw / quantGroup.count;
      // For single-model quants, add a small visual range so the bar is visible
      if (quantGroup.minVram === quantGroup.maxVram) {
        quantGroup.minVram = quantGroup.avgVram * 0.97;
        quantGroup.maxVram = quantGroup.avgVram * 1.03;
      }
      if (quantGroup.minTps === quantGroup.maxTps) {
        quantGroup.minTps = quantGroup.avgTps * 0.97;
        quantGroup.maxTps = quantGroup.avgTps * 1.03;
      }
    }

    // Custom plugin: draw average tick marks on both VRAM and TPS bars
    const avgLinePlugin = {
      id: "quantAvgLine",
      afterDatasetsDraw(chart: import("chart.js").Chart) {
        const { ctx: c } = chart;
        c.save();

        const drawAvgTick = (
          datasetIdx: number,
          scaleId: string,
          getAvg: (g: QuantGroupStats) => number | undefined,
        ) => {
          const meta = chart.getDatasetMeta(datasetIdx);
          if (!meta.visible) return;
          const scale = chart.scales[scaleId];

          for (let i = 0; i < meta.data.length; i++) {
            const bar = meta.data[i];
            const quantLabel = quantLabels[i];
            const avg = getAvg(quantGroups[quantLabel]);
            if (avg === undefined) continue;
            const yPx = scale.getPixelForValue(avg);
            const halfW =
              (bar as import("chart.js").Element & { width: number; x: number })
                .width / 2;
            const barBorder =
              (
                bar as import("chart.js").Element & {
                  options?: { borderColor?: string };
                }
              ).options?.borderColor || "#6366f1";

            // Tick line
            c.beginPath();
            c.strokeStyle = barBorder;
            c.lineWidth = 2.5;
            c.moveTo(
              (bar as import("chart.js").Element & { x: number }).x - halfW + 2,
              yPx,
            );
            c.lineTo(
              (bar as import("chart.js").Element & { x: number }).x + halfW - 2,
              yPx,
            );
            c.stroke();

            // Label with outline for readability
            const text = avg.toFixed(1);
            c.font = `600 9px ${CHART_FONT}`;
            c.textAlign = "center";
            c.textBaseline = "bottom";
            // Outline
            c.strokeStyle = "rgba(0,0,0,0.6)";
            c.lineWidth = 3;
            c.lineJoin = "round";
            c.strokeText(
              text,
              (bar as import("chart.js").Element & { x: number }).x,
              yPx - 4,
            );
            // Fill
            c.fillStyle = "#fff";
            c.fillText(
              text,
              (bar as import("chart.js").Element & { x: number }).x,
              yPx - 4,
            );
          }
        };

        drawAvgTick(0, "y", (g: QuantGroupStats) => g.avgVram); // VRAM bars
        drawAvgTick(1, "y1", (g: QuantGroupStats) => g.avgTps); // TPS bars

        c.restore();
      },
    };

    chartInstances.current.quantDist = new Chart(context, {
      type: "bar",
      data: {
        labels: quantLabels,
        datasets: [
          {
            label: "VRAM Range (GiB)",
            data: quantLabels.map((q) => [
              quantGroups[q].minVram,
              quantGroups[q].maxVram,
            ]),
            backgroundColor: quantLabels.map((q) => getQuantColor(q).bg),
            borderColor: quantLabels.map((q) => getQuantColor(q).border),
            borderWidth: 1.5,
            borderRadius: 2,
            borderSkipped: false,
            yAxisID: "y",
          },
          {
            label: "TPS Range",
            data: quantLabels.map((q) => [
              quantGroups[q].minTps,
              quantGroups[q].maxTps,
            ]),
            backgroundColor: "rgba(128,128,128,0.15)",
            borderColor: "rgba(100,100,100,0.5)",
            borderWidth: 1.5,
            borderRadius: 2,
            borderSkipped: false,
            yAxisID: "y1",
          },
        ],
      },
      plugins: [avgLinePlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            grid: { display: false },
            ticks: { ...TICK_STYLE, padding: 8 },
          },
          y: {
            position: "left",
            title: { ...AXIS_TITLE_STYLE, text: "VRAM (GiB)" },
            grid: GRID_STYLE,
            ticks: TICK_STYLE,
          },
          y1: {
            position: "right",
            title: { ...AXIS_TITLE_STYLE, text: "TPS" },
            grid: { display: false },
            ticks: TICK_STYLE,
          },
        },
        plugins: {
          legend: LEGEND_STYLE,
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              title: (items) =>
                `${quantLabels[items[0]?.dataIndex]} Quantization`,
              afterTitle: (items) => {
                const quantLabel = quantLabels[items[0]?.dataIndex];
                return `${quantGroups[quantLabel].count} model${quantGroups[quantLabel].count > 1 ? "s" : ""}`;
              },
              label: (
                item: import("chart.js").TooltipItem<"bar" | "scatter">,
              ) => {
                const quantLabel = quantLabels[item.dataIndex];
                const quantGroup = quantGroups[quantLabel];
                if (item.datasetIndex === 0) {
                  return [
                    ` Avg VRAM: ${(quantGroup.avgVram || 0).toFixed(2)} GiB`,
                    ` Range: ${(quantGroup.count > 1 ? quantGroup.minVram : quantGroup.avgVram || 0).toFixed(2)} → ${(quantGroup.count > 1 ? quantGroup.maxVram : quantGroup.avgVram || 0).toFixed(2)} GiB`,
                  ];
                }
                return [
                  ` Avg Speed: ${(quantGroup.avgTps || 0).toFixed(1)} tok/s`,
                  ` Range: ${(quantGroup.count > 1 ? quantGroup.minTps : quantGroup.avgTps || 0).toFixed(1)} → ${(quantGroup.count > 1 ? quantGroup.maxTps : quantGroup.avgTps || 0).toFixed(1)} tok/s`,
                ];
              },
              afterBody: (items) => {
                const quantLabel = quantLabels[items[0]?.dataIndex];
                if (!quantLabel) return "";
                const quantGroup = quantGroups[quantLabel];
                const lines = [];
                if (quantGroup.avgBpw && quantGroup.avgBpw > 0)
                  lines.push(
                    `Avg bits/weight: ${quantGroup.avgBpw.toFixed(1)} bpw`,
                  );
                if (
                  quantGroup.avgTps &&
                  quantGroup.avgVram &&
                  quantGroup.avgTps > 0 &&
                  quantGroup.avgVram > 0
                ) {
                  lines.push(
                    `Avg efficiency: ${(quantGroup.avgTps / quantGroup.avgVram).toFixed(1)} TPS/GiB`,
                  );
                }
                return lines;
              },
            },
          },
        },
      },
    });
  }, [models]);

  // -- Context Length Leaderboard ----------------------------
  // Dual-axis horizontal floating range bars — matches VRAM/TPS chart pattern.
  // Primary x: context length range (K), Secondary x: TPS range.

  const renderCtxLeaderboard = useCallback(() => {
    const canvas = chartRefs.ctxLeaderboard.current;
    if (!canvas || models.length === 0) return;
    destroyChart("ctxLeaderboard");

    const context = canvas.getContext("2d");
    if (!context) return;

    // Sort by max context descending, then TPS within same tier
    const sorted = [...models].sort(
      (a: VramBenchmarkEntry, b: VramBenchmarkEntry) => {
        const cA =
          (ctxRanges as Record<string, RangeStats>)[a.displayName || "unknown"]
            ?.max ||
          (a.contextLength || 0) / 1024 ||
          0;
        const cB =
          (ctxRanges as Record<string, RangeStats>)[b.displayName || "unknown"]
            ?.max ||
          (b.contextLength || 0) / 1024 ||
          0;
        return cB - cA || (b.tokensPerSecond || 0) - (a.tokensPerSecond || 0);
      },
    );

    const labels = sorted.map((m) => {
      const name = m.displayName || m.model || "unknown";
      return name.length > 30 ? name.slice(0, 28) + "…" : name;
    });

    if (canvas.parentElement) {
      canvas.parentElement.style.height =
        Math.max(400, sorted.length * 24 + 80) + "px";
    }

    // Build floating bar data: [min, max] context (K) tuples per model
    const ctxRangeData = sorted.map((m) => {
      const range = (ctxRanges as Record<string, RangeStats>)[
        m.displayName || "unknown"
      ];
      if (range && range.count > 1) {
        return [range.min, range.max];
      }
      const k = (m.contextLength || 0) / 1024;
      return [Math.max(0, k - 0.5), k + 0.5];
    });

    // Build floating bar data: [min, max] TPS tuples per model
    const tpsRangeData = sorted.map((m) => {
      const range = (tpsRanges as Record<string, RangeStats>)[
        m.displayName || "unknown"
      ];
      if (range && range.count > 1) {
        return [range.min, range.max];
      }
      const tokensPerSecond = m.tokensPerSecond || 0;
      return [Math.max(0, tokensPerSecond - 0.5), tokensPerSecond + 0.5];
    });

    // Color gradient for context bars: cyan → emerald → teal by context magnitude
    const allContextValues = sorted.map(
      (m) =>
        (ctxRanges as Record<string, RangeStats>)[m.displayName || "unknown"]
          ?.max || (m.contextLength || 0) / 1024,
    );
    const contextMinimum = Math.min(...allContextValues);
    const contextMaximum = Math.max(...allContextValues);
    const contextSpan = contextMaximum - contextMinimum || 1;

    function ctxColor(k: number, alpha = 0.55) {
      const t = (k - contextMinimum) / contextSpan; // 0 → 1
      // HSL sweep: 190 (cyan/small) → 160 (emerald/medium) → 140 (teal/large)
      const hue = 190 - t * 50;
      const sat = 60 + t * 20;
      const lgt = 55 - t * 10;
      return {
        bg: `hsla(${hue}, ${sat}%, ${lgt}%, ${alpha})`,
        border: `hsl(${hue}, ${sat}%, ${lgt}%)`,
      };
    }

    // Build scatter overlay: individual context entries as interactive dots
    const ctxScatterData: (import("chart.js").Point & {
      entry: VramBenchmarkEntry;
    })[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const model = sorted[i];
      const range = ctxRanges[model?.displayName || ""];
      if (!range || range.count <= 1) continue;
      for (const entry of range.entries) {
        ctxScatterData.push({
          x: (entry.contextLength || 0) / 1024,
          y: labels[i] as unknown as number,
          entry,
        });
      }
    }

    // Build scatter overlay: individual TPS entries as interactive dots
    const tpsScatterData: (import("chart.js").Point & {
      entry: VramBenchmarkEntry;
    })[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const model = sorted[i];
      const range = tpsRanges[model?.displayName || ""];
      if (!range || range.count <= 1) continue;
      for (const entry of range.entries) {
        tpsScatterData.push({
          x: entry.tokensPerSecond || 0,
          y: labels[i] as unknown as number,
          entry,
        });
      }
    }

    chartInstances.current.ctxLeaderboard = new Chart(context, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Context Range (K)",
            data: ctxRangeData as [number, number][],
            backgroundColor: sorted.map(
              (m) =>
                ctxColor(
                  (ctxRanges as Record<string, RangeStats>)[
                    m.displayName || "unknown"
                  ]?.max || (m.contextLength || 0) / 1024,
                  0.45,
                ).bg,
            ),
            borderColor: sorted.map((m) =>
              m.fitsInVram === false
                ? "#f43f5e"
                : ctxColor(
                    (ctxRanges as Record<string, RangeStats>)[
                      m.displayName || "unknown"
                    ]?.max || (m.contextLength || 0) / 1024,
                    1,
                  ).border,
            ),
            borderWidth: 1.5,
            borderSkipped: false,
            borderRadius: 2,
            hoverBorderWidth: 2.5,
            hoverBorderColor: "#f8f8f8",
            xAxisID: "x",
            order: 4,
          },
          {
            label: "TPS Range",
            data: tpsRangeData as [number, number][],
            backgroundColor: "rgba(128,128,128,0.15)",
            borderColor: "rgba(100,100,100,0.5)",
            borderWidth: 1.5,
            borderSkipped: false,
            borderRadius: 2,
            hoverBorderWidth: 2.5,
            hoverBorderColor: "#f8f8f8",
            xAxisID: "x1",
            order: 3,
          },
          {
            type: "scatter",
            label: "Context Runs",
            data: ctxScatterData as unknown as [number, number][],
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            borderColor: "rgba(255, 255, 255, 0.3)",
            borderWidth: 0.5,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#fff",
            pointHoverBorderColor: "#14b8a6",
            pointHoverBorderWidth: 2,
            xAxisID: "x",
            order: 1,
          },
          {
            type: "scatter",
            label: "TPS Runs",
            data: tpsScatterData as unknown as [number, number][],
            backgroundColor: "rgba(255, 255, 255, 0.5)",
            borderColor: "rgba(255, 255, 255, 0.2)",
            borderWidth: 0.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: "#fff",
            pointHoverBorderColor: "#6366f1",
            pointHoverBorderWidth: 2,
            xAxisID: "x1",
            order: 2,
          },
        ],
      },
      plugins: [
        makeDatalabelsPlugin({
          getLabel: (
            _raw: import("chart.js").Point & { entry?: VramBenchmarkEntry },
            i: number,
          ) => {
            const model = sorted[i];
            if (!model) return "";
            // Context range label
            const cRange = ctxRanges[model.displayName || ""];
            let ctxLabel;
            if (cRange && cRange.count > 1) {
              const minL =
                cRange.min >= 1024
                  ? `${(cRange.min / 1024).toFixed(0)}M`
                  : `${cRange.min.toFixed(0)}K`;
              const maxL =
                cRange.max >= 1024
                  ? `${(cRange.max / 1024).toFixed(0)}M`
                  : `${cRange.max.toFixed(0)}K`;
              ctxLabel = `${minL}–${maxL}`;
            } else {
              const k = (model.contextLength || 0) / 1024;
              ctxLabel =
                k >= 1024 ? `${(k / 1024).toFixed(0)}M` : `${k.toFixed(0)}K`;
            }
            // TPS label
            const tRange = tpsRanges[model.displayName || ""];
            let tpsLabel;
            if (tRange && tRange.count > 1) {
              tpsLabel = `${tRange.min.toFixed(0)}–${tRange.max.toFixed(0)} t/s`;
            } else {
              tpsLabel = `${(model.tokensPerSecond || 0).toFixed(0)} t/s`;
            }
            return `${ctxLabel} · ${tpsLabel}`;
          },
          anchor: "end",
          align: "right",
          offset: 6,
          filterFn: (di: number) => di === 0,
        }),
      ],
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        interaction: { mode: "point", intersect: true },
        scales: {
          x: {
            position: "bottom",
            title: { ...AXIS_TITLE_STYLE, text: "Context Length (K tokens)" },
            grid: GRID_STYLE,
            ticks: {
              ...TICK_STYLE,
              callback: (v: string | number) =>
                Number(v) >= 1024
                  ? `${(Number(v) / 1024).toFixed(0)}M`
                  : `${v}K`,
            },
          },
          x1: {
            position: "top",
            title: { ...AXIS_TITLE_STYLE, text: "Tokens / sec" },
            grid: { display: false },
            ticks: TICK_STYLE,
          },
          y: {
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: { ...TICK_STYLE, padding: 8 },
          },
        },
        plugins: {
          legend: LEGEND_STYLE,
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              title: (
                items: import("chart.js").TooltipItem<"bar" | "scatter">[],
              ) => {
                const item = items[0];
                if (!item) return "";
                // Scatter dots
                if (item.datasetIndex >= 2) {
                  return (
                    (item.raw as { entry?: VramBenchmarkEntry })?.entry
                      ?.displayName || ""
                  );
                }
                return sorted[item.dataIndex]?.displayName || "";
              },
              afterTitle: (
                items: import("chart.js").TooltipItem<"bar" | "scatter">[],
              ) => {
                const item = items[0];
                if (!item) return "";
                if (item.datasetIndex >= 2) {
                  const e = (item.raw as { entry?: VramBenchmarkEntry })?.entry;
                  if (!e) return "";
                  return `${e.quantization} · ${e.architecture} · ${(e.contextLength / 1024).toFixed(0)}K ctx · ${shortGPU(e.system?.gpu?.name || "")}`;
                }
                const model = sorted[item.dataIndex];
                if (!model) return "";
                return `${model.quantization} · ${model.architecture} · ${(model.contextLength / 1024).toFixed(0)}K ctx · ${shortGPU(model.system?.gpu?.name || "")}`;
              },
              label: (
                item: import("chart.js").TooltipItem<"bar" | "scatter">,
              ) => {
                // Scatter dots — entry-specific
                if (item.datasetIndex === 2) {
                  const e = (item.raw as { entry?: VramBenchmarkEntry })?.entry;
                  if (!e) return "";
                  return ` Context: ${((e.contextLength || 0) / 1024).toFixed(0)}K`;
                }
                if (item.datasetIndex === 3) {
                  const e = (item.raw as { entry?: VramBenchmarkEntry })?.entry;
                  if (!e) return "";
                  return ` Speed: ${(e.tokensPerSecond || 0).toFixed(1)} tok/s`;
                }
                const model = sorted[item.dataIndex];
                if (!model) return "";
                if (item.datasetIndex === 0) {
                  const range = ctxRanges[model.displayName || ""];
                  if (range && range.count > 1) {
                    const minL =
                      range.min >= 1024
                        ? `${(range.min / 1024).toFixed(0)}M`
                        : `${range.min.toFixed(0)}K`;
                    const maxL =
                      range.max >= 1024
                        ? `${(range.max / 1024).toFixed(0)}M`
                        : `${range.max.toFixed(0)}K`;
                    return ` Context: ${minL}–${maxL} (${range.count} runs)`;
                  }
                  return ` Context: ${((model.contextLength || 0) / 1024).toFixed(0)}K`;
                }
                // TPS bar
                const tRange = tpsRanges[model.displayName || ""];
                if (tRange && tRange.count > 1) {
                  return ` Speed: ${tRange.min.toFixed(1)}–${tRange.max.toFixed(1)} tok/s (${tRange.count} runs)`;
                }
                return ` Speed: ${model.tokensPerSecond?.toFixed(1) || "0"} tok/s`;
              },
              afterBody: (
                items: import("chart.js").TooltipItem<"bar" | "scatter">[],
              ) => {
                const item = items[0];
                if (!item) return "";
                const m =
                  item.datasetIndex >= 2
                    ? (item.raw as { entry?: VramBenchmarkEntry })?.entry
                    : sorted[item.dataIndex];
                if (!m) return "";
                const sInfo = m.settings?.label
                  ? SETTINGS_INFO[m.settings.label]
                  : undefined;
                const lines = [
                  "",
                  `VRAM: ${(m.modelVramGiB || 0).toFixed(2)} GiB`,
                  `Parallel: ${sInfo?.parallel ?? "?"}`,
                  `Batch: ${sInfo?.batch ?? "?"}`,
                  `Context: ${((m.contextLength || 0) / 1024).toFixed(0)}K`,
                  `Efficiency: ${((m.tokensPerSecond || 0) / (m.modelVramGiB || 1)).toFixed(1)} TPS/GiB`,
                  `Quant: ${m.quantization} (${m.bitsPerWeight || "?"} bpw)`,
                ];
                if (m.ttft?.ms) lines.push(`TTFT: ${m.ttft.ms.toFixed(0)} ms`);
                if (m.loadTimeMs)
                  lines.push(`Load: ${(m.loadTimeMs / 1000).toFixed(1)}s`);
                const gpu = m.system?.gpu as
                  | { temp?: number; power?: number }
                  | undefined;
                if (gpu?.temp)
                  lines.push(`GPU: ${gpu.temp}°C · ${gpu.power || "?"}W`);
                if (m.fitsInVram === false)
                  lines.push(`⚠ Does NOT fit in VRAM`);
                if (m.settings?.label && m.settings.label !== "default")
                  lines.push(`Settings: ${m.settings.label}`);
                return lines;
              },
            },
          },
        },
      },
    });
  }, [models, ctxRanges, tpsRanges]);

  // -- Context Length Scaling --------------------------------

  const renderContext = useCallback(() => {
    const canvas = chartRefs.context.current;
    if (!canvas || allFilteredData.length === 0) return;
    destroyChart("context");

    const context = canvas.getContext("2d");
    if (!context) return;
    const showAllMachines = machineFilter === "all";

    // -- Group data --
    // When all machines: group by model+hostname so each GPU gets its own line
    // When single machine: group by model only (original behavior)
    const groups: Record<
      string,
      {
        modelName: string;
        hostname: string;
        ctxMap: Record<number, VramBenchmarkEntry>;
      }
    > = {};
    for (const d of allFilteredData) {
      const modelName = d.displayName || "unknown";
      const hostname = d.system?.hostname || "unknown";
      const groupKey = showAllMachines
        ? `${modelName}__${hostname}`
        : modelName;

      if (!groupKey) continue;

      if (!groups[groupKey]) {
        groups[groupKey] = { modelName, hostname, ctxMap: {} };
      }
      const ctxKey = d.contextLength || 0;
      if (
        !groups[groupKey].ctxMap[ctxKey] ||
        (d.createdAt &&
          groups[groupKey].ctxMap[ctxKey] &&
          groups[groupKey].ctxMap[ctxKey].createdAt &&
          d.createdAt &&
          groups[groupKey].ctxMap[ctxKey] &&
          d.createdAt > groups[groupKey].ctxMap[ctxKey].createdAt)
      ) {
        groups[groupKey].ctxMap[ctxKey] = d;
      }
    }

    // Build sorted entries — most context lengths first, then by VRAM
    const sortedGroups = Object.entries(groups)
      .map(
        ([key, { modelName, hostname, ctxMap }]: [
          string,
          {
            modelName: string;
            hostname: string;
            ctxMap: Record<number, VramBenchmarkEntry>;
          },
        ]) => ({
          key,
          modelName,
          hostname,
          items: Object.values(ctxMap).sort(
            (a: VramBenchmarkEntry, b: VramBenchmarkEntry) =>
              (a.contextLength || 0) - (b.contextLength || 0),
          ),
          ctxCount: Object.keys(ctxMap).length,
        }),
      )
      .sort(
        (
          a: { ctxCount: number; items: VramBenchmarkEntry[] },
          b: { ctxCount: number; items: VramBenchmarkEntry[] },
        ) =>
          b.ctxCount - a.ctxCount ||
          (a.items[0] ? a.items[0].modelVramGiB || 0 : 0) -
            (b.items[0] ? b.items[0].modelVramGiB || 0 : 0),
      )
      .slice(0, 20);

    if (sortedGroups.length === 0) return;

    // -- Assign stable color per model name --
    const uniqueModels = [...new Set(sortedGroups.map((g) => g.modelName))];
    const modelColorMap: Record<string, PaletteEntry> = {};
    uniqueModels.forEach((name, i) => {
      modelColorMap[name] = PALETTE[i % PALETTE.length] as PaletteEntry;
    });

    // Track how many lines per model (for dash style differentiation)
    const modelLineCount: Record<string, number> = {};

    const datasets = sortedGroups.map(
      ({
        modelName,
        items,
      }: {
        modelName: string;
        items: VramBenchmarkEntry[];
      }) => {
        const color = modelColorMap[modelName];
        const lineIdx = modelLineCount[modelName] || 0;
        modelLineCount[modelName] = lineIdx + 1;

        // Solid for first machine, dashed for second, dotted for third, etc.
        const dashPatterns = [[], [6, 3], [2, 3], [8, 4, 2, 4]];
        const borderDash = dashPatterns[lineIdx % dashPatterns.length];

        const gpuLabel = showAllMachines
          ? shortGPU(items[0]?.system?.gpu?.name || "")
          : "";
        const label = showAllMachines
          ? `${modelName.length > 22 ? modelName.slice(0, 20) + "…" : modelName} · ${gpuLabel}`
          : modelName.length > 25
            ? modelName.slice(0, 23) + "…"
            : modelName;

        return {
          label,
          data: items.map((d: VramBenchmarkEntry) => ({
            x: (d.contextLength || 0) / 1024,
            y: d.modelVramGiB || 0,
            ctx: d,
          })),
          borderColor: color.border,
          backgroundColor: color.bg,
          borderWidth: 2,
          borderDash,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBorderWidth: 1.5,
          pointBorderColor: color.border,
          tension: 0.3,
          fill: false,
          showLine: items.length > 1,
        };
      },
    );

    chartInstances.current.context = new Chart(context, {
      type: "scatter",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: "easeOutQuart" },
        scales: {
          x: {
            type: "logarithmic",
            title: { ...AXIS_TITLE_STYLE, text: "Context Length (K tokens)" },
            grid: GRID_STYLE,
            afterBuildTicks: (axis: import("chart.js").Scale) => {
              // Force ticks at powers of 2 instead of decade multiples
              const pow2 = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
              axis.ticks = pow2
                .filter(
                  (v) => v >= (axis.min as number) && v <= (axis.max as number),
                )
                .map((v) => ({ value: v }));
            },
            ticks: {
              ...TICK_STYLE,
              callback: (v: string | number) => `${v}K`,
            },
          },
          y: {
            title: { ...AXIS_TITLE_STYLE, text: "VRAM (GiB)" },
            grid: GRID_STYLE,
            ticks: TICK_STYLE,
          },
        },
        plugins: {
          legend: LEGEND_STYLE,
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              title: (items: import("chart.js").TooltipItem<"scatter">[]) =>
                items[0]?.dataset?.label || "",
              label: (item: import("chart.js").TooltipItem<"scatter">) => {
                const rawItem = item.raw as {
                  x: number;
                  y: number;
                  ctx: VramBenchmarkEntry;
                };
                const contextData = rawItem.ctx;
                const sInfo = contextData?.settings?.label
                  ? SETTINGS_INFO[contextData.settings.label]
                  : undefined;
                const lines = [
                  ` VRAM: ${rawItem.y.toFixed(2)} GiB`,
                  ` Parallel: ${sInfo?.parallel ?? "?"}`,
                  ` Batch: ${sInfo?.batch ?? "?"}`,
                  ` Context: ${rawItem.x}K`,
                ];
                if (contextData?.system?.gpu?.name)
                  lines.push(
                    ` GPU: ${shortGPU((contextData.system as { gpu?: { name?: string } })?.gpu?.name || "")}`,
                  );
                if (contextData?.tokensPerSecond)
                  lines.push(
                    ` Speed: ${contextData.tokensPerSecond.toFixed(1)} tok/s`,
                  );
                if (contextData?.quantization)
                  lines.push(
                    ` Quant: ${contextData.quantization} (${contextData.bitsPerWeight || "?"} bpw)`,
                  );
                if (contextData?.ttft?.ms)
                  lines.push(` TTFT: ${contextData.ttft.ms.toFixed(0)} ms`);
                if (contextData?.settings?.label)
                  lines.push(` Settings: ${contextData.settings.label}`);
                if (contextData?.fitsInVram === false)
                  lines.push(` ⚠ Does NOT fit in VRAM`);
                return lines;
              },
            },
          },
        },
      },
    });
  }, [allFilteredData, machineFilter]);

  // -- Destroy chart when switching tabs --
  const prevViewRef = useRef<ChartViewKey>(activeView);
  useEffect(() => {
    const previousView = prevViewRef.current;
    if (previousView !== activeView) {
      destroyChart(previousView);
      // Clear cached original colors for the destroyed chart
      delete searchOrigColors.current[previousView];
      prevViewRef.current = activeView;
    }
    return () => destroyChart(activeView);
  }, [activeView]);

  useEffect(() => {
    if (loading || error) return;

    // Chart.js global defaults
    Chart.defaults.color = "#6b728e";
    Chart.defaults.borderColor = "rgba(255,255,255,0.04)";
    Chart.defaults.font.family = CHART_FONT;

    // Clear cached colors so search highlight re-snapshots after rebuild
    delete searchOrigColors.current[activeView];

    // Render the active view
    const renderMap = {
      scatter: renderScatter,
      bar: renderBar,
      efficiency: renderEfficiency,
      quantDist: renderQuantDist,
      ctxLeaderboard: renderCtxLeaderboard,
      context: renderContext,
    };
    renderMap[activeView]?.();
  }, [
    loading,
    error,
    activeView,
    renderScatter,
    renderBar,
    renderEfficiency,
    renderQuantDist,
    renderCtxLeaderboard,
    renderContext,
  ]);

  // -- Search highlight — dims non-matching chart elements --

  const applySearchHighlight = useCallback(
    (term: string) => {
      const chart = chartInstances.current[activeView];
      if (!chart) return;

      // -- Color utility helpers --
      function dimColor(
        color: string | undefined,
        targetAlpha: number,
      ): string | undefined {
        if (!color || typeof color !== "string") return color;
        // rgba(r, g, b, a)
        const rgbaMatch = color.match(
          /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/,
        );
        if (rgbaMatch) {
          return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${targetAlpha})`;
        }
        // hsla(h, s%, l%, a) or hsl(...)
        const hslaMatch = color.match(/hsla?\(([^)]+)\)/);
        if (hslaMatch) {
          const parts = hslaMatch[1].split(",").map((s: string) => s.trim());
          if (parts.length >= 3) {
            return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${targetAlpha})`;
          }
        }
        // #hex
        if (color.startsWith("#")) {
          const hexClean = color.replace("#", "");
          const r = parseInt(hexClean.substring(0, 2), 16);
          const g = parseInt(hexClean.substring(2, 4), 16);
          const b = parseInt(hexClean.substring(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${targetAlpha})`;
        }
        return color;
      }

      // Extract searchable model name from various chart data shapes
      function getSearchableName(
        raw: unknown,
        label: string | number | undefined,
        dsLabel: string | undefined,
      ): string {
        const r = raw as {
          model?: { displayName?: string };
          entry?: { displayName?: string };
          ctx?: { displayName?: string };
        };
        if (r?.model?.displayName) return r.model.displayName;
        if (r?.entry?.displayName) return r.entry.displayName;
        if (r?.ctx?.displayName) return r.ctx.displayName;
        if (label) return String(label);
        if (dsLabel) return String(dsLabel);
        return "";
      }

      const datasets = chart.data.datasets;
      const cacheKey = activeView;

      // -- Restore originals if search is cleared --
      if (!term) {
        const cache = searchOrigColors.current[cacheKey];
        if (cache) {
          for (let di = 0; di < datasets.length; di++) {
            if (cache[di]) {
              datasets[di].backgroundColor = cache[di].bg;
              datasets[di].borderColor = cache[di].border;
            }
          }
          delete searchOrigColors.current[cacheKey];
        }
        chart.update("none");
        return;
      }

      const needle = typeof term === "string" ? term.toLowerCase() : "";

      // -- Snapshot original colors on first search --
      if (!searchOrigColors.current[cacheKey]) {
        const snapshot: ChartColorCache = {};
        for (let di = 0; di < datasets.length; di++) {
          const ds = datasets[di];
          snapshot[di] = {
            bg: Array.isArray(ds.backgroundColor)
              ? [...ds.backgroundColor]
              : (ds.backgroundColor as string),
            border: Array.isArray(ds.borderColor)
              ? [...ds.borderColor]
              : (ds.borderColor as string),
          };
        }
        searchOrigColors.current[cacheKey] = snapshot;
      }

      const cache = searchOrigColors.current[cacheKey];

      // -- Apply per-element dimming --
      for (let di = 0; di < datasets.length; di++) {
        const ds = datasets[di];
        // Skip connector lines
        if (
          ds.label === "_connector" ||
          (ds.type === "line" && ds.label === "_connector")
        )
          continue;

        const orig = cache[di];
        if (!orig) continue;

        const data = ds.data;
        const labels = chart.data.labels;
        const origBg = orig.bg;
        const origBorder = orig.border;

        const newBg = [];
        const newBorder = [];

        for (let i = 0; i < data.length; i++) {
          const raw = data[i];
          const name = getSearchableName(
            raw,
            labels?.[i] as string | undefined,
            ds.label,
          );
          const matches = name.toLowerCase().includes(needle);

          const backgroundColor = Array.isArray(origBg) ? origBg[i] : origBg;
          const border = Array.isArray(origBorder) ? origBorder[i] : origBorder;

          if (matches) {
            newBg.push(backgroundColor);
            newBorder.push(border);
          } else {
            newBg.push(dimColor(backgroundColor, 0.06));
            newBorder.push(dimColor(border, 0.1));
          }
        }

        ds.backgroundColor = newBg;
        ds.borderColor = newBorder;
      }

      chart.update("none");
    },
    [activeView],
  );

  // Re-apply search highlight after chart renders or search term changes
  useEffect(() => {
    if (loading || error) return;
    // Small delay to ensure chart render completed first
    const timer = setTimeout(() => applySearchHighlight(chartSearch), 50);
    return () => clearTimeout(timer);
  }, [
    chartSearch,
    activeView,
    loading,
    error,
    applySearchHighlight,
    renderScatter,
    renderBar,
    renderEfficiency,
    renderQuantDist,
    renderCtxLeaderboard,
    renderContext,
  ]);

  // -- Subtitle for header ----------------------------------

  const subtitle = useMemo(() => {
    const parts = [
      `${rawData.length} benchmarks`,
      `${machines.length} machine${machines.length !== 1 ? "s" : ""}`,
    ];
    if (settingsFilter !== "all") parts.push(`⚙ ${settingsFilter}`);
    if (hwLabel) parts.push(hwLabel);
    return parts.join(" · ");
  }, [rawData.length, machines.length, settingsFilter, hwLabel]);

  // -- Chart descriptions per view --------------------------

  const settingsDesc =
    settingsFilter !== "all" && settingsFilter !== "default"
      ? ` (${settingsFilter} settings)`
      : "";

  const chartDescriptions = {
    scatter: `Each bubble represents a model — size indicates file weight. ${activeScatterMode.desc}${settingsDesc}`,
    bar: `Each bar spans the min→max measured VRAM across all benchmark runs${settingsDesc || " — default settings"}.`,
    efficiency: `Each bar spans the min→max tokens/sec across all benchmark runs${settingsDesc || " — default settings"}. Sorted by peak throughput.`,
    quantDist: `Average VRAM and speed grouped by quantization format${settingsDesc}.`,
    ctxLeaderboard: `Each model shows two bars: context length range (bottom axis, colored by max context) and TPS range (top axis, gray). Scatter dots show individual runs${settingsDesc || " — default settings"}.`,
    context:
      "How VRAM consumption scales as context window size increases per model.",
  };

  // -- Loading / Error --------------------------------------

  if (loading && rawData.length === 0) {
    return (
      <>
        <PageHeaderComponent title="VRAM Benchmark" subtitle="Loading…" />
        <div className={styles['content']}>
          <LoadingMessage message="Fetching VRAM benchmarks…" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeaderComponent title="VRAM Benchmark" subtitle="Error" />
        <div className={styles['content']}>
          <ErrorMessage message={error} />
        </div>
      </>
    );
  }

  // -- Render -----------------------------------------------

  return (
    <>
      <PageHeaderComponent title="VRAM Benchmark" subtitle={subtitle}>
        <button
          className={`vram-benchmark-component ${styles['refresh-button']}`}
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </PageHeaderComponent>

      <div className={styles['content']}>
        {/* Stats cards */}
        {stats && (
          <div className={styles['stats-grid']}>
            {/* -- Summary stats (single-width) -- */}
            <StatsCard
              label="Models Profiled"
              value={stats.n}
              icon={Cpu}
              variant="accent"
            />
            <StatsCard
              label="VRAM Range"
              value={`${stats.minVram}—${stats.maxVram}`}
              subtitle="GiB (min → max)"
              icon={Gauge}
              variant="info"
            />
            {stats.medianTtft && (
              <StatsCard
                label="Median TTFT"
                value={`${stats.medianTtft} ms`}
                subtitle="Time to First Token"
                icon={Clock}
                variant="info"
              />
            )}
            <StatsCard
              label="Est. Accuracy"
              value={`±${stats.avgDelta} GiB`}
              subtitle="Avg prediction error"
              icon={Crosshair}
              variant="destructive"
            />
            {stats.oomCount > 0 && (
              <StatsCard
                label="OOM Models"
                value={stats.oomCount}
                subtitle="Exceeded GPU VRAM"
                icon={Target}
                variant="destructive"
              />
            )}
            <StatsCard
              label="Quantizations"
              value={stats.quantCount}
              subtitle="Distinct formats"
              icon={Grid3x3}
              variant="accent"
            />

            {/* -- Model cards (wide, 2-col span, sorted by model name) -- */}
            {stats.modelCards.map(
              (card: Exclude<(typeof stats.modelCards)[0], null> | null) => {
                if (!card) return null;
                return (
                  <StatsCard
                    key={card?.key}
                    className={styles['stat-wide']}
                    label={card?.label}
                    value={card?.value}
                    subtitle={card?.subtitle}
                    icon={card?.icon}
                    variant={card?.variant}
                    onMouseEnter={() =>
                      highlightModelInChart(card?.sortName || "")
                    }
                    onMouseLeave={() => highlightModelInChart(null)}
                  />
                );
              },
            )}
          </div>
        )}

        {/* Global filters — apply to all tabs */}
        <FilterBarComponent>
          <FilterSelectComponent
            value={machineFilter}
            onChange={setMachineFilter}
            options={[
              { value: "all", label: "All Machines" },
              ...machines.map((m) => ({
                value: m.hostname,
                label: `${m.hostname} · ${shortGPU(m.gpu)} (${m.benchmarkCount})`,
              })),
            ]}
          />
          <FilterSelectComponent
            value={providerFilter}
            onChange={setProviderFilter}
            options={[
              { value: "all", label: "All Providers" },
              ...providerOptions.map((p) => ({
                value: p || "",
                label: p || "",
              })),
            ]}
          />
        </FilterBarComponent>

        {/* Tab bar for chart type */}
        <TabBarComponent
          tabs={viewTabs}
          activeTab={activeView}
          onChange={(key: string) => setActiveView(key as ChartViewKey)}
          className={styles['tab-bar']}
        />

        {/* Chart area */}
        <div className={styles['chart-card']}>
          {/* Per-tab filters */}
          <FilterBarComponent>
            <div className={styles['chart-search-group']}>
              <Search size={13} className={styles['chart-search-icon']} />
              <InputComponent
                type="text"
                className={styles['chart-search-input']}
                placeholder="Highlight model…"
                value={chartSearch}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement>,
                ) => setChartSearch(e.target.value)}
              />
              {chartSearch && (
                <button
                  className={styles['chart-search-clear']}
                  onClick={() => setChartSearch("")}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <SelectComponent
              value={settingsFilter}
              onChange={(value: string) => {
                setSettingsFilter(value);
                setLoading(true);
              }}
              triggerTooltipContent={<SettingsMatrixTooltip />}
              options={
                [
                  {
                    value: "all",
                    label: "All Settings",
                    icon: <span>📊</span>,
                  },
                  ...settingsLabels.map((s) => ({
                    value: s,
                    label: s,
                    icon: <span>{SETTINGS_EMOJI[s] || "🛠️"}</span>,
                    tooltip: <SettingsTooltipContent settingsKey={s} />,
                  })),
                ] as SelectOptionType[]
              }
            />
            {activeView !== "context" && (
              <div className={styles['vram-clip-group']}>
                <label className={styles['vram-clip-label']}>Context Range</label>
                <div className={styles['vram-clip-inputs']}>
                  <InputComponent
                    type="number"
                    className={styles['vram-clip-input']}
                    placeholder="Min"
                    value={ctxMin}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>,
                    ) => setCtxMin(e.target.value)}
                    min="0"
                    step="1"
                  />
                  <span className={styles['vram-clip-separator']}>–</span>
                  <InputComponent
                    type="number"
                    className={styles['vram-clip-input']}
                    placeholder="Max"
                    value={ctxMax}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>,
                    ) => setCtxMax(e.target.value)}
                    min="0"
                    step="1"
                  />
                  <span className={styles['vram-clip-unit']}>K</span>
                </div>
              </div>
            )}
            <FilterSelectComponent
              value={parallelFilter}
              onChange={setParallelFilter}
              options={[
                { value: "all", label: "All Parallel" },
                ...parallelOptions.map((p) => ({
                  value: String(p),
                  label: `Parallel: ${p}`,
                })),
              ]}
            />
            <FilterSelectComponent
              value={batchFilter}
              onChange={setBatchFilter}
              options={[
                { value: "all", label: "All Batch" },
                ...batchOptions.map((b) => ({
                  value: String(b),
                  label: `Batch: ${b}`,
                })),
              ]}
            />
            {activeView === "scatter" && (
              <FilterSelectComponent
                value={scatterMode}
                onChange={setScatterMode}
                options={SCATTER_MODES.map((m) => ({
                  value: m.key,
                  label: `Axes: ${m.label}`,
                }))}
              />
            )}
            {activeView === "scatter" && (
              <div className={styles['vram-clip-group']}>
                <label className={styles['vram-clip-label']}>
                  {activeScatterMode.xLabel.split(" (")[0]} Range
                </label>
                <div className={styles['vram-clip-inputs']}>
                  <InputComponent
                    type="number"
                    className={styles['vram-clip-input']}
                    placeholder="Min"
                    value={scatterClipXMin}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>,
                    ) => setScatterClipXMin(e.target.value)}
                    min="0"
                    step="0.5"
                  />
                  <span className={styles['vram-clip-separator']}>–</span>
                  <InputComponent
                    type="number"
                    className={styles['vram-clip-input']}
                    placeholder="Max"
                    value={scatterClipXMax}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>,
                    ) => setScatterClipXMax(e.target.value)}
                    min="0"
                    step="0.5"
                  />
                  <span className={styles['vram-clip-unit']}>
                    {activeScatterMode.xLabel.match(/\(([^)]+)\)/)?.[1] || ""}
                  </span>
                </div>
              </div>
            )}
            {activeView === "bar" && (
              <div className={styles['vram-clip-group']}>
                <label className={styles['vram-clip-label']}>VRAM Range</label>
                <div className={styles['vram-clip-inputs']}>
                  <InputComponent
                    type="number"
                    className={styles['vram-clip-input']}
                    placeholder="Min"
                    value={vramClipMin}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>,
                    ) => setVramClipMin(e.target.value)}
                    min="0"
                    step="0.5"
                  />
                  <span className={styles['vram-clip-separator']}>–</span>
                  <InputComponent
                    type="number"
                    className={styles['vram-clip-input']}
                    placeholder="Max"
                    value={vramClipMax}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>,
                    ) => setVramClipMax(e.target.value)}
                    min="0"
                    step="0.5"
                  />
                  <span className={styles['vram-clip-unit']}>GiB</span>
                </div>
              </div>
            )}
            {activeView === "efficiency" && (
              <div className={styles['vram-clip-group']}>
                <label className={styles['vram-clip-label']}>TPS Range</label>
                <div className={styles['vram-clip-inputs']}>
                  <InputComponent
                    type="number"
                    className={styles['vram-clip-input']}
                    placeholder="Min"
                    value={tpsClipMin}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>,
                    ) => setTpsClipMin(e.target.value)}
                    min="0"
                    step="5"
                  />
                  <span className={styles['vram-clip-separator']}>–</span>
                  <InputComponent
                    type="number"
                    className={styles['vram-clip-input']}
                    placeholder="Max"
                    value={tpsClipMax}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>,
                    ) => setTpsClipMax(e.target.value)}
                    min="0"
                    step="5"
                  />
                  <span className={styles['vram-clip-unit']}>t/s</span>
                </div>
              </div>
            )}
            {["bar", "efficiency"].includes(activeView) && (
              <FilterSelectComponent
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: "vram", label: "Sort: VRAM Usage" },
                  { value: "tps", label: "Sort: Tokens/sec" },
                  { value: "efficiency", label: "Sort: Efficiency" },
                  { value: "filesize", label: "Sort: File Size" },
                  { value: "ttft", label: "Sort: TTFT" },
                  { value: "loadTime", label: "Sort: Load Time" },
                ]}
              />
            )}
          </FilterBarComponent>

          <p className={styles['chart-description']}>
            {chartDescriptions[activeView]}
          </p>
          <div className={styles['chart-panels']}>
            {viewTabs.map((tab) => (
              <div
                key={tab.key}
                className={styles['chart-wrapper']}
                style={{
                  display: activeView === tab.key ? "block" : "none",
                  height:
                    tab.key === "bar" ||
                    tab.key === "efficiency" ||
                    tab.key === "ctxLeaderboard"
                      ? undefined
                      : 460,
                }}
              >
                <canvas
                  ref={
                    chartRefs[
                      tab.key as keyof typeof chartRefs
                    ] as React.Ref<HTMLCanvasElement>
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
