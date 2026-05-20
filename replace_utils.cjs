const fs = require("fs");

function fixRequestDetailHelpers() {
  const file = "src/utils/requestDetailHelpers.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  pc = pc.replace(/export function extractMediaAssets\(object: any\)/g, "export function extractMediaAssets(object: Record<string, any>)");
  pc = pc.replace(/const assets: any\[\] = \[\];/g, "const assets: Record<string, any>[] = [];");
  pc = pc.replace(/const search = \(node: any, origin: any\) =>/g, "const search = (node: Record<string, any> | Record<string, any>[], origin: string) =>");
  pc = pc.replace(/\(n: any\)/g, "(n: Record<string, any>)");
  pc = pc.replace(/export function getMediaTypeFromRef\(ref: any\)/g, "export function getMediaTypeFromRef(ref: string)");
  pc = pc.replace(/export function buildRequestDetailSections\(req: any\)/g, "export function buildRequestDetailSections(req: Record<string, any>)");
  pc = pc.replace(/export function reconstructChatMessages\(selectedRequest: any\)/g, "export function reconstructChatMessages(selectedRequest: Record<string, any>)");
  pc = pc.replace(/\(p: any\)/g, "(p: Record<string, any>)");
  pc = pc.replace(/\(tc: any\)/g, "(tc: Record<string, any>)");
  pc = pc.replace(/\(assistantMsg as any\)/g, "(assistantMsg as Record<string, any>)");
  pc = pc.replace(/\(m: any\)/g, "(m: Record<string, any>)");

  fs.writeFileSync(file, pc);
  console.log("Updated requestDetailHelpers");
}

function fixMentionUtils() {
  const file = "src/utils/mentionUtils.ts";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  pc = pc.replace(/export function serializeEditable\(element: any\)/g, "export function serializeEditable(element: HTMLElement)");
  pc = pc.replace(/export function flattenTree\(nodes: any, prefix = ""\): any\[\]/g, "export function flattenTree(nodes: Record<string, any>[], prefix = \"\"): Record<string, any>[]");
  pc = pc.replace(/export function detectMentionToken\(text: any, cursorOffset: any\)/g, "export function detectMentionToken(text: string, cursorOffset: number)");
  pc = pc.replace(/export function filterMentionResults\(entries: any, query: any, limit = 20\)/g, "export function filterMentionResults(entries: Record<string, any>[], query: string, limit = 20)");
  pc = pc.replace(/\(e: any\)/g, "(e: Record<string, any>)");
  pc = pc.replace(/export function parseMentionTokens\(text: any\)/g, "export function parseMentionTokens(text: string)");
  pc = pc.replace(/\(segment as any\)/g, "(segment as Record<string, any>)");
  pc = pc.replace(/export function createMentionBadge\(path: any, name: any, type: any, opts = \{\}\)/g, "export function createMentionBadge(path: string, name: string, type: string, opts: Record<string, any> = {})");
  pc = pc.replace(/\(opts as any\)/g, "(opts as Record<string, any>)");
  pc = pc.replace(/badge: any,/g, "badge: HTMLElement,");
  pc = pc.replace(/cursorOffset: any,/g, "cursorOffset: number,");
  pc = pc.replace(/anchorOffset: any,/g, "anchorOffset: number,");

  fs.writeFileSync(file, pc);
  console.log("Updated mentionUtils");
}

fixRequestDetailHelpers();
fixMentionUtils();
