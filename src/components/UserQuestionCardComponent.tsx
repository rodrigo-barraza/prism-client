"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MessageCircleQuestion, Send, CornerDownLeft, Check, ChevronRight, StickyNote } from "lucide-react";
import styles from "./UserQuestionCardComponent.module.css";

/**
 * Individual question sub-card — handles single or multi-select options,
 * optional preview pane, free-text input, and annotations.
 */
function QuestionBlock({
  // @ts-ignore
  // @ts-ignore
  _index: any,
  // @ts-ignore
  // @ts-ignore
  question: any,
  // @ts-ignore
  // @ts-ignore
  header: any,
  options = [],
  multiSelect = false,
  // @ts-ignore
  // @ts-ignore
  isPending: any,
  // @ts-ignore
  // @ts-ignore
  onAnswer: any,
  answeredWith = null,
}) {
  const [selected, setSelected] = useState<any>(multiSelect ? [] : null);
  const [freeText, setFreeText] = useState<any>("");
  const [annotations, setAnnotations] = useState<any>("");
  const [showAnnotations, setShowAnnotations] = useState<any>(false);
  const [previewIdx, setPreviewIdx] = useState<any>(null);
  const inputRef = useRef<any>(null);

  // Auto-focus input when there are no options or after mount
  useEffect(() => {
    // @ts-ignore
    if (isPending && options.length === 0 && inputRef.current) {
      inputRef.current.focus();
    }
  // @ts-ignore
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
        // @ts-ignore
        onAnswer?.({ answer: label, annotations: annotations || undefined });
      }
    }
  };

  const handleSubmit = () => {
    let answer;
    if (multiSelect && selected.length > 0) {
      answer = selected;
    } else if (!multiSelect && selected) {
      answer = selected;
    } else if (freeText.trim()) {
      answer = freeText.trim();
    } else {
      return; // Nothing to submit
    }
    // @ts-ignore
    onAnswer?.({ answer, annotations: annotations || undefined });
  };

  const handleKeyDown = (e: any) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // The preview currently focused
  // @ts-ignore
  const activePreview = previewIdx !== null ? options[previewIdx]?.preview : null;

  return (
    <div className={styles.questionBlock}>
      {/* Header chip */}
      {/* @ts-ignore */}
      {header && (
        // @ts-ignore
        <span className={styles.headerChip}>{header}</span>
      )}

      {/* Question text */}
      {/* @ts-ignore */}
      <div className={styles.questionText}>{question}</div>

      {/* Options + Preview side-by-side layout */}
      {/* @ts-ignore */}
      {isPending && options.length > 0 && (
        <div className={`${styles.optionsRow} ${activePreview ? styles.withPreview : ""}`}>
          <div className={styles.optionsList}>
            {options.map((opt, i) => {
              const isSelected = multiSelect
                // @ts-ignore
                ? selected.includes(opt.label)
                // @ts-ignore
                : selected === opt.label;
              const isFocused = previewIdx === i;

              return (
                <button
                  key={i}
                  className={`${styles.optionBtn} ${isSelected ? styles.optionSelected : ""} ${isFocused ? styles.optionFocused : ""}`}
                  // @ts-ignore
                  onClick={() => handleOptionClick(opt.label)}
                  // @ts-ignore
                  onMouseEnter={() => opt.preview ? setPreviewIdx(i) : null}
                  onMouseLeave={() => setPreviewIdx(null)}
                >
                  {multiSelect && (
                    <span className={`${styles.checkbox} ${isSelected ? styles.checkboxChecked : ""}`}>
                      {isSelected && <Check size={10} />}
                    </span>
                  )}
                  {/* @ts-ignore */}
                  <span className={styles.optionLabel}>{opt.label}</span>
                  {/* @ts-ignore */}
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
      {/* @ts-ignore */}
      {isPending && (
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder={options.length > 0 ? "Or type a custom answer…" : "Type your answer…"}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {/* Annotation toggle */}
          <button
            className={`${styles.annotateBtn} ${showAnnotations ? styles.annotateBtnActive : ""}`}
            onClick={() => setShowAnnotations((v: any) => !v)}
            title="Add notes"
          >
            <StickyNote size={14} />
          </button>
          <button
            className={styles.sendBtn}
            onClick={handleSubmit}
            disabled={!freeText.trim() && !selected && !(multiSelect && selected.length > 0)}
          >
            <Send size={14} />
          </button>
        </div>
      )}

      {/* Annotations textarea */}
      {/* @ts-ignore */}
      {isPending && showAnnotations && (
        <div className={styles.annotationsRow}>
          <textarea
            className={styles.annotationsInput}
            placeholder="Add notes or context for this answer…"
            value={annotations}
            onChange={(e) => setAnnotations(e.target.value)}
            rows={2}
          />
        </div>
      )}

      {/* Resolved state */}
      {/* @ts-ignore */}
      {!isPending && answeredWith && (
        <div className={styles.answeredRow}>
          <CornerDownLeft size={12} className={styles.answeredIcon} />
          <span className={styles.answeredText}>
            {/* @ts-ignore */}
            {Array.isArray(answeredWith) ? answeredWith.join(", ") : answeredWith}
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
  // @ts-ignore
  // @ts-ignore
  onAnswer: any,
  isPending = true,
  answeredWith = null,
  // ── Backward compat (single question) ─────
  // @ts-ignore
  // @ts-ignore
  question: any,
  choices = [],
}) {
  // Normalize: single question props → questions array
  const normalizedQuestions = useMemo<any>(() => {
    if (questions.length > 0) return questions;
    // @ts-ignore
    if (question) {
      return [{
        // @ts-ignore
        question,
        header: null,
        options: choices.map((c) => ({ label: c, preview: null })),
        multiSelect: false,
      }];
    }
    return [];
  // @ts-ignore
  }, [questions, question, choices]);

  // Track answers per question index
  const [collectedAnswers, setCollectedAnswers] = useState<any>({});
  const isMultiQuestion = normalizedQuestions.length > 1;
  const allAnswered = isMultiQuestion
    ? Object.keys(collectedAnswers).length === normalizedQuestions.length
    : false;

  const handleQuestionAnswer = useCallback((idx: any, answerData: any) => {
    if (isMultiQuestion) {
      // Collect answers for batch submission
      setCollectedAnswers((prev: any) => ({ ...prev, [idx]: answerData }));
    } else {
      // Single question — submit immediately
      // @ts-ignore
      onAnswer?.([answerData]);
    }
  // @ts-ignore
  }, [isMultiQuestion, onAnswer]);

  const handleSubmitAll = useCallback(() => {
    if (!allAnswered) return;
    const orderedAnswers = normalizedQuestions.map((_: any, i: any) => collectedAnswers[i]);
    // @ts-ignore
    onAnswer?.(orderedAnswers);
  // @ts-ignore
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
      {normalizedQuestions.map((q: any, i: any) => (
        <QuestionBlock
          key={i}
          // @ts-ignore
          index={i}
          question={q.question}
          header={q.header}
          options={q.options || []}
          multiSelect={q.multiSelect || false}
          isPending={isPending && !collectedAnswers[i]}
          onAnswer={(answerData: any) => handleQuestionAnswer(i, answerData)}
          answeredWith={
            !isPending
              // @ts-ignore
              ? (answeredWith?.[i]?.answer || answeredWith?.[i])
              : (collectedAnswers[i]?.answer || null)
          }
        />
      ))}

      {/* Multi-question batch submit */}
      {isPending && isMultiQuestion && (
        <div className={styles.batchSubmit}>
          <button
            className={`${styles.submitAllBtn} ${allAnswered ? styles.submitAllReady : ""}`}
            onClick={handleSubmitAll}
            disabled={!allAnswered}
          >
            <Send size={14} />
            Submit All Answers
            {!allAnswered && (
              <span className={styles.remaining}>
                ({normalizedQuestions.length - Object.keys(collectedAnswers).length} remaining)
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
