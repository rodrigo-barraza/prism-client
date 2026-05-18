"use client";

import { useState, useCallback } from "react";
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
import styles from "./MCPServersPanelComponent.module.css";

/**
 * MCPServersPanel — Manage MCP (Model Context Protocol) server connections.
 *
 * Shows configured MCP servers with live connection status. Users can
 * add/edit/delete servers, connect/disconnect, and see discovered tools.
 */
export default function MCPServersPanel({ servers, onServersChange, project }: any) {
  const [editingServer, setEditingServer] = useState<any>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState<any>(null); // server ID being connected
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<any>(null);
  const [error, setError] = useState<any>(null);

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

  const handleEdit = useCallback((server: any) => {
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
                .map((a: any) => a.trim())
                .filter(Boolean)
            : editingServer.args,
        ...(project ? { project } : {}),
      };

      if (isNew) {
        await PrismService.createMCPServer(payload);
      } else {
        await PrismService.updateMCPServer(
          editingServer.id || editingServer._id,
          payload,
        );
      }

      setEditingServer(null);
      setIsNew(false);
      onServersChange();
    } catch (error: any) {
      setError(error.message || "Failed to save server");
    } finally {
      setSaving(false);
    }
  }, [editingServer, isNew, onServersChange, project]);

  const handleDelete = useCallback((id: any) => {
    setConfirmingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(
    async (id: any) => {
      try {
        await PrismService.deleteMCPServer(id);
        setConfirmingDeleteId(null);
        onServersChange();
      } catch (error: any) {
        console.error("Failed to delete MCP server:", error);
      }
    },
    [onServersChange],
  );

  // -- Connect / Disconnect -------------------------------------

  const handleConnect = useCallback(
    async (server: any) => {
      const serverId = server.id || server._id;
      setConnecting(serverId);
      setError(null);
      try {
        await PrismService.connectMCPServer(serverId);
        onServersChange();
      } catch (error: any) {
        setError(`Connect failed: ${error.message || "Unknown error"}`);
      } finally {
        setConnecting(null);
      }
    },
    [onServersChange],
  );

  const handleDisconnect = useCallback(
    async (server: any) => {
      const serverId = server.id || server._id;
      setConnecting(serverId);
      try {
        await PrismService.disconnectMCPServer(serverId);
        onServersChange();
      } catch (error: any) {
        console.error("Disconnect failed:", error);
      } finally {
        setConnecting(null);
      }
    },
    [onServersChange],
  );

  // -- Edit / Create Form ---------------------------------------

  if (editingServer) {
    const isStdio = (editingServer as any).transport === "stdio";

    return (
      <div className={styles.container}>
        <div className={styles.formHeader}>
          <h3>{isNew ? "Add MCP Server" : "Edit Server"}</h3>
          <button className={styles.cancelBtn} onClick={handleCancel}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.form}>
          <div className={styles.formGroup}>
            <label>Server Name</label>
            <input
              type="text"
              className={styles.input}
              value={(editingServer as any).name}
              onChange={(e: any) =>
                setEditingServer((s: any) => ({
                  ...s,
                  name: e.target.value
                    .replace(/[^a-zA-Z0-9_-]/g, "-")
                    .toLowerCase(),
                }))
              }
              placeholder="filesystem"
            />
            <span className={styles.hint}>
              Unique slug — used in tool names (mcp__{"{name}"}__tool)
            </span>
          </div>

          <div className={styles.formGroup}>
            <label>Display Name</label>
            <input
              type="text"
              className={styles.input}
              value={(editingServer as any).displayName}
              onChange={(e: any) =>
                setEditingServer((s: any) => ({
                  ...s,
                  displayName: e.target.value,
                }))
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
                  setEditingServer((s: any) => ({ ...s, transport: "stdio" }))
                }
              >
                stdio
              </button>
              <button
                className={`${styles.transportTab} ${!isStdio ? styles.transportTabActive : ""}`}
                onClick={() =>
                  setEditingServer((s: any) => ({
                    ...s,
                    transport: "streamable-http",
                  }))
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
                <input
                  type="text"
                  className={styles.input}
                  value={(editingServer as any).command}
                  onChange={(e: any) =>
                    setEditingServer((s: any) => ({
                      ...s,
                      command: e.target.value,
                    }))
                  }
                  placeholder="npx"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Arguments</label>
                <input
                  type="text"
                  className={styles.input}
                  value={
                    Array.isArray((editingServer as any).args)
                      ? (editingServer as any).args.join(", ")
                      : (editingServer as any).args
                  }
                  onChange={(e: any) =>
                    setEditingServer((s: any) => ({
                      ...s,
                      args: e.target.value,
                    }))
                  }
                  placeholder="-y, @modelcontextprotocol/server-filesystem, /home"
                />
                <span className={styles.hint}>Comma-separated arguments</span>
              </div>
            </>
          ) : (
            <div className={styles.formGroup}>
              <label>Server URL</label>
              <input
                type="text"
                className={styles.input}
                value={(editingServer as any).url}
                onChange={(e: any) =>
                  setEditingServer((s: any) => ({ ...s, url: e.target.value }))
                }
                placeholder="https://mcp-server.example.com/mcp"
              />
            </div>
          )}

          {error && <div className={styles.errorMsg}>{error}</div>}

          <div className={styles.formActions}>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving || !(editingServer as any).name?.trim()}
            >
              <Save size={14} />
              {saving
                ? "Saving..."
                : isNew
                  ? "Add Server"
                  : "Save Changes"}
            </button>
            <button className={styles.cancelFormBtn} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -- List View ------------------------------------------------

  const connectedCount = servers.filter((s: any) => s.connected).length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          MCP ({connectedCount}/{servers.length})
        </span>
        <div className={styles.headerActions}>
          <button className={styles.addBtn} onClick={handleCreate}>
            <Plus size={12} />
            Add
          </button>
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {servers.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Plug size={24} />
          </div>
          <div className={styles.emptyTitle}>No MCP servers</div>
          <div className={styles.emptySubtitle}>
            Connect external tool providers via the Model Context Protocol.
            Add servers to give the agent access to databases, APIs, and more.
          </div>
          <button className={styles.addBtn} onClick={handleCreate}>
            <Plus size={12} />
            Add your first server
          </button>
        </div>
      )}

      {servers.map((server: any) => {
        const serverId = server.id || server._id;
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
                  {server.connected && server.toolCount > 0 && (
                    <span className={styles.toolCountBadge}>
                      <Wrench size={9} />
                      {server.toolCount} tools
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.serverActions}>
                {server.connected ? (
                  <button
                    className={styles.disconnectBtn}
                    onClick={() => handleDisconnect(server)}
                    disabled={isConnecting}
                  >
                    <Unplug size={11} />
                    {isConnecting ? "..." : "Disconnect"}
                  </button>
                ) : (
                  <button
                    className={styles.connectBtn}
                    onClick={() => handleConnect(server)}
                    disabled={isConnecting}
                  >
                    <Plug size={11} />
                    {isConnecting ? "Connecting..." : "Connect"}
                  </button>
                )}
                <button
                  className={styles.actionBtn}
                  onClick={() => handleEdit(server)}
                  title="Edit server"
                >
                  <Edit3 size={13} />
                </button>
                <button
                  className={`${styles.actionBtn} ${styles.deleteBtn}`}
                  onClick={() => handleDelete(serverId)}
                  title="Delete server"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Show discovered tools when connected */}
            {server.connected && server.tools?.length > 0 && (
              <div className={styles.toolList}>
                {server.tools.map((tool: any) => (
                  <span key={tool.name} className={styles.toolTag}>
                    {tool.name}
                  </span>
                ))}
              </div>
            )}

            {isConfirming && (
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>
                  Delete &ldquo;{server.name}&rdquo;?
                </span>
                <button
                  className={`${styles.confirmBtn} ${styles.confirmBtnYes}`}
                  onClick={() => confirmDelete(serverId)}
                >
                  Delete
                </button>
                <button
                  className={`${styles.confirmBtn} ${styles.confirmBtnNo}`}
                  onClick={() => setConfirmingDeleteId(null)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
