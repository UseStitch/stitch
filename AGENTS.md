# AGENTS.md - Coding Agent Instructions for Stitch

## Project Overview

Stitch is a ai based tool to help users do work locally.

## Quick Reference

| Command         | Description              |
| --------------- | ------------------------ |
| `bun install`   | Install all dependencies |
| `bun run check` | Checks Projects Rules    |

## Project Workflow

After completing any task, you **must** run the following checks and fix all issues until the output is fully clean:

1. `bun run check` - Gives all the check results (includes lint, test, typecheck, knip, format:changed)
2. If working with Rust files, use `cargo test` and `cargo format`

Do not consider a task done until all three commands pass with zero errors.

### Managing Packages

- When installing packages you **must** use `bun add <package>`
- When removing packages you **must** use `bun remove <package>`

### Database Migrations (packages/server)

- `packages/server/src/db/schema.ts` is the single source of truth for the database schema
- After modifying `schema.ts`, run `bunx drizzle-kit generate` inside `packages/server` to produce a new numbered migration SQL file in `packages/server/drizzle/`
- Commit the generated migration file — it gets bundled with the Electron app and applied automatically at runtime via `migrate()` in `client.ts`
- Never edit generated migration files or the `drizzle/meta/` directory manually
- Do not add `drizzle-kit` as a runtime dependency — it is devOnly and only used during development to generate migrations

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
