"use client";

/**
 * The admin chat's viewer: the selected conversation, read-only — any user's,
 * streamed live while it runs. Rows are windowed in the viewer's own
 * scrolling body, like the chat's transcript.
 */

import type { RefObject } from "react";
import { MessageSquare } from "lucide-react";
import MessageList from "./MessageListComponent";
import type { ClientAgent } from "./BadgeComponent";
import adminPageStyles from "../app/admin/chat/page.module.css";
import type { ToolDisplayMetadata } from "@rodrigo-barraza/utilities-library";
import type { Message } from "../types/types";

interface AdminConversationViewComponentProps {
  bodyRef: RefObject<HTMLDivElement | null>;
  /** The selected conversation; null before one is picked. */
  conversationId: string | null;
  isLoading: boolean;
  messages: Message[];
  showRaw: boolean;
  minimal: boolean;
  isGenerating: boolean;
  activeAgent: ClientAgent | null;
  systemPrompt: string | undefined;
  toolDisplayMetadataMap: Record<string, ToolDisplayMetadata>;
}

export default function AdminConversationViewComponent({
  bodyRef,
  conversationId,
  isLoading,
  messages,
  showRaw,
  minimal,
  isGenerating,
  activeAgent,
  systemPrompt,
  toolDisplayMetadataMap,
}: AdminConversationViewComponentProps) {
  return (
    <div className={adminPageStyles['viewer-body']} ref={bodyRef} style={{ overflowAnchor: "none" }}>
      {!conversationId && !isLoading ? (
        <div className={adminPageStyles['empty-viewer']}>
          <MessageSquare size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div>Select a conversation to view</div>
        </div>
      ) : isLoading ? (
        <div className={adminPageStyles['empty-viewer']}>Loading conversation...</div>
      ) : (
        <MessageList
          messages={messages}
          readOnly
          showRaw={showRaw}
          minimal={minimal}
          isGenerating={isGenerating}
          activeAgent={activeAgent}
          systemPrompt={systemPrompt}
          toolDisplayMetadataMap={toolDisplayMetadataMap}
          scrollElementRef={bodyRef}
          listKey={conversationId ?? undefined}
        />
      )}
    </div>
  );
}
