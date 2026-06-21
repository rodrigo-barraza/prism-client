"use client";

import { useState, useEffect, useCallback } from "react";
import WorkflowSidebar from "./WorkflowSidebarComponent";
import WorkflowCanvas from "./WorkflowCanvasComponent";
import WorkflowInspector, { type NodeResult } from "./WorkflowInspectorComponent";
import type { Workflow, WorkflowNode, WorkflowConnection, ModelOption } from "../types/types";
import styles from "./WorkflowComponent.module.css";

const noop = () => {};

interface WorkflowComponentProps {
  readOnly?: boolean;
  admin?: boolean;
  nodes?: WorkflowNode[];
  connections?: WorkflowConnection[];
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  nodeStatuses?: Record<string, string>;
  nodeResults?: Record<string, NodeResult | null | undefined>;
  onUpdateNodePosition?: (nodeId: string, position: { x: number; y: number }) => void;
  onDeleteNode?: (nodeId: string) => void;
  onAddConnection?: (connection: { sourceNodeId: string; sourceModality: string; targetNodeId: string; targetModality: string }) => void;
  onDeleteConnection?: (connectionId: string) => void;
  onUpdateNodeContent?: (nodeId: string, content: string) => void;
  onUpdateNodeConfig?: (nodeId: string, key: string, value: unknown) => void;
  onUpdateFileInput?: (nodeId: string, fileData: string | ArrayBuffer | null, mimeType: string | null) => void;
  onDuplicateNode?: (node: WorkflowNode) => void;
  workflows?: Workflow[];
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
  isLoadingWorkflow?: boolean;
  favorites?: string[];
  onToggleFavorite?: (id: string) => void;
  initialProviders?: string[];
  initialSearch?: string;
  allModels?: ModelOption[];
  onChangeModel?: (nodeId: string, model: ModelOption) => void;
}

/**
 * WorkflowComponent — unified wrapper that composes WorkflowSidebar,
 * WorkflowCanvas, and WorkflowInspector into a single three-panel layout.
 *
 * Props:
 *   readOnly    — disable all mutations (admin view)
 *   admin       — admin mode for the sidebar (no delete, shows user info)
 *
 *   -- Data --
 *   nodes, connections
 *   selectedNodeId, onSelectNode
 *   nodeStatuses, nodeResults
 *
 *   -- Canvas mutation handlers (ignored when readOnly) --
 *   onUpdateNodePosition, onDeleteNode, onAddConnection,
 *   onDeleteConnection, onUpdateNodeContent, onUpdateNodeConfig,
 *   onUpdateFileInput
 *
 *   -- Sidebar props --
 *   workflows, activeWorkflowId,
 *   onLoadWorkflow, onDeleteWorkflow,
 *   onDownloadWorkflow, onCopyWorkflow
 *   loading
 *
 *   -- Inspector props --
 *   allModels, onChangeModel
 */
