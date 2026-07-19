import { describe, it, expect } from "vitest";

import type { ToolSchema as ToolOption, PrismConfig as FilteredConfig } from "../../types/types";
import { buildAcceptFilter, classifyIntakeFile } from "../fileIntake";

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

/**
 * Mirrors the component-level gate in AgentChatComponent: classify via
 * the shared util, then reject files whose modality the active model
 * does not support.
 */
function classifyFileModality(
  fileName: string,
  mimeType: string,
  supportedInputModalities: Set<string>
): string | null {
  const classification = classifyIntakeFile(fileName, mimeType);
  if (!classification || !supportedInputModalities.has(classification.modality)) {
    return null;
  }
  return classification.modality;
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
    const filter = buildAcceptFilter(modalities);

    expect(filter).toContain("image/*");
    expect(filter).toContain(".pdf,application/pdf");
    expect(filter).toContain(".docx,.doc,.xlsx,.xls,.csv,.tsv");
    // Text/code widening + explicit image extensions
    expect(filter.split(",")).toContain(".py");
    expect(filter.split(",")).toContain(".svg");
    expect(filter).toContain("text/plain");
    expect(filter).not.toContain("audio/*");
    expect(filter).not.toContain("video/*");
  });

  it("classifies file MIME types correctly only when the corresponding modality is supported", () => {
    const supportedModalities = new Set(["audio", "pdf"]);

    // Supported
    expect(classifyFileModality("song.mp3", "audio/mpeg", supportedModalities)).toBe("audio");
    expect(classifyFileModality("paper.pdf", "application/pdf", supportedModalities)).toBe("pdf");

    // Unsupported because not in the set
    expect(classifyFileModality("photo.png", "image/png", supportedModalities)).toBeNull();
    expect(classifyFileModality("table.csv", "text/csv", supportedModalities)).toBeNull();
  });

  it("gates extension-fallback classification on the supported set too", () => {
    // .py falls back to the document modality — only allowed when the
    // model supports documents.
    expect(classifyFileModality("main.py", "", new Set(["document"]))).toBe("document");
    expect(classifyFileModality("main.py", "", new Set(["image"]))).toBeNull();
    // .svg falls back to image even with a generic MIME
    expect(
      classifyFileModality("logo.svg", "application/octet-stream", new Set(["image"]))
    ).toBe("image");
  });
});
