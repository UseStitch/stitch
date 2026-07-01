# Stitch

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/UseStitch/stitch)

**Stitch** is a local-first, AI-powered desktop assistant that runs entirely on your machine — no cloud accounts, no tracking, no data leaving your computer.

Think of it as an AI pair programmer for your entire operating system: it can read and write files, run shell commands, search code, browse the web, manage your calendar and email, record and summarize meetings, and execute recurring automations — all through a natural language chat interface.

## Features

- **AI Chat** — Full conversational interface with an LLM that has tool-use capabilities across your local machine
- **Tool System** — The AI can read/write files, run bash, search code/glob/grep, browse the web, ask you questions, and delegate subtasks to child sessions
- **Automations** — Turn any chat into a recurring workflow (daily summaries, cleanup tasks, scheduled reports)
- **Agenda Management** — Built-in planning for todos, priorities, due dates, and daily schedules that Stitch can update from chats or meetings
- **Meeting Recordings** — Granola-style local meeting capture from Zoom, Meet, Teams, Slack, or Discord, with transcription, summaries, and action items
- **Memory System** — Semantic memory using LanceDB vector storage so the AI remembers your preferences, workflows, and key facts across conversations
- **Connectors** — Integrate with external services (Google: Gmail, Drive, Calendar) via a pluggable connector framework
- **MCP Support** — Model Context Protocol integration for additional tool ecosystems
- **100% Local** — SQLite database, local vector store, sidecar server. No accounts, no telemetry, no cloud dependency

## Architecture

```
stitch/
├── apps/
│   ├── desktop/        # Electron shell — spawns the server, provides native OS integration
│   └── web/            # React 19 + TanStack UI (chat, settings, onboarding)
├── packages/
│   ├── server/         # Hono-based local backend — LLM orchestration, tool execution, DB
│   ├── shared/         # Zod schemas, TypeScript interfaces, constants
│   ├── scheduler/      # Cron-like scheduling for automations
│   ├── sandbox/        # Process-isolated TypeScript execution for Code Mode
│   ├── audio-capture/  # TypeScript wrapper around native Rust audio recording
│   └── meeting-detection/ # NAPI native addon for in-process meeting detection
├── native/             # Rust workspace (audio capture)
│   └── crates/
│       ├── audio-core/
│       ├── audio-recording/
│       └── audio-cli/
├── connectors/
│   ├── sdk/            # Connector framework and shared types
│   └── google/         # Google connector (Gmail, Drive, Calendar)
└── registries/
    ├── embeddings/
    ├── live-transcription/
    └── mcp/
```

## Tech Stack

| Layer              | Technology                                                         |
| ------------------ | ------------------------------------------------------------------ |
| Desktop Shell      | Electron                                                           |
| Frontend           | React 19, TanStack Router, TanStack Query                          |
| Backend            | Hono (TypeScript), Bun runtime                                     |
| Database           | SQLite via Drizzle ORM                                             |
| Vector Store       | LanceDB                                                            |
| AI SDK             | Vercel AI SDK (OpenAI, Anthropic, Google, AWS Bedrock, OpenRouter) |
| Audio Capture      | Rust (cpal, WASAPI, CoreAudio)                                     |
| Monorepo           | Bun workspaces, Turborepo                                          |
| Linting/Formatting | Oxlint, Oxfmt                                                      |

## Development

```bash
# Install Bun (required): https://bun.sh/
bun install            # Install all dependencies
bun run dev            # Start the app in development mode
bun run check          # Run lint, typecheck, test, and format checks
bun run audio-native:build  # Build native Rust audio binaries
```

## Packages

| Package                     | Description                                |
| --------------------------- | ------------------------------------------ |
| `@stitch/desktop`           | Electron desktop shell                     |
| `@stitch/web`               | React/TanStack web UI                      |
| `@stitch/server`            | Local backend service and AI orchestration |
| `@stitch/shared`            | Shared types and cross-package contracts   |
| `@stitch/scheduler`         | Scheduling utilities and job-related logic |
| `@stitch/sandbox`           | Process-isolated Code Mode runtime         |
| `@stitch/audio-capture`     | Native audio recording wrapper             |
| `@stitch-connectors/sdk`    | Connector framework                        |
| `@stitch-connectors/google` | Google connector implementation            |

## License

MIT
