"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MessageCircleQuestion,
  Send,
  CornerDownLeft,
  Check,
  ChevronRight,
  StickyNote,
} from "lucide-react";
import styles from "./UserQuestionCardComponent.module.css";

/**
 * Individual question sub-card — handles single or multi-select options,
 * optional preview pane, free-text input, and annotations.
 */
function QuestionBlock({
  _index,
  question,
  header,
  options = [],
  multiSelect = false,
  isPending,
  onAnswer,
  answeredWith = null,
}: any) {
  const [selected, setSelected] = useState<any>(multiSelect ? [] : null);
  const [freeText, setFreeText] = useState("");
  const [annotations, setAnnotations] = useState("");
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus input when there are no options or after mount
  useEffect(() => {
    if (isPending && options.length === 0 && inputRef.current) {
      inputRef.current?.focus();
    }
  }, [isPending, options.length]);

  const handleOptionClick = (label: any) => {
    if (multiSelect) {
      setSelected((prev: any) =>
        prev.includes(label)
          ? prev.filter((l: any) => l !== label)
          : [...prev, label],
      );
    } else {
      setSelected(label);
      // In single-select with no annotation needed, auto-submit on click
      if (!showAnnotations) {
        onAnswer?.({ answer: label, annotations: annotations || undefined });
      }
    }
  };

  const handleSubmit = () => {
    let answer;
    if (multiSelect && selected && selected.length > 0) {
      answer = selected;
    } else if (!multiSelect && selected) {
      answer = selected;
    } else if (freeText.trim()) {
      answer = freeText.trim();
    } else {
      return; // Nothing to submit
    }
    onAnswer?.({ answer, annotations: annotations || undefined });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // The preview currently focused
  const activePreview =
    previewIdx !== null ? options[previewIdx]?.preview : null;

  return (
    <div className={styles.questionBlock}>
      {/* Header chip */}
      {header && <span className={styles.headerChip}>{header}</span>}

      {/* Question text */}
      <div className={styles.questionText}>{question}</div>

      {/* Options + Preview side-by-side layout */}
      {isPending && options.length > 0 && (
        <div
          className={`${styles.optionsRow} ${activePreview ? styles.withPreview : ""}`}
        >
          <div className={styles.optionsList}>
            {options.map((opt: any, i: number) => {
              const isSelected = multiSelect
                ? selected?.includes(opt.label)
                : selected === opt.label;
              const isFocused = previewIdx === i;

              return (
                <button
                  key={i}
                  className={`${styles.optionButton} ${isSelected ? styles.optionSelected : ""} ${isFocused ? styles.optionFocused : ""}`}
                  onClick={() => handleOptionClick(opt.label)}
                  onMouseEnter={() => (opt.preview ? setPreviewIdx(i) : null)}
                  onMouseLeave={() => setPreviewIdx(null)}
                >
                  {multiSelect && (
                    <span
                      className={`${styles.checkbox} ${isSelected ? styles.checkboxChecked : ""}`}
                    >
                      {isSelected && <Check size={10} />}
                    </span>
                  )}
                  <span className={styles.optionLabel}>{opt.label}</span>
                  {opt.preview && (
                    <ChevronRight size={12} className={styles.previewHint} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Preview pane — shown when hovering an option with preview content */}
          {activePreview && (
            <div className={styles.previewPane}>
              <pre className={styles.previewContent}>{activePreview}</pre>
            </div>
          )}
        </div>
      )}

      {/* Free-text input (always available) */}
      {isPending && (
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder={
              options.length > 0
                ? "Or type a custom answer…"
                : "Type your answer…"
            }
            value={freeText}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setFreeText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {/* Annotation toggle */}
          <button
            className={`${styles.annotateButton} ${showAnnotations ? styles.annotateBtnActive : ""}`}
            onClick={() => setShowAnnotations((v) => !v)}
            title="Add notes"
          >
            <StickyNote size={14} />
          </button>
          <button
            className={styles.sendButton}
            onClick={handleSubmit}
            disabled={
              !freeText.trim() &&
              !selected &&
              !(multiSelect && selected && selected.length > 0)
            }
          >
            <Send size={14} />
          </button>
        </div>
      )}

      {/* Annotations textarea */}
      {isPending && showAnnotations && (
        <div className={styles.annotationsRow}>
          <textarea
            className={styles.annotationsInput}
            placeholder="Add notes or context for this answer…"
            value={annotations}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setAnnotations(e.target.value)}
            rows={2}
          />
        </div>
      )}

      {/* Resolved state */}
      {!isPending && answeredWith && (
        <div className={styles.answeredRow}>
          <CornerDownLeft size={12} className={styles.answeredIcon} />
          <span className={styles.answeredText}>
            {Array.isArray(answeredWith)
              ? answeredWith.join(", ")
              : answeredWith}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Inline card for agent-initiated user questions.
 * Supports multi-question batching, header chips, multi-select,
 * preview panes, and annotations — CC-level feature parity.
 */
export default function UserQuestionCardComponent({
  questions = [],
  context = null,
  onAnswer,
  isPending = true,
  answeredWith = null,
  // ── Backward compat (single question) ─────
  question,
  choices = [],
}: any) {
  // Normalize: single question props → questions array
  const normalizedQuestions = useMemo(() => {
    if (questions.length > 0) return questions;
    if (question) {
      return [
        {
          question,
          header: null,
          options: choices.map((c: any) => ({ label: c, preview: null })),
          multiSelect: false,
        },
      ];
    }
    return [];
  }, [questions, question, choices]);

  // Track answers per question index
  const [collectedAnswers, setCollectedAnswers] = useState<any>({});
  const isMultiQuestion = normalizedQuestions.length > 1;
  const allAnswered = isMultiQuestion
    ? Object.keys(collectedAnswers).length === normalizedQuestions.length
    : false;

  const handleQuestionAnswer = useCallback(
    (index: any, answerData: any) => {
      if (isMultiQuestion) {
        // Collect answers for batch submission
        setCollectedAnswers((prev: any) => ({ ...prev, [index]: answerData }));
      } else {
        // Single question — submit immediately
        onAnswer?.([answerData]);
      }
    },
    [isMultiQuestion, onAnswer],
  );

  const handleSubmitAll = useCallback(() => {
    if (!allAnswered) return;
    const orderedAnswers = normalizedQuestions.map(
      (_: any, i: number) => (collectedAnswers as any)[i],
    );
    onAnswer?.(orderedAnswers);
  }, [allAnswered, normalizedQuestions, collectedAnswers, onAnswer]);

  if (normalizedQuestions.length === 0) return null;

  return (
    <div className={`${styles.card} ${!isPending ? styles.resolved : ""}`}>
      <div className={styles.header}>
        <MessageCircleQuestion size={16} className={styles.icon} />
        <span className={styles.label}>
          Agent Question{normalizedQuestions.length > 1 ? "s" : ""}
        </span>
        {normalizedQuestions.length > 1 && (
          <span className={styles.countBadge}>
            {Object.keys(collectedAnswers).length}/{normalizedQuestions.length}
          </span>
        )}
      </div>

      {/* Context block */}
      {context && (
        <div className={styles.context}>
          <pre className={styles.contextPre}>{context}</pre>
        </div>
      )}

      {/* Questions */}
      {normalizedQuestions.map((q: any, i: number) => (
        <QuestionBlock
          key={i}
          index={i}
          question={q.question}
          header={q.header}
          options={q.options || []}
          multiSelect={q.multiSelect || false}
          isPending={isPending && !(collectedAnswers as Record<string, any>)[i]}
          onAnswer={(answerData: any) => handleQuestionAnswer(i, answerData)}
          answeredWith={
            !isPending
              ? (answeredWith as any)?.[i]?.answer || (answeredWith as any)?.[i]
              : (collectedAnswers as Record<string, any>)[i]?.answer || null
          }
        />
      ))}

      {/* Multi-question batch submit */}
      {isPending && isMultiQuestion && (
        <div className={styles.batchSubmit}>
          <button
            className={`${styles.submitAllButton} ${allAnswered ? styles.submitAllReady : ""}`}
            onClick={handleSubmitAll}
            disabled={!allAnswered}
          >
            <Send size={14} />
            Submit All Answers
            {!allAnswered && (
              <span className={styles.remaining}>
                (
                {normalizedQuestions.length -
                  Object.keys(collectedAnswers).length}{" "}
                remaining)
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
