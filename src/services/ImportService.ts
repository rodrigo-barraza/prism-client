import { HTTP_METHODS } from "@/constants";
import PrismService from "./PrismService";
import type {
  ClaudeConfigImportSummary,
  PluginImportSource,
  PluginImportSummary,
} from "../types/imports";

/**
 * Client for prism-service's importers: Claude Code config from a
 * workspace folder, and Agent Plugins from a zip or a workspace folder.
 * Every call can be a dry run — the preview the Import panel shows before
 * anything is written.
 */
export default class ImportService {
  static claudeConfig(
    workspacePath: string,
    { dryRun }: { dryRun: boolean },
  ): Promise<ClaudeConfigImportSummary> {
    return PrismService._request<ClaudeConfigImportSummary>("/claude-config-import", {
      method: HTTP_METHODS.POST,
      body: { workspacePath, dryRun },
    });
  }

  static plugin(
    source: PluginImportSource,
    { dryRun }: { dryRun: boolean },
  ): Promise<PluginImportSummary> {
    return PrismService._request<PluginImportSummary>("/plugins/import", {
      method: HTTP_METHODS.POST,
      body: { ...source, dryRun },
    });
  }
}

/** A file's bytes as base64, in chunks (String.fromCharCode has an arity limit). */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
