"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  Plug,
  Unplug,
  Wrench,
} from "lucide-react";
import PrismService from "../services/PrismService";
import {
  ButtonComponent,
  CloseButtonComponent,
  IconButtonComponent,
  InputComponent,
} from "@rodrigo-barraza/components-library";
import styles from "./MCPServersPanelComponent.module.css";
import type { MCPServer } from "@/types/types";
import type { ReactNode } from "react";
import { getErrorMessage } from "../utils/errorMessage";

/**
 * MCPServersPanel — Manage MCP (Model Context Protocol) server connections.
 *
 * Shows configured MCP servers with live connection status. Users can
 * add/edit/delete servers, connect/disconnect, and see discovered tools.
 */
export default function MCPServersPanel({
  servers,
  onServersChange,
  project,
  readOnly = false,
  onActionsChange,
}: {
  servers: MCPServer[];
  onServersChange: () => void;
  project?: string;
  readOnly?: boolean;
  onActionsChange?: (actions: ReactNode) => void;
}) {
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null); // server ID being connected
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // -- CRUD -----------------------------------------------------

  const handleCreate = useCallback(() => {
    setEditingServer({
      name: "",
      displayName: "",
      transport: "stdio",
      command: "",
      args: [],
      env: {},
      url: "",
      headers: {},
      enabled: true,
    });
    setIsNew(true);
    setError(null);
  }, []);

  useEffect(() => {
    if (onActionsChange) {
      if (readOnly) {
        onActionsChange(null);
      } else {
        onActionsChange(
          <ButtonComponent
            variant="primary"
            size="small"
            icon={Plus}
            onClick={handleCreate}
          >
            Add
          </ButtonComponent>,
        );
      }
    }
  }, [onActionsChange, readOnly, handleCreate]);

  const handleEdit = useCallback((server: MCPServer) => {
    setEditingServer({ ...server });
    setIsNew(false);
    setError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setEditingServer(null);
    setIsNew(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingServer) return;
    if (!editingServer.name?.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...editingServer,
        // Parse args from comma-separated string if it's a string
        args:
          typeof editingServer.args === "string"
            ? editingServer.args
                .split(",")
                .map((agent: string) => agent.trim())
                .filter(Boolean)
            : editingServer.args,
        ...(project ? { project } : {}),
      };

      if (isNew) {
        await PrismService.createMCPServer(payload);
      } else {
        await PrismService.updateMCPServer(
          editingServer.id || editingServer._id?.toString() || "",
          payload,
        );
      }

      setEditingServer(null);
      setIsNew(false);
      onServersChange();
    } catch (error: unknown) {
      setError(getErrorMessage(error) || "Failed to save server");
    } finally {
      setSaving(false);
    }
  }, [editingServer, isNew, onServersChange, project]);

  const handleDelete = useCallback((id: string) => {
    setConfirmingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(
    async (id: string) => {
      try {
        await PrismService.deleteMCPServer(id);
        setConfirmingDeleteId(null);
        onServersChange();
      } catch (error: unknown) {
        console.error("Failed to delete MCP server:", error);
      }
    },
    [onServersChange],
  );

  // -- Connect / Disconnect -------------------------------------

  const handleConnect = useCallback(
    async (server: MCPServer) => {
      const serverId = server.id || server._id || "";
      if (!serverId) return;
      setConnecting(serverId);
      setError(null);
      try {
        await PrismService.connectMCPServer(serverId);
        onServersChange();
      } catch (error: unknown) {
        setError(
          `Connect failed: ${getErrorMessage(error) || "Unknown error"}`,
        );
      } finally {
        setConnecting(null);
      }
    },
    [onServersChange],
  );

  const handleDisconnect = useCallback(
    async (server: MCPServer) => {
      const serverId = server.id || server._id || "";
      if (!serverId) return;
      setConnecting(serverId);
      try {
        await PrismService.disconnectMCPServer(serverId);
        onServersChange();
      } catch (error: unknown) {
        console.error("Disconnect failed:", error);
      } finally {
        setConnecting(null);
      }
    },
    [onServersChange],
  );

  // -- Edit / Create Form ---------------------------------------

  if (editingServer) {
    const isStdio = editingServer.transport === "stdio";

    return (
      <div className={styles['container']}>
        <div className={styles['form-header']}>
          <h3>{isNew ? "Add MCP Server" : "Edit Server"}</h3>
          <CloseButtonComponent onClick={handleCancel} />
        </div>

        <div className={styles['form']}>
          <div className={styles['form-group']}>
            <label>Server Name</label>
            <InputComponent
              type="text"
              value={editingServer.name}
              onChange={(
                e: React.ChangeEvent<HTMLInputElement>,
              ) =>
                setEditingServer((state: MCPServer | null) =>
                  state
                    ? {
                        ...state,
                        name: e.target.value
                          .replace(/[^a-zA-Z0-9_-]/g, "-")
                          .toLowerCase(),
                      }
                    : null,
                )
              }
              placeholder="filesystem"
            />
            <span className={styles['hint']}>
              Unique slug — used in tool names (mcp__{"{name}"}__tool)
            </span>
          </div>

          <div className={styles['form-group']}>
            <label>Display Name</label>
            <InputComponent
              type="text"
              value={editingServer.displayName}
              onChange={(
                e: React.ChangeEvent<HTMLInputElement>,
              ) =>
                setEditingServer((state: MCPServer | null) =>
                  state
                    ? {
                        ...state,
                        displayName: e.target.value,
                      }
                    : null,
                )
              }
              placeholder="Filesystem Access"
            />
          </div>

          <div className={styles['form-group']}>
            <label>Transport</label>
            <div className={styles['transport-tabs']}>
              <button
                className={`${styles['transport-tab']} ${editingServer.transport === "stdio" ? styles['transport-tab-is-active-state'] : ""}`}
                onClick={() =>
                  setEditingServer((state: MCPServer | null) =>
                    state ? { ...state, transport: "stdio" } : null,
                  )
                }
              >
                stdio
              </button>
              <button
                className={`${styles['transport-tab']} ${editingServer.transport === "sse" ? styles['transport-tab-is-active-state'] : ""}`}
                onClick={() =>
                  setEditingServer((state: MCPServer | null) =>
                    state ? { ...state, transport: "sse" } : null,
                  )
                }
              >
                SSE
              </button>
              <button
                className={`${styles['transport-tab']} ${editingServer.transport === "streamable-http" ? styles['transport-tab-is-active-state'] : ""}`}
                onClick={() =>
                  setEditingServer((state: MCPServer | null) =>
                    state
                      ? {
                          ...state,
                          transport: "streamable-http",
                        }
                      : null,
                  )
                }
              >
                HTTP
              </button>
            </div>
          </div>

          {isStdio ? (
            <>
              <div className={styles['form-group']}>
                <label>Command</label>
                <InputComponent
                  type="text"
                  value={editingServer.command}
                  onChange={(
                    e: React.ChangeEvent<HTMLInputElement>,
                  ) =>
                    setEditingServer((state: MCPServer | null) =>
                      state
                        ? {
                            ...state,
                            command: e.target.value,
                          }
                        : null,
                    )
                  }
                  placeholder="npx"
                />
              </div>
              <div className={styles['form-group']}>
                <label>Arguments</label>
                <InputComponent
                  type="text"
                  value={
                    Array.isArray(editingServer.args)
                      ? editingServer.args.join(", ")
                      : editingServer.args
                  }
                  onChange={(
                    e: React.ChangeEvent<HTMLInputElement>,
                  ) =>
                    setEditingServer((state: MCPServer | null) =>
                      state
                        ? {
                            ...state,
                            args: e.target.value,
                          }
                        : null,
                    )
                  }
                  placeholder="-y, @modelcontextprotocol/server-filesystem, /home"
                />
                <span className={styles['hint']}>Comma-separated arguments</span>
              </div>
            </>
          ) : (
            <div className={styles['form-group']}>
              <label>Server URL</label>
              <InputComponent
                type="text"
                value={editingServer.url}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement>,
                ) =>
                  setEditingServer((state: MCPServer | null) =>
                    state ? { ...state, url: e.target.value } : null,
                  )
                }
                placeholder="https://mcp-server.example.com/mcp"
              />
            </div>
          )}

          {error && <div className={styles['error-message']}>{error}</div>}

          <div className={styles['form-actions']}>
            <ButtonComponent
              variant="primary"
              size="small"
              icon={Save}
              onClick={handleSave}
              disabled={saving || !editingServer.name?.trim()}
              fullWidth
            >
              {saving ? "Saving..." : isNew ? "Add Server" : "Save Changes"}
            </ButtonComponent>
            <ButtonComponent variant="disabled" size="small" onClick={handleCancel}>
              Cancel
            </ButtonComponent>
          </div>
        </div>
      </div>
    );
  }

  // -- List View ------------------------------------------------

  return (
    <div className={`m-c-p-servers-panel-component ${styles['container']}`}>
      {error && <div className={styles['error-message']}>{error}</div>}

      {servers.length === 0 && (
        <div className={styles['empty-state']}>
          <div className={styles['empty-icon']}>
            <Plug size={24} />
          </div>
          <div className={styles['empty-title']}>No MCP servers</div>
          <div className={styles['empty-subtitle']}>
            Connect external tool providers via the Model Context Protocol. Add
            servers to give the agent access to databases, APIs, and more.
          </div>
          {!readOnly && (
            <ButtonComponent
              variant="primary"
              icon={Plus}
              onClick={handleCreate}
            >
              Add your first server
            </ButtonComponent>
          )}
        </div>
      )}

      {servers.map((server: MCPServer) => {
        const serverId = server.id || server._id?.toString() || "";
        const isConfirming = confirmingDeleteId === serverId;
        const isConnecting = connecting === serverId;

        return (
          <div key={serverId} className={styles['server-card']}>
            <div className={styles['server-card-header']}>
              <div
                className={`${styles['status-dot']} ${server.connected ? styles['status-dot-connected'] : ""}`}
              />
              <div className={styles['server-info']}>
                <div className={styles['server-name']}>
                  {server.displayName || server.name}
                </div>
                <div className={styles['server-meta']}>
                  <span className={styles['transport-badge']}>
                    {server.transport}
                  </span>
                  {server.connected && (server.toolCount ?? 0) > 0 && (
                    <span className={styles['tool-count-badge']}>
                      <Wrench size={9} />
                      {server.toolCount} tools
                    </span>
                  )}
                </div>
              </div>
              {!readOnly && (
                <div className={styles['server-actions']}>
                  {server.connected ? (
                    <button
                      className={styles['disconnect-button']}
                      onClick={() => handleDisconnect(server)}
                      disabled={isConnecting}
                    >
                      <Unplug size={11} />
                      {isConnecting ? "..." : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      className={styles['connect-button']}
                      onClick={() => handleConnect(server)}
                      disabled={isConnecting}
                    >
                      <Plug size={11} />
                      {isConnecting ? "Connecting..." : "Connect"}
                    </button>
                  )}
                  <IconButtonComponent
                    icon={<Edit3 size={13} />}
                    onClick={() => handleEdit(server)}
                    tooltip="Edit server"
                  />
                  <IconButtonComponent
                    icon={<Trash2 size={13} />}
                    onClick={() => handleDelete(serverId)}
                    tooltip="Delete server"
                    variant="destructive"
                  />
                </div>
              )}
            </div>

            {/* Show discovered tools when connected */}
            {server.connected && (server.tools?.length ?? 0) > 0 && (
              <div className={styles['tool-list']}>
                {server.tools?.map(
                  (tool: { name: string; description?: string }) => (
                    <span key={tool.name} className={styles['tool-tag']}>
                      {tool.name}
                    </span>
                  ),
                )}
              </div>
            )}

            {isConfirming && (
              <div className={styles['confirm-layout-row']}>
                <span className={styles['confirm-label']}>
                  Delete &ldquo;{server.name}&rdquo;?
                </span>
                <ButtonComponent
                  variant="destructive"
                  size="small"
                  onClick={() => confirmDelete(serverId)}
                >
                  Delete
                </ButtonComponent>
                <ButtonComponent
                  variant="disabled"
                  size="small"
                  onClick={() => setConfirmingDeleteId(null)}
                >
                  Cancel
                </ButtonComponent>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
