/**
 * Pre-processes text to convert simple inline LaTeX math commands ($\command$)
 * into their Unicode equivalents before the markdown parser sees them.
 *
 * This avoids enabling remark-math's singleDollarTextMath option, which would
 * break currency notation like "$5-$10" or "$100($50 off)".
 */

const LATEX_COMMAND_TO_UNICODE: Record<string, string> = {
  /* ── Arrows ─────────────────────────────────────────────────── */
  "\\rightarrow": "→",
  "\\leftarrow": "←",
  "\\Rightarrow": "⇒",
  "\\Leftarrow": "⇐",
  "\\leftrightarrow": "↔",
  "\\Leftrightarrow": "⇔",
  "\\uparrow": "↑",
  "\\downarrow": "↓",
  "\\mapsto": "↦",
  "\\nearrow": "↗",
  "\\searrow": "↘",
  "\\nwarrow": "↖",
  "\\swarrow": "↙",
  "\\longrightarrow": "⟶",
  "\\longleftarrow": "⟵",
  "\\Longrightarrow": "⟹",
  "\\Longleftarrow": "⟸",
  "\\longleftrightarrow": "⟷",

  /* ── Math Operators ─────────────────────────────────────────── */
  "\\times": "×",
  "\\div": "÷",
  "\\pm": "±",
  "\\mp": "∓",
  "\\cdot": "·",
  "\\circ": "∘",
  "\\star": "⋆",
  "\\bullet": "•",
  "\\oplus": "⊕",
  "\\otimes": "⊗",

  /* ── Relations ──────────────────────────────────────────────── */
  "\\neq": "≠",
  "\\leq": "≤",
  "\\geq": "≥",
  "\\approx": "≈",
  "\\equiv": "≡",
  "\\sim": "∼",
  "\\simeq": "≃",
  "\\cong": "≅",
  "\\propto": "∝",
  "\\ll": "≪",
  "\\gg": "≫",
  "\\prec": "≺",
  "\\succ": "≻",

  /* ── Logic & Set Theory ─────────────────────────────────────── */
  "\\forall": "∀",
  "\\exists": "∃",
  "\\nexists": "∄",
  "\\neg": "¬",
  "\\land": "∧",
  "\\lor": "∨",
  "\\in": "∈",
  "\\notin": "∉",
  "\\subset": "⊂",
  "\\supset": "⊃",
  "\\subseteq": "⊆",
  "\\supseteq": "⊇",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\emptyset": "∅",
  "\\varnothing": "∅",

  /* ── Greek Letters (lowercase) ──────────────────────────────── */
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\delta": "δ",
  "\\epsilon": "ε",
  "\\varepsilon": "ε",
  "\\zeta": "ζ",
  "\\eta": "η",
  "\\theta": "θ",
  "\\vartheta": "ϑ",
  "\\iota": "ι",
  "\\kappa": "κ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\nu": "ν",
  "\\xi": "ξ",
  "\\pi": "π",
  "\\rho": "ρ",
  "\\sigma": "σ",
  "\\tau": "τ",
  "\\upsilon": "υ",
  "\\phi": "φ",
  "\\varphi": "φ",
  "\\chi": "χ",
  "\\psi": "ψ",
  "\\omega": "ω",

  /* ── Greek Letters (uppercase) ──────────────────────────────── */
  "\\Gamma": "Γ",
  "\\Delta": "Δ",
  "\\Theta": "Θ",
  "\\Lambda": "Λ",
  "\\Xi": "Ξ",
  "\\Pi": "Π",
  "\\Sigma": "Σ",
  "\\Upsilon": "Υ",
  "\\Phi": "Φ",
  "\\Psi": "Ψ",
  "\\Omega": "Ω",

  /* ── Miscellaneous Symbols ──────────────────────────────────── */
  "\\infty": "∞",
  "\\partial": "∂",
  "\\nabla": "∇",
  "\\hbar": "ℏ",
  "\\ell": "ℓ",
  "\\Re": "ℜ",
  "\\Im": "ℑ",
  "\\aleph": "ℵ",
  "\\wp": "℘",
  "\\angle": "∠",
  "\\triangle": "△",
  "\\diamond": "◇",
  "\\square": "□",
  "\\checkmark": "✓",
  "\\dagger": "†",
  "\\ddagger": "‡",
  "\\langle": "⟨",
  "\\rangle": "⟩",

  /* ── Big Operators (standalone symbols) ─────────────────────── */
  "\\sum": "∑",
  "\\prod": "∏",
  "\\coprod": "∐",
  "\\int": "∫",
  "\\oint": "∮",
  "\\bigcup": "⋃",
  "\\bigcap": "⋂",

  /* ── Dots ────────────────────────────────────────────────────── */
  "\\ldots": "…",
  "\\cdots": "⋯",
  "\\vdots": "⋮",
  "\\ddots": "⋱",

  /* ── Spacing / Accents (commonly emitted as standalone) ─────── */
  "\\to": "→",
  "\\gets": "←",
  "\\iff": "⟺",
  "\\implies": "⟹",
};

/**
 * Matches `$\command$` — a single LaTeX command (no spaces, no arguments)
 * wrapped in single-dollar delimiters. This is intentionally narrow to avoid
 * false positives with currency notation.
 *
 * The negative lookbehind (?<!`) and lookahead (?!`) prevent replacement
 * inside inline code spans.
 */
const SINGLE_COMMAND_PATTERN = /(?<!`)(\$)(\\[a-zA-Z]+)\$(?!`)/g;

export function sanitizeInlineLatex(content: string): string {
  return content.replace(SINGLE_COMMAND_PATTERN, (_match, _dollar, command) => {
    return LATEX_COMMAND_TO_UNICODE[command] ?? _match;
  });
}
