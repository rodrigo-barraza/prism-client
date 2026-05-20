const fs = require("fs");

function fixProviders() {
  const file = "src/app/admin/providers/page.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  // Fix generic states
  pc = pc.replace(/useState<any\[\]>\(\[\]\)/g, "useState<Record<string, any>[]>([])");
  pc = pc.replace(/useState<any>\(\{\}\)/g, "useState<Record<string, any>>({})");

  // Fix params cast
  pc = pc.replace(/\(params as any\)\.project/g, "(params as Record<string, any>).project");
  
  // Fix catch
  pc = pc.replace(/catch \(error: any\)/g, "catch (error: unknown)");

  // Fix Maps / callbacks
  pc = pc.replace(/\(m: any\)/g, "(m: Record<string, any>)");
  pc = pc.replace(/\(map as any\)/g, "(map as Record<string, any>)");
  pc = pc.replace(/\(p: any\)/g, "(p: Record<string, any>)");
  pc = pc.replace(/\(p: any, i: any\)/g, "(p: Record<string, any>, i: number)");
  pc = pc.replace(/\(a: any, b: any\)/g, "(a: Record<string, any>, b: Record<string, any>)");
  pc = pc.replace(/\(s: any, p: any\)/g, "(s: number, p: Record<string, any>)");
  pc = pc.replace(/\(m: any, i: any\)/g, "(m: Record<string, any>, i: number)");
  
  // Fix props
  pc = pc.replace(/\{ data \}: any/g, "{ data }: { data: Record<string, any> }");
  pc = pc.replace(/\[modelName, modelData\]: any/g, "[modelName, modelData]");
  pc = pc.replace(/\{ modelName, modelData, dynamic \}: any/g, "{ modelName, modelData, dynamic }: { modelName: string; modelData: Record<string, any>; dynamic?: boolean }");
  pc = pc.replace(/\{ label, remaining, limit, reset \}: any/g, "{ label, remaining, limit, reset }: { label: string; remaining: number; limit: number; reset?: string }");
  pc = pc.replace(/\{ label, value \}: any/g, "{ label, value }: { label: string; value: React.ReactNode }");
  
  // rate limits casting
  pc = pc.replace(/\(rateLimits as any\)/g, "(rateLimits as Record<string, any>)");

  fs.writeFileSync(file, pc);
  console.log("Updated providers");
}

fixProviders();
