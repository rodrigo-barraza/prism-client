"use client";

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
import HistoryList from "./HistoryListComponent";
import styles from "./WorkflowSidebarComponent.module.css";

export default function WorkflowSidebar({
  admin = false,
  workflows = [],
  // @ts-ignore
  // @ts-ignore
  activeWorkflowId: any,
  // @ts-ignore
  // @ts-ignore
  onLoadWorkflow: any,
  // @ts-ignore
  // @ts-ignore
  onDeleteWorkflow: any,
  // @ts-ignore
  // @ts-ignore
  onDownloadWorkflow: any,
  // @ts-ignore
  // @ts-ignore
  onCopyWorkflow: any,
  // @ts-ignore
  // @ts-ignore
  onAddAsset: any,
  // @ts-ignore
  // @ts-ignore
  onNewWorkflow: any,
  // @ts-ignore
  // @ts-ignore
  onSaveWorkflow: any,
  // @ts-ignore
  // @ts-ignore
  workflowName: any,
  // @ts-ignore
  // @ts-ignore
  onWorkflowNameChange: any,
  loading = false,
  favorites = [],
  // @ts-ignore
  // @ts-ignore
  onToggleFavorite: any,
  // @ts-ignore
  // @ts-ignore
  initialProviders: any,
  initialSearch = "",
}) {
  // Normalize workflows into HistoryList items
  const items = useMemo<any>(() => {
    return workflows.map((wf) => {
      // @ts-ignore
      // @ts-ignore
      const id = wf._id || wf.id;
      const name =
        // @ts-ignore
        wf.name ||
        // @ts-ignore
        (wf.userContent
          // @ts-ignore
          ? wf.userContent.substring(0, 80) +
            // @ts-ignore
            (wf.userContent.length > 80 ? "…" : "")
          : "Untitled Workflow");

      return {
        id,
        title: name,
        // @ts-ignore
        updatedAt: wf.updatedAt,
        // @ts-ignore
        createdAt: wf.createdAt,
        // @ts-ignore
        totalCost: wf.totalCost || 0,
        // @ts-ignore
        modalities: wf.modalities || {},
        // @ts-ignore
        providers: wf.providers || [],
        // @ts-ignore
        username: wf.userName,
        // @ts-ignore
        searchText: wf.userName || "",
      };
    });
  }, [workflows]);

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarCount}>
          {workflows.length} workflows
        </span>
        {!admin && (
          <div className={styles.sidebarHeaderActions}>
            <button
              className={styles.headerBtn}
              // @ts-ignore
              onClick={onNewWorkflow}
              title="New Workflow"
            >
              <Plus size={14} />
            </button>
            <button
              className={styles.headerBtn}
              // @ts-ignore
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
        <div className={styles.nameInputWrapper}>
          <input
            type="text"
            className={styles.nameInput}
            placeholder="Untitled Workflow"
            // @ts-ignore
            value={workflowName || ""}
            // @ts-ignore
            onChange={(e) => onWorkflowNameChange?.(e.target.value)}
          />
        </div>
      )}

      {/* Asset buttons — user mode only */}
      {/* @ts-ignore */}
      {!admin && onAddAsset && (
        <div className={styles.assetSection}>
          <div className={styles.assetSectionLabel}>
            <Package size={11} />
            Assets
          </div>
          <div className={styles.assetButtons}>
            <button
              className={styles.assetBtn}
              // @ts-ignore
              onClick={() => onAddAsset("model")}
              title="Add AI Model"
            >
              <Bot size={12} style={{ color: "#3b82f6" }} />
              <span>AI Model</span>
            </button>
            <button
              className={styles.assetBtn}
              // @ts-ignore
              onClick={() => onAddAsset("conversation", "input")}
              title="Add Chat History"
            >
              <MessageSquare size={12} style={{ color: "#8b5cf6" }} />
              <span>Chat History</span>
            </button>
            <button
              className={styles.assetBtn}
              // @ts-ignore
              onClick={() => onAddAsset("text", "input")}
              title="Add Text"
            >
              <Type size={12} style={{ color: "#6366f1" }} />
              <span>Text</span>
            </button>
            <button
              className={styles.assetBtn}
              // @ts-ignore
              onClick={() => onAddAsset("file", "input")}
              title="Add Media"
            >
              <Paperclip size={12} style={{ color: "#8b5cf6" }} />
              <span>Media</span>
            </button>
            <button
              className={styles.assetBtn}
              // @ts-ignore
              onClick={() => onAddAsset("text", "viewer")}
              title="Add Output"
            >
              <Eye size={12} style={{ color: "#a78bfa" }} />
              <span>Output</span>
            </button>
            <button
              className={styles.assetBtn}
              // @ts-ignore
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
      {/* @ts-ignore */}
      <HistoryList
        items={items}
        // @ts-ignore
        activeId={activeWorkflowId}
        // @ts-ignore
        onSelect={(item: any) => onLoadWorkflow?.(item.id)}
        // @ts-ignore
        onDelete={!admin ? onDeleteWorkflow : undefined}
        // @ts-ignore
        onDownload={onDownloadWorkflow}
        // @ts-ignore
        onCopy={onCopyWorkflow}
        icon={Workflow}
        readOnly={false}
        emptyLabel={loading ? "Loading…" : "No workflows yet"}
        searchPlaceholder="Search workflows…"
        admin={admin}
        favorites={favorites}
        // @ts-ignore
        onToggleFavorite={onToggleFavorite}
        // @ts-ignore
        initialProviders={initialProviders}
        initialSearch={initialSearch}
      />
    </div>
  );
}
