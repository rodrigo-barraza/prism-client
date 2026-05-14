"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircleQuestion, Send, CornerDownLeft } from "lucide-react";
import styles from "./UserQuestionCardComponent.module.css";

/**
 * Inline card for agent-initiated user questions.
 * Renders the question, optional context, optional multiple-choice buttons,
 * and a free-text input. Mirrors ApprovalCardComponent's visual language.
 */
export default function UserQuestionCardComponent({
  question,
  choices = [],
  context = null,
  onAnswer,
  isPending = true,
  answeredWith = null,
}) {
  const [freeText, setFreeText] = useState("");
  const inputRef = useRef(null);

  // Auto-focus the input when the card mounts
  useEffect(() => {
    if (isPending && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isPending]);

  const handleSubmitFreeText = () => {
    const text = freeText.trim();
    if (!text || !onAnswer) return;
    onAnswer(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitFreeText();
    }
  };

  return (
    <div className={`${styles.card} ${!isPending ? styles.resolved : ""}`}>
      <div className={styles.header}>
        <MessageCircleQuestion
          size={16}
          className={styles.icon}
        />
        <span className={styles.label}>Agent Question</span>
      </div>

      <div className={styles.question}>{question}</div>

      {context && (
        <div className={styles.context}>
          <pre className={styles.contextPre}>{context}</pre>
        </div>
      )}

      {isPending && choices.length > 0 && (
        <div className={styles.choices}>
          {choices.map((choice, i) => (
            <button
              key={i}
              className={styles.choiceBtn}
              onClick={() => onAnswer?.(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {isPending && (
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder={choices.length > 0 ? "Or type a custom answer…" : "Type your answer…"}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSubmitFreeText}
            disabled={!freeText.trim()}
          >
            <Send size={14} />
          </button>
        </div>
      )}

      {!isPending && answeredWith && (
        <div className={styles.answeredRow}>
          <CornerDownLeft size={12} className={styles.answeredIcon} />
          <span className={styles.answeredText}>{answeredWith}</span>
        </div>
      )}
    </div>
  );
}
