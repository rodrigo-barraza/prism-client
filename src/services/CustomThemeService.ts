/**
 * CustomThemeService — Client-side custom theme management.
 *
 * Handles CRUD operations for user-created themes persisted in localStorage,
 * CSS injection via dynamic `<style>` tags, and auto-derivation of related
 * tokens from user-picked colors.
 *
 * Storage key: `prism:custom-themes`
 * CSS selector:  `[data-theme="custom-<id>"]`
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface CustomThemeTokens {
  // Surfaces
  background: string;
  surface: string;
  elevated: string;
  // Accent
  primary: string;
  secondary: string;
  tertiary: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Borders
  borderColor: string;
  // Semantic
  success: string;
  danger: string;
  warning: string;
  info: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  icon: string;
  tokens: CustomThemeTokens;
  createdAt: string;
  updatedAt: string;
}

/** Metadata shape expected by ThemePickerComponent */
export interface CustomThemeMeta {
  label: string;
  icon: string;
  background: string;
  surface: string;
  elevated: string;
  primary: string;
  secondary: string;
  tertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderColor: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const STORAGE_KEY = "prism:custom-themes";
const STYLE_ID_PREFIX = "custom-theme-";

// ── Color Utilities ────────────────────────────────────────────────────

/** Parse a hex color (#rrggbb) into [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  if (!hex || typeof hex !== "string") {
    return [0, 0, 0];
  }
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

/** Convert [r,g,b] to hex string */
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Darken a hex color by a percentage (0–100) */
function darken(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const factor = 1 - percent / 100;
  return rgbToHex(r * factor, g * factor, b * factor);
}

/** Lighten a hex color by a percentage (0–100) */
function lighten(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const factor = percent / 100;
  return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
}

/** Produce rgba() string from hex + alpha */
function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Check if a color is "light" (luma > 128) */
function isLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ── Token Auto-Derivation ──────────────────────────────────────────────

/**
 * From the ~17 user-picked tokens, derive the full set of CSS custom
 * properties needed by the design system.
 */
function deriveFullCSS(tokens: CustomThemeTokens): string {
  const t = tokens || {};
  const primary = t.primary || "#6366f1";
  const secondary = t.secondary || "#a78bfa";
  const tertiary = t.tertiary || "#38bdf8";
  const background = t.background || "#0a0a0f";
  const surface = t.surface || "#13141c";
  const elevated = t.elevated || "#1a1b26";
  const textPrimary = t.textPrimary || "#f8f8f8";
  const textSecondary = t.textSecondary || "#8e95ae";
  const textMuted = t.textMuted || "#565c74";
  const borderCol = t.borderColor || "#ffffff";
  const success = t.success || "#10b981";
  const danger = t.danger || "#ef4444";
  const warning = t.warning || "#f59e0b";
  const info = t.info || "#3b82f6";

  const lightMode = isLight(background);
  const borderRgb = hexToRgb(borderCol);

  // Derive text inverse (opposite of primary bg)
  const textInverse = lightMode ? background : textPrimary;

  // Opacity scales depend on light/dark
  const borderOpacity = lightMode ? 0.1 : 0.06;
  const subtleMultiplier = lightMode ? 0.5 : 0.5;
  const mediumMultiplier = lightMode ? 1.0 : 1.67;
  const strongMultiplier = lightMode ? 1.4 : 2.5;
  const glowAlpha = lightMode ? 0.2 : 0.4;
  const subtleAlpha = lightMode ? 0.06 : 0.1;
  const shadowAlpha = lightMode ? 0.08 : 0.15;

  const lines = [
    `/* Accent — Primary */`,
    `--accent-primary: ${primary};`,
    `--accent-primary-hover: ${darken(primary, 12)};`,
    `--accent-primary-glow: ${hexToRgba(primary, glowAlpha)};`,
    `--accent-primary-subtle: ${hexToRgba(primary, subtleAlpha)};`,
    `--shadow-glow: 0 0 20px ${hexToRgba(primary, shadowAlpha)};`,
    ``,
    `/* Accent — Secondary */`,
    `--accent-secondary: ${secondary};`,
    `--accent-secondary-hover: ${darken(secondary, 12)};`,
    `--accent-secondary-glow: ${hexToRgba(secondary, glowAlpha)};`,
    `--accent-secondary-subtle: ${hexToRgba(secondary, subtleAlpha)};`,
    ``,
    `/* Accent — Tertiary */`,
    `--accent-tertiary: ${tertiary};`,
    ``,
    `/* Surfaces */`,
    `--bg-base: ${background};`,
    `--bg-surface: ${surface};`,
    `--bg-elevated: ${elevated};`,
    ``,
    `/* Borders */`,
    `--border-color: rgba(${borderRgb.join(", ")}, ${borderOpacity});`,
    `--border-subtle: rgba(${borderRgb.join(", ")}, ${borderOpacity * subtleMultiplier});`,
    `--border-medium: rgba(${borderRgb.join(", ")}, ${borderOpacity * mediumMultiplier});`,
    `--border-strong: rgba(${borderRgb.join(", ")}, ${borderOpacity * strongMultiplier});`,
    ``,
    `/* Text */`,
    `--text-primary: ${textPrimary};`,
    `--text-secondary: ${textSecondary};`,
    `--text-muted: ${textMuted};`,
    `--text-inverse: ${textInverse};`,
    ``,
    `/* Semantic */`,
    `--color-success: ${success};`,
    `--color-success-subtle: ${hexToRgba(success, lightMode ? 0.06 : 0.1)};`,
    `--color-danger: ${danger};`,
    `--color-danger-subtle: ${hexToRgba(danger, lightMode ? 0.06 : 0.1)};`,
    `--color-warning: ${warning};`,
    `--color-warning-subtle: ${hexToRgba(warning, lightMode ? 0.06 : 0.1)};`,
    `--color-info: ${info};`,
    `--color-info-subtle: ${hexToRgba(info, lightMode ? 0.06 : 0.1)};`,
    ``,
    `/* Shadows */`,
    `--shadow-sm: 0 1px 3px rgba(0, 0, 0, ${lightMode ? 0.08 : 0.3});`,
    `--shadow-md: 0 4px 12px rgba(0, 0, 0, ${lightMode ? 0.1 : 0.4});`,
    `--shadow-lg: 0 8px 32px rgba(0, 0, 0, ${lightMode ? 0.12 : 0.5});`,
    ``,
    `/* Select */`,
    `--select-bg: ${lightMode ? surface : hexToRgba(surface, 0.65)};`,
    `--select-option-bg: ${surface};`,
    `--select-option-text: ${textPrimary};`,
  ];

  return lines.join("\n  ");
}

// ── CSS Injection ──────────────────────────────────────────────────────

/**
 * Returns the data-theme attribute value for a custom theme.
 * Custom themes use `custom-<id>` to avoid collisions with built-in themes.
 */
export function getCustomThemeAttr(id: string): string {
  return `custom-${id}`;
}

/** Build the full CSS rule for a custom theme */
function buildStyleContent(theme: CustomTheme): string {
  if (!theme || !theme.id) return "";
  const selector = `[data-theme="${getCustomThemeAttr(theme.id)}"]`;
  return `${selector} {\n  ${deriveFullCSS(theme.tokens)}\n}`;
}

/** Inject or update a <style> element for a single custom theme */
function injectThemeStyle(theme: CustomTheme): void {
  if (typeof document === "undefined") return;
  const styleId = STYLE_ID_PREFIX + theme.id;
  let el = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = styleId;
    el.setAttribute("data-custom-theme", theme.id);
    document.head.appendChild(el);
  }
  el.textContent = buildStyleContent(theme);
}

