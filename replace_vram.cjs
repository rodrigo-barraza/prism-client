const fs = require("fs");

function fixVram() {
  const file = "src/components/VramBenchmarkComponent.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  // generic types
  pc = pc.replace(/\(d: any\)/g, "(d: Record<string, any>)");
  pc = pc.replace(/\(p: any\)/g, "(p: Record<string, any>)");
  pc = pc.replace(/\(m: any\)/g, "(m: Record<string, any>)");
  pc = pc.replace(/\[q, items\]: any/g, "[q, items]");
  pc = pc.replace(/\(raw: any\)/g, "(raw: Record<string, any>)");
  pc = pc.replace(/\(di: any, chart: any\)/g, "(di: Record<string, any>, chart: Record<string, any>)");
  pc = pc.replace(/\(v: any\)/g, "(v: number | string)");
  pc = pc.replace(/\(gib: any/g, "(gib: number");
  pc = pc.replace(/\(e: any\)/g, "(e: React.MouseEvent)");
  pc = pc.replace(/\(key: any\)/g, "(key: string)");
  pc = pc.replace(/\(val: any\)/g, "(val: number)");

  // Type casts
  pc = pc.replace(/\(m\.gpu as any\)/g, "(m.gpu as Record<string, any>)");
  pc = pc.replace(/\(currentChart\.options\.scales\?\.x as any\)/g, "(currentChart.options.scales?.x as Record<string, any>)");
  pc = pc.replace(/\(currentChart\.options\.scales!\.x as any\)/g, "(currentChart.options.scales!.x as Record<string, any>)");
  pc = pc.replace(/\(currentChart\.options\.scales\?\.y as any\)/g, "(currentChart.options.scales?.y as Record<string, any>)");
  pc = pc.replace(/\(currentChart\.options\.scales!\.y as any\)/g, "(currentChart.options.scales!.y as Record<string, any>)");

  fs.writeFileSync(file, pc);
  console.log("Updated Vram");
}

fixVram();
