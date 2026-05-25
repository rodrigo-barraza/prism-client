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
  // Accent
  accentColor: string;
  accentSecondary: string;
  // Surfaces
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  // Borders
  borderColor: string;
  // Semantic
  danger: string;
  success: string;
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
  color: string;
  secondary: string;
  bg: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const STORAGE_KEY = "prism:custom-themes";
const STYLE_ID_PREFIX = "custom-theme-";

// ── Color Utilities ────────────────────────────────────────────────────

/** Parse a hex color (#rrggbb) into [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
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
 * From the ~13 user-picked tokens, derive the full set of ~45+ CSS custom
 * properties needed by the design system.
 */
function deriveFullCSS(tokens: CustomThemeTokens): string {
  const {
    accentColor,
    accentSecondary,
    bgPrimary,
    bgSecondary,
    bgTertiary,
    textPrimary,
    textSecondary,
    textTertiary,
    borderColor: borderCol,
    danger,
    success,
    warning,
    info,
  } = tokens;

  const lightMode = isLight(bgPrimary);
  const borderRgb = hexToRgb(borderCol);

  // Derive text muted (halfway between tertiary and bg)
  const [tr, tg, tb] = hexToRgb(textTertiary);
  const [br, bg2, bb] = hexToRgb(bgPrimary);
  const textMuted = rgbToHex(
    (tr + br) / 2,
    (tg + bg2) / 2,
    (tb + bb) / 2,
  );

  // Derive text inverse (opposite of primary bg)
  const textInverse = lightMode ? bgPrimary : textPrimary;

  // Opacity scales depend on light/dark
  const borderOpacity = lightMode ? 0.1 : 0.06;
  const subtleMultiplier = lightMode ? 0.5 : 0.5;
  const mediumMultiplier = lightMode ? 1.0 : 1.67;
  const accentMultiplier = lightMode ? 1.4 : 2.5;
  const glowAlpha = lightMode ? 0.2 : 0.4;
  const subtleAlpha = lightMode ? 0.06 : 0.1;
  const shadowAlpha = lightMode ? 0.08 : 0.15;

  const lines = [
    `/* Accent — Primary */`,
    `--accent-color: ${accentColor};`,
    `--accent-hover: ${darken(accentColor, 12)};`,
    `--accent-glow: ${hexToRgba(accentColor, glowAlpha)};`,
    `--accent-subtle: ${hexToRgba(accentColor, subtleAlpha)};`,
    `--shadow-glow: 0 0 20px ${hexToRgba(accentColor, shadowAlpha)};`,
    ``,
    `/* Accent — Secondary */`,
    `--accent-secondary: ${accentSecondary};`,
    `--accent-secondary-hover: ${darken(accentSecondary, 12)};`,
    `--accent-secondary-glow: ${hexToRgba(accentSecondary, glowAlpha)};`,
    `--accent-secondary-subtle: ${hexToRgba(accentSecondary, subtleAlpha)};`,
    ``,
    `/* Surfaces */`,
    `--bg-primary: ${bgPrimary};`,
    `--bg-secondary: ${bgSecondary};`,
    `--bg-tertiary: ${bgTertiary};`,
    `--bg-surface: ${hexToRgba(bgSecondary, 0.72)};`,
    `--bg-card: ${hexToRgba(bgSecondary, 0.94)};`,
    `--bg-card-hover: ${hexToRgba(bgTertiary, 0.96)};`,
    `--bg-panel: ${hexToRgba(bgSecondary, 0.85)};`,
    `--bg-input: ${hexToRgba(bgSecondary, 0.6)};`,
    `--bg-input-hover: ${hexToRgba(bgTertiary, 0.7)};`,
    `--bg-sidebar: ${hexToRgba(lightMode ? lighten(bgPrimary, 3) : darken(bgPrimary, 15), 0.97)};`,
    ``,
    `/* Borders */`,
    `--border-color: rgba(${borderRgb.join(", ")}, ${borderOpacity});`,
    `--border-subtle: rgba(${borderRgb.join(", ")}, ${borderOpacity * subtleMultiplier});`,
    `--border-medium: rgba(${borderRgb.join(", ")}, ${borderOpacity * mediumMultiplier});`,
    `--border-accent: rgba(${borderRgb.join(", ")}, ${borderOpacity * accentMultiplier});`,
    ``,
    `/* Text */`,
    `--text-primary: ${textPrimary};`,
    `--text-secondary: ${textSecondary};`,
    `--text-tertiary: ${textTertiary};`,
    `--text-muted: ${textMuted};`,
    `--text-inverse: ${textInverse};`,
    ``,
    `/* Semantic */`,
    `--danger: ${danger};`,
    `--danger-subtle: ${hexToRgba(danger, lightMode ? 0.06 : 0.1)};`,
    `--success: ${success};`,
    `--success-subtle: ${hexToRgba(success, lightMode ? 0.06 : 0.1)};`,
    `--warning: ${warning};`,
    `--warning-subtle: ${hexToRgba(warning, lightMode ? 0.06 : 0.1)};`,
    `--info: ${info};`,
    `--info-subtle: ${hexToRgba(info, lightMode ? 0.06 : 0.1)};`,
    `--color-success: var(--success);`,
    `--color-error: var(--danger);`,
    `--color-warning: var(--warning);`,
    `--color-info: var(--info);`,
    ``,
    `/* Shadows */`,
    `--shadow-sm: 0 1px 3px rgba(0, 0, 0, ${lightMode ? 0.08 : 0.3});`,
    `--shadow-md: 0 4px 12px rgba(0, 0, 0, ${lightMode ? 0.1 : 0.4});`,
    `--shadow-lg: 0 8px 32px rgba(0, 0, 0, ${lightMode ? 0.12 : 0.5});`,
    ``,
    `/* Select */`,
    `--select-bg: ${lightMode ? bgSecondary : hexToRgba(bgSecondary, 0.65)};`,
    `--select-option-bg: ${bgSecondary};`,
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
    return raw ? (JSON.parse(raw) as CustomTheme[]) : [];
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
    injectThemeStyle(theme);
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
    map[getCustomThemeAttr(theme.id)] = {
      label: theme.name,
      icon: theme.icon,
      color: theme.tokens.accentColor,
      secondary: theme.tokens.accentSecondary,
      bg: theme.tokens.bgPrimary,
    };
  }
  return map;
}

