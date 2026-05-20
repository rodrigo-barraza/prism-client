const fs = require("fs");
const path = require("path");

function replaceAll(file, find, replace) {
  let content = fs.readFileSync(file, "utf8");
  content = content.split(find).join(replace);
  fs.writeFileSync(file, content);
}

function replaceRegex(file, regex, replace) {
  let content = fs.readFileSync(file, "utf8");
  content = content.replace(regex, replace);
  fs.writeFileSync(file, content);
}

// ---- RequestsTableComponent ----
const reqFile = "src/components/RequestsTableComponent.tsx";
replaceRegex(reqFile, /}: any\) \{/g, "}: { requests?: Record<string, unknown>[]; emptyText?: string; compact?: boolean; mini?: boolean; title?: string; maxHeight?: number | string | null; sortKey?: string; sortDir?: string; onSort?: (key: string, dir: string) => void; onRowClick?: (row: Record<string, unknown>) => void; onRowMouseEnter?: (row: Record<string, unknown>, e: React.MouseEvent) => void; onRowMouseLeave?: () => void; getRowClassName?: (row: Record<string, unknown>) => string; }) {");
replaceRegex(reqFile, /\(sum: any, r: any\)/g, "(sum: number, r: Record<string, any>)");
replaceRegex(reqFile, /\(c: any\)/g, "(c: Record<string, any>)");
replaceRegex(reqFile, /\(r: any, i: any\)/g, "(r: Record<string, any>, i: number)");

// ---- TracesTableComponent ----
const traceFile = "src/components/TracesTableComponent.tsx";
replaceRegex(traceFile, /}: any\) \{/g, "}: { traces?: Record<string, unknown>[]; emptyText?: string; compact?: boolean; mini?: boolean; title?: string; maxHeight?: number | string | null; sortKey?: string; sortDir?: string; onSort?: (key: string, dir: string) => void; onRequestRowClick?: (row: Record<string, unknown>) => void; }) {");
replaceRegex(traceFile, /\(c: any\)/g, "(c: Record<string, any>)");
replaceRegex(traceFile, /\(s: any, i: any\)/g, "(s: Record<string, any>, i: number)");
replaceRegex(traceFile, /\(trace: any\)/g, "(trace: Record<string, any>)");

// ---- traces/page.tsx ----
const pageFile = "src/app/admin/traces/page.tsx";
let pc = fs.readFileSync(pageFile, "utf8");

pc = pc.replace(/useState<any\[\]>\(\[\]\)/g, "useState<Record<string, any>[]>([])");
pc = pc.replace(/useRef<any>\(false\)/g, "useRef<boolean>(false)");
pc = pc.replace(/useRef<any>\(0\)/g, "useRef<number>(0)");
pc = pc.replace(/useState<any>\(null\)/g, "useState<Record<string, any> | null>(null)");

pc = pc.replace(/\(params as any\)\.project/g, "(params as Record<string, any>).project");
pc = pc.replace(/catch \(error: any\)/g, "catch (error: unknown)");
pc = pc.replace(/let pollInterval: any = null;/g, "let pollInterval: NodeJS.Timeout | null = null;");
pc = pc.replace(/let debounceTimer: any = null;/g, "let debounceTimer: NodeJS.Timeout | null = null;");
pc = pc.replace(/\(data: any\)/g, "(data: Record<string, any>)");
pc = pc.replace(/\(event: any\)/g, "(event: Record<string, any>)");

pc = pc.replace(/\(selectedRequest as any\)\?/g, "(selectedRequest as Record<string, any>)?");
pc = pc.replace(/\(selectedRequest as any\)\./g, "(selectedRequest as Record<string, any>).");

pc = pc.replace(/\.then\(\(data: any\) =>/g, ".then((data: Record<string, any>) =>");
pc = pc.replace(/const handleRequestRowClick = useCallback\(async \(req: any\) =>/g, "const handleRequestRowClick = useCallback(async (req: Record<string, any>) =>");

pc = pc.replace(/onSort=\{\(key: any, dir: any\) =>/g, "onSort={(key: string, dir: string) =>");

pc = pc.replace(/\(associations as any\)\?/g, "(associations as Record<string, any>)?");
pc = pc.replace(/\(associations\.conversations\.map\(\(c: any\) =>/g, "(associations.conversations.map((c: Record<string, any>) =>");
pc = pc.replace(/\(associations\.workflows\.map\(\(w: any\) =>/g, "(associations.workflows.map((w: Record<string, any>) =>");
pc = pc.replace(/\(associations\.traces\.map\(\(s: any\) =>/g, "(associations.traces.map((s: Record<string, any>) =>");

pc = pc.replace(/mediaAssets\.map\(\(asset: any, index: any\)/g, "mediaAssets.map((asset: Record<string, any>, index: number)");

fs.writeFileSync(pageFile, pc);
console.log("Updated traces");
