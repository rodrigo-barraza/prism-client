import {
  Bot,
  Braces,
  Brain,
  Clock,
  Cloud,
  Cog,
  Cpu,
  Database,
  FolderOpen,
  Gamepad2,
  Globe,
  Heart,
  Layers,
  Lightbulb,
  MessageCircle,
  Navigation,
  Package,
  Palette,
  Shield,
  Ship,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * toolDomainIcons — Single source of truth mapping tool domains to
 * their lucide icons, shared by the Tools page table, cards, and
 * sidebar navigation.
 */

export type DomainIcon = React.ComponentType<{ size?: number; className?: string }>;

export const DOMAIN_ICONS: Record<string, DomainIcon> = {
  "Weather & Environment": Cloud,
  Events: Zap,
  Sports: Gamepad2,
  "Markets & Commodities": Database,
  Trends: Globe,
  Products: Package,
  Finance: Database,
  Knowledge: Brain,
  "Movies & TV": Palette,
  Health: Heart,
  Transit: Navigation,
  Utilities: Cog,
  Compute: Cpu,
  Maritime: Ship,
  Energy: Lightbulb,
  Communication: MessageCircle,
  Creative: Palette,
  Discord: MessageCircle,
  "Smart Home": Lightbulb,
  Reasoning: Brain,
  Coordinator: Bot,
  Workspace: FolderOpen,
  Web: Globe,
  Browser: Globe,
  "Task Management": Layers,
  Memory: Brain,
  "Agent Management": Bot,
  "Model Context Protocol": Cpu,
  Meta: Cog,
  "Scheduled Tasks": Clock,
  Timers: Clock,
  Skills: Zap,
  "Control Flow": Shield,
  "Structured Output": Braces,
};

/** Resolves a domain to its icon, falling back to the generic tool icon. */
export function getDomainIcon(domain: string): DomainIcon {
  return DOMAIN_ICONS[domain] || Wrench;
}
