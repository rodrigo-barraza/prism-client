# Prism Client — AI Chat Interface

Feature-rich frontend for interacting with AI models through the [Prism AI Gateway](../prism-service). Supports multi-provider chat, streaming responses, image generation, text-to-speech, speech-to-text, agent sessions, benchmarking, workflows, and an admin dashboard for monitoring usage and costs.

## Features

### Chat

- **Multi-Provider Chat** — Switch between OpenAI, Anthropic, Google, LM Studio, and more
- **WebSocket Streaming** — Real-time token-by-token response rendering
- **Thinking / Reasoning** — Display model thinking output with configurable effort levels
- **Vision** — Attach images and documents (PDFs) for multimodal models
- **Image Generation** — Inline image generation with GPT Image and Imagen
- **Web Search** — Toggle grounded web search with source citations
- **Code Execution** — Server-side code execution results rendered inline
- **Markdown Rendering** — Full markdown with syntax highlighting
- **System Prompts** — Create, select, and manage reusable system instructions
- **Conversation History** — Save, load, rename, and delete conversations
- **Message Editing** — Edit, delete, or re-run individual messages
- **Auto-Title** — Conversations automatically titled from first message

### Text-to-Speech

- **Multiple TTS Providers** — OpenAI, Google, ElevenLabs, and Inworld voices
- **Voice Selection** — Per-provider voice picker with gender labels
- **Inline Playback** — Audio responses with playback controls in chat

### Speech-to-Text

- **Audio Transcription** — Attach audio files and transcribe with OpenAI Whisper or Google
- **Multi-File Support** — Transcribe multiple audio files in sequence

### Tools & Agents

- **Tool Browser** — Browse and search available tools
- **Coding Agent** — Dedicated coding agent interface
- **Agent Personas** — Custom agent configuration
- **Benchmarks** — Run prompts across models and compare results
- **Workflows** — Visual node-graph workflow editor
- **Synthesis** — Multi-model synthesis sessions
- **VRAM Benchmark** — Local model VRAM usage benchmarking

### Admin Dashboard (`/admin`)

- **Overview** — Total requests, tokens, cost, latency, and success rate
- **Request Logs** — Paginated, filterable request history with full detail view
- **Conversations** — Cross-project conversation browser
- **Traces** — Request trace viewer
- **Tool Calls** — Tool call log viewer
- **Tool Requests** — Tool request analytics
- **Models** — Model usage analytics
- **Providers** — Provider usage analytics
- **Media** — Admin media browser

### Settings

- **Model Selection** — Grouped by provider with pricing, context length, and arena scores
- **Generation Parameters** — Temperature, max tokens, top-p, top-k, penalties, stop sequences
- **Tool Toggles** — Enable/disable thinking, web search, code execution, URL context
- **Dark / Light / Tropical Theme** — Toggle with persistent preference

## Stack

| Dependency                            | Purpose                        |
| ------------------------------------- | ------------------------------ |
| Next.js 16                            | React framework (App Router)   |
| React 19                              | UI library                     |
| `@rodrigo-barraza/components-library` | Shared component library       |
| `@rodrigo-barraza/utilities-library`  | Shared utility functions       |
| react-markdown                        | Markdown rendering             |
| react-syntax-highlighter              | Code block syntax highlighting |
| remark-gfm                            | GitHub-flavored markdown       |
| Recharts                              | Analytics charts               |
| Chart.js                              | Additional chart types         |
| Three.js                              | 3D visualizations              |
| Lucide React                          | Icons                          |
| Luxon                                 | Date/time formatting           |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
# Secrets are resolved from vault-service automatically.

