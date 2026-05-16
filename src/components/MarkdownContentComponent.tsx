"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import styles from "./MarkdownContentComponent.module.css";
import { CopyButtonComponent } from "@rodrigo-barraza/components-library";

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function FencedCodeBlock({ language: any, children: any }) {
  // @ts-ignore
  const codeString = String(children).replace(/\n$/, "");

  // @ts-ignore
  let displayLabel = language;
  // @ts-ignore
  let syntaxLang = language;
  // @ts-ignore
  if (language.startsWith("exec-")) {
    // @ts-ignore
    syntaxLang = language.replace("exec-", "");
    displayLabel = `${syntaxLang.toUpperCase()} — EXECUTABLE CODE`;
  // @ts-ignore
  } else if (language.startsWith("execresult-")) {
    // @ts-ignore
    syntaxLang = language.replace("execresult-", "") || "text";
    displayLabel = `${(syntaxLang || "PYTHON").toUpperCase()} — CODE EXECUTION RESULT`;
  }

  return (
    <div className={styles.codeBlockWrapper}>
      <div className={styles.codeBlockHeader}>
        <span className={styles.codeBlockLang}>{displayLabel}</span>
        <CopyButtonComponent
          text={codeString}
          size={12}
          showLabel
          className={styles.codeBlockCopy}
        />
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={syntaxLang}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: "0 0 8px 8px",
          fontSize: "13px",
        }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
}

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function CodeBlock({ children: any, className: any, ...rest }) {
  // @ts-ignore
  const match = /language-(\w+)/.exec(className || "");
  if (!match) {
    return (
      // @ts-ignore
      <code className={`${styles.inlineCode} ${className || ""}`} {...rest}>
        {/* @ts-ignore */}
        {children}
      </code>
    );
  }
  // @ts-ignore
  return <FencedCodeBlock language={match[1]}>{children}</FencedCodeBlock>;
}

/**
 * Auto-resizing iframe for HTML embed pages (LaTeX, Mermaid, Maps).
 * Listens for postMessage `embed-resize` events from the embed page
 * and dynamically adjusts iframe height to fit content.
 */
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function AutoResizeEmbed({ src: any, title: any, fallbackHeight: any, className: any }) {
  const iframeRef = useRef<any>(null);
  // @ts-ignore
  const [height, setHeight] = useState<any>(fallbackHeight);

  const handleMessage = useCallback((event: any) => {
    if (
      event.data?.type === "embed-resize" &&
      iframeRef.current &&
      event.source === iframeRef.current.contentWindow
    ) {
      setHeight(event.data.height);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return (
    <span className={styles.embedWrapper}>
      <iframe
        ref={iframeRef}
        // @ts-ignore
        src={src}
        // @ts-ignore
        className={className}
        // @ts-ignore
        title={title}
        style={{ height: `${height}px` }}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </span>
  );
}

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function ImageOrEmbed({ src: any, alt: any, ...rest }) {
  // Detect embed URLs that return HTML pages and render as auto-resizing iframes
  // @ts-ignore
  // @ts-ignore
  if (src && src.includes("/utility/map/embed")) {
    return (
      <AutoResizeEmbed
        // @ts-ignore
        src={src}
        // @ts-ignore
        title={alt || "Map"}
        fallbackHeight={360}
        className={styles.mapEmbed}
      />
    );
  }
  // @ts-ignore
  // @ts-ignore
  if (src && src.includes("/compute/latex/embed")) {
    return (
      <AutoResizeEmbed
        // @ts-ignore
        src={src}
        // @ts-ignore
        title={alt || "LaTeX"}
        fallbackHeight={160}
        className={styles.embedFrame}
      />
    );
  }
  // @ts-ignore
  // @ts-ignore
  if (src && src.includes("/compute/diagram/embed")) {
    return (
      <AutoResizeEmbed
        // @ts-ignore
        src={src}
        // @ts-ignore
        title={alt || "Diagram"}
        fallbackHeight={420}
        className={styles.embedFrame}
      />
    );
  }
  // @ts-ignore
  // @ts-ignore
  if (src && src.includes("/compute/turtle/embed")) {
    return (
      <AutoResizeEmbed
        // @ts-ignore
        src={src}
        // @ts-ignore
        title={alt || "Turtle Drawing"}
        fallbackHeight={660}
        className={styles.embedFrame}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  // @ts-ignore
  // @ts-ignore
  return <img src={src} alt={alt} {...rest} />;
}

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export default function MarkdownContent({ content: any, className: any, children: any }) {
  // @ts-ignore
  if (!content) return null;
  return (
    // @ts-ignore
    <div className={`${styles.text} ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // @ts-ignore
        // @ts-ignore
        components={{ code: CodeBlock, img: ImageOrEmbed }}
      >
        {/* @ts-ignore */}
        {content}
      </ReactMarkdown>
      {/* @ts-ignore */}
      {children}
    </div>
  );
}
