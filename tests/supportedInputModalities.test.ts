import { describe, it, expect } from "vitest";

import type { ModelOption, ToolSchema as ToolOption, PrismConfig as FilteredConfig } from "../src/types/types";

function computeSupportedInputModalities(
  filteredConfig: Partial<FilteredConfig> | null,
  provider: string,
  modelName: string,
  builtInTools: Partial<ToolOption>[],
  disabledTools: Set<string>
): Set<string> {
  const modalities = new Set<string>();

  // Model-level image support (vision models)
  if (filteredConfig) {
    const models = filteredConfig.textToText?.models?.[provider] || [];
    const modelDefinition = models.find((model) => model.name === modelName);
    if (modelDefinition?.inputTypes?.includes("image")) {
      modalities.add("image");
    }
  }

  // Tool-level modality support (from enabled tools)
  for (const tool of builtInTools) {
    if (!tool.name || disabledTools.has(tool.name)) {
      continue;
    }
    for (const modality of tool.inputModalities || []) {
      modalities.add(modality);
    }
  }

  return modalities;
}

function computeAcceptFilter(supportedInputModalities: Set<string>): string {
  const filters: string[] = [];
  if (supportedInputModalities.has("image")) {
    filters.push("image/*");
  }
  if (supportedInputModalities.has("audio")) {
    filters.push("audio/*");
  }
  if (supportedInputModalities.has("video")) {
    filters.push("video/*");
  }
  if (supportedInputModalities.has("pdf")) {
    filters.push(".pdf,application/pdf");
  }
  if (supportedInputModalities.has("document")) {
    filters.push(
      ".docx,.doc,.xlsx,.xls,.csv,.tsv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
    );
  }
  return filters.join(",");
}

function classifyFileModality(mimeType: string, supportedInputModalities: Set<string>): string | null {
  if (mimeType.startsWith("image/") && supportedInputModalities.has("image")) {
    return "image";
  }
  if (mimeType.startsWith("audio/") && supportedInputModalities.has("audio")) {
    return "audio";
  }
  if (mimeType.startsWith("video/") && supportedInputModalities.has("video")) {
    return "video";
  }
  if (mimeType === "application/pdf" && supportedInputModalities.has("pdf")) {
    return "pdf";
  }

  const documentMimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "text/tab-separated-values",
  ];
  if (documentMimeTypes.includes(mimeType) && supportedInputModalities.has("document")) {
    return "document";
  }

  return null;
}

describe("Client-side Input Modalities logic", () => {
  const mockConfig = {
    textToText: {
      models: {
        google: [
          { name: "gemini-3.5-flash", inputTypes: ["text", "image"] },
          { name: "gemini-text-only", inputTypes: ["text"] },
        ],
      },
    },
  } as unknown as FilteredConfig;

  const mockTools: Partial<ToolOption>[] = [
    { name: "generate_image", inputModalities: ["image"] },
    { name: "speech_to_text", inputModalities: ["audio"] },
    { name: "read_pdf", inputModalities: ["pdf"] },
    { name: "read_spreadsheet", inputModalities: ["document"] },
  ];

  it("derives image modality from vision-capable model definition", () => {
    const modalities = computeSupportedInputModalities(
      mockConfig,
      "google",
      "gemini-3.5-flash",
      [],
      new Set()
    );

    expect(modalities.has("image")).toBe(true);
    expect(modalities.has("audio")).toBe(false);
  });

  it("derives modalities from enabled tools", () => {
    const disabledTools = new Set<string>(["speech_to_text"]);
    const modalities = computeSupportedInputModalities(
      mockConfig,
      "google",
      "gemini-text-only",
      mockTools,
      disabledTools
    );

    // Should contain image (from generate_image tool), pdf (from read_pdf), document (from read_spreadsheet)
    expect(modalities.has("image")).toBe(true);
    expect(modalities.has("pdf")).toBe(true);
    expect(modalities.has("document")).toBe(true);

    // Should NOT contain audio because speech_to_text is disabled
    expect(modalities.has("audio")).toBe(false);
  });

  it("correctly computes file picker accept filters based on modalities", () => {
    const modalities = new Set(["image", "pdf", "document"]);
    const filter = computeAcceptFilter(modalities);

    expect(filter).toContain("image/*");
    expect(filter).toContain(".pdf,application/pdf");
    expect(filter).toContain(".docx,.doc,.xlsx,.xls,.csv,.tsv");
    expect(filter).not.toContain("audio/*");
    expect(filter).not.toContain("video/*");
  });

  it("classifies file MIME types correctly only when the corresponding modality is supported", () => {
    const supportedModalities = new Set(["audio", "pdf"]);

    // Supported
    expect(classifyFileModality("audio/mpeg", supportedModalities)).toBe("audio");
    expect(classifyFileModality("application/pdf", supportedModalities)).toBe("pdf");

    // Unsupported because not in the set
    expect(classifyFileModality("image/png", supportedModalities)).toBeNull();
    expect(classifyFileModality("text/csv", supportedModalities)).toBeNull();
  });
});
