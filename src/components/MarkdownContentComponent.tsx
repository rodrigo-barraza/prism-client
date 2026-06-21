"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
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
    <div className={styles['code-block-wrapper']}>
      <div className={styles['code-block-header']}>
        <span className={styles['code-block-lang']}>{displayLabel}</span>
        <CopyButtonComponent
          text={codeString}
          size={12}
          showLabel
          className={styles['code-block-copy']}
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
  node?: unknown;
}

function CodeBlock({ children, className, node, ...rest }: CodeBlockProps) {
  const match = /language-(\w+)/.exec(className || "");
  if (!match) {
    return (
      <code className={`${styles['inline-code']} ${className || ""}`} {...rest}>
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

function AutoResizeEmbed({
  src,
  title,
  fallbackHeight,
  className,
}: AutoResizeEmbedProps) {
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
    <span className={styles['embed-wrapper']}>
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
  node?: unknown;
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
        className={styles['map-embed']}
      />
    );
  }
  if (isStringSrc && src.includes("/compute/latex/embed")) {
    return (
      <AutoResizeEmbed
        src={src}
        title={alt || "LaTeX"}
        fallbackHeight={160}
        className={styles['embed-frame']}
      />
    );
  }
  if (isStringSrc && src.includes("/compute/diagram/embed")) {
    return (
      <AutoResizeEmbed
        src={src}
        title={alt || "Diagram"}
        fallbackHeight={420}
        className={styles['embed-frame']}
      />
    );
  }
  if (isStringSrc && src.includes("/compute/3d/embed")) {
    return (
      <AutoResizeEmbed
        src={src}
        title={alt || "3D Scene"}
        fallbackHeight={480}
        className={styles['embed-frame']}
      />
    );
  }
  if (isStringSrc && src.includes("/compute/image/ascii/embed")) {
    return (
      <AutoResizeEmbed
        src={src}
        title={alt || "ASCII Art"}
        fallbackHeight={600}
        className={styles['embed-frame']}
      />
    );
  }
  if (isStringSrc && src.includes("/gaming/bonfire/embed")) {
    return (
      <AutoResizeEmbed
        src={src}
        title={alt || "Bonfire"}
        fallbackHeight={480}
        className={styles['embed-frame']}
      />
    );
  }
  if (isStringSrc && src.includes("/compute/turtle/embed")) {
    return (
      <span className={`${styles['embed-wrapper']} ${styles['turtle-embed-wrapper']}`}>
        <iframe
          src={src}
          className={`${styles['embed-frame']} ${styles['turtle-embed-frame']}`}
          title={alt || "Turtle Drawing"}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </span>
    );
  }
  return <img src={src} alt={alt} {...rest} />;
}

export interface MarkdownContentProps {
  content: string;
  className?: string;
  children?: React.ReactNode;
}

export default function MarkdownContent({
  content,
  className,
  children,
}: MarkdownContentProps) {
  if (!content) return null;
  return (
    <div className={`markdown-content-component ${styles['text']} ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[rehypeKatex]}
        components={{ code: CodeBlock, img: ImageOrEmbed }}
      >
        {content}
      </ReactMarkdown>
      {children}
    </div>
  );
}
