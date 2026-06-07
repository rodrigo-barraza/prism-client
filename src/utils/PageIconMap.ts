/**
 * PageIconMap — Single source of truth for page-level icons and navigation structure.
 *
 * LayoutHeaderComponent, NavigationSidebarComponent, ThreePanelLayoutComponent,
 * and AdminShellComponent all reference this registry so icons are consistent
 * across the sidebar, header, and main content for every page route.
 */

import type { LucideIcon } from "lucide-react";
import {
  Server,
  Clock,
  ImageIcon,
  Wrench,
  MemoryStick,
  Eye,
  Type,
  Settings,
  Target,
  FlaskConical,
  Workflow,
  MessageSquare,
  LayoutDashboard,
  BookText,
  Bot,
  ScrollText,
  FolderOpen,
  Users,
  Layers,
  GitBranch,
} from "lucide-react";

export interface PageIconEntry {
  icon: LucideIcon;
  aliases: string[];
}

/**
 * Canonical map keyed by the primary lowercase page title.
 * `aliases` captures alternate route names or titles that
 * should resolve to the same icon.
 */
const PAGE_ICON_ENTRIES: PageIconEntry[] = [
  { icon: MessageSquare, aliases: ["chat", "conversations", "conversation"] },
  { icon: Clock, aliases: ["scheduled tasks", "cron jobs"] },
  { icon: Settings, aliases: ["settings"] },
  { icon: Bot, aliases: ["agents"] },
  { icon: Server, aliases: ["models"] },
  { icon: Wrench, aliases: ["tools", "tool requests"] },
  { icon: ImageIcon, aliases: ["media"] },
  { icon: Type, aliases: ["text"] },
  { icon: BookText, aliases: ["prompts"] },
  { icon: Eye, aliases: ["vision"] },
  { icon: Target, aliases: ["benchmarks"] },
  { icon: MemoryStick, aliases: ["vram benchmark", "vram bench"] },
  { icon: FlaskConical, aliases: ["synthesis"] },
  { icon: Workflow, aliases: ["workflows", "workflow"] },
  { icon: LayoutDashboard, aliases: ["dashboard", "admin"] },
  { icon: ScrollText, aliases: ["requests"] },
  { icon: FolderOpen, aliases: ["traces"] },
  { icon: Users, aliases: ["users"] },
  { icon: Layers, aliases: ["providers"] },
];

const ICON_BY_ALIAS = new Map<string, LucideIcon>();
for (const entry of PAGE_ICON_ENTRIES) {
  for (const alias of entry.aliases) {
    ICON_BY_ALIAS.set(alias, entry.icon);
  }
}

/**
 * Resolve a Lucide icon for a given page title string.
 * Falls back to fuzzy substring matching for partial hits.
 * Returns `null` when no match is found.
 */
export function resolvePageIcon(title: string): LucideIcon | null {
  const normalizedTitle = title.trim().toLowerCase();

  const exactMatch = ICON_BY_ALIAS.get(normalizedTitle);
  if (exactMatch) return exactMatch;

  for (const [alias, icon] of ICON_BY_ALIAS) {
    if (normalizedTitle.includes(alias)) return icon;
  }

  return null;
}

// ── Navigation section definitions ──────────────────────────────────

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  alsoMatches?: string[];
  showBadge?: string;
}

export interface NavigationSection {
  label: string | null;
  items: NavigationItem[];
}

export const USER_NAV_SECTIONS: NavigationSection[] = [
  {
    label: "Workspace",
    items: [
      {
        href: "/chat",
        label: "Chat",
        icon: MessageSquare,
        alsoMatches: ["/coding-agent"],
      },
      {
        href: "/scheduled-tasks",
        label: "Scheduled Tasks",
        icon: Clock,
      },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Information",
    items: [
      {
        href: "/agents",
        label: "Agents",
        icon: Bot,
      },
      { href: "/models", label: "Models", icon: Server },
      { href: "/tools", label: "Tools", icon: Wrench },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/media", label: "Media", icon: ImageIcon },
      { href: "/text", label: "Text", icon: Type },
      { href: "/prompts", label: "Prompts", icon: BookText },
    ],
  },
  {
    label: "Experiments",
    items: [
      { href: "/benchmarks", label: "Benchmarks", icon: Target },
      { href: "/vram-benchmark", label: "VRAM Bench", icon: MemoryStick },
      { href: "/synthesis", label: "Synthesis", icon: FlaskConical },
      { href: "/workflows", label: "Workflows", icon: Workflow },
      { href: "/vision", label: "Vision", icon: Eye },
    ],
  },
];

export const ADMIN_NAV_SECTIONS: NavigationSection[] = [
  {
    label: "Analytics",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      {
        href: "/admin/requests",
        label: "Requests",
        icon: ScrollText,
        showBadge: "requests",
      },
      { href: "/admin/tool-requests", label: "Tool Requests", icon: Wrench },
      {
        href: "/admin/traces",
        label: "Traces",
        icon: FolderOpen,
        showBadge: "traces",
      },
      { href: "/admin/users", label: "Users", icon: Users },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        href: "/admin/chat",
        label: "Chat",
        icon: MessageSquare,
        showBadge: "conversations",
      },
      { href: "/admin/providers", label: "Providers", icon: Layers },
      { href: "/admin/models", label: "Models", icon: Server },
      { href: "/admin/tools", label: "Tools", icon: Wrench },
      { href: "/admin/scheduled-tasks", label: "Scheduled Tasks", icon: Clock },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/admin/media", label: "Media", icon: ImageIcon, showBadge: "media" },
      { href: "/admin/text", label: "Text", icon: Type, showBadge: "text" },
      { href: "/admin/prompts", label: "Prompts", icon: BookText },
    ],
  },
  {
    label: "Experiments",
    items: [
      { href: "/admin/synthesis", label: "Synthesis", icon: FlaskConical },
      { href: "/admin/workflows", label: "Workflows", icon: GitBranch },
      { href: "/admin/vision", label: "Vision", icon: Eye },
    ],
  },
];

export { PAGE_ICON_ENTRIES, ICON_BY_ALIAS };
