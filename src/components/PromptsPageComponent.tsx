"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BookText,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  Save,
  X,
  LayoutGrid,
  List,
  Table,
} from "lucide-react";
import PrismService from "../services/PrismService";
import {
  ButtonComponent,
  CloseButtonComponent,
  IconButtonComponent,
  PaginationComponent,
  SearchInputComponent,
  SegmentedControlComponent,
  TableComponent,
} from "@rodrigo-barraza/components-library";

import { LoadingMessage } from "./StateMessageComponent";
import { usePersistedState } from "../hooks/usePersistedState";
import MarkdownContent from "./MarkdownContentComponent";
import styles from "./PromptsPageComponent.module.css";

import type { Prompt } from "../types/types";

type PromptDocument = Prompt;

const PAGE_SIZE = 30;

const ESTIMATED_TOKENS_PER_WORD = 1.33;

const COLOR_OPTIONS = [
  { name: "Muted", value: "oklch(0.53 0.03 240)" },
  { name: "Blue", value: "oklch(0.61 0.16 245)" },
  { name: "Indigo", value: "oklch(0.58 0.19 275)" },
  { name: "Purple", value: "oklch(0.60 0.18 300)" },
  { name: "Pink", value: "oklch(0.63 0.19 335)" },
  { name: "Crimson", value: "oklch(0.57 0.20 20)" },
  { name: "Orange", value: "oklch(0.68 0.17 50)" },
  { name: "Amber", value: "oklch(0.74 0.15 75)" },
  { name: "Teal", value: "oklch(0.67 0.12 190)" },
  { name: "Emerald", value: "oklch(0.66 0.15 150)" }
];

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateTokens(text: string): number {
  return Math.ceil(countWords(text) * ESTIMATED_TOKENS_PER_WORD);
}

