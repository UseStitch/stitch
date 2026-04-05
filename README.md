# Stitch

Stitch is an AI-powered desktop app that helps users get work done locally.

## Status

Stitch is currently in **alpha**. Things will break, behavior may change quickly, and APIs are not stable yet. We still do our best to keep things usable and improve reliability each release.

## Packages

### Apps

- `apps/desktop` (`@stitch/desktop`): Electron desktop shell for Stitch.
- `apps/web` (`@stitch/web`): React/TanStack web UI used by the desktop app.

### Core packages

- `packages/server` (`@stitch/server`): Local backend service and AI/runtime orchestration.
- `packages/shared` (`@stitch/shared`): Shared types and cross-package contracts.
- `packages/scheduler` (`@stitch/scheduler`): Scheduling utilities and job-related logic.

### Connectors

- `connectors/sdk` (`@stitch-connectors/sdk`): Connector framework and shared connector types.
- `connectors/google` (`@stitch-connectors/google`): Google connector implementation.

## Development

- Install dependencies: `bun install`
- Run project checks: `bun run check`
