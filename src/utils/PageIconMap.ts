/**
 * PageIconMap — Single source of truth for page-level icons.
 *
 * Both LayoutHeaderComponent and NavigationSidebarComponent reference
 * this map so the sidebar and header always display the same Lucide
 * icon for a given page route or title.
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

export { PAGE_ICON_ENTRIES, ICON_BY_ALIAS };
