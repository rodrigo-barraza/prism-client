"use client";

/**
 * The chat's transcript: the scrolling area with the conversation's rows,
 * the empty state and ambient scene, and whatever the chat puts under the
 * rows (dialogs, approval and question cards).
 *
 * It owns the scrolling. Rows are windowed (MessageList with
 * `scrollElementRef`): only the ones near the viewport mount. The view
 * follows the bottom while the user is near it — every new message, tool
 * step or card scrolls it there — and stops following once they scroll up;
 * `stickToBottom` re-engages it (a send, a conversation opened).
 */

import {
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import MessageList, {
  type MessageListNavigation,
  type MessageListNavigationState,
  type MessageListProps,
} from "./MessageListComponent";
import chatStyles from "./ChatAreaComponent.module.css";
import useFollowBottom from "../hooks/useFollowBottom";

export interface ChatTranscriptHandle {
  /**
   * Follow the bottom again: the next change scrolls there, with
   * `behavior` ("instant" when a whole conversation just loaded).
   */
  stickToBottom: (_behavior?: ScrollBehavior) => void;
  /** Scroll to the bottom now. */
  scrollToBottom: (_behavior: ScrollBehavior) => void;
  previousMessage: () => void;
  nextMessage: () => void;
}

interface ChatTranscriptComponentProps {
  /** The scrolling element — the chat's pixel transition veils it. */
  scrollElementRef: RefObject<HTMLDivElement | null>;
  handleRef: Ref<ChatTranscriptHandle>;
  /** The Nodes view hides the transcript (kept mounted). */
  isHidden: boolean;
  isTerminalView: boolean;
  /** The agent's own background image, if it has one. */
  backgroundImage: string;
  /** The ambient 3D scene behind an empty conversation. */
  scene: ReactNode;
  emptyState: ReactNode;
  listProps: MessageListProps;
  /** Anything that grows the transcript: a change scrolls to the bottom while following it. */
  followTriggers: readonly unknown[];
  onNavigationStateChange: (_state: MessageListNavigationState) => void;
  /** Rendered under the rows: dialogs, approval and question cards. */
  children?: ReactNode;
}

export default function ChatTranscriptComponent({
  scrollElementRef,
  handleRef,
  isHidden,
  isTerminalView,
  backgroundImage,
  scene,
  emptyState,
  listProps,
  followTriggers,
  onNavigationStateChange,
  children,
}: ChatTranscriptComponentProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<MessageListNavigation>(null);
  const { stickToBottom } = useFollowBottom(scrollElementRef, endRef, followTriggers);

  useImperativeHandle(
    handleRef,
    () => ({
      stickToBottom,
      scrollToBottom: (behavior) => endRef.current?.scrollIntoView({ behavior }),
      previousMessage: () => navigationRef.current?.previous(),
      nextMessage: () => navigationRef.current?.next(),
    }),
    [stickToBottom],
  );

  const hasScene = !!scene;
  const style: CSSProperties = {
    // Rows are windowed and keep the view anchored themselves.
    overflowAnchor: "none",
    ...(backgroundImage ? ({ "--agent-background-image": `url(${backgroundImage})` } as CSSProperties) : {}),
  };

  return (
    <div
      className={`${chatStyles['messages-list']} ${backgroundImage && !isTerminalView ? chatStyles['has-background'] : ""} ${hasScene ? chatStyles['has-scene'] : ""} ${isHidden ? chatStyles['messages-list-hidden'] : ""}`}
      ref={scrollElementRef}
      style={style}
    >
      {scene}
      {emptyState}
      <MessageList
        {...listProps}
        scrollElementRef={scrollElementRef}
        navigationRef={navigationRef}
        onNavigationStateChange={onNavigationStateChange}
      />
      {children}
      <div ref={endRef} style={{ minHeight: 1 }} />
    </div>
  );
}
