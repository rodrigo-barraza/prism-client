const fs = require("fs");

function fixConversations() {
  const file = "src/app/admin/conversations/page.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  // Fix generic states
  pc = pc.replace(/useState<any\[\]>\(\[\]\)/g, "useState<Record<string, any>[]>([])");
  pc = pc.replace(/useState<any>\(null\)/g, "useState<Record<string, any> | null>(null)");
  pc = pc.replace(/useState<any>\(initialId\)/g, "useState<string | null>(initialId)");
  pc = pc.replace(/useState<any>\(new Set\(\)\)/g, "useState<Set<string>>(new Set())");

  // Fix refs
  pc = pc.replace(/useRef<any>\(1\)/g, "useRef<number>(1)");
  pc = pc.replace(/useRef<any>\(0\)/g, "useRef<number>(0)");
  pc = pc.replace(/useRef<any>\(null\)/g, "useRef<any>(null)"); // Leave null refs for now unless we know the DOM element
  pc = pc.replace(/useRef<any>\(""\)/g, "useRef<string>(\"\")");
  pc = pc.replace(/useRef<any>\(!!initialId\)/g, "useRef<boolean>(!!initialId)");

  // Fix maps and callbacks
  pc = pc.replace(/\(prev: any\)/g, "(prev)");
  pc = pc.replace(/\(key: any\)/g, "(key: string)");
  pc = pc.replace(/\(k: any\)/g, "(k: string)");
  pc = pc.replace(/\(favs: any\)/g, "(favs: Record<string, any>[])");
  pc = pc.replace(/\(f: any\)/g, "(f: Record<string, any>)");
  pc = pc.replace(/\(params as any\)\.trace/g, "(params as Record<string, any>).trace");
  pc = pc.replace(/\(params as any\)\.project/g, "(params as Record<string, any>).project");
  pc = pc.replace(/\(params as any\)\.provider/g, "(params as Record<string, any>).provider");
  pc = pc.replace(/\(params as any\)\.model/g, "(params as Record<string, any>).model");
  pc = pc.replace(/\(c: any\)/g, "(c: Record<string, any>)");
  pc = pc.replace(/\(id: any\)/g, "(id: string)");
  
  pc = pc.replace(/\(knownIdsRef\.current as any\)/g, "(knownIdsRef.current as Set<string>)");

  pc = pc.replace(/catch \(error: any\)/g, "catch (error: unknown)");

  pc = pc.replace(/\.then\(\(data: any\) =>/g, ".then((data: Record<string, any>) =>");
  pc = pc.replace(/const onEvent = \(event: any\) =>/g, "const onEvent = (event: Record<string, any>) =>");
  pc = pc.replace(/onStatus: \(data: any\) =>/g, "onStatus: (data: Record<string, any>) =>");
  pc = pc.replace(/onChange: \(event: any\) =>/g, "onChange: (event: Record<string, any>) =>");

  pc = pc.replace(/\(element as any\)/g, "(element as HTMLElement)");

  pc = pc.replace(/\(selectedConv as any\)/g, "(selectedConv as Record<string, any>)");
  pc = pc.replace(/\(conversation: any\)/g, "(conversation: Record<string, any>)");

  pc = pc.replace(/props: any/g, "props: { searchParams?: Record<string, string>; params?: Record<string, string> }");
  pc = pc.replace(/\{ initialId = null, traceId = null \}: any/g, "{ initialId = null, traceId = null }: { initialId?: string | null; traceId?: string | null }");

  fs.writeFileSync(file, pc);
  console.log("Updated conversations");
}

fixConversations();
