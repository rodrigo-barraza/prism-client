"use client";

import { useState, useEffect, useCallback } from "react";
import WorkflowSidebar from "./WorkflowSidebarComponent";
import WorkflowCanvas from "./WorkflowCanvasComponent";
import WorkflowInspector from "./WorkflowInspectorComponent";
import styles from "./WorkflowComponent.module.css";

const noop = () => {};

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
  // @ts-ignore
  // @ts-ignore
  selectedNodeId: any,
  // @ts-ignore
  // @ts-ignore
  onSelectNode: any,
  nodeStatuses = {},
  nodeResults = {},

  // @ts-ignore
  // @ts-ignore
  onUpdateNodePosition: any,
  // @ts-ignore
  // @ts-ignore
  onDeleteNode: any,
  // @ts-ignore
  // @ts-ignore
  onAddConnection: any,
  // @ts-ignore
  // @ts-ignore
  onDeleteConnection: any,
  // @ts-ignore
  // @ts-ignore
  onUpdateNodeContent: any,
  // @ts-ignore
  // @ts-ignore
  onUpdateNodeConfig: any,
  // @ts-ignore
  // @ts-ignore
  onUpdateFileInput: any,
  // @ts-ignore
  // @ts-ignore
  onDuplicateNode: any,

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
  isLoadingWorkflow = false,
  favorites = [],
  // @ts-ignore
  // @ts-ignore
  onToggleFavorite: any,
  // @ts-ignore
  // @ts-ignore
  initialProviders: any,
  initialSearch = "",

  // @ts-ignore
  // @ts-ignore
  allModels: any,
  // @ts-ignore
  // @ts-ignore
  onChangeModel: any,
}) {
  const [sidebarVisible, setSidebarVisible] = useState<any>(true);
  const [isMobile, setIsMobile] = useState<any>(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const safePosition = readOnly
    // @ts-ignore
    ? onUpdateNodePosition || noop
    // @ts-ignore
    : onUpdateNodePosition || noop;

  // @ts-ignore
  // @ts-ignore
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const handleClose = useCallback(() => {
    // @ts-ignore
    onSelectNode?.(null);
  // @ts-ignore
  }, [onSelectNode]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarVisible((v: any) => {
      const next = !v;
      // On mobile, close inspector when opening sidebar
      if (next && window.innerWidth < 768) {
        // @ts-ignore
        onSelectNode?.(null);
      }
      return next;
    });
  // @ts-ignore
  }, [onSelectNode]);

  // When loading a workflow on mobile, auto-hide sidebar
  const handleLoadWorkflowWithHide = useCallback(
    // @ts-ignore
    (...args) => {
      if (window.innerWidth < 768) {
        setSidebarVisible(false);
      }
      // @ts-ignore
      onLoadWorkflow?.(...args);
    },
    // @ts-ignore
    [onLoadWorkflow],
  );

  // On mobile, close sidebar when selecting a node (opening inspector)
  const handleSelectNode = useCallback(
    (nodeId: any) => {
      if (nodeId && window.innerWidth < 768) {
        setSidebarVisible(false);
      }
      // @ts-ignore
      onSelectNode?.(nodeId);
    },
    // @ts-ignore
    [onSelectNode],
  );

  return (
    <div className={styles.body}>
      <div
        className={`${styles.sidebarWrapper} ${sidebarVisible ? "" : styles.sidebarHidden}`}
      >
        <WorkflowSidebar
          admin={admin}
          workflows={workflows}
          // @ts-ignore
          activeWorkflowId={activeWorkflowId}
          onLoadWorkflow={handleLoadWorkflowWithHide}
          // @ts-ignore
          onDeleteWorkflow={admin ? noop : onDeleteWorkflow || noop}
          // @ts-ignore
          onDownloadWorkflow={onDownloadWorkflow}
          // @ts-ignore
          onCopyWorkflow={onCopyWorkflow}
          // @ts-ignore
          onAddAsset={admin ? undefined : onAddAsset}
          // @ts-ignore
          onNewWorkflow={admin ? undefined : onNewWorkflow}
          // @ts-ignore
          onSaveWorkflow={admin ? undefined : onSaveWorkflow}
          // @ts-ignore
          workflowName={workflowName}
          // @ts-ignore
          onWorkflowNameChange={onWorkflowNameChange}
          loading={loading}
          favorites={favorites}
          // @ts-ignore
          onToggleFavorite={onToggleFavorite}
          // @ts-ignore
          initialProviders={initialProviders}
          initialSearch={initialSearch}
        />
      </div>
      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarVisible && (
        <div className={styles.sidebarBackdrop} onClick={handleToggleSidebar} />
      )}
      <WorkflowCanvas
        nodes={nodes}
        connections={connections}
        onUpdateNodePosition={safePosition}
        // @ts-ignore
        onDeleteNode={readOnly ? noop : onDeleteNode || noop}
        // @ts-ignore
        onAddConnection={readOnly ? noop : onAddConnection || noop}
        // @ts-ignore
        onDeleteConnection={readOnly ? noop : onDeleteConnection || noop}
        // @ts-ignore
        onUpdateNodeContent={readOnly ? noop : onUpdateNodeContent || noop}
        // @ts-ignore
        onUpdateNodeConfig={readOnly ? noop : onUpdateNodeConfig || noop}
        // @ts-ignore
        onUpdateFileInput={readOnly ? noop : onUpdateFileInput || noop}
        // @ts-ignore
        onDuplicateNode={readOnly ? noop : onDuplicateNode || noop}
        nodeStatuses={nodeStatuses}
        nodeResults={nodeResults}
        // @ts-ignore
        selectedNodeId={selectedNodeId}
        onSelectNode={handleSelectNode}
        // @ts-ignore
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
            <div className={styles.inspectorBackdrop} onClick={handleClose} />
          )}
          <div className={styles.inspectorWrapper}>
            <WorkflowInspector
              node={selectedNode}
              connections={connections}
              nodes={nodes}
              // @ts-ignore
              allModels={readOnly ? [] : allModels || []}
              nodeResults={nodeResults}
              nodeStatuses={nodeStatuses}
              // @ts-ignore
              onUpdateNodeConfig={readOnly ? noop : onUpdateNodeConfig || noop}
              onUpdateNodeContent={
                // @ts-ignore
                readOnly ? noop : onUpdateNodeContent || noop
              }
              // @ts-ignore
              onUpdateFileInput={readOnly ? noop : onUpdateFileInput || noop}
              // @ts-ignore
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