/**
 * Generate a raw CSS string for all custom themes (used by themeInit
 * for FOUC prevention — injected inline before first paint).
 */
function generateAllCustomThemeCSS(): string {
  return getAll().map(buildStyleContent).join("\n");
}

// ── Default Token Presets ──────────────────────────────────────────────

/** Built-in theme token snapshots for the "clone from" flow */
const BUILT_IN_PRESETS: Record<string, CustomThemeTokens> = {
  dark: {
    accentColor: "#6366f1",
    accentSecondary: "#a78bfa",
    bgPrimary: "#0a0a0f",
    bgSecondary: "#13141c",
    bgTertiary: "#1a1b26",
    textPrimary: "#f8f8f8",
    textSecondary: "#8e95ae",
    textTertiary: "#6b728e",
    borderColor: "#ffffff",
    danger: "#ef4444",
    success: "#10b981",
    warning: "#f59e0b",
    info: "#3b82f6",
  },
  light: {
    accentColor: "#4f46e5",
    accentSecondary: "#e11d48",
    bgPrimary: "#f5f5f7",
    bgSecondary: "#ffffff",
    bgTertiary: "#edeef2",
    textPrimary: "#1a1a2e",
    textSecondary: "#64748b",
    textTertiary: "#78849c",
    borderColor: "#000000",
    danger: "#dc2626",
    success: "#059669",
    warning: "#d97706",
    info: "#2563eb",
  },
  tropical: {
    accentColor: "#ff6b6b",
    accentSecondary: "#00ceaa",
    bgPrimary: "#1a120e",
    bgSecondary: "#241a14",
    bgTertiary: "#2e221a",
    textPrimary: "#faebd7",
    textSecondary: "#c4a882",
    textTertiary: "#8a7560",
    borderColor: "#00ceaa",
    danger: "#ff5252",
    success: "#00d4aa",
    warning: "#ffb347",
    info: "#4fc3f7",
  },
  oceanic: {
    accentColor: "#00b4d8",
    accentSecondary: "#48e0a0",
    bgPrimary: "#060d18",
    bgSecondary: "#0b1628",
    bgTertiary: "#111f38",
    textPrimary: "#d0e8f2",
    textSecondary: "#7ba7c2",
    textTertiary: "#4a7a96",
    borderColor: "#00b4d8",
    danger: "#ff6b6b",
    success: "#48e0a0",
    warning: "#ffc857",
    info: "#90e0ef",
  },
  punk: {
    accentColor: "#ff2d9b",
    accentSecondary: "#f0b429",
    bgPrimary: "#0e0a10",
    bgSecondary: "#171119",
    bgTertiary: "#211828",
    textPrimary: "#f0e6f4",
    textSecondary: "#b893c4",
    textTertiary: "#7d5f8e",
    borderColor: "#ff2d9b",
    danger: "#ff3d5a",
    success: "#39ff76",
    warning: "#f0b429",
    info: "#a78bfa",
  },
  ember: {
    accentColor: "#f59e0b",
    accentSecondary: "#e06c4e",
    bgPrimary: "#120c08",
    bgSecondary: "#1c1410",
    bgTertiary: "#261c16",
    textPrimary: "#f5ebe0",
    textSecondary: "#c2a68a",
    textTertiary: "#8b7260",
    borderColor: "#f59e0b",
    danger: "#ef4444",
    success: "#34d399",
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
