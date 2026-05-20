const fs = require("fs");

function fixAgentComponent() {
  const file = "src/components/AgentComponent.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  // Fix generic states
  pc = pc.replace(/useState<any\[\]>\(\[\]\)/g, "useState<Record<string, any>[]>([])");
  pc = pc.replace(/useState<any>\(null\)/g, "useState<Record<string, any> | null>(null)");
  pc = pc.replace(/useState<any>\(\{\}\)/g, "useState<Record<string, any>>({})");
  pc = pc.replace(/useState<any>\(false\)/g, "useState<boolean>(false)");
  pc = pc.replace(/useState<any>\(0\)/g, "useState<number>(0)");
  pc = pc.replace(/useState<any>\(""\)/g, "useState<string>(\"\")");

  // Fix refs
  pc = pc.replace(/useRef<any>\(0\)/g, "useRef<number>(0)");
  pc = pc.replace(/useRef<any>\(null\)/g, "useRef<any>(null)"); // Leave null refs for now unless we know the DOM element

  // Fix maps and callbacks
  pc = pc.replace(/\(prev: any\)/g, "(prev)");
  pc = pc.replace(/\(msg: any\)/g, "(msg: Record<string, any>)");
  pc = pc.replace(/\(item: any\)/g, "(item: Record<string, any>)");
  pc = pc.replace(/\(v: any\)/g, "(v: Record<string, any>)");
  pc = pc.replace(/\(c: any\)/g, "(c: Record<string, any>)");
  pc = pc.replace(/\(w: any\)/g, "(w: Record<string, any>)");
  pc = pc.replace(/\(m: any\)/g, "(m: Record<string, any>)");
  pc = pc.replace(/\(f: any\)/g, "(f: Record<string, any>)");
  pc = pc.replace(/\(x: any\)/g, "(x: Record<string, any>)");

  // Specific common args
  pc = pc.replace(/\(tabKey: any\)/g, "(tabKey: string)");
  pc = pc.replace(/\(targetTab: any/g, "(targetTab: string");
  pc = pc.replace(/\(key: any\)/g, "(key: string)");
  
  // Specific catch blocks
  pc = pc.replace(/catch \(err: any\)/g, "catch (err: unknown)");
  pc = pc.replace(/catch \(e: any\)/g, "catch (e: unknown)");
  pc = pc.replace(/catch \(error: any\)/g, "catch (error: unknown)");

  fs.writeFileSync(file, pc);
  console.log("Updated AgentComponent");
}

function fixFile(file) {
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  // Fix generic states
  pc = pc.replace(/useState<any\[\]>\(\[\]\)/g, "useState<Record<string, any>[]>([])");
  pc = pc.replace(/useState<any>\(null\)/g, "useState<Record<string, any> | null>(null)");
  pc = pc.replace(/useState<any>\(\{\}\)/g, "useState<Record<string, any>>({})");
  pc = pc.replace(/useState<any>\(false\)/g, "useState<boolean>(false)");
  pc = pc.replace(/useState<any>\(0\)/g, "useState<number>(0)");
  pc = pc.replace(/useState<any>\(""\)/g, "useState<string>(\"\")");

  // Fix refs
  pc = pc.replace(/useRef<any>\(0\)/g, "useRef<number>(0)");

  // Fix maps and callbacks
  pc = pc.replace(/\(prev: any\)/g, "(prev)");
  pc = pc.replace(/\(msg: any\)/g, "(msg: Record<string, any>)");
  pc = pc.replace(/\(item: any\)/g, "(item: Record<string, any>)");
  pc = pc.replace(/\(v: any\)/g, "(v: Record<string, any>)");
  pc = pc.replace(/\(c: any\)/g, "(c: Record<string, any>)");
  pc = pc.replace(/\(w: any\)/g, "(w: Record<string, any>)");
  pc = pc.replace(/\(m: any\)/g, "(m: Record<string, any>)");
  pc = pc.replace(/\(n: any\)/g, "(n: Record<string, any>)");
  pc = pc.replace(/\(e: any\)/g, "(e: Record<string, any>)");
  pc = pc.replace(/\(f: any\)/g, "(f: Record<string, any>)");
  pc = pc.replace(/\(x: any\)/g, "(x: Record<string, any>)");

  // Specific catch blocks
  pc = pc.replace(/catch \(err: any\)/g, "catch (err: unknown)");
  pc = pc.replace(/catch \(e: any\)/g, "catch (e: unknown)");
  pc = pc.replace(/catch \(error: any\)/g, "catch (error: unknown)");

  fs.writeFileSync(file, pc);
  console.log("Updated", file);
}

fixAgentComponent();
fixFile("src/components/BenchmarkDetailPageComponent.tsx");
fixFile("src/app/workflows/page.tsx");
fixFile("src/components/VramBenchmarkComponent.tsx");
fixFile("src/components/WorkflowCanvasComponent.tsx");

