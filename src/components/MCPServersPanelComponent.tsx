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
                .map((a: string) => a.trim())
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
      <div className={styles.container}>
        <div className={styles.formHeader}>
          <h3>{isNew ? "Add MCP Server" : "Edit Server"}</h3>
          <CloseButtonComponent onClick={handleCancel} />
        </div>

        <div className={styles.form}>
          <div className={styles.formGroup}>
            <label>Server Name</label>
            <InputComponent
              type="text"
              value={editingServer.name}
              onChange={(
                e: React.ChangeEvent<HTMLInputElement>,
              ) =>
                setEditingServer((s: MCPServer | null) =>
                  s
                    ? {
                        ...s,
                        name: e.target.value
                          .replace(/[^a-zA-Z0-9_-]/g, "-")
                          .toLowerCase(),
                      }
                    : null,
                )
              }
              placeholder="filesystem"
            />
            <span className={styles.hint}>
              Unique slug — used in tool names (mcp__{"{name}"}__tool)
            </span>
          </div>

          <div className={styles.formGroup}>
            <label>Display Name</label>
            <InputComponent
              type="text"
              value={editingServer.displayName}
              onChange={(
                e: React.ChangeEvent<HTMLInputElement>,
              ) =>
                setEditingServer((s: MCPServer | null) =>
                  s
                    ? {
                        ...s,
                        displayName: e.target.value,
                      }
                    : null,
                )
              }
              placeholder="Filesystem Access"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Transport</label>
            <div className={styles.transportTabs}>
              <button
                className={`${styles.transportTab} ${isStdio ? styles.transportTabActive : ""}`}
                onClick={() =>
                  setEditingServer((s: MCPServer | null) =>
                    s ? { ...s, transport: "stdio" } : null,
                  )
                }
              >
                stdio
              </button>
              <button
                className={`${styles.transportTab} ${!isStdio ? styles.transportTabActive : ""}`}
                onClick={() =>
                  setEditingServer((s: MCPServer | null) =>
                    s
                      ? {
                          ...s,
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
              <div className={styles.formGroup}>
                <label>Command</label>
                <InputComponent
                  type="text"
                  value={editingServer.command}
                  onChange={(
                    e: React.ChangeEvent<HTMLInputElement>,
                  ) =>
                    setEditingServer((s: MCPServer | null) =>
                      s
                        ? {
                            ...s,
                            command: e.target.value,
                          }
                        : null,
                    )
                  }
                  placeholder="npx"
                />
              </div>
              <div className={styles.formGroup}>
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
                    setEditingServer((s: MCPServer | null) =>
                      s
                        ? {
                            ...s,
                            args: e.target.value,
                          }
                        : null,
                    )
                  }
                  placeholder="-y, @modelcontextprotocol/server-filesystem, /home"
                />
                <span className={styles.hint}>Comma-separated arguments</span>
              </div>
            </>
          ) : (
            <div className={styles.formGroup}>
              <label>Server URL</label>
              <InputComponent
                type="text"
                value={editingServer.url}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement>,
                ) =>
                  setEditingServer((s: MCPServer | null) =>
                    s ? { ...s, url: e.target.value } : null,
                  )
                }
                placeholder="https://mcp-server.example.com/mcp"
              />
            </div>
          )}

          {error && <div className={styles.errorMsg}>{error}</div>}

          <div className={styles.formActions}>
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
    <div className={styles.container}>
      {error && <div className={styles.errorMsg}>{error}</div>}

      {servers.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Plug size={24} />
          </div>
          <div className={styles.emptyTitle}>No MCP servers</div>
          <div className={styles.emptySubtitle}>
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
          <div key={serverId} className={styles.serverCard}>
            <div className={styles.serverCardHeader}>
              <div
                className={`${styles.statusDot} ${server.connected ? styles.statusDotConnected : ""}`}
              />
              <div className={styles.serverInfo}>
                <div className={styles.serverName}>
                  {server.displayName || server.name}
                </div>
                <div className={styles.serverMeta}>
                  <span className={styles.transportBadge}>
                    {server.transport}
                  </span>
                  {server.connected && (server.toolCount ?? 0) > 0 && (
                    <span className={styles.toolCountBadge}>
                      <Wrench size={9} />
                      {server.toolCount} tools
                    </span>
                  )}
                </div>
              </div>
              {!readOnly && (
                <div className={styles.serverActions}>
                  {server.connected ? (
                    <button
                      className={styles.disconnectButton}
                      onClick={() => handleDisconnect(server)}
                      disabled={isConnecting}
                    >
                      <Unplug size={11} />
                      {isConnecting ? "..." : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      className={styles.connectButton}
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
              <div className={styles.toolList}>
                {server.tools?.map(
                  (tool: { name: string; description?: string }) => (
                    <span key={tool.name} className={styles.toolTag}>
                      {tool.name}
                    </span>
                  ),
                )}
              </div>
            )}

            {isConfirming && (
              <div className={styles.confirmLayoutRow}>
                <span className={styles.confirmLabel}>
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
