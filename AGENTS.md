# AGENTS.md - Coding Agent Instructions for Stitch

## Project Overview

Stitch is a ai based tool to help users do work locally.

## Quick Reference

| Command       | Description              |
| ------------- | ------------------------ |
| `bun install` | Install all dependencies |

## General Workflow

After completing any task, you **must** run the following checks and fix all issues until the output is fully clean:

1. `bun run check` - Gives all the check results (includes lint, test, typecheck, knip)

Do not consider a task done until all three commands pass with zero errors.

### Approach to Fixing Bugs

- Write a reproducible test case wherever possible before fixing the bug
- Fix the bug while ensuring the test passes
- This ensures the bug is well-understood and prevents regressions

### Managing Packages

- When installing packages you **must** use `bun add <package>`
- When removing packages you **must** use `bun remove <package>`

### Database Migrations (packages/server)

- `packages/server/src/db/schema.ts` is the single source of truth for the database schema
- After modifying `schema.ts`, run `bunx drizzle-kit generate` inside `packages/server` to produce a new numbered migration SQL file in `packages/server/drizzle/`
- Commit the generated migration file — it gets bundled with the Electron app and applied automatically at runtime via `migrate()` in `client.ts`
- Never edit generated migration files or the `drizzle/meta/` directory manually
- Do not add `drizzle-kit` as a runtime dependency — it is devOnly and only used during development to generate migrations

## Testing

- Project uses **Vitest** for testing. Tests are organized by workspace.
- Tests are located in `__test__` directories:

### Test Patterns

- **Unit tests**: Test individual functions/handlers in isolation
- **Integration tests**: Test full WebSocket flows with mock MongoDB/Valkey
- File naming: `*.test.ts`
- Config: `vitest.config.ts` in each workspace

### Test Quality Guidelines

- Do not test external module behavior - trust third-party libraries to work as documented
- Do not test guarantees provided by the language itself (e.g., type safety enforced at compile time)
- Tests should cover all branches of the function being tested
- Do not test orchestration call order unless order is semantically important to the functio
- Every assertion should verify something meaningful - if a test's comment says "should do X" but the assertions don't actually verify X, the test is broken

## Code Style Guidelines

### General

- Prefer low cyclomatic complexity code - keep functions simple with minimal branching
- Prefer absolute imports over relative (ie. import x from '@stitch/lib/...' instead of import x from '../../lib/...')

Naming Conventions

| Type             | Convention       | Example                 |
| ---------------- | ---------------- | ----------------------- |
| Files            | kebab-case       | `socket-server.ts`      |
| Interfaces/Types | PascalCase       | `User`, `ChannelMember` |
| Functions        | camelCase        | `createSocketToken`     |
| Constants        | UPPER_SNAKE_CASE | `COLLECTIONS`           |

### Comments

- Leave minimal comments
- Never comment self-describing code
- Only comment behavior that is non-obvious or out of the norm

### Styling

- Avoid inline styles (e.g., `style={{ background: '...' }}`) - use Tailwind classes instead
- Use semantic theme tokens from `apps/web/src/styles/` (e.g., `bg-primary`, `bg-success`, `text-warning`)
- Don't use hardcoded colors like `bg-red-500` or `bg-emerald-500` - use semantic tokens (`bg-destructive`, `bg-success`)
- For new styles that need to be reused, add them to `apps/web/src/styles/global.css` as utility classes

### Error Handling

- Avoid defensive try/catch blocks that don't add value
- Only catch errors when you can handle them meaningfully (e.g., return null, retry, log and continue)
- Let errors bubble up when there's no recovery strategy

### Do Not

- Use `var` - always `const` or `let`
- Use `==`/`!=` - use strict equality
- Use `any` without reason - prefer `unknown`
- Forget `.js` on relative imports
- Commit `.env` files
- Import from package internals
- Run build scripts
- Add oxlint-disable or eslint-disable comments
- Use dynamic imports inside of functions unless there is no alternative
- Create Barrel export files

## Performance Best Practices

### Async Operations

- Parallelize independent async operations using `Promise.all()` or `Promise.allSettled()`
- Avoid sequential awaits when operations don't depend on each other

```typescript
// Bad: Sequential awaits (slow)
const user = await fetchUser(userId);
const workspace = await fetchWorkspace(workspaceId);
const channels = await fetchChannels(workspaceId);

// Good: Parallel execution (fast)
const [user, workspace, channels] = await Promise.all([
  fetchUser(userId),
  fetchWorkspace(workspaceId),
  fetchChannels(workspaceId),
]);
```

### Database Operations

- Avoid N+1 queries - use bulk fetches or aggregation pipelines instead of querying in a loop
- Only fetch fields you need - use projection to select specific fields
- Take advantage of batch operations (`insertMany`, `updateMany`, `bulkWrite`)

```typescript
// Bad: N+1 query pattern
for (const userId of userIds) {
  const user = await users.findOne({ _id: userId });
}

// Good: Single bulk query
const userList = await users
  .find({ _id: { $in: userIds } })
  .project({ name: 1, email: 1 }) // Only fetch needed fields
  .toArray();
```

### Cache Management

- Don't store excess data in cache - only cache what's necessary
- Use appropriate TTLs for cached data
- Consider cache size limits to avoid memory bloat

## Tanstack Package Guide

LLMs Text: https://tanstack.com/llms.txt

### Tanstack Start/Routuer

General Component Layout

```typescript
export const Route = createFileRoute('/posts/$id')({
  component, // React component for page
  loader, // Fetch page data
  validateSearch, // Validate search params
  errorComponent, // If loader throws
  pendingComponent, // While the loader is running
  meta, // Meta tags, SEO
});

// Hooks:
Route.useParams(); // Access path parameters
Route.useLoaderData(); // Access loader data
Route.useSearch(); // Access search parameters
```

### Tanstack Query

#### `select` - Fine-grained Subscriptions

Use `select` to subscribe a component only to the specific data it needs, avoiding re-renders when unrelated fields change. If the selector has no dependencies, define it outside the component for a stable reference; if it closes over props, wrap it in `useCallback`.

```typescript
// Component only re-renders when `title` changes, not when other product fields do
function ProductTitle({ id }: Props) {
  const { data: title } = useSuspenseQuery({
    ...productOptions(id),
    select: (data) => data.title,
  })
  return <h1>{title}</h1>
}

// Stable reference - no dependencies, defined outside component
const selectTopRated = (data: Product[]) => expensiveTransformation(data)

function ProductList({ filters }: Props) {
  const { data } = useSuspenseQuery({
    ...productListOptions(filters),
    select: selectTopRated,
  })
  // ...
}

// Closes over props - use useCallback
function ProductList({ filters, minRating }: Props) {
  const { data } = useSuspenseQuery({
    ...productListOptions(filters),
    select: useCallback(
      (data: Product[]) => expensiveTransformation(data, minRating),
      [minRating]
    ),
  })
  // ...
}
```
