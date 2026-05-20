const fs = require("fs");

function fixProviders() {
  const file = "src/app/admin/providers/page.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  pc = pc.replace(/setError\(error\.message\);/g, "setError(error instanceof Error ? error.message : String(error));");
  pc = pc.replace(/const providers = Object\.values\(map\)/g, "const providers = Object.values(map) as Record<string, any>[]");
  pc = pc.replace(/\[modelName, modelData\]/g, "[modelName, modelData]: [string, any]");
  fs.writeFileSync(file, pc);
  console.log("Updated providers");
}

function fixRequests() {
  const file = "src/app/admin/requests/page.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");
  
  pc = pc.replace(/const \[fadingIds, setFadingIds\] = useState\(new Set\(\)\);/g, "const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());");
  pc = pc.replace(/const \[justNowIds, setJustNowIds\] = useState\(new Set\(\)\);/g, "const [justNowIds, setJustNowIds] = useState<Set<string>>(new Set());");
  
  pc = pc.replace(/setError\(error\.message\);/g, "setError(error instanceof Error ? error.message : String(error));");
  pc = pc.replace(/setFilters\(\(prev\) =>/g, "setFilters((prev: Record<string, string>) =>");
  pc = pc.replace(/associations\.sessions\.map\(\(s: Set<string>\) =>/g, "associations?.sessions?.map((s: Record<string, any>) =>");
  
  fs.writeFileSync(file, pc);
  console.log("Updated requests");
}

fixProviders();
fixRequests();
