"use client";

/**
 * The chat area's header bar: the conversation's title, the view-mode
 * switch, the previous/next message arrows and "New Conversation" (with its
 * rainbow-and-glitch flash). A read-only viewer (admin) shows the title and
 * the view mode only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { ButtonComponent, IconButtonComponent } from "@rodrigo-barraza/components-library";
import ChatViewModeControlComponent, { type ChatViewMode } from "./ChatViewModeControlComponent";
import chatStyles from "./ChatAreaComponent.module.css";
import { glitchText } from "../utils/glitchText";

interface ChatHeaderComponentProps {
  title: string;
  viewMode: ChatViewMode;
  onViewModeChange: (_mode: ChatViewMode) => void;
  /** False for a read-only viewer: no arrows, no New Conversation. */
  showConversationControls: boolean;
  canNavigateUp: boolean;
  canNavigateDown: boolean;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  isNewConversationDisabled: boolean;
  onNewConversation: () => void;
}

export default function ChatHeaderComponent({
  title,
  viewMode,
  onViewModeChange,
  showConversationControls,
  canNavigateUp,
  canNavigateDown,
  onNavigateUp,
  onNavigateDown,
  isNewConversationDisabled,
  onNewConversation,
}: ChatHeaderComponentProps) {
  const newButtonRef = useRef<HTMLButtonElement | null>(null);
  const rainbowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [glitchLabel, setGlitchLabel] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (rainbowTimerRef.current) clearTimeout(rainbowTimerRef.current);
      if (glitchIntervalRef.current) clearInterval(glitchIntervalRef.current);
    },
    [],
  );

  const handleNewConversation = useCallback(() => {
    const element = newButtonRef.current;
    if (element) {
      element.classList.remove(chatStyles['chat-header-new-button-element-rainbow']);
      void element.offsetWidth;
      element.classList.add(chatStyles['chat-header-new-button-element-rainbow']);

      setGlitchLabel(glitchText());
      if (glitchIntervalRef.current) clearInterval(glitchIntervalRef.current);
      glitchIntervalRef.current = setInterval(() => {
        setGlitchLabel(glitchText());
      }, 30);

      if (rainbowTimerRef.current) clearTimeout(rainbowTimerRef.current);
      rainbowTimerRef.current = setTimeout(() => {
        element.classList.remove(chatStyles['chat-header-new-button-element-rainbow']);
        if (glitchIntervalRef.current) clearInterval(glitchIntervalRef.current);
        glitchIntervalRef.current = null;
        setGlitchLabel(null);
      }, 1000);
    }
    onNewConversation();
  }, [onNewConversation]);

  return (
    <div className={chatStyles['chat-header']}>
      <div className={chatStyles['chat-header-title']}>
        <span className={chatStyles['chat-header-title-text']}>{title || ""}</span>
      </div>
      <div className={chatStyles['chat-header-actions']}>
        <ChatViewModeControlComponent viewMode={viewMode} onViewModeChange={onViewModeChange} />
        {showConversationControls && (
          <>
            <div className={chatStyles['message-navigation-controls']}>
              <IconButtonComponent
                icon={<ChevronUp size={15} />}
                onClick={onNavigateUp}
                disabled={!canNavigateUp}
                tooltip="Previous message"
                aria-label="Previous message"
                className={chatStyles['message-navigation-button']}
              />
              <IconButtonComponent
                icon={<ChevronDown size={15} />}
                onClick={onNavigateDown}
                disabled={!canNavigateDown}
                tooltip="Next message"
                aria-label="Next message"
                className={chatStyles['message-navigation-button']}
              />
            </div>
            <ButtonComponent
              ref={newButtonRef}
              variant="primary"
              size="small"
              icon={glitchLabel ? undefined : Plus}
              onClick={handleNewConversation}
              disabled={isNewConversationDisabled}
              className={`${chatStyles['chat-header-new-button']} ${glitchLabel ? chatStyles['chat-header-new-button-element-glitch'] : ""}`}
              title="Start a new conversation"
            >
              {glitchLabel || "New Conversation"}
            </ButtonComponent>
          </>
        )}
      </div>
    </div>
  );
}