# 3. Start development server
npm run dev
```

## Environment

Secrets are resolved in priority order:

1. `process.env` (manual env vars, Docker `--env`)
2. Local `.env` file
3. Vault service (`VAULT_SERVICE_URL` + `VAULT_SERVICE_TOKEN`)
4. Shared `../vault-service/.env` fallback

| Variable            | Description                      |
| ------------------- | -------------------------------- |
| `PRISM_CLIENT_PORT` | Dev server port (default `3333`) |
| `VAULT_SERVICE_URL` | Vault service endpoint           |
| `PRISM_URL`         | Prism backend REST URL           |
| `PRISM_WS_URL`      | Prism backend WebSocket URL      |
| `TOOLS_API_URL`     | Tools service URL                |
| `MINIO_PUBLIC_URL`  | MinIO public endpoint for media  |

## Authentication

Prism needs a login — on the LAN too; there is no private-network bypass.

- **The gate** (`src/proxy.ts` → Auth.js `authorized` → `src/lib/gate.ts`): every page
  and API route needs a session whose email is in `PRISM_ALLOWED_EMAILS`. Signed out,
  a page goes to `/login` (at the origin the browser used) and an API route gets 401;
  an account not on the list gets `/login?error=AccessDenied` or 403. Only Auth.js's
  routes, Next's build assets, `sw.js`, the files in `public/`, the app's icons and
  web manifest, and `/login` are open.
  Sign-in itself (Google, or an accounts-service password) refuses an email not on
  the list. The Admin Side also needs the `admin` role from accounts-service.
- **The token** (`GET /api/prism-token` → `{ token, expiresAt, username, roles }`):
  prism-service trusts nothing from a browser but this HS256 JWT, signed with
  `PRISM_USER_TOKEN_SECRET` for the signed-in user — `sub` is their Prism username
  (`PRISM_USERS`, else the email's local part), `iss` `prism-client`, `aud`
  `prism-service`, one hour. `expiresAt` is epoch milliseconds.
- **The browser** (`src/services/prismTokenManager.ts`, `prismFetch.ts`): the app
  renders once the first token is in hand (`PrismSessionGateComponent`). Every call
  to prism-service sends `Authorization: Bearer <token>`; the token is renewed five
  minutes before it expires and once after a 401 (the request is retried once). The
  live socket carries it as `access_token` on its URL, a fresh one per reconnect;
  the admin change streams are read with fetch (`prismEventSource.ts`) because
  `EventSource` cannot send a header. A token route that answers 401/403 sends the
  app to `/login`, coming back afterwards.
- **tools-service** is reached only through `/api/tools/*`, a route handler that
  checks the session and adds `x-api-secret: TOOLS_SERVICE_API_SECRET`, streaming
  both ways. The workspace-agent downloads go through `/api/prism/workspaces/download/*`,
  which calls prism-service with a token minted for the user.

| Server-only variable       | Meaning                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `AUTH_SECRET`              | Auth.js session encryption                                          |
| `AUTH_GOOGLE_ID`/`_SECRET` | Google sign-in                                                      |
| `PRISM_ALLOWED_EMAILS`     | comma-separated emails that may sign in — **empty admits nobody**   |
| `PRISM_USERS`              | `email=username` pairs: the Prism username each login becomes       |
| `PRISM_USER_TOKEN_SECRET`  | the HS256 key for user tokens (prism-service verifies with it)      |
| `TOOLS_SERVICE_API_SECRET` | the secret `/api/tools` sends to tools-service                      |

None of them may be listed in `next.config.ts`'s `env` or carry a `NEXT_PUBLIC_`
prefix: they are read from `process.env` at runtime (`boot.js` loads them from the
vault) and never reach the browser.

## Scripts

```bash
npm run start         # Start production server
npm run dev           # Start dev server (port 3333)
npm run build         # Build for production
npm run lint          # Run oxlint (.oxlintrc.json)
npm run lint:fix      # Auto-fix lint issues
npm run format        # Format with Prettier
npm run format:check  # Check formatting
npm test              # Run tests (Vitest)
npm run test:watch    # Run tests in watch mode
npm run deploy        # Deploy to production
npm run deploy:dry    # Validate deployment without deploying
```

## Architecture

```
prism-client/
├── public/                     # Static assets (AudioWorklet processors, icons)
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── admin/              # Admin dashboard
│   │   │   ├── agent-sessions/
│   │   │   ├── conversations/
│   │   │   ├── media/
│   │   │   ├── models/
│   │   │   ├── providers/
│   │   │   ├── requests/
│   │   │   ├── text/
│   │   │   ├── tool-calls/
│   │   │   ├── tool-requests/
│   │   │   ├── traces/
│   │   │   └── workflows/
│   │   ├── agents/             # Agent personas
│   │   ├── benchmarks/         # Benchmark runner
│   │   ├── chat/               # Main chat interface
│   │   ├── coding-agent/       # Coding agent interface
│   │   ├── media/              # Generated media gallery
│   │   ├── models/             # Model catalog browser
│   │   ├── settings/           # User settings
│   │   ├── synthesis/          # Multi-model synthesis
│   │   ├── text/               # Plain text generation
│   │   ├── tools/              # Tool browser
│   │   ├── vram-benchmark/     # VRAM benchmark interface
│   │   └── workflows/          # Workflow editor
│   ├── components/             # React components (100+)
│   ├── hooks/                  # Custom React hooks
│   ├── services/               # API clients (PrismService, SSEManager, etc.)
│   └── utils/                  # Utility helpers
├── config.ts                   # Runtime configuration
├── secrets.ts                  # Secret resolution (gitignored)
├── next.config.mjs             # Next.js + Vault bootstrap
└── deploy.sh                   # Synology NAS deploy script
```

## Related Services

- **prism-service** (`:7777`) — AI gateway backend (chat, TTS, STT, agents, benchmarks)
- **tools-service** (`:5590`) — Tool execution hub
