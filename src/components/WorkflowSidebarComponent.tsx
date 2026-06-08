"use client";
import { DEFAULT_WORKFLOW_TITLE } from "@/constants";

import { useMemo } from "react";
import {
  Plus,
  Save,
  Package,
  Bot,
  MessageSquare,
  Type,
  Paperclip,
  Eye,
  Workflow,
  Parentheses,
} from "lucide-react";
import { InputComponent } from "@rodrigo-barraza/components-library";
import HistoryList from "./HistoryListComponent";
import styles from "./WorkflowSidebarComponent.module.css";

interface WorkflowRecord {
  _id?: string;
  id?: string;
  name?: string;
  userContent?: string;
  updatedAt?: string;
  createdAt?: string;
  totalCost?: number;
  modalities?: Record<string, number | boolean>;
  providers?: string[];
  userName?: string;
}

interface WorkflowSidebarProps {
  admin?: boolean;
  workflows?: WorkflowRecord[];
  activeWorkflowId?: string;
  onLoadWorkflow?: (id: string) => void;
  onDeleteWorkflow?: (id: string) => void;
  onDownloadWorkflow?: (id: string) => void;
  onCopyWorkflow?: (id: string) => void;
  onAddAsset?: (type: string, nodeType?: string) => void;
  onNewWorkflow?: () => void;
  onSaveWorkflow?: () => void;
  workflowName?: string;
  onWorkflowNameChange?: (name: string) => void;
  loading?: boolean;
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
  initialProviders?: string[];
  initialSearch?: string;
}

export default function WorkflowSidebar({
  admin = false,
  workflows = [],
  activeWorkflowId,
  onLoadWorkflow,
  onDeleteWorkflow,
  onDownloadWorkflow,
  onCopyWorkflow,
  onAddAsset,
  onNewWorkflow,
  onSaveWorkflow,
  workflowName,
  onWorkflowNameChange,
  loading = false,
  favorites = [],
  onToggleFavorite,
  initialProviders,
  initialSearch = "",
}: WorkflowSidebarProps) {
  const items = useMemo(() => {
    return (workflows || []).map((workflow) => {
      const id = workflow._id || workflow.id || "";
      const name =
        workflow.name ||
        (workflow.userContent
          ? workflow.userContent.substring(0, 80) +
            (workflow.userContent.length > 80 ? "…" : "")
          : DEFAULT_WORKFLOW_TITLE);

      return {
        id,
        title: name,
        updatedAt: workflow.updatedAt,
        createdAt: workflow.createdAt,
        totalCost: workflow.totalCost || 0,
        modalities: workflow.modalities || {},
        providers: workflow.providers || [],
        username: workflow.userName,
        searchText: workflow.userName || "",
      };
    });
  }, [workflows]);

  return (
    <div className={`workflow-sidebar-component ${styles['sidebar']}`}>
      <div className={styles['sidebar-header']}>
        <span className={styles['sidebar-count']}>
          {workflows.length} workflows
        </span>
        {!admin && (
          <div className={styles['sidebar-header-actions']}>
            <button
              className={styles['header-button']}
              onClick={onNewWorkflow}
              title="New Workflow"
            >
              <Plus size={14} />
            </button>
            <button
              className={styles['header-button']}
              onClick={onSaveWorkflow}
              title="Save Workflow"
            >
              <Save size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Workflow name input — user mode only */}
      {!admin && (
        <div className={styles['name-input-wrapper']}>
          <InputComponent
            type="text"
            placeholder={DEFAULT_WORKFLOW_TITLE}
            value={workflowName || ""}
            onChange={(
              e: React.ChangeEvent<HTMLInputElement>,
            ) => onWorkflowNameChange?.(e.target.value)}
          />
        </div>
      )}

      {/* Asset buttons — user mode only */}
      {!admin && onAddAsset && (
        <div className={styles['asset-section']}>
          <div className={styles['asset-section-label']}>
            <Package size={11} />
            Assets
          </div>
          <div className={styles['asset-buttons']}>
            <button
              className={styles['asset-button']}
              onClick={() => onAddAsset("model")}
              title="Add AI Model"
            >
              <Bot size={12} style={{ color: "#3b82f6" }} />
              <span>AI Model</span>
            </button>
            <button
              className={styles['asset-button']}
              onClick={() => onAddAsset("conversation", "input")}
              title="Add Chat History"
            >
              <MessageSquare size={12} style={{ color: "#8b5cf6" }} />
              <span>Chat History</span>
            </button>
            <button
              className={styles['asset-button']}
              onClick={() => onAddAsset("text", "input")}
              title="Add Text"
            >
              <Type size={12} style={{ color: "#6366f1" }} />
              <span>Text</span>
            </button>
            <button
              className={styles['asset-button']}
              onClick={() => onAddAsset("file", "input")}
              title="Add Media"
            >
              <Paperclip size={12} style={{ color: "#8b5cf6" }} />
              <span>Media</span>
            </button>
            <button
              className={styles['asset-button']}
              onClick={() => onAddAsset("text", "viewer")}
              title="Add Output"
            >
              <Eye size={12} style={{ color: "#a78bfa" }} />
              <span>Output</span>
            </button>
            <button
              className={styles['asset-button']}
              onClick={() => onAddAsset("tools", "tools")}
              title="Add Function Calling Tools"
            >
              <Parentheses size={12} style={{ color: "#f97316" }} />
              <span>Tools</span>
            </button>
          </div>
        </div>
      )}

      {/* Workflow list — uses shared HistoryList */}
      <HistoryList
        items={items}
        activeId={activeWorkflowId}
        onSelect={(item) => onLoadWorkflow?.(item.id)}
        onDelete={!admin ? onDeleteWorkflow : undefined}
        onDownload={onDownloadWorkflow}
        onCopy={onCopyWorkflow}
        icon={Workflow}
        readOnly={false}
        emptyLabel={loading ? "Loading…" : "No workflows yet"}
        searchPlaceholder="Search workflows…"
        admin={admin}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        initialProviders={initialProviders}
        initialSearch={initialSearch}
      />
    </div>
  );
}
