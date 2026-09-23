"use client";

/**
 * What the composer can attach: the modalities the model takes (its declared
 * input types) or an enabled tool takes (a PDF reader, a transcriber), plus
 * text and code files, which the service inlines for every provider.
 */

import { useMemo } from "react";
import { buildAcceptFilter } from "../utils/fileIntake";
import type { ModelOption, PrismConfig, ToolSchema } from "../types/types";

const MODALITY_PLURAL_LABELS: Record<string, string> = {
  image: "images",
  audio: "audio",
  video: "video",
  pdf: "PDFs",
  document: "documents",
};

export type UploadType = "image" | "audio" | "video" | "pdf" | "document";

export interface AttachmentPolicy {
  supportedInputModalities: ReadonlySet<string>;
  /** "images, PDFs, text/code files" — the file picker's label, the drop overlay's. */
  attachmentKindsLabel: string;
  /** The upload types the picker button shows; empty or one means a plain paperclip. */
  activeUploadTypes: UploadType[];
  /** The file input's `accept`. */
  acceptFilter: string;
}

export default function useAttachmentPolicy({
  config,
  provider,
  model,
  builtInTools,
  disabledTools,
}: {
  config: PrismConfig | null;
  provider: string | undefined;
  model: string | undefined;
  builtInTools: ToolSchema[];
  disabledTools: ReadonlySet<string>;
}): AttachmentPolicy {
  // -- Model + tool capability detection -------------------------
  const supportedInputModalities = useMemo(() => {
    const modalities = new Set<string>();
    // Model-level image support (vision models)
    if (config) {
      const models = config.textToText?.models?.[provider ?? ""] || [];
      const modelDef = models.find(
        (candidate: ModelOption) => candidate.name === model,
      ) as (ModelOption & { inputTypes?: string[] }) | undefined;
      // Honor every attachment-capable modality the model declares —
      // e.g. Gemini models list audio/video/pdf alongside image.
      // ("text" is not an attachment modality; office documents stay
      // tool-gated via inputModalities below.)
      for (const inputType of modelDef?.inputTypes ?? []) {
        if (["image", "audio", "video", "pdf"].includes(inputType)) {
          modalities.add(inputType);
        }
      }
    }
    // Tool-level modality support (from enabled tools)
    for (const tool of builtInTools) {
      if (disabledTools.has(tool.name)) continue;
      for (const modality of tool.inputModalities || []) {
        modalities.add(modality);
      }
    }
    return modalities;
  }, [config, provider, model, builtInTools, disabledTools]);

  return useMemo(() => {
    // Human-readable list of what can currently be attached — the
    // modality labels plus the always-supported text/code files.
    const attachmentKindsLabel = [
      ...[...supportedInputModalities].map((modality) => MODALITY_PLURAL_LABELS[modality] || modality),
      "text/code files",
    ].join(", ");
    const modalityToUploadType: Record<string, UploadType> = {
      image: "image",
      audio: "audio",
      video: "video",
      pdf: "pdf",
      document: "document",
    };
    const activeUploadTypes = [...supportedInputModalities]
      .map((modality) => modalityToUploadType[modality])
      .filter(Boolean);
    return {
      supportedInputModalities,
      attachmentKindsLabel,
      activeUploadTypes,
      acceptFilter: buildAcceptFilter(supportedInputModalities),
    };
  }, [supportedInputModalities]);
}
