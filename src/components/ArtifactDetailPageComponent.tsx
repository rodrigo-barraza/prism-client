"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Trash2, History } from "lucide-react";
import PrismService from "../services/PrismService";
import MarkdownContent from "./MarkdownContentComponent";
import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";
import { AutoResizeToolEmbed } from "./ToolResultRenderers/renderers/BrowserMediaAndVisualRenderers";
import { ArtifactKindIcon } from "./ArtifactsPageComponent";
import { LoadingMessage, EmptyMessage } from "./StateMessageComponent";
import type { ArtifactItem } from "../types/types";
import styles from "./ArtifactDetailPageComponent.module.css";

const CONVERSATION_BASE_PATH = "/admin/chat";
const CURRENT_VERSION = -1;

export default function ArtifactDetailPageComponent({
  artifactId,
}: {
  artifactId?: string;
}) {
  const router = useRouter();
  const [artifact, setArtifact] = useState<ArtifactItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState(CURRENT_VERSION);

  useEffect(() => {
    if (!artifactId) return;
    let cancelled = false;
    PrismService.getArtifact(artifactId)
      .then((fetched) => {
        if (cancelled) return;
        setArtifact(fetched);
        setSelectedVersion(CURRENT_VERSION);
      })
      .catch(() => {
        if (!cancelled) setArtifact(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  const handleDelete = async () => {
    if (!artifact) return;
    if (!window.confirm(`Delete artifact "${artifact.title}"?`)) return;
    try {
      await PrismService.deleteArtifact(artifact.id);
      router.push("/artifacts");
    } catch (error: unknown) {
      console.error("Failed to delete artifact:", error);
    }
  };

  if (loading) return <LoadingMessage message="Loading artifact..." />;
  if (!artifact) return <EmptyMessage message="Artifact not found" />;

  const versions = artifact.versions ?? [];
  const viewingCurrent = selectedVersion === CURRENT_VERSION;
  const viewedContent = viewingCurrent
    ? artifact.content
    : versions[selectedVersion]?.content;
  const viewedTitle = viewingCurrent
    ? artifact.title
    : versions[selectedVersion]?.title || artifact.title;
  const convId = artifact.conversationId || artifact.agentConversationId;
  const resolvedUrl = artifact.url ? PrismService.getFileUrl(artifact.url) : null;
  const isDocument = artifact.kind === "markdown" || artifact.kind === "html";

  return (
    <div className={styles['container']}>
      <div className={styles['header']}>
        <div className={styles['header-main']}>
          <Link href="/artifacts" className={styles['back-link']}>
            <ArrowLeft size={16} />
            <span>Artifacts</span>
          </Link>
          <h1 className={styles['title']}>
            <ArtifactKindIcon kind={artifact.kind} size={18} />
            <span>{viewedTitle}</span>
          </h1>
          <div className={styles['meta']}>
            <span>v{artifact.version}</span>
            <span>
              {new Date(artifact.updatedAt).toLocaleString()}
            </span>
            {artifact.source === "document"
              ? artifact.agent && <span>{artifact.agent}</span>
              : artifact.toolName && <span>{artifact.toolName}</span>}
          </div>
        </div>
        <div className={styles['actions']}>
          {isDocument && versions.length > 0 && (
            <span className={styles['version-picker']}>
              <History size={14} />
              <select
                value={selectedVersion}
                onChange={(event) => setSelectedVersion(Number(event.target.value))}
                className={styles['version-select']}
              >
                <option value={CURRENT_VERSION}>
                  v{artifact.version} (current)
                </option>
                {versions
                  .map((version, index) => (
                    <option key={index} value={index}>
                      v{index + 1} — {new Date(version.updatedAt).toLocaleDateString()}
                    </option>
                  ))
                  .reverse()}
              </select>
            </span>
          )}
          {convId && (
            <Link
              href={`${CONVERSATION_BASE_PATH}/${convId}`}
              className={styles['action-button']}
              title="Open source conversation"
            >
              <ExternalLink size={14} />
              <span>Conversation</span>
            </Link>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className={`${styles['action-button']} ${styles['danger']}`}
            title="Delete artifact"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      <div className={styles['body']}>
        {artifact.kind === "markdown" && (
          <div className={styles['document-panel']}>
            <MarkdownContent content={viewedContent || ""} />
          </div>
        )}
        {artifact.kind === "html" && (
          <iframe
            srcDoc={viewedContent || ""}
            sandbox="allow-scripts"
            title={viewedTitle}
            className={styles['html-frame']}
          />
        )}
        {artifact.kind === "image" && resolvedUrl && (
          <img src={resolvedUrl} alt={artifact.title} className={styles['media-image']} />
        )}
        {artifact.kind === "video" && resolvedUrl && (
          <video src={resolvedUrl} controls className={styles['media-video']} />
        )}
        {artifact.kind === "audio" && resolvedUrl && (
          <div className={styles['media-audio']}>
            <AudioPlayerRecorderComponent sourceUrl={resolvedUrl} />
          </div>
        )}
        {artifact.kind === "embed" && artifact.url && (
          <AutoResizeToolEmbed
            sourceUrl={artifact.url}
            title={artifact.title}
            fallbackHeight={artifact.height ?? 480}
          />
        )}
      </div>
    </div>
  );
}