export default function WorkflowComponent({
  readOnly = false,
  admin = false,

  nodes = [],
  connections = [],
  selectedNodeId,
  onSelectNode,
  nodeStatuses = {},
  nodeResults = {},

  onUpdateNodePosition,
  onDeleteNode,
  onAddConnection,
  onDeleteConnection,
  onUpdateNodeContent,
  onUpdateNodeConfig,
  onUpdateFileInput,
  onDuplicateNode,

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
  isLoadingWorkflow = false,
  favorites = [],
  onToggleFavorite,
  initialProviders,
  initialSearch = "",

  allModels,
  onChangeModel,
}: WorkflowComponentProps) {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const safePosition = readOnly
    ? onUpdateNodePosition || noop
    : onUpdateNodePosition || noop;

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  const handleClose = useCallback(() => {
    onSelectNode?.(null);
  }, [onSelectNode]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarVisible((value) => {
      const next = !value;
      // On mobile, close inspector when opening sidebar
      if (next && window.innerWidth < 768) {
        onSelectNode?.(null);
      }
      return next;
    });
  }, [onSelectNode]);

  // When loading a workflow on mobile, auto-hide sidebar
  const handleLoadWorkflowWithHide = useCallback(
    (workflowId: string) => {
      if (window.innerWidth < 768) {
        setSidebarVisible(false);
      }
      onLoadWorkflow?.(workflowId);
    },
    [onLoadWorkflow],
  );

  // On mobile, close sidebar when selecting a node (opening inspector)
  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      if (nodeId && window.innerWidth < 768) {
        setSidebarVisible(false);
      }
      onSelectNode?.(nodeId);
    },
    [onSelectNode],
  );

  return (
    <div className={`workflow-component ${styles['body']}`}>
      <div
        className={`${styles['sidebar-wrapper']} ${sidebarVisible ? "" : styles['sidebar-hidden']}`}
      >
        <WorkflowSidebar
          admin={admin}
          workflows={workflows}
          activeWorkflowId={activeWorkflowId}
          onLoadWorkflow={handleLoadWorkflowWithHide}
          onDeleteWorkflow={admin ? noop : onDeleteWorkflow || noop}
          onDownloadWorkflow={onDownloadWorkflow}
          onCopyWorkflow={onCopyWorkflow}
          onAddAsset={admin ? undefined : onAddAsset}
          onNewWorkflow={admin ? undefined : onNewWorkflow}
          onSaveWorkflow={admin ? undefined : onSaveWorkflow}
          workflowName={workflowName}
          onWorkflowNameChange={onWorkflowNameChange}
          loading={loading}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          initialProviders={initialProviders}
          initialSearch={initialSearch}
        />
      </div>
      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarVisible && (
        <div className={styles['sidebar-backdrop']} onClick={handleToggleSidebar} />
      )}
      <WorkflowCanvas
        nodes={nodes}
        connections={connections}
        onUpdateNodePosition={safePosition}
        onDeleteNode={readOnly ? noop : onDeleteNode || noop}
        onAddConnection={readOnly ? noop : onAddConnection || noop}
        onDeleteConnection={readOnly ? noop : onDeleteConnection || noop}
        onUpdateNodeContent={readOnly ? noop : onUpdateNodeContent || noop}
        onUpdateNodeConfig={readOnly ? noop : onUpdateNodeConfig || noop}
        onUpdateFileInput={readOnly ? noop : onUpdateFileInput || noop}
        onDuplicateNode={readOnly ? noop : onDuplicateNode || noop}
        nodeStatuses={nodeStatuses}
        nodeResults={nodeResults}
        selectedNodeId={selectedNodeId}
        onSelectNode={handleSelectNode}
        activeWorkflowId={activeWorkflowId}
        readOnly={readOnly}
        isLoadingWorkflow={isLoadingWorkflow}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={handleToggleSidebar}
      />
      {/* Inspector: bottom sheet on mobile, side panel on desktop */}
      {selectedNode && (
        <>
          {isMobile && (
            <div className={styles['inspector-backdrop']} onClick={handleClose} />
          )}
          <div className={styles['inspector-wrapper']}>
            <WorkflowInspector
              node={selectedNode}
              connections={connections}
              nodes={nodes}
              allModels={readOnly ? [] : allModels || []}
              nodeResults={nodeResults}
              nodeStatuses={nodeStatuses}
              onUpdateNodeConfig={readOnly ? noop : onUpdateNodeConfig || noop}
              onUpdateNodeContent={
                readOnly ? noop : onUpdateNodeContent || noop
              }
              onUpdateFileInput={readOnly ? noop : onUpdateFileInput || noop}
              onChangeModel={readOnly ? noop : onChangeModel || noop}
              onSelectNode={handleSelectNode}
              onClose={handleClose}
              readOnly={readOnly}
            />
          </div>
        </>
      )}
    </div>
  );
}
