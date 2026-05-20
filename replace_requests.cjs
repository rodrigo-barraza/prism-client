const fs = require("fs");

function fixRequests() {
  const file = "src/app/admin/requests/page.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  // Fix generic states
  pc = pc.replace(/useState<any\[\]>\(\[\]\)/g, "useState<Record<string, any>[]>([])");
  pc = pc.replace(/useState<any>\(null\)/g, "useState<Record<string, any> | null>(null)");
  pc = pc.replace(/useState<any>\(\{\}\)/g, "useState<Record<string, any>>({})");

  // Fix refs
  pc = pc.replace(/useRef<any>\(false\)/g, "useRef<boolean>(false)");
  pc = pc.replace(/useRef<any>\(0\)/g, "useRef<number>(0)");
  pc = pc.replace(/useRef<any>\(new Set\(\)\)/g, "useRef<Set<string>>(new Set())");
  pc = pc.replace(/useRef<any>\(new Map\(\)\)/g, "useRef<Map<string, NodeJS.Timeout>>(new Map())");

  // Fix maps and callbacks
  pc = pc.replace(/\(prev: any\)/g, "(prev)");
  pc = pc.replace(/\(s: any\)/g, "(s: Set<string>)");
  pc = pc.replace(/\(t: any\)/g, "(t: number)");

  pc = pc.replace(/\(r as any\)/g, "(r as Record<string, any>)");
  pc = pc.replace(/\(r: any\)/g, "(r: Record<string, any>)");
  
  pc = pc.replace(/\(params as any\)/g, "(params as Record<string, any>)");
  pc = pc.replace(/\[k, v\]: any/g, "[k, v]");
  
  pc = pc.replace(/catch \(error: any\)/g, "catch (error: unknown)");

  pc = pc.replace(/let pollInterval: any = null;/g, "let pollInterval: NodeJS.Timeout | null = null;");
  pc = pc.replace(/let debounceTimer: any = null;/g, "let debounceTimer: NodeJS.Timeout | null = null;");

  pc = pc.replace(/\(data: any\)/g, "(data: Record<string, any>)");
  pc = pc.replace(/\(event: any\)/g, "(event: Record<string, any>)");

  pc = pc.replace(/\(selectedRequest as any\)\?/g, "(selectedRequest as Record<string, any>)?");
  pc = pc.replace(/\(selectedRequest as any\)\./g, "(selectedRequest as Record<string, any>).");

  pc = pc.replace(/handleSort\(key: any, dir: any\)/g, "handleSort(key: string, dir: string)");
  pc = pc.replace(/handleFilterChange = useCallback\(\(key: any, value: any\)/g, "handleFilterChange = useCallback((key: string, value: string)");
  pc = pc.replace(/onChange=\{\(value: any\)/g, "onChange={(value: string)");

  pc = pc.replace(/onRowMouseEnter=\{\(row: any\)/g, "onRowMouseEnter={(row: Record<string, any>)");
  pc = pc.replace(/getRowClassName=\{\(row: any\)/g, "getRowClassName={(row: Record<string, any>)");
  pc = pc.replace(/onRowClick=\{async \(req: any\)/g, "onRowClick={async (req: Record<string, any>)");

  pc = pc.replace(/\(associations as any\)\?/g, "(associations as Record<string, any>)?");
  pc = pc.replace(/\{associations.conversations.map\(\(c: any\)/g, "{associations?.conversations?.map((c: Record<string, any>)");
  pc = pc.replace(/\{associations.workflows.map\(\(w: any\)/g, "{associations?.workflows?.map((w: Record<string, any>)");
  pc = pc.replace(/\{associations.sessions.map\(\(s: any\)/g, "{associations?.sessions?.map((s: Record<string, any>)");

  pc = pc.replace(/mediaAssets\.map\(\(asset: any, index: any\)/g, "mediaAssets.map((asset: Record<string, any>, index: number)");

  fs.writeFileSync(file, pc);
  console.log("Updated requests page");
}

fixRequests();
