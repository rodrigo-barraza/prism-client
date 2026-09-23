---
name: verify
description: Build/launch/drive recipe for verifying prism-client UI changes in the running app.
---

# Verifying prism-client changes

## Launch

- Dev server: `npm run dev` (Next.js on port **3333**). Check first — one is
  often already running (`ss -ltnp | grep 3333`); it hot-reloads working-tree
  edits, so no restart needed.
- `/` redirects to `/chat`.

## Drive (Playwright)

- No local Playwright install; borrow one:
  `import { chromium } from "/home/rodrigo/development/tools-service/node_modules/playwright/index.mjs"`.
- Use `waitUntil: "domcontentloaded"` — `/chat` holds live connections open, so
  `networkidle` never settles.
- Sidebar starts collapsed in a fresh profile. Force it open via
  `addInitScript(() => localStorage.setItem("panel_nav", "true"))`.
- The Next dev overlay (`<nextjs-portal>`) intercepts clicks — remove it before
  clicking: `document.querySelector("nextjs-portal")?.remove()`.
- Theme switching for visual checks: set
  `document.documentElement.setAttribute("data-theme", "tropical")` (themes in
  `src/app/globals.css`). Fresh profiles land on the Daylight theme, whose
  accents are greys — accent-derived visuals look grey there by design.
- Mobile surfaces: `page.setViewportSize({ width: 420, height: 900 })` remounts
  the sidebar as hamburger + popover.
- Chat selectors that hold across the split (2026-09-23): composer
  `[role="textbox"][contenteditable]`, send / stop `button[aria-label="Send"]` /
  `button[aria-label="Stop"]` (a turn is over when Send is back), rows
  `[data-message-index]`, approval card `[role="group"][aria-label^="Approval for"]`,
  live badge `[aria-label^="Live stream:"]` (Connecting / Live / Reconnecting).
- The transcript is windowed: only rows near the viewport are mounted. Scroll
  to a row (or use the header's ↑/↓ message buttons) before reading it.
- Pick a new chat's model with `/chat?agent=CODING&model=<provider>:<model>`,
  and check the header shows it before sending.
- An isolated stack (prism-service `docs/prompts/README.md` §Live) needs a
  workspace agent for any chat that uses files; the README has the command.

## Gotchas

- Pre-existing SSR error (not yours): `document is not defined` from
  `AgentChatComponent` (generating-dot phase color) — logs
  "Switched to client rendering" on every `/chat` load.
- At phone width under `next dev`, the chat opens with its settings panel over
  the transcript: React StrictMode re-runs ThreePanelLayout's narrow-transition
  effect, which restores both panels (a production build does not). Close it as
  a tap on the chat would:
  `document.dispatchEvent(new Event("panel:dismiss-sidebars"))`.
- Dev server stdout isn't in a file; snapshot it with
  `timeout 3 cat /proc/<next-server-pid>/fd/1 > log.txt &` while curling the page.
