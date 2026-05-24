"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import styles from "./MarkdownContentComponent.module.css";
import { CopyButtonComponent } from "@rodrigo-barraza/components-library";

interface FencedCodeBlockProps {
  language: string;
  children: React.ReactNode;
}

function FencedCodeBlock({ language, children }: FencedCodeBlockProps) {
  const codeString = String(children).replace(/\n$/, "");

  let displayLabel = language;
  let syntaxLang = language;
  if (language.startsWith("exec-")) {
    syntaxLang = language.replace("exec-", "");
    displayLabel = `${syntaxLang.toUpperCase()} — EXECUTABLE CODE`;
  } else if (language.startsWith("execresult-")) {
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

interface CodeBlockProps extends React.ComponentPropsWithoutRef<"code"> {
  node?: any;
}

function CodeBlock({ children, className, node, ...rest }: CodeBlockProps) {
  const match = /language-(\w+)/.exec(className || "");
  if (!match) {
    return (
      <code className={`${styles.inlineCode} ${className || ""}`} {...rest}>
        {children}
      </code>
    );
  }
  return <FencedCodeBlock language={match[1]}>{children}</FencedCodeBlock>;
}

/**
 * Auto-resizing iframe for HTML embed pages (LaTeX, Mermaid, Maps).
 * Listens for postMessage `embed-resize` events from the embed page
 * and dynamically adjusts iframe height to fit content.
 */
interface AutoResizeEmbedProps {
  src: string;
  title: string;
  fallbackHeight: number;
  className?: string;
}

function AutoResizeEmbed({ src, title, fallbackHeight, className }: AutoResizeEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(fallbackHeight);

  const handleMessage = useCallback((event: MessageEvent) => {
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
        src={src}
        className={className}
        title={title}
        style={{ height: `${height}px` }}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </span>
  );
}

interface ImageOrEmbedProps extends React.ComponentPropsWithoutRef<"img"> {
  node?: any;
}

function ImageOrEmbed({ src, alt, node, ...rest }: ImageOrEmbedProps) {
  // Detect embed URLs that return HTML pages and render as auto-resizing iframes
  const isStringSrc = typeof src === "string";
  if (isStringSrc && src.includes("/utility/map/embed")) {
    return (
      <AutoResizeEmbed
        src={src}
        title={alt || "Map"}
        fallbackHeight={360}
        className={styles.mapEmbed}
      />
    );
  }
  if (isStringSrc && src.includes("/compute/latex/embed")) {
    return (
      <AutoResizeEmbed
        src={src}
        title={alt || "LaTeX"}
        fallbackHeight={160}
        className={styles.embedFrame}
      />
    );
  }
  if (isStringSrc && src.includes("/compute/diagram/embed")) {
    return (
      <AutoResizeEmbed
        src={src}
        title={alt || "Diagram"}
        fallbackHeight={420}
        className={styles.embedFrame}
      />
    );
  }
  if (isStringSrc && src.includes("/compute/turtle/embed")) {
    return (
      <AutoResizeEmbed
        src={src}
        title={alt || "Turtle Drawing"}
        fallbackHeight={660}
        className={styles.embedFrame}
      />
    );
  }
  return <img src={src} alt={alt} {...rest} />;
}

export interface MarkdownContentProps {
  content: string;
  className?: string;
  children?: React.ReactNode;
}

export default function MarkdownContent({ content, className, children }: MarkdownContentProps) {
  if (!content) return null;
  return (
    <div className={`${styles.text} ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ code: CodeBlock, img: ImageOrEmbed }}
      >
        {content}
      </ReactMarkdown>
      {children}
    </div>
  );
}