export default function PromptsPageComponent() {
  const [prompts, setPrompts] = useState<PromptDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [isCreating, setIsCreating] = useState(false);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formColor, setFormColor] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [viewMode, setViewMode] = usePersistedState("prompts-page:view-mode", "card");

  const [modalPrompt, setModalPrompt] = useState<PromptDocument | null>(null);
  const [modalEditMode, setModalEditMode] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalContent, setModalContent] = useState("");
  const [modalTags, setModalTags] = useState("");
  const [modalColor, setModalColor] = useState("");
  const [isModalSaving, setIsModalSaving] = useState(false);

  const loadPrompts = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
      if (search) params.search = search;

      const result = await PrismService.getPrompts(params);
      setPrompts(result.data || []);
      setTotal(result.total || 0);
    } catch (error: unknown) {
      console.error("Failed to load prompts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormTags("");
    setFormColor("");
    setIsCreating(false);
    setIsSaving(false);
  };

  const handleCreate = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setIsSaving(true);
    try {
      const tags = formTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      await PrismService.createPrompt({
        title: formTitle.trim(),
        content: formContent.trim(),
        tags,
        color: formColor || undefined,
      });
      resetForm();
      loadPrompts();
    } catch (error: unknown) {
      console.error("Failed to create prompt:", error);
      setIsSaving(false);
    }
  };



  const handleDelete = async (promptId: string) => {
    try {
      await PrismService.deletePrompt(promptId);
      setDeletingPromptId(null);
      loadPrompts();
    } catch (error: unknown) {
      console.error("Failed to delete prompt:", error);
    }
  };

  const handleCopyToClipboard = useCallback(async (prompt: PromptDocument) => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopiedPromptId(prompt.id);
      setTimeout(() => setCopiedPromptId(null), 2000);
    } catch {
      /* clipboard API may fail in non-secure contexts */
    }
  }, []);

  const openPromptModal = (prompt: PromptDocument, shouldOpenInEditMode = false) => {
    setModalPrompt(prompt);
    setModalEditMode(shouldOpenInEditMode);
    setModalTitle(prompt.title);
    setModalContent(prompt.content);
    setModalTags((prompt.tags || []).join(", "));
    setModalColor(prompt.color || "");
  };

  const closePromptModal = () => {
    setModalPrompt(null);
    setModalEditMode(false);
    setModalColor("");
    setIsModalSaving(false);
  };

  const handleModalSave = async () => {
    if (!modalPrompt || !modalTitle.trim() || !modalContent.trim()) return;
    setIsModalSaving(true);
    try {
      const tags = modalTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      await PrismService.updatePrompt(modalPrompt.id, {
        title: modalTitle.trim(),
        content: modalContent.trim(),
        tags,
        color: modalColor || "",
      });
      closePromptModal();
      loadPrompts();
    } catch (error: unknown) {
      console.error("Failed to update prompt:", error);
      setIsModalSaving(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const tableColumns = useMemo(() => [
    {
      key: "title",
      label: "Title",
      sortable: true,
      sortValue: (row: PromptDocument) => row.title.toLowerCase(),
      render: (row: PromptDocument) => (
        <div className={styles["table-title-container"]}>
          {row.color && (
            <span
              className={styles["color-indicator-dot"]}
              style={{ backgroundColor: row.color }}
              title="Prompt color label"
            />
          )}
          <span className={styles["table-title-cell"]}>{row.title}</span>
        </div>
      ),
    },
    {
      key: "tags",
      label: "Tags",
      render: (row: PromptDocument) => (
        <div className={styles["table-tags-cell"]}>
          {row.tags?.map((tag) => (
            <span key={tag} className={styles["tag-badge"]}>{tag}</span>
          ))}
        </div>
      ),
    },
    {
      key: "words",
      label: "Words",
      sortable: true,
      sortValue: (row: PromptDocument) => countWords(row.content),
      render: (row: PromptDocument) => (
        <span className={styles["table-stat-cell"]}>{countWords(row.content).toLocaleString()}</span>
      ),
    },
    {
      key: "tokens",
      label: "Est. Tokens",
      sortable: true,
      sortValue: (row: PromptDocument) => estimateTokens(row.content),
      render: (row: PromptDocument) => (
        <span className={styles["table-stat-cell"]}>~{estimateTokens(row.content).toLocaleString()}</span>
      ),
    },
    {
      key: "updatedAt",
      label: "Updated",
      sortable: true,
      sortValue: (row: PromptDocument) => row.updatedAt || "",
      render: (row: PromptDocument) => (
        <span className={styles["prompt-timestamp"]}>
          {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (row: PromptDocument) => {
        const isCopied = copiedPromptId === row.id;
        return (
          <div
            className={styles["table-actions-cell"]}
            onClick={(event) => event.stopPropagation()}
          >
            <IconButtonComponent
              icon={isCopied ? <Check size={13} /> : <Copy size={13} />}
              onClick={() => handleCopyToClipboard(row)}
              tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
              active={isCopied}
            />
          </div>
        );
      },
    },
  ], [copiedPromptId, handleCopyToClipboard]);

  const renderForm = () => (
    <div className={styles["form-card"]}>
      <div className={styles["form-body"]}>
        <div className={styles["form-field"]}>
          <label className={styles["form-label"]}>Title</label>
          <input
            type="text"
            className={styles["form-input"]}
            value={formTitle}
            onChange={(event) => setFormTitle(event.target.value)}
            placeholder="Give your prompt a descriptive title…"
            autoFocus
          />
        </div>
        <div className={styles["form-field"]}>
          <label className={styles["form-label"]}>Content</label>
          <textarea
            className={styles["form-textarea"]}
            value={formContent}
            onChange={(event) => setFormContent(event.target.value)}
            placeholder="Write your prompt content here…"
            rows={6}
          />
        </div>
        <div className={styles["form-field"]}>
          <label className={styles["form-label"]}>Tags (comma-separated)</label>
          <input
            type="text"
            className={styles["form-input"]}
            value={formTags}
            onChange={(event) => setFormTags(event.target.value)}
            placeholder="e.g. coding, creative, analysis"
          />
        </div>
        <div className={styles["form-field"]}>
          <label className={styles["form-label"]}>Label Color</label>
          <div className={styles["color-picker-group"]}>
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles["color-picker-button"]} ${formColor === option.value ? styles["is-selected-state"] : ""}`}
                style={{ "--option-color": option.value } as React.CSSProperties}
                onClick={() => setFormColor(option.value)}
                title={option.name}
              >
                {formColor === option.value && <Check size={12} />}
              </button>
            ))}
            {formColor && (
              <button
                type="button"
                className={styles["clear-color-button"]}
                onClick={() => setFormColor("")}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      <div className={styles["form-actions"]}>
        <ButtonComponent
          variant="primary"
          size="small"
          icon={Save}
          onClick={handleCreate}
          disabled={isSaving || !formTitle.trim() || !formContent.trim()}
        >
          Create
        </ButtonComponent>
        <ButtonComponent variant="disabled" size="small" icon={X} onClick={resetForm}>
          Cancel
        </ButtonComponent>
      </div>
    </div>
  );

  const renderPromptCard = (prompt: PromptDocument) => {
    const isDeleting = deletingPromptId === prompt.id;
    const isCopied = copiedPromptId === prompt.id;
    const wordCount = countWords(prompt.content);
    const tokenEstimate = estimateTokens(prompt.content);

    return (
      <div
        key={prompt.id}
        className={styles["prompt-card"]}
        style={{
          borderLeft: prompt.color ? `4px solid ${prompt.color}` : undefined,
          "--prompt-color": prompt.color || undefined,
        } as React.CSSProperties}
        onClick={() => openPromptModal(prompt)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPromptModal(prompt);
          }
        }}
      >
        <div className={styles["prompt-card-header"]}>
          {prompt.color && (
            <span
              className={styles["color-indicator-dot"]}
              style={{ backgroundColor: prompt.color }}
              title="Prompt color label"
            />
          )}
          <span className={styles["prompt-title"]}>
            {prompt.title}
          </span>
          {prompt.tags?.map((tag) => (
            <span key={tag} className={styles["tag-badge"]}>
              {tag}
            </span>
          ))}
          <span className={styles["metric-badge"]} title="Word count">
            {wordCount.toLocaleString()} words
          </span>
          <span className={styles["metric-badge"]} title="Estimated tokens">
            ~{tokenEstimate.toLocaleString()} tokens
          </span>
          {prompt.updatedAt && (
            <span className={styles["prompt-timestamp"]}>
              {new Date(prompt.updatedAt).toLocaleDateString()}
            </span>
          )}
          <div
            className={styles["prompt-actions"]}
            onClick={(event) => event.stopPropagation()}
          >
            <IconButtonComponent
              icon={isCopied ? <Check size={13} /> : <Copy size={13} />}
              onClick={() => handleCopyToClipboard(prompt)}
              tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
              active={isCopied}
            />
            <IconButtonComponent
              icon={<Pencil size={13} />}
              onClick={() => openPromptModal(prompt, true)}
              tooltip="Edit prompt"
            />
            <IconButtonComponent
              icon={<Trash2 size={13} />}
              onClick={() => setDeletingPromptId(prompt.id)}
              tooltip="Delete prompt"
              variant="destructive"
            />
          </div>
        </div>
        <MarkdownContent
          content={prompt.content}
          className={styles["prompt-content"]}
        />
        {isDeleting && (
          <div
            className={styles["delete-confirmation-overlay"]}
            onClick={(event) => event.stopPropagation()}
          >
            <span>Delete this prompt?</span>
            <ButtonComponent
              variant="destructive"
              size="small"
              onClick={() => handleDelete(prompt.id)}
            >
              Delete
            </ButtonComponent>
            <ButtonComponent
              variant="disabled"
              size="small"
              onClick={() => setDeletingPromptId(null)}
            >
              Cancel
            </ButtonComponent>
          </div>
        )}
      </div>
    );
  };

  const renderListItem = (prompt: PromptDocument) => {
    const isCopied = copiedPromptId === prompt.id;
    const wordCount = countWords(prompt.content);
    const tokenEstimate = estimateTokens(prompt.content);

    return (
      <div
        key={prompt.id}
        className={styles["list-item"]}
        style={{
          borderLeft: prompt.color ? `4px solid ${prompt.color}` : undefined,
        } as React.CSSProperties}
        onClick={() => openPromptModal(prompt)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPromptModal(prompt);
          }
        }}
      >
        {prompt.color && (
          <span
            className={styles["color-indicator-dot"]}
            style={{ backgroundColor: prompt.color }}
            title="Prompt color label"
          />
        )}
        <span className={styles["list-item-title"]}>{prompt.title}</span>
        <div className={styles["list-item-tags"]}>
          {prompt.tags?.map((tag) => (
            <span key={tag} className={styles["tag-badge"]}>{tag}</span>
          ))}
        </div>
        <span className={styles["metric-badge"]}>{wordCount.toLocaleString()} words</span>
        <span className={styles["metric-badge"]}>~{tokenEstimate.toLocaleString()} tokens</span>
        <span className={styles["prompt-timestamp"]}>
          {prompt.updatedAt ? new Date(prompt.updatedAt).toLocaleDateString() : ""}
        </span>
        <div
          className={styles["prompt-actions"]}
          onClick={(event) => event.stopPropagation()}
        >
          <IconButtonComponent
            icon={isCopied ? <Check size={13} /> : <Copy size={13} />}
            onClick={() => handleCopyToClipboard(prompt)}
            tooltip={isCopied ? "Copied!" : "Copy to clipboard"}
            active={isCopied}
          />
          <IconButtonComponent
            icon={<Pencil size={13} />}
            onClick={() => openPromptModal(prompt, true)}
            tooltip="Edit prompt"
          />
          <IconButtonComponent
            icon={<Trash2 size={13} />}
            onClick={() => setDeletingPromptId(prompt.id)}
            tooltip="Delete prompt"
            variant="destructive"
          />
        </div>
      </div>
    );
  };

  return (
    <div className={`prompts-page-component ${styles['container']}`}>
      {/* Header */}
      <div className={styles['header']}>
        <div className={styles["header-left"]}>
          <h1 className={styles['title']}>
            <BookText className={styles["title-icon"]} size={22} />
            Prompts
          </h1>
          <p className={styles['subtitle']}>
            Create and store your own reusable prompts and messages.
          </p>
        </div>

        <div className={styles["header-right"]}>
          {!isCreating && (
            <ButtonComponent
              variant="primary"
              size="small"
              icon={Plus}
              onClick={() => {
                resetForm();
                setIsCreating(true);
              }}
            >
              New Prompt
            </ButtonComponent>
          )}
        </div>
      </div>

      <div className={styles['page']}>
        <SearchInputComponent
          value={searchInput}
          onChange={(value: string) => {
            setSearchInput(value);
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search prompts…"
          compact
          className={styles["search-wrapper"]}
        />

        <div className={styles["view-controls-layout-row"]}>
          <SegmentedControlComponent
            value={viewMode}
            onChange={setViewMode}
            compact
            segments={[
              { value: "card", icon: <LayoutGrid size={14} />, label: "Cards" },
              { value: "list", icon: <List size={14} />, label: "List" },
              { value: "table", icon: <Table size={14} />, label: "Table" },
            ]}
          />
        </div>

        {/* Create Form */}
        {isCreating && renderForm()}

        {isLoading && <LoadingMessage message="Loading prompts..." />}

        {/* Card View */}
        {!isLoading && viewMode === "card" && (
          <div className={styles["prompt-list"]}>
            {prompts.map((prompt) => renderPromptCard(prompt))}
          </div>
        )}

        {/* List View */}
        {!isLoading && viewMode === "list" && (
          <div className={styles["prompt-list-view"]}>
            {prompts.map((prompt) => renderListItem(prompt))}
          </div>
        )}

        {/* Table View */}
        {!isLoading && viewMode === "table" && (
          <div className={styles["table-wrapper"]}>
            <TableComponent
              columns={tableColumns}
              data={prompts}
              getRowKey={(row: PromptDocument) => row.id}
              emptyText="No prompts found."
              onRowClick={(row: PromptDocument) => openPromptModal(row)}
              storageKey="prompts-table"
            />
          </div>
        )}

        {!isLoading && prompts.length === 0 && !isCreating && (
          <div className={styles["empty-state-container"]}>
            <BookText size={48} className={styles["empty-state-icon"]} />
            <p className={styles["empty-state-title"]}>No prompts yet</p>
            <p className={styles["empty-state-description"]}>
              Create your first prompt to start building your personal prompt library.
            </p>
            <ButtonComponent
              variant="primary"
              icon={Plus}
              onClick={() => {
                resetForm();
                setIsCreating(true);
              }}
            >
              Create Your First Prompt
            </ButtonComponent>
          </div>
        )}

        {/* Pagination */}
        <PaginationComponent
          page={page}
          totalPages={totalPages}
          totalItems={total}
          onPageChange={setPage}
        />
      </div>

      {/* Prompt Detail Modal */}
      {modalPrompt && (
        <div
          className={styles["modal-overlay"]}
          onClick={closePromptModal}
        >
          <div
            className={styles["modal-container"]}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles["modal-header"]}>
              {modalPrompt.color && (
                <span
                  className={styles["color-indicator-dot"]}
                  style={{ backgroundColor: modalPrompt.color, marginInlineEnd: 4 }}
                />
              )}
              {modalEditMode ? (
                <input
                  type="text"
                  className={styles["modal-title-input"]}
                  value={modalTitle}
                  onChange={(event) => setModalTitle(event.target.value)}
                  autoFocus
                />
              ) : (
                <h2 className={styles["modal-title"]}>{modalPrompt.title}</h2>
              )}
              <div className={styles["modal-header-actions"]}>
                {modalEditMode ? (
                  <>
                    <ButtonComponent
                      variant="primary"
                      size="small"
                      icon={Save}
                      onClick={handleModalSave}
                      disabled={isModalSaving || !modalTitle.trim() || !modalContent.trim()}
                    >
                      Save
                    </ButtonComponent>
                    <ButtonComponent
                      variant="disabled"
                      size="small"
                      icon={X}
                      onClick={() => {
                        setModalEditMode(false);
                        setModalTitle(modalPrompt.title);
                        setModalContent(modalPrompt.content);
                        setModalTags((modalPrompt.tags || []).join(", "));
                      }}
                    >
                      Cancel
                    </ButtonComponent>
                  </>
                ) : (
                  <>
                    <ButtonComponent
                      variant="disabled"
                      size="small"
                      icon={copiedPromptId === modalPrompt.id ? Check : Copy}
                      onClick={() => handleCopyToClipboard(modalPrompt)}
                    >
                      {copiedPromptId === modalPrompt.id ? "Copied" : "Copy"}
                    </ButtonComponent>
                    <ButtonComponent
                      variant="disabled"
                      size="small"
                      icon={Pencil}
                      onClick={() => setModalEditMode(true)}
                    >
                      Edit
                    </ButtonComponent>
                  </>
                )}
                <CloseButtonComponent onClick={closePromptModal} />
              </div>
            </div>

            <div className={styles["modal-meta"]}>
              {modalPrompt.tags?.map((tag) => (
                <span key={tag} className={styles["tag-badge"]}>{tag}</span>
              ))}
              <span className={styles["metric-badge"]}>
                {countWords(modalEditMode ? modalContent : modalPrompt.content).toLocaleString()} words
              </span>
              <span className={styles["metric-badge"]}>
                ~{estimateTokens(modalEditMode ? modalContent : modalPrompt.content).toLocaleString()} tokens
              </span>
              {modalPrompt.updatedAt && (
                <span className={styles["prompt-timestamp"]}>
                  Updated {new Date(modalPrompt.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {modalEditMode ? (
              <div className={styles["modal-edit-body"]}>
                <div className={styles["form-field"]}>
                  <label className={styles["form-label"]}>Content</label>
                  <textarea
                    className={styles["modal-textarea"]}
                    value={modalContent}
                    onChange={(event) => setModalContent(event.target.value)}
                    rows={16}
                  />
                </div>
                <div className={styles["form-field"]}>
                  <label className={styles["form-label"]}>Tags (comma-separated)</label>
                  <input
                    type="text"
                    className={styles["form-input"]}
                    value={modalTags}
                    onChange={(event) => setModalTags(event.target.value)}
                    placeholder="e.g. coding, creative, analysis"
                  />
                </div>
                <div className={styles["form-field"]}>
                  <label className={styles["form-label"]}>Label Color</label>
                  <div className={styles["color-picker-group"]}>
                    {COLOR_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles["color-picker-button"]} ${modalColor === option.value ? styles["is-selected-state"] : ""}`}
                        style={{ "--option-color": option.value } as React.CSSProperties}
                        onClick={() => setModalColor(option.value)}
                        title={option.name}
                      >
                        {modalColor === option.value && <Check size={12} />}
                      </button>
                    ))}
                    {modalColor && (
                      <button
                        type="button"
                        className={styles["clear-color-button"]}
                        onClick={() => setModalColor("")}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <MarkdownContent
                content={modalPrompt.content}
                className={styles["modal-content"]}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
