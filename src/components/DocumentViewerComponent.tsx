"use client";

import { useMemo } from "react";
import { ModalComponent } from "@rodrigo-barraza/components-library";
import styles from "./DocumentViewerComponent.module.css";

function decodeDataUrl(dataUrl: any) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { mimeType: "unknown", text: "" };
  const mimeType = match[1];
  const base64 = match[2];
  try {
    const text = atob(base64);
    return { mimeType, text };
  } catch {
    return { mimeType, text: "" };
  }
}

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export default function DocumentViewer({ dataUrl: any, onClose: any }) {
  // @ts-ignore
  const { mimeType } = decodeDataUrl(dataUrl);
  const isPdf = mimeType === "application/pdf";
  const content = useMemo<any>(
    // @ts-ignore
    () => (!isPdf ? decodeDataUrl(dataUrl).text : null),
    // @ts-ignore
    [dataUrl, isPdf],
  );

  return (
    <ModalComponent
      title={isPdf ? "PDF Document" : "Text Document"}
      // @ts-ignore
      onClose={onClose}
      variant="dark"
      size="lg"
      className={styles.viewer}
    >
      {isPdf ? (
        <iframe
          // @ts-ignore
          src={dataUrl}
          className={styles.pdfFrame}
          title="PDF Viewer"
        />
      ) : (
        <pre className={styles.textContent}>{content}</pre>
      )}
    </ModalComponent>
  );
}
