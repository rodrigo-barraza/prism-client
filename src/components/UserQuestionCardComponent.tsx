"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircleQuestion,
  Send,
  Check,
  ChevronRight,
  StickyNote,
} from "lucide-react";
import { TextAreaComponent } from "@rodrigo-barraza/components-library";
import InputBoxComponent from "./InputBoxComponent";
import ChatInputButton from "./ChatInputButtonComponent";
import styles from "./UserQuestionCardComponent.module.css";

interface QuestionOption {
  label: string;
  preview?: string | null;
}

interface QuestionAnswerData {
  answer: string | string[];
  annotations?: string;
}

interface NormalizedQuestion {
  question: string;
  header?: string | null;
  options: QuestionOption[];
  multiSelect?: boolean;
}

interface QuestionBlockProps {
  questionNumber: number;
  totalQuestions: number;
  question: string;
  header?: string | null;
  options?: QuestionOption[];
  multiSelect?: boolean;
  isPending: boolean;
  onAnswer?: (_answerData: QuestionAnswerData) => void;
  answeredWith?: string | string[] | null;
}

/**
 * Individual question sub-card — handles single or multi-select options,
 * optional preview pane, free-text input, and annotations.
 */
function QuestionBlock({
  questionNumber,
  totalQuestions,
  question,
  header,
  options = [],
  multiSelect = false,
  isPending,
  onAnswer,
  answeredWith = null,
}: QuestionBlockProps) {
  const [selected, setSelected] = useState<string | string[] | null>(multiSelect ? [] : null);
  const [freeText, setFreeText] = useState("");
  const [annotations, setAnnotations] = useState("");
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus input when there are no options or after mount
  useEffect(() => {
    if (isPending && options.length === 0 && inputRef.current) {
      inputRef.current?.focus();
    }
  }, [isPending, options.length]);

  // Auto-expand the answer textarea like the main chat input
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [freeText]);

  const handleOptionClick = (label: string) => {
    if (multiSelect) {
      setSelected((previous) => {
        const previousArray = Array.isArray(previous) ? previous : [];
        return previousArray.includes(label)
          ? previousArray.filter((selectedLabel: string) => selectedLabel !== label)
          : [...previousArray, label];
      });
    } else {
      setSelected(label);
      // In single-select with no annotation needed, auto-submit on click
      if (!showAnnotations) {
        onAnswer?.({ answer: label, annotations: annotations || undefined });
      }
    }
  };

  const handleSubmit = () => {
    let answer: string | string[] | undefined;
    if (multiSelect && Array.isArray(selected) && selected.length > 0) {
      answer = selected;
    } else if (!multiSelect && selected && typeof selected === "string") {
      answer = selected;
    } else if (freeText.trim()) {
      answer = freeText.trim();
    } else {
      return; // Nothing to submit
    }
    onAnswer?.({ answer, annotations: annotations || undefined });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit =
    Boolean(freeText.trim()) ||
    Boolean(!multiSelect && selected) ||
    (multiSelect && Array.isArray(selected) && selected.length > 0);

  // The preview currently focused
  const activePreview =
    previewIdx !== null ? options[previewIdx]?.preview : null;

  return (
    <div className={styles['question-block']}>
      {/* Question number + header chip */}
      {(totalQuestions > 1 || header) && (
        <div className={styles['question-meta']}>
          {totalQuestions > 1 && (
            <span className={styles['question-number']}>
              Question {questionNumber} of {totalQuestions}
            </span>
          )}
          {header && <span className={styles['header-chip']}>{header}</span>}
        </div>
      )}

      {/* Question text */}
      <div className={styles['question-text']}>{question}</div>

      {/* Options + Preview side-by-side layout */}
      {isPending && options.length > 0 && (
        <div
          className={`${styles['options-layout-row']} ${activePreview ? styles['with-preview'] : ""}`}
        >
          <div className={styles['options-list']}>
            {options.map((option: QuestionOption, optionIndex: number) => {
              const isSelected = multiSelect
                ? Array.isArray(selected) && selected.includes(option.label)
                : selected === option.label;
              const isFocused = previewIdx === optionIndex;

              return (
                <button
                  key={optionIndex}
                  className={`${styles['option-button']} ${isSelected ? styles['option-selected'] : ""} ${isFocused ? styles['option-focused'] : ""}`}
                  onClick={() => handleOptionClick(option.label)}
                  onMouseEnter={() => (option.preview ? setPreviewIdx(optionIndex) : null)}
                  onMouseLeave={() => setPreviewIdx(null)}
                >
                  {multiSelect && (
                    <span
                      className={`${styles['checkbox']} ${isSelected ? styles['checkbox-checked'] : ""}`}
                    >
                      {isSelected && <Check size={10} />}
                    </span>
                  )}
                  <span className={styles['option-label']}>{option.label}</span>
                  {option.preview && (
                    <ChevronRight size={12} className={styles['preview-hint']} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Preview pane — shown when hovering an option with preview content */}
          {activePreview && (
            <div className={styles['preview-pane']}>
              <pre className={styles['preview-content']}>{activePreview}</pre>
            </div>
          )}
        </div>
      )}

      {/* Free-text input — same shell as the main chat input */}
      {isPending && (
        <InputBoxComponent>
          <div className={styles['answer-input-row']}>
            <textarea
              ref={inputRef}
              rows={1}
              className={styles['answer-textarea']}
              placeholder={
                options.length > 0
                  ? "Or type a custom answer…"
                  : "Type your answer…"
              }
              value={freeText}
              onChange={(
                e: React.ChangeEvent<HTMLTextAreaElement>,
              ) => setFreeText(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <ChatInputButton
              icon={<StickyNote size={18} />}
              label="Add notes to this answer"
              isActive={showAnnotations}
              onClick={() => setShowAnnotations((value) => !value)}
            />
            <ChatInputButton
              variant="submit"
              onClick={handleSubmit}
              disabled={!canSubmit}
              label="Send answer"
            />
          </div>
        </InputBoxComponent>
      )}

      {/* Annotations textarea */}
      {isPending && showAnnotations && (
        <div className={styles['annotations-layout-row']}>
          <TextAreaComponent
            placeholder="Add notes or context for this answer…"
            value={annotations}
            onChange={(
              e: React.ChangeEvent<HTMLTextAreaElement>,
            ) => setAnnotations(e.target.value)}
            minRows={2}
          />
        </div>
      )}

      {/* Resolved state */}
      {!isPending && answeredWith && (
        <div className={styles['answered-layout-row']}>
          <Check size={14} className={styles['answered-icon']} />
          <span className={styles['answered-text']}>
            {Array.isArray(answeredWith)
              ? answeredWith.join(", ")
              : answeredWith}
          </span>
        </div>
      )}
    </div>
  );
}

interface UserQuestionCardComponentProps {
  questions?: NormalizedQuestion[];
  context?: string | null;
  onAnswer?: (_answers: QuestionAnswerData[]) => void;
  isPending?: boolean;
  answeredWith?: Array<QuestionAnswerData | string> | null;
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
}: UserQuestionCardComponentProps) {
  const normalizedQuestions = questions;

  // Track answers per question index
  const [collectedAnswers, setCollectedAnswers] = useState<Record<number, QuestionAnswerData>>({});
  const isMultiQuestion = normalizedQuestions.length > 1;
  const answeredCount = Object.keys(collectedAnswers).length;
  const allAnswered = isMultiQuestion
    ? answeredCount === normalizedQuestions.length
    : false;

  const handleQuestionAnswer = useCallback(
    (index: number, answerData: QuestionAnswerData) => {
      if (isMultiQuestion) {
        // Collect answers for batch submission
        setCollectedAnswers((previous: Record<number, QuestionAnswerData>) => ({ ...previous, [index]: answerData }));
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
      (_: NormalizedQuestion, questionIndex: number) => collectedAnswers[questionIndex],
    );
    onAnswer?.(orderedAnswers);
  }, [allAnswered, normalizedQuestions, collectedAnswers, onAnswer]);

  if (normalizedQuestions.length === 0) return null;

  return (
    <div className={`user-question-card-component ${styles['card']} ${!isPending ? styles['resolved'] : ""}`}>
      <div className={styles['header']}>
        <MessageCircleQuestion size={16} className={styles['icon']} />
        <span className={styles['label']}>
          Agent Question{normalizedQuestions.length > 1 ? "s" : ""}
        </span>
        {isMultiQuestion && (
          <span className={styles['count-badge']}>
            {answeredCount}/{normalizedQuestions.length} answered
          </span>
        )}
        {isPending ? (
          <span className={styles['header-status']}>
            <span className={styles['header-status-dot']} />
            Waiting for your answer
          </span>
        ) : (
          <span className={styles['header-status-resolved']}>
            <Check size={12} />
            Answered
          </span>
        )}
      </div>

      {/* Context block */}
      {context && (
        <div className={styles['context']}>
          <pre className={styles['context-pre']}>{context}</pre>
        </div>
      )}

      {/* Questions */}
      {normalizedQuestions.map((normalizedQuestion: NormalizedQuestion, questionIndex: number) => {
        const answeredItem = answeredWith?.[questionIndex];
        const resolvedAnswer = !isPending
          ? (typeof answeredItem === "object" && answeredItem !== null && "answer" in answeredItem
            ? (answeredItem as QuestionAnswerData).answer as string | string[]
            : answeredItem as string | null)
          : (collectedAnswers[questionIndex]?.answer as string | string[] || null);

        return (
          <QuestionBlock
            key={questionIndex}
            questionNumber={questionIndex + 1}
            totalQuestions={normalizedQuestions.length}
            question={normalizedQuestion.question}
            header={normalizedQuestion.header}
            options={normalizedQuestion.options || []}
            multiSelect={normalizedQuestion.multiSelect || false}
            isPending={isPending && !collectedAnswers[questionIndex]}
            onAnswer={(answerData: QuestionAnswerData) => handleQuestionAnswer(questionIndex, answerData)}
            answeredWith={resolvedAnswer}
          />
        );
      })}

      {/* Multi-question batch submit */}
      {isPending && isMultiQuestion && (
        <div className={styles['batch-submit']}>
          <button
            className={`${styles['submit-all-button']} ${allAnswered ? styles['submit-all-ready'] : ""}`}
            onClick={handleSubmitAll}
            disabled={!allAnswered}
          >
            <Send size={14} />
            Submit All Answers
            {!allAnswered && (
              <span className={styles['remaining']}>
                (
                {normalizedQuestions.length - answeredCount}{" "}
                remaining)
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
