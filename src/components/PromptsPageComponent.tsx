"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookText,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  Save,
  X,
} from "lucide-react";
import PrismService from "../services/PrismService";
import {
  PaginationComponent,
  SearchInputComponent,
} from "@rodrigo-barraza/components-library";
import { FilterBarComponent } from "./FilterBarComponent";
import { LoadingMessage } from "./StateMessageComponent";
import styles from "./PromptsPageComponent.module.css";

interface PromptDocument {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const PAGE_SIZE = 30;

export default function PromptsPageComponent() {
  const [prompts, setPrompts] = useState<PromptDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [isCreating, setIsCreating] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formTags, setFormTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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
    setIsCreating(false);
    setEditingPromptId(null);
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
      });
      resetForm();
      loadPrompts();
    } catch (error: unknown) {
      console.error("Failed to create prompt:", error);
      setIsSaving(false);
    }
  };

  const handleEdit = (prompt: PromptDocument) => {
    setEditingPromptId(prompt.id);
    setFormTitle(prompt.title);
    setFormContent(prompt.content);
    setFormTags((prompt.tags || []).join(", "));
    setIsCreating(false);
  };

  const handleUpdate = async () => {
    if (!editingPromptId || !formTitle.trim() || !formContent.trim()) return;
    setIsSaving(true);
    try {
      const tags = formTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      await PrismService.updatePrompt(editingPromptId, {
        title: formTitle.trim(),
        content: formContent.trim(),
        tags,
      });
      resetForm();
      loadPrompts();
    } catch (error: unknown) {
      console.error("Failed to update prompt:", error);
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

  const handleCopyToClipboard = async (prompt: PromptDocument) => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopiedPromptId(prompt.id);
      setTimeout(() => setCopiedPromptId(null), 2000);
    } catch {
      /* clipboard API may fail in non-secure contexts */
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const renderForm = (mode: "create" | "edit") => (
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
      </div>
      <div className={styles["form-actions"]}>
        <button
          className={styles["form-action-save"]}
          onClick={mode === "create" ? handleCreate : handleUpdate}
          disabled={isSaving || !formTitle.trim() || !formContent.trim()}
        >
          <Save size={13} />
          {mode === "create" ? "Create" : "Save"}
        </button>
        <button className={styles["form-action-cancel"]} onClick={resetForm}>
          <X size={13} />
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles["header-left"]}>
          <h1 className={styles.title}>
            <BookText className={styles["title-icon"]} size={22} />
            Prompts
          </h1>
          <p className={styles.subtitle}>
            Create and store your own reusable prompts and messages.
          </p>
        </div>

        <div className={styles["header-right"]}>
          <div className={styles["stats-badges"]}>
            <div className={styles["stat-badge"]}>
              <span className={styles["stat-value"]}>{total}</span> prompts
            </div>
          </div>
          {!isCreating && !editingPromptId && (
            <button
              className={styles["create-button"]}
              onClick={() => {
                resetForm();
                setIsCreating(true);
              }}
            >
              <Plus size={14} />
              New Prompt
            </button>
          )}
        </div>
      </div>

      <div className={styles.page}>
        {/* Filters */}
        <FilterBarComponent>
          <SearchInputComponent
            value={searchInput}
            onChange={(value: any) => {
              setSearchInput(value);
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search prompts…"
            compact
            className={styles["search-wrapper"]}
          />
        </FilterBarComponent>

        {/* Create Form */}
        {isCreating && renderForm("create")}

        {isLoading && <LoadingMessage message="Loading prompts..." />}

        {/* Prompt List */}
        {!isLoading && (
          <div className={styles["prompt-list"]}>
            {prompts.map((prompt) => {
              const isEditing = editingPromptId === prompt.id;
              const isDeleting = deletingPromptId === prompt.id;
              const isCopied = copiedPromptId === prompt.id;

              if (isEditing) {
                return (
                  <div key={prompt.id}>{renderForm("edit")}</div>
                );
              }

              return (
                <div key={prompt.id} className={styles["prompt-card"]}>
                  <div className={styles["prompt-card-header"]}>
                    <span className={styles["prompt-title"]}>
                      {prompt.title}
                    </span>
                    {prompt.tags?.map((tag) => (
                      <span key={tag} className={styles["tag-badge"]}>
                        {tag}
                      </span>
                    ))}
                    {prompt.updatedAt && (
                      <span className={styles["prompt-timestamp"]}>
                        {new Date(prompt.updatedAt).toLocaleDateString()}
                      </span>
                    )}
                    <div className={styles["prompt-actions"]}>
                      <button
                        className={`${styles["action-button"]} ${styles["action-button-copy"]} ${isCopied ? styles["is-copied-state"] : ""}`}
                        onClick={() => handleCopyToClipboard(prompt)}
                        title={isCopied ? "Copied!" : "Copy to clipboard"}
                      >
                        {isCopied ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                      <button
                        className={styles["action-button"]}
                        onClick={() => handleEdit(prompt)}
                        title="Edit prompt"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className={`${styles["action-button"]} ${styles["action-button-danger"]}`}
                        onClick={() => setDeletingPromptId(prompt.id)}
                        title="Delete prompt"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className={styles["prompt-content"]}>
                    {prompt.content}
                  </div>
                  {isDeleting && (
                    <div className={styles["delete-confirmation-overlay"]}>
                      <span>Delete this prompt?</span>
                      <button
                        className={styles["delete-confirm-button"]}
                        onClick={() => handleDelete(prompt.id)}
                      >
                        Delete
                      </button>
                      <button
                        className={styles["delete-cancel-button"]}
                        onClick={() => setDeletingPromptId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && prompts.length === 0 && !isCreating && (
          <div className={styles["empty-state-container"]}>
            <BookText size={48} className={styles["empty-state-icon"]} />
            <p className={styles["empty-state-title"]}>No prompts yet</p>
            <p className={styles["empty-state-description"]}>
              Create your first prompt to start building your personal prompt library.
            </p>
            <button
              className={styles["create-button"]}
              onClick={() => {
                resetForm();
                setIsCreating(true);
              }}
            >
              <Plus size={14} />
              Create Your First Prompt
            </button>
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
    </div>
  );
}
