const fs = require("fs");

function fixRequestDetailHelpers() {
  const file = "src/utils/requestDetailHelpers.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  pc = pc.replace(/export function buildRequestDetailSections\(req: Record<string, any>\)/g, "export function buildRequestDetailSections(req: Record<string, any> | null)");
  pc = pc.replace(/const search = \(node: Record<string, any> \| Record<string, any>\[\], origin: string\) =>/g, "const search = (node: string | Record<string, any> | Record<string, any>[], origin: string) =>");
  pc = pc.replace(/node\.startsWith/g, "(typeof node === \"string\" && node.startsWith)");
  pc = pc.replace(/node\.split/g, "(node as string).split");
  pc = pc.replace(/includes\(ext\)/g, "includes(ext as string)");

  fs.writeFileSync(file, pc);
  console.log("Updated requestDetailHelpers");
}

function fixMentionUtils() {
  const file = "src/utils/mentionUtils.ts";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  pc = pc.replace(/export function serializeEditable\(element: HTMLElement\)/g, "export function serializeEditable(element: Node)");
  pc = pc.replace(/node\.dataset/g, "(node as HTMLElement).dataset");
  pc = pc.replace(/node\.tagName/g, "(node as HTMLElement).tagName");
  pc = pc.replace(/export function filterMentionResults\(entries: Record<string, any>\[\], query: string, limit = 20\)/g, "export function filterMentionResults(entries: Record<string, any>[] | null, query: string, limit = 20)");
  pc = pc.replace(/export function createMentionBadge\(path: string, name: string, type: string, opts: Record<string, any> = \{\}\)/g, "export function createMentionBadge(path: string, name: string, type: string | undefined, opts: Record<string, any> = {})");

  fs.writeFileSync(file, pc);
  console.log("Updated mentionUtils");
}

fixRequestDetailHelpers();
fixMentionUtils();
