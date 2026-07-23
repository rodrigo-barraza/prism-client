import { describe, it, expect } from "vitest";

import {
  EXTENSION_FALLBACK_TABLE,
  IMAGE_DOWNSCALE_TRIGGER_BYTES,
  buildAcceptFilter,
  classifyIntakeFile,
  classifyMimeType,
  downscaleImageForAttachment,
  getFileExtension,
  getTextualFileKind,
  isGenericMimeType,
  normalizeDataUrlMimeType,
  shouldDownscaleImage,
} from "../fileIntake";

describe("fileIntake", () => {
  describe("isGenericMimeType", () => {
    it("treats empty and octet-stream as generic", () => {
      expect(isGenericMimeType("")).toBe(true);
      expect(isGenericMimeType("application/octet-stream")).toBe(true);
      expect(isGenericMimeType("text/plain")).toBe(false);
      expect(isGenericMimeType("image/png")).toBe(false);
    });
  });

  describe("getFileExtension", () => {
    it("returns the lower-cased last suffix", () => {
      expect(getFileExtension("Notes.TXT")).toBe("txt");
      expect(getFileExtension("archive.tar.gz")).toBe("gz");
    });

    it("recognizes the compound .env.example extension", () => {
      expect(getFileExtension(".env.example")).toBe("env.example");
      expect(getFileExtension("backend.env.example")).toBe("env.example");
    });

    it("returns null for extensionless and dotfile names", () => {
      expect(getFileExtension("Makefile")).toBeNull();
      expect(getFileExtension(".gitignore")).toBeNull();
      expect(getFileExtension("trailing.")).toBeNull();
    });
  });

  describe("classifyMimeType", () => {
    it("maps recognized MIME types to modalities", () => {
      expect(classifyMimeType("image/png")).toBe("image");
      expect(classifyMimeType("audio/mpeg")).toBe("audio");
      expect(classifyMimeType("video/mp4")).toBe("video");
      expect(classifyMimeType("application/pdf")).toBe("pdf");
      expect(classifyMimeType("text/csv")).toBe("document");
      expect(classifyMimeType("text/plain")).toBe("document");
      expect(classifyMimeType("text/markdown")).toBe("document");
      expect(classifyMimeType("application/json")).toBe("document");
    });

    it("returns null for generic and unrecognized MIME types", () => {
      expect(classifyMimeType("")).toBeNull();
      expect(classifyMimeType("application/octet-stream")).toBeNull();
      expect(classifyMimeType("text/x-python")).toBeNull();
      expect(classifyMimeType("application/x-yaml")).toBeNull();
    });
  });

  describe("classifyIntakeFile — extension fallback", () => {
    it("trusts a recognized browser MIME and keeps it", () => {
      expect(classifyIntakeFile("photo.png", "image/png")).toEqual({
        modality: "image",
        mimeType: "image/png",
      });
      expect(classifyIntakeFile("logo.svg", "image/svg+xml")).toEqual({
        modality: "image",
        mimeType: "image/svg+xml",
      });
    });

    it("falls back to the extension table for empty MIME", () => {
      expect(classifyIntakeFile("script.py", "")).toEqual({
        modality: "document",
        mimeType: "text/plain",
      });
    });

    it("falls back for application/octet-stream", () => {
      expect(
        classifyIntakeFile("config.toml", "application/octet-stream"),
      ).toEqual({ modality: "document", mimeType: "text/plain" });
    });

    it("falls back for unrecognized browser MIME types", () => {
      expect(classifyIntakeFile("script.py", "text/x-python")).toEqual({
        modality: "document",
        mimeType: "text/plain",
      });
      expect(classifyIntakeFile("deploy.yaml", "application/x-yaml")).toEqual({
        modality: "document",
        mimeType: "text/plain",
      });
    });

    it("maps svg/heic/heif extensions to the image modality", () => {
      expect(classifyIntakeFile("logo.svg", "")).toEqual({
        modality: "image",
        mimeType: "image/svg+xml",
      });
      expect(
        classifyIntakeFile("IMG_0001.HEIC", "application/octet-stream"),
      ).toEqual({ modality: "image", mimeType: "image/heic" });
      expect(classifyIntakeFile("shot.heif", "")).toEqual({
        modality: "image",
        mimeType: "image/heif",
      });
    });

    it("applies MIME overrides for markdown/json/tabular text", () => {
      expect(classifyIntakeFile("README.md", "")?.mimeType).toBe(
        "text/markdown",
      );
      expect(classifyIntakeFile("data.json", "")?.mimeType).toBe(
        "application/json",
      );
      expect(classifyIntakeFile("events.jsonl", "")?.mimeType).toBe(
        "application/json",
      );
      expect(classifyIntakeFile("table.csv", "")?.mimeType).toBe("text/csv");
      expect(classifyIntakeFile("table.tsv", "")?.mimeType).toBe(
        "text/tab-separated-values",
      );
    });

    it("classifies .env.example as a text document", () => {
      expect(classifyIntakeFile(".env.example", "")).toEqual({
        modality: "document",
        mimeType: "text/plain",
      });
    });

    it("returns null for unknown extensions with generic MIME", () => {
      expect(classifyIntakeFile("binary.bin", "")).toBeNull();
      expect(
        classifyIntakeFile("model.safetensors", "application/octet-stream"),
      ).toBeNull();
      expect(classifyIntakeFile("noextension", "")).toBeNull();
    });

    it("covers every extension required of the fallback table", () => {
      const requiredExtensions = [
        "txt", "md", "markdown", "json", "jsonl", "yaml", "yml", "xml",
        "html", "css", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rb",
        "go", "rs", "java", "kt", "c", "h", "cpp", "hpp", "cs", "sh",
        "bash", "zsh", "sql", "toml", "ini", "cfg", "conf", "env.example",
        "log", "srt", "vtt", "csv", "tsv", "svg", "heic", "heif",
      ];
      for (const extension of requiredExtensions) {
        expect(EXTENSION_FALLBACK_TABLE[extension], extension).toBeDefined();
      }
    });
  });

  describe("normalizeDataUrlMimeType", () => {
    it("rewrites octet-stream data URLs to the effective MIME", () => {
      expect(
        normalizeDataUrlMimeType(
          "data:application/octet-stream;base64,aGVsbG8=",
          "text/plain",
        ),
      ).toBe("data:text/plain;base64,aGVsbG8=");
    });

    it("rewrites empty-MIME data URLs", () => {
      expect(
        normalizeDataUrlMimeType("data:;base64,aGVsbG8=", "image/svg+xml"),
      ).toBe("data:image/svg+xml;base64,aGVsbG8=");
    });

    it("is a no-op when the header already matches", () => {
      const dataUrl = "data:text/plain;base64,aGVsbG8=";
      expect(normalizeDataUrlMimeType(dataUrl, "text/plain")).toBe(dataUrl);
    });

    it("only touches the header, never the payload", () => {
      // Payload contains a plausible-looking "data:" substring
      const payload = "ZGF0YTpvY3RldA==";
      expect(
        normalizeDataUrlMimeType(
          `data:application/octet-stream;base64,${payload}`,
          "text/plain",
        ),
      ).toBe(`data:text/plain;base64,${payload}`);
    });
  });

  describe("getTextualFileKind", () => {
    it("classifies code/config extensions as code", () => {
      expect(getTextualFileKind("main.py")).toBe("code");
      expect(getTextualFileKind("index.ts")).toBe("code");
      expect(getTextualFileKind("query.sql")).toBe("code");
      expect(getTextualFileKind("app.env.example")).toBe("code");
    });

    it("classifies plain-text extensions as text", () => {
      expect(getTextualFileKind("notes.txt")).toBe("text");
      expect(getTextualFileKind("README.md")).toBe("text");
      expect(getTextualFileKind("server.log")).toBe("text");
      expect(getTextualFileKind("subs.srt")).toBe("text");
    });

    it("returns null for non-textual files (tabular keeps spreadsheet icon)", () => {
      expect(getTextualFileKind("table.csv")).toBeNull();
      expect(getTextualFileKind("report.docx")).toBeNull();
      expect(getTextualFileKind("photo.png")).toBeNull();
      expect(getTextualFileKind("Makefile")).toBeNull();
    });
  });

  describe("buildAcceptFilter", () => {
    it("adds explicit svg/heic/heif extensions for the image modality", () => {
      const filter = buildAcceptFilter(new Set(["image"]));
      expect(filter).toContain("image/*");
      expect(filter).toContain(".svg");
      expect(filter).toContain(".heic");
      expect(filter).toContain(".heif");
    });

    it("includes office extensions for the document modality and textual ones always", () => {
      const filter = buildAcceptFilter(new Set(["document"]));
      expect(filter).toContain(".docx,.doc,.xlsx,.xls");
      for (const extension of [".csv", ".tsv", ".txt", ".md", ".json", ".yaml", ".py", ".sh", ".sql", ".log"]) {
        expect(filter.split(",")).toContain(extension);
      }
      expect(filter).toContain("text/plain");
      expect(filter).toContain("text/markdown");
      expect(filter).toContain("application/json");
    });

    it("omits binary filters for unsupported modalities but keeps textual files", () => {
      const filter = buildAcceptFilter(new Set(["audio", "pdf"]));
      expect(filter).toContain("audio/*");
      expect(filter).toContain(".pdf,application/pdf");
      expect(filter).not.toContain("image/*");
      expect(filter).not.toContain(".docx");
      // Text/code files are universally supported — always offered.
      expect(filter.split(",")).toContain(".py");
      expect(filter.split(",")).toContain(".csv");
    });

    it("offers textual files even with no supported modalities", () => {
      const filter = buildAcceptFilter(new Set());
      expect(filter.split(",")).toContain(".py");
      expect(filter).toContain("text/plain");
      expect(filter).not.toContain("image/*");
      expect(filter).not.toContain(".docx");
    });
  });

  describe("shouldDownscaleImage", () => {
    const overTrigger = IMAGE_DOWNSCALE_TRIGGER_BYTES + 1;

    it("downscales large raster images", () => {
      expect(shouldDownscaleImage("image/jpeg", overTrigger)).toBe(true);
      expect(shouldDownscaleImage("image/png", overTrigger)).toBe(true);
      expect(shouldDownscaleImage("image/webp", overTrigger)).toBe(true);
    });

    it("leaves images at or under the trigger untouched", () => {
      expect(
        shouldDownscaleImage("image/jpeg", IMAGE_DOWNSCALE_TRIGGER_BYTES),
      ).toBe(false);
      expect(shouldDownscaleImage("image/png", 1024)).toBe(false);
    });

    it("never touches GIFs (animation) or SVGs (vector)", () => {
      expect(shouldDownscaleImage("image/gif", overTrigger)).toBe(false);
      expect(shouldDownscaleImage("image/svg+xml", overTrigger)).toBe(false);
    });

    it("ignores non-image MIME types regardless of size", () => {
      expect(shouldDownscaleImage("application/pdf", overTrigger)).toBe(false);
      expect(shouldDownscaleImage("video/mp4", overTrigger)).toBe(false);
    });
  });

  describe("downscaleImageForAttachment", () => {
    it("returns null (caller falls back to original bytes) when the browser canvas pipeline is unavailable", async () => {
      // jsdom has no createImageBitmap/canvas encoder — the util must
      // signal fallback rather than throw, matching the HEIC/decode-
      // failure path in real browsers.
      const file = new File([new Uint8Array(64)], "photo.jpg", {
        type: "image/jpeg",
      });
      await expect(downscaleImageForAttachment(file)).resolves.toBeNull();
    });
  });
});
