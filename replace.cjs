const fs = require("fs");
const path = require("path");

const pagePath = "src/app/admin/tool-requests/page.tsx";
const colsPath = "src/app/admin/tool-requests/toolRequestsColumns.tsx";

const typeDef = `
export interface ToolCallRecord {
  _id?: string;
  toolName?: string;
  domain?: string;
  method?: string;
  path?: string;
  status?: number;
  success?: boolean;
  errorMessage?: string;
  elapsedMs?: number;
  inBytes?: number;
  outBytes?: number;
  callerProject?: string;
  callerUsername?: string;
  callerAgent?: string;
  callerRequestId?: string;
  callerConversationId?: string;
  callerIteration?: number;
  clientIp?: string;
  timestamp?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
}
`;

// Update Columns
let colsContent = fs.readFileSync(colsPath, "utf8");
colsContent = colsContent.replace("import { formatLatencyMs, formatFileSize } from \"../../../utils/utilities\";", "import { formatLatencyMs, formatFileSize } from \"../../../utils/utilities\";\n\n" + typeDef);
colsContent = colsContent.replace(/\(\{ totalDuration = 1 \}: any = \{\}\)/g, "({ totalDuration = 1 }: { totalDuration?: number } = {})");
colsContent = colsContent.replace(/\(r: any\)/g, "(r: ToolCallRecord)");
fs.writeFileSync(colsPath, colsContent);

// Update Page
let pageContent = fs.readFileSync(pagePath, "utf8");
pageContent = pageContent.replace("import { getToolRequestsColumns } from \"./toolRequestsColumns\";", "import { getToolRequestsColumns, ToolCallRecord } from \"./toolRequestsColumns\";");

pageContent = pageContent.replace(/useState<any\[\]>\(\[\]\)/g, "useState<ToolCallRecord[]>([])");
pageContent = pageContent.replace(/useState<any>\(null\)/g, "useState<ToolCallRecord | null>(null)");
pageContent = pageContent.replace(/\] = useState\(null\);/g, "] = useState<ToolCallRecord | null>(null);");

pageContent = pageContent.replace(/\(\[k, v\]: any\)/g, "([k, v])");
pageContent = pageContent.replace(/\(params as any\)\[k\] = v;/g, "(params as Record<string, unknown>)[k] = v;");
pageContent = pageContent.replace(/\(dateParams as any\)\.since/g, "(dateParams as Record<string, string>).since");
pageContent = pageContent.replace(/\(params as any\)\.since/g, "(params as Record<string, unknown>).since");
pageContent = pageContent.replace(/\(dateParams as any\)\.until/g, "(dateParams as Record<string, string>).until");
pageContent = pageContent.replace(/\(params as any\)\.until/g, "(params as Record<string, unknown>).until");
pageContent = pageContent.replace(/catch \(error: any\)/g, "catch (error: unknown)");
pageContent = pageContent.replace(/setError\(error\.message\);/g, "setError(error instanceof Error ? error.message : String(error));");

pageContent = pageContent.replace(/handleSort\(key: any, dir: any\)/g, "handleSort(key: string, dir: \"asc\" | \"desc\" | string)");
pageContent = pageContent.replace(/handleFilterChange = useCallback\(\(key: any, value: any\)/g, "handleFilterChange = useCallback((key: string, value: string)");
pageContent = pageContent.replace(/setFilters\(\(prev: any\)/g, "setFilters((prev)");

pageContent = pageContent.replace(/\(sum: any, tc: any\)/g, "(sum: number, tc: ToolCallRecord)");
pageContent = pageContent.replace(/\(tc: any\)/g, "(tc: ToolCallRecord)");
pageContent = pageContent.replace(/\(tc: any, i: any\)/g, "(tc: ToolCallRecord, i: number)");

pageContent = pageContent.replace(/\(selectedCall as any\)/g, "selectedCall");
pageContent = pageContent.replace(/value: any/g, "value: string");

fs.writeFileSync(pagePath, pageContent);
console.log("Updated tool-requests");