/** Remove the <style> element for a custom theme */
function removeThemeStyle(id: string): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(STYLE_ID_PREFIX + id);
  if (el) el.remove();
}

// ── CRUD Operations ────────────────────────────────────────────────────

/** Read all custom themes from localStorage */
function getAll(): CustomTheme[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist the full custom themes array to localStorage */
function persistAll(themes: CustomTheme[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  } catch {
    /* localStorage full or unavailable */
  }
}

/** Save (upsert) a custom theme */
function save(theme: CustomTheme): CustomTheme[] {
  const all = getAll();
  const index = all.findIndex((t) => t.id === theme.id);
  const updated = { ...theme, updatedAt: new Date().toISOString() };
  if (index >= 0) {
    all[index] = updated;
  } else {
    all.push(updated);
  }
  persistAll(all);
  injectThemeStyle(updated);
  return all;
}

/** Remove a custom theme by id */
function remove(id: string): CustomTheme[] {
  const all = getAll().filter((t) => t.id !== id);
  persistAll(all);
  removeThemeStyle(id);
  return all;
}

/** Duplicate a custom theme with a new id */
function duplicate(id: string): { themes: CustomTheme[]; newTheme: CustomTheme } | null {
  const all = getAll();
  const source = all.find((t) => t.id === id);
  if (!source) return null;

  const newId = crypto.randomUUID().slice(0, 8);
  const newTheme: CustomTheme = {
    ...structuredClone(source),
    id: newId,
    name: `${source.name} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  all.push(newTheme);
  persistAll(all);
  injectThemeStyle(newTheme);
  return { themes: all, newTheme };
}

/** Inject all custom theme <style> blocks (called on app boot) */
function injectAllCustomThemes(): void {
  const all = getAll();
  for (const theme of all) {
    if (theme) {
      injectThemeStyle(theme);
    }
  }
}

/** Get custom theme names for the ThemeProvider themes array */
function getCustomThemeNames(): string[] {
  return getAll().map((t) => getCustomThemeAttr(t.id));
}

/** Build a metadata map for the ThemePickerComponent */
function getCustomThemeMetaMap(): Record<string, CustomThemeMeta> {
  const map: Record<string, CustomThemeMeta> = {};
  for (const theme of getAll()) {
    if (!theme) continue;
    const t = theme.tokens || {};
    map[getCustomThemeAttr(theme.id)] = {
      label: theme.name || "Unnamed Theme",
      icon: theme.icon || "palette",
      background: t.background || "#0a0a0f",
      surface: t.surface || "#13141c",
      elevated: t.elevated || "#1a1b26",
      primary: t.primary || "#6366f1",
      secondary: t.secondary || "#a78bfa",
      tertiary: t.tertiary || "#38bdf8",
      textPrimary: t.textPrimary || "#f8f8f8",
      textSecondary: t.textSecondary || "#8e95ae",
      textMuted: t.textMuted || "#565c74",
      borderColor: t.borderColor || "#ffffff",
      success: t.success || "#10b981",
      danger: t.danger || "#ef4444",
      warning: t.warning || "#f59e0b",
      info: t.info || "#3b82f6",
    };
  }
  return map;
}

/**
 * Generate a raw CSS string for all custom themes (used by themeInit
 * for FOUC prevention — injected inline before first paint).
 */
function generateAllCustomThemeCSS(): string {
  return getAll()
    .map(buildStyleContent)
    .filter(Boolean)
    .join("\n");
}

// ── Default Token Presets ──────────────────────────────────────────────

/** Built-in theme token snapshots for the "clone from" flow */
const BUILT_IN_PRESETS: Record<string, CustomThemeTokens> = {
  dark: {
    background: "#0a0a0f",
    surface: "#13141c",
    elevated: "#1a1b26",
    primary: "#6366f1",
    secondary: "#a78bfa",
    tertiary: "#38bdf8",
    textPrimary: "#f8f8f8",
    textSecondary: "#8e95ae",
    textMuted: "#565c74",
    borderColor: "#ffffff",
    success: "#10b981",
    danger: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
  },
  light: {
    background: "#f5f5f7",
    surface: "#ffffff",
    elevated: "#edeef2",
    primary: "#4f46e5",
    secondary: "#e11d48",
    tertiary: "#f59e0b",
    textPrimary: "#1a1a2e",
    textSecondary: "#64748b",
    textMuted: "#94a3b8",
    borderColor: "#000000",
    success: "#059669",
    danger: "#dc2626",
    warning: "#d97706",
    info: "#2563eb",
  },
  tropical: {
    background: "#1a120e",
    surface: "#241a14",
    elevated: "#2e221a",
    primary: "#ff6b6b",
    secondary: "#00ceaa",
    tertiary: "#fbbf24",
    textPrimary: "#faebd7",
    textSecondary: "#c4a882",
    textMuted: "#8a7560",
    borderColor: "#00ceaa",
    success: "#00d4aa",
    danger: "#ff5252",
    warning: "#ffb347",
    info: "#4fc3f7",
  },
  oceanic: {
    background: "#060d18",
    surface: "#0b1628",
    elevated: "#111f38",
    primary: "#00b4d8",
    secondary: "#48e0a0",
    tertiary: "#a78bfa",
    textPrimary: "#d0e8f2",
    textSecondary: "#7ba7c2",
    textMuted: "#4a7a96",
    borderColor: "#00b4d8",
    success: "#48e0a0",
    danger: "#ff6b6b",
    warning: "#ffc857",
    info: "#90e0ef",
  },
  punk: {
    background: "#0e0a10",
    surface: "#171119",
    elevated: "#211828",
    primary: "#ff2d9b",
    secondary: "#f0b429",
    tertiary: "#a78bfa",
    textPrimary: "#f0e6f4",
    textSecondary: "#b893c4",
    textMuted: "#7d5f8e",
    borderColor: "#ff2d9b",
    success: "#39ff76",
    danger: "#ff3d5a",
    warning: "#f0b429",
    info: "#a78bfa",
  },
  ember: {
    background: "#120c08",
    surface: "#1c1410",
    elevated: "#261c16",
    primary: "#f59e0b",
    secondary: "#e06c4e",
    tertiary: "#34d399",
    textPrimary: "#f5ebe0",
    textSecondary: "#c2a68a",
    textMuted: "#8b7260",
    borderColor: "#f59e0b",
    success: "#34d399",
    danger: "#ef4444",
    warning: "#fbbf24",
    info: "#60a5fa",
  },
};

function getBuiltInPreset(themeId: string): CustomThemeTokens {
  return BUILT_IN_PRESETS[themeId] || BUILT_IN_PRESETS.dark;
}

// ── Public API ─────────────────────────────────────────────────────────

const CustomThemeService = {
  getAll,
  save,
  remove,
  duplicate,
  injectAllCustomThemes,
  injectThemeStyle,
  getCustomThemeNames,
  getCustomThemeMetaMap,
  getCustomThemeAttr,
  getBuiltInPreset,
  generateAllCustomThemeCSS,
  BUILT_IN_PRESETS,
};

export default CustomThemeService;
