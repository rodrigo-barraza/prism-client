const fs = require("fs");

function fixModels() {
  const file = "src/components/ModelsTableComponent.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  // Fix generic states and properties
  pc = pc.replace(/_benchStat\?: any;/g, "_benchStat?: Record<string, any>;");
  pc = pc.replace(/models\?: any\[\];/g, "models?: Record<string, any>[];");
  pc = pc.replace(/sortValue\?: \(row: any\) => any;/g, "sortValue?: (row: Record<string, any>) => number | string;");
  pc = pc.replace(/render\?: \(row: any\) => React\.ReactNode;/g, "render?: (row: Record<string, any>) => React.ReactNode;");

  // Fix maps and callbacks
  pc = pc.replace(/\(row: any\)/g, "(row: Record<string, any>)");
  pc = pc.replace(/\(e: any\)/g, "(e: React.MouseEvent)");
  pc = pc.replace(/\(s: any, m: any\)/g, "(s: number, m: Record<string, any>)");
  pc = pc.replace(/\(m: any, i: any\)/g, "(m: Record<string, any>, i: number)");

  // Fix casts
  pc = pc.replace(/\(MODALITY_ICONS as any\)/g, "(MODALITY_ICONS as Record<string, any>)");
  pc = pc.replace(/\(MODALITY_COLORS as any\)/g, "(MODALITY_COLORS as Record<string, any>)");

  fs.writeFileSync(file, pc);
  console.log("Updated ModelsTableComponent");
}

fixModels();
