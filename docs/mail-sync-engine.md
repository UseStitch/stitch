# Mail Sync Engine — Implementation Plan

Status: **approved, ready for implementation**
Branch: `feature/mail-sync-engine`
Scope: Gmail-backed mail sync + management UI ("Mail" app). Outlook later via the same plugin interfaces.

---

## 1. Summary

Stitch gains a **Mail app**: a local sync engine that downloads Gmail mailboxes into a dedicated
SQLite database (separate from the main Stitch DB) and keeps them fresh with incremental syncs,
plus a Gmail-like UI for viewing and managing multiple inboxes (per-account view, no unified
inbox) and a settings page for account/sync management.

Initial operations: **read, mark read/unread, label changes, trash/untrash, drafts, send.**

### Settled decisions

| Decision | Choice |
| --- | --- |
| Package | Single new package `packages/mail` (`@stitch/mail`) — engine, DB schema, plugin interfaces, **and** the Gmail provider. No mail code in `connectors/google`. |
| Provider auth/rate limits | Dependency-injected: the server constructs a `GoogleClient` (existing auth + rate-limit stack) and adapts it to the engine's `MailHttpClient` interface. `@stitch/mail` never imports `connectors/google`. |
| Database | Second SQLite file `mail.db` (bun:sqlite + drizzle), own migrations folder in `packages/mail/drizzle`, applied at startup by the server. |
| Backfill | Metadata for the entire mailbox; full bodies for the last 90 days (per-account setting `backfillDays`). Bodies outside window hydrated on demand. |
| Attachments | Metadata synced with messages; file bytes downloaded lazily on demand. |
| Sync cadence | Per-account `syncFrequencySeconds` (default 90, min 30). Single scheduler tick job (30s) dispatches due accounts. |
| History recovery | Store `syncCursor` (historyId) **and** `lastSyncedAt`. On cursor expiry: approximate catch-up via `after:` query, then a low-priority reconciliation pass. See §5.3. |
| Inbox model | Per-account views only. No unified "all inboxes". |
| Enrollment | Opt-in per account from settings. No auto-enroll of connected Google accounts. |
| Agent tools | Deferred. DB query helpers are exported as plain functions from `@stitch/mail` so a future tool can consume them. |
| Push notifications | Not used (`users.watch` needs Pub/Sub + public endpoint). Polling only. |

---

## 2. Existing infrastructure map (read these before coding)

| Concern | Where | Notes |
| --- | --- | --- |
| Google OAuth + tokens | `packages/server/src/connectors/`, `connectors/google/src/connector.ts` | Scopes already include `gmail.readonly`, `gmail.send`, `gmail.modify` — **no new scopes needed**. |
| GoogleClient construction pattern | `packages/server/src/connectors/google-toolsets.ts:97-187` | The exact token-refresh wiring to replicate for the mail HTTP client. |
| Rate limiting | `connectors/google/src/rate-limit.ts` | `GoogleRateLimitCoordinator`, real Gmail quota-unit costs, keyed by connector instance id (`quotaAccountKey`). Built into `GoogleClient`. |
| DB client pattern | `packages/server/src/db/client.ts` | Copy this shape for `initMailDb()`. WAL, busy_timeout, FK pragmas, `migrate()` at startup. |
| Migrations bundling | `apps/desktop/electron-builder.config.ts:46` | Server migrations copied next to exe as `drizzle`; mail needs a second entry → `drizzle-mail`. |
| Runtime paths | `packages/server/src/lib/paths.ts:140-157` | Add `mailDb` to `filePaths`. |
| Scheduler | `packages/server/src/scheduler/runtime.ts:31-96` | Register `mail-sync-tick` job here. |
| SSE / event bus | `packages/server/src/lib/internal-bus.ts`, `packages/server/src/adapters/sse.ts`, `packages/server/src/routes/events.ts` | Add event names to `InternalEventMap`, emit, register in SSE adapter. |
| Route mounting | `packages/server/src/index.ts:59-79` | Add `app.route('/mail', mailRouter)`. |
| Apps concept | `packages/shared/src/apps/types.ts` | Add `'mail'` to `APP_IDS`. Gating pattern: `apps/web/src/lib/queries/apps.ts`, route guards in `apps/web/src/routes/recordings/route.tsx`. |
| Settings page pattern | `apps/web/src/components/settings/settings-metadata.tsx` (`SETTINGS_PAGES`), `apps/web/src/routes/settings/recordings.tsx`, `apps/web/src/components/settings/app-enable-setting.tsx` | |
| Navigation | `apps/web/src/components/navigation/activity-bar.tsx` (`TOP_ITEMS`), `apps/web/src/components/navigation/app-sidebar.tsx` (`SIDEBAR_CONTENT`) | |
| FE data layer | `apps/web/src/lib/api.ts` (`serverRequest`), `apps/web/src/lib/queries/`, `apps/web/src/lib/mutations/` | TanStack Query v5. |
| Package template | `packages/scheduler/package.json` | Minimal workspace package shape (src exports, typecheck, bun test). |
| Existing Gmail API code | `connectors/google/src/gmail/api.ts` | Reference only — tool-oriented. The mail provider implements its own sync-oriented calls. Do not modify or share. |

---

## 3. Package layout

```
packages/mail/
  package.json                 # @stitch/mail — deps: drizzle-orm, @stitch/shared
  drizzle.config.ts            # { dialect: 'sqlite', schema: './src/db/schema.ts', out: './drizzle' }
  drizzle/                     # generated migrations (committed)
  src/
    db/
      schema.ts                # all mail tables (single file, source of truth)
      client.ts                # initMailDb(dbPath, migrationsDir), getMailDb(), closeMailDb()
      queries.ts               # read helpers: listThreads, getThread, listLabels, ...
    contracts.ts               # ★ FROZEN CONTRACT FILE — all plugin + engine interfaces (§4)
    registry.ts                # registerMailProvider / getMailProvider
    sync/
      engine.ts                # per-account orchestrator + state machine
      backfill.ts              # full sync algorithm
      incremental.ts           # cursor sync + recovery ladder
      reconcile.ts             # flag/deletion repair pass
      persist.ts               # upsert pages of provider data into DB
    ops/
      outbox.ts                # enqueue, flush loop, retry/backoff
      operations.ts            # optimistic local mutations + outbox enqueue (trash, labels, send, drafts)
    providers/
      gmail/
        provider.ts            # implements MailSyncProvider + MailOpsProvider
        api.ts                 # raw Gmail REST calls (history.list, batch gets, drafts, ...)
        batch.ts               # multipart/mixed batch request helper (~50 ops/request)
        parse.ts               # Gmail payload → normalized SyncMessage (MIME walk, header extraction)
```

Rules:

- `@stitch/mail` has **no dependency** on `connectors/google` or `@stitch/server`.
- All provider network access goes through the injected `MailHttpClient`.
- Tests colocated (`*.test.ts`) per AGENTS.md. `parse.ts`, `incremental.ts` recovery ladder,
  `outbox.ts` retry logic, and `queries.ts` pagination are the priority test targets.
- After editing `src/db/schema.ts`, run `bunx drizzle-kit generate` inside `packages/mail` and
  commit the migration. Never hand-edit generated files.

---

## 4. Contracts (`packages/mail/src/contracts.ts`) — FROZEN after Wave 0

These types are the coordination boundary between workstreams. Implement exactly; changes require
coordinator sign-off and a doc update (§10.4).

```ts
// ── Infrastructure injected by the server ────────────────────────────────
export type MailHttpClient = {
  /** Authed, rate-limited request. Throws on non-retryable failures. */
  request(url: string, init?: RequestInit): Promise<Response>;
};

export type MailLogger = {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
};

export type MailProviderContext = {
  account: MailAccountRecord;      // row from mail_accounts
  http: MailHttpClient;
  logger: MailLogger;
  signal: AbortSignal;             // engine cancels on shutdown/disable
};

// ── Normalized provider data (provider → engine) ─────────────────────────
export type SyncLabel = {
  providerLabelId: string;
  name: string;
  kind: 'system' | 'user';
  color: string | null;
};

export type SyncAddress = { name: string | null; email: string };

export type SyncAttachmentMeta = {
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type SyncMessage = {
  providerMessageId: string;
  providerThreadId: string;
  from: SyncAddress | null;
  to: SyncAddress[];
  cc: SyncAddress[];
  bcc: SyncAddress[];
  subject: string | null;
  snippet: string;
  internalDate: number;            // epoch ms
  labelProviderIds: string[];
  bodyText: string | null;         // null when hydration === 'metadata'
  bodyHtml: string | null;
  hydration: 'metadata' | 'full';
  attachments: SyncAttachmentMeta[];
  headers: { messageId: string | null; inReplyTo: string | null; references: string | null };
};

export type SyncPage = {
  messages: SyncMessage[];
  /** Opaque resume cursor persisted after each page; undefined = backfill complete. */
  nextPageCursor: string | undefined;
};

export type SyncChange =
  | { kind: 'upsert'; message: SyncMessage }
  | { kind: 'delete'; providerMessageId: string }
  | { kind: 'labels'; providerMessageId: string; addProviderIds: string[]; removeProviderIds: string[] };

export type IncrementalResult =
  | { status: 'ok'; changes: SyncChange[]; nextSyncCursor: string }
  | { status: 'cursor_expired' };

// ── Plugin interfaces ─────────────────────────────────────────────────────
export type MailSyncProvider = {
  readonly id: string; // 'gmail'
  listLabels(ctx: MailProviderContext): Promise<SyncLabel[]>;
  /** Snapshot a sync cursor BEFORE backfill starts (Gmail: current historyId via getProfile). */
  snapshotCursor(ctx: MailProviderContext): Promise<string>;
  /** Newest-first, resumable. `fullBodiesAfter` (epoch ms) controls hydration format. */
  backfillPage(ctx: MailProviderContext, cursor: string | undefined, fullBodiesAfter: number): Promise<SyncPage>;
  incrementalSync(ctx: MailProviderContext, syncCursor: string): Promise<IncrementalResult>;
  /** Approximate catch-up when cursor expired (Gmail: messages.list q=after:<epochSec>). */
  listMessagesSince(ctx: MailProviderContext, sinceMs: number): Promise<SyncMessage[]>;
  hydrateMessages(ctx: MailProviderContext, providerMessageIds: string[]): Promise<SyncMessage[]>;
  fetchAttachment(
    ctx: MailProviderContext,
    providerMessageId: string,
    providerAttachmentId: string,
  ): Promise<Uint8Array>;
};

export type OutgoingDraft = {
  to: SyncAddress[];
  cc: SyncAddress[];
  bcc: SyncAddress[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  inReplyTo: { providerMessageId: string; providerThreadId: string } | null;
};

export type MailOpsProvider = {
  readonly id: string; // 'gmail'
  send(ctx: MailProviderContext, draft: OutgoingDraft): Promise<{ providerMessageId: string; providerThreadId: string }>;
  createDraft(ctx: MailProviderContext, draft: OutgoingDraft): Promise<{ providerDraftId: string }>;
  updateDraft(ctx: MailProviderContext, providerDraftId: string, draft: OutgoingDraft): Promise<void>;
  deleteDraft(ctx: MailProviderContext, providerDraftId: string): Promise<void>;
  sendDraft(ctx: MailProviderContext, providerDraftId: string): Promise<{ providerMessageId: string; providerThreadId: string }>;
  trashThread(ctx: MailProviderContext, providerThreadId: string): Promise<void>;
  untrashThread(ctx: MailProviderContext, providerThreadId: string): Promise<void>;
  modifyMessageLabels(
    ctx: MailProviderContext,
    providerMessageId: string,
    addProviderIds: string[],
    removeProviderIds: string[],
  ): Promise<void>;
};

export type MailProviderModule = { sync: MailSyncProvider; ops: MailOpsProvider };
```

Read/unread is a label operation (Gmail `UNREAD`); the engine maps `markRead` to
`modifyMessageLabels(remove: ['UNREAD'])`.

---

## 5. Database (`mail.db`)

### 5.1 Tables (drizzle, sqlite)

ID convention: prefixed random ids matching existing style (see `packages/server/src/db/schema/connectors.ts`):
`macc_`, `mlbl_`, `mthr_`, `mmsg_`, `matt_`, `mdrf_`, `mob_`.

All FKs below are intra-`mail.db`. The link to the main DB (`connector_instances.id`) is a plain
string column — **no cross-database FK**.

- **mail_accounts** — `id`, `connectorInstanceId` (unique), `provider` ('gmail'), `email`,
  `enabled` (bool), `syncPhase` ('idle'|'backfill'|'incremental'|'reconciling'|'error'),
  `syncCursor` (text, null), `backfillCursor` (text, null — resume token),
  `lastSyncedAt` (ms, null), `lastError` (text, null),
  `syncFrequencySeconds` (int, default 90), `backfillDays` (int, default 90),
  `createdAt`, `updatedAt`.
- **mail_labels** — `id`, `accountId` FK, `providerLabelId`, `name`, `kind` ('system'|'user'),
  `color` (null), `unreadCount` (int, denormalized), `totalCount` (int). Unique `(accountId, providerLabelId)`.
- **mail_threads** — `id`, `accountId` FK, `providerThreadId`, `subject`, `snippet`,
  `lastMessageAt` (ms), `messageCount`, `hasUnread` (bool), `hasAttachments` (bool),
  `isTrashed` (bool), `updatedAt`. Unique `(accountId, providerThreadId)`.
  Index `(accountId, isTrashed, lastMessageAt DESC)` for list pagination.
- **mail_messages** — `id`, `accountId` FK, `threadId` FK, `providerMessageId`,
  `fromJson`, `toJson`, `ccJson`, `bccJson` (JSON text), `subject`, `snippet`,
  `internalDate` (ms), `isUnread` (bool), `isDraft` (bool), `isTrashed` (bool),
  `hydration` ('metadata'|'full'), `bodyText` (null), `bodyHtml` (null),
  `rfcMessageId` (null), `inReplyTo` (null), `updatedAt`.
  Unique `(accountId, providerMessageId)`. Index `(threadId, internalDate)`.
- **mail_message_labels** — `messageId` FK, `labelId` FK. PK `(messageId, labelId)`.
- **mail_attachments** — `id`, `messageId` FK, `providerAttachmentId`, `filename`, `mimeType`,
  `sizeBytes`, `localPath` (null until downloaded), `downloadedAt` (null).
- **mail_drafts** — `id`, `accountId` FK, `providerDraftId` (null until pushed),
  `toJson`, `ccJson`, `bccJson`, `subject`, `bodyText`, `bodyHtml` (null),
  `inReplyToMessageId` (null, local message id), `dirty` (bool), `createdAt`, `updatedAt`.
- **mail_outbox** — `id`, `accountId` FK, `opType`
  ('send'|'send_draft'|'trash_thread'|'untrash_thread'|'modify_labels'|'create_draft'|'update_draft'|'delete_draft'),
  `payloadJson`, `status` ('pending'|'in_flight'|'failed'|'done'), `attempts` (int),
  `nextAttemptAt` (ms), `lastError` (null), `createdAt`.

Denormalized thread fields (`hasUnread`, `messageCount`, `lastMessageAt`, label counts) are
recomputed by `sync/persist.ts` whenever it touches messages of a thread — single writer, no
triggers.

### 5.2 Client (`src/db/client.ts`)

Mirror `packages/server/src/db/client.ts`: `initMailDb(dbPath: string, migrationsDir: string)`,
`getMailDb()`, `closeMailDb()` (WAL checkpoint on close). Same pragmas. The server resolves both
paths (§7.1) — the mail package touches no environment or PATHS.

### 5.3 Sync cursor recovery ladder

1. **Normal**: `incrementalSync(syncCursor)` → apply changes, persist `nextSyncCursor` and
   `lastSyncedAt = now`.
2. **`cursor_expired`** (Gmail 404s historyIds after ~1 week):
   a. `snapshotCursor()` FIRST (new historyId).
   b. `listMessagesSince(lastSyncedAt - 24h)` — overlap window absorbs clock skew and
      internal-date drift. Upsert results (idempotent by `providerMessageId`).
   c. Persist new cursor; resume normal incremental. Inbox is usable immediately.
   d. Set `syncPhase = 'reconciling'` and queue step 3.
3. **Reconciliation** (low priority, also runs periodically — weekly): re-list message
   IDs + label sets (metadata-only batch gets) within the `backfillDays` window; fix stale
   flags, apply deletions for IDs no longer present, refresh label counts.

The approximate catch-up recovers new mail but **not** offline deletions/label flips on old
messages — that is exactly what step 3 repairs.

---

## 6. Sync engine (`src/sync/`, `src/ops/`)

### 6.1 Account state machine

```
(enroll) → backfill → incremental ⇄ reconciling
                ↘ error (auth/permanent) — surfaced in settings UI, retried on next tick
```

- **backfill**: `snapshotCursor()` → loop `backfillPage(cursor, fullBodiesAfter)` → persist page +
  update `backfillCursor` after each page (resumable across restarts) → on completion set
  `syncCursor` to the snapshot, phase → `incremental`. Emit progress events per page.
- **incremental**: run when `now >= lastSyncedAt + syncFrequencySeconds * 1000`.
- **Concurrency**: at most one sync run per account (in-memory lock in engine); accounts run
  in parallel up to a small cap (2–3) — providers are rate-limited underneath anyway.
- **Cancellation**: engine owns an `AbortController` per run; disable/removal/shutdown aborts.

### 6.2 Scheduler integration

One job in `packages/server/src/scheduler/runtime.ts`:

```
key: 'mail-sync-tick', interval 30s, catchup 'none', maxConcurrency 1
callback: flushOutbox() → runDueSyncs()
```

Outbox ops are additionally flushed immediately on enqueue (fire-and-forget) so interactive
actions don't wait for the tick; the tick is the retry path.

### 6.3 Write path (outbox)

1. API handler calls `ops/operations.ts` — applies the **optimistic local mutation** (e.g., set
   `isTrashed`, remove `UNREAD` junction row, recompute thread denorms), enqueues the outbox op,
   triggers a flush, emits `mail.threads.changed`.
2. Flush marks op `in_flight`, calls the `MailOpsProvider` method, marks `done`.
3. Failure → `failed`, `attempts++`, exponential backoff into `nextAttemptAt`
   (30s · 2^attempts, cap 1h, give up after 8 attempts → keep `failed`, surface in settings +
   `mail.account.updated`). Local state is NOT rolled back automatically; the next
   incremental/reconcile sync restores provider truth.
4. `send` success: upsert the returned message/thread immediately (don't wait for sync).

### 6.4 Body hydration

`GET /mail/threads/:id` returns messages; any with `hydration = 'metadata'` are hydrated
inline via `hydrateMessages` (batched), persisted as `full`, then returned. Attachment bytes:
`GET /mail/attachments/:id` downloads via `fetchAttachment` to
`PATHS.dirPaths` mail attachments dir (add `mailAttachments: path.join(paths.data, 'mail-attachments')`),
stores `localPath`, streams the file.

---

## 7. Server integration (`packages/server`)

### 7.1 Bootstrapping

- `paths.ts`: add `filePaths.mailDb = path.join(paths.data, 'mail.db')` and
  `dirPaths.mailAttachments`.
- `init.ts`: after `initDb()`, call `initMailDb(PATHS.filePaths.mailDb, resolveMailMigrationsDir())`.
  Migrations dir resolution mirrors `getMigrationsDir()` in `db/client.ts`:
  dev → `packages/mail/drizzle` (via `import.meta.url` from the mail package or a passed path);
  prod → `path.join(path.dirname(process.execPath), 'drizzle-mail')`.
- `apps/desktop/electron-builder.config.ts`: add
  `{ from: '../../packages/mail/drizzle', to: 'drizzle-mail', filter: ['**/*'] }`.
- `shutdown.ts`: call `closeMailDb()`.

### 7.2 Provider wiring (`packages/server/src/mail/wiring.ts`)

- `registerMailProvider({ sync: gmailSync, ops: gmailOps })` at startup.
- `createMailHttpClient(connectorInstanceId): MailHttpClient` — replicates the token-refresh
  logic of `google-toolsets.ts:97-187` (extract a shared helper rather than copy if
  straightforward; the toolsets file keeps working unchanged). Wraps a `GoogleClient` with
  `quotaAccountKey = connectorInstanceId` so mail sync and agent tools share per-account rate
  limits.
- Enrollment validation: instance exists, `connectorId === 'google'`, `status === 'connected'`,
  scopes include `gmail.readonly` + `gmail.modify` + `gmail.send`.

### 7.3 HTTP API (`packages/server/src/routes/mail.ts`) — CONTRACT for FE workstreams

All JSON. Errors follow existing route conventions.

| Method & path | Body / query | Returns |
| --- | --- | --- |
| `GET /mail/accounts` | — | `MailAccountView[]` (account + syncPhase, lastSyncedAt, lastError, counts, settings) |
| `GET /mail/eligible-accounts` | — | connected Google instances w/ gmail scopes not yet enrolled: `{ connectorInstanceId, email }[]` |
| `POST /mail/accounts` | `{ connectorInstanceId, backfillDays?, syncFrequencySeconds? }` | `MailAccountView` (starts backfill) |
| `PATCH /mail/accounts/:id` | `{ enabled?, syncFrequencySeconds?, backfillDays? }` | `MailAccountView` |
| `DELETE /mail/accounts/:id` | — | 204; purges all local rows + attachment files |
| `POST /mail/accounts/:id/resync` | `{ mode: 'full' \| 'incremental' }` | 202 |
| `GET /mail/accounts/:id/labels` | — | `MailLabelView[]` |
| `GET /mail/accounts/:id/threads` | `?labelId=&cursor=&limit=50` | `{ threads: MailThreadListItem[], nextCursor: string \| null }` — keyset on `(lastMessageAt, id)` |
| `GET /mail/threads/:id` | — | `MailThreadDetail` (messages hydrated, sanitization is FE concern) |
| `POST /mail/messages/:id/modify` | `{ addLabelIds?, removeLabelIds?, markRead? }` | 200 updated message |
| `POST /mail/threads/:id/trash` / `.../untrash` | — | 200 |
| `GET /mail/attachments/:id` | — | file stream (downloads lazily) |
| `GET /mail/accounts/:id/drafts` | — | `MailDraftView[]` |
| `POST /mail/drafts` | `{ accountId, to, cc?, bcc?, subject, bodyText, bodyHtml?, inReplyToMessageId? }` | `MailDraftView` |
| `PATCH /mail/drafts/:id` / `DELETE` | draft fields | `MailDraftView` / 204 |
| `POST /mail/drafts/:id/send` | — | 202 (outbox) |
| `POST /mail/send` | same as create draft body | 202 (outbox, no stored draft) |
| `GET /mail/sync/status` | — | per-account `{ accountId, syncPhase, progress?: { processed, estimatedTotal } , lastSyncedAt, lastError }[]` |

View types (`MailAccountView`, `MailThreadListItem`, `MailThreadDetail`, `MailLabelView`,
`MailDraftView`) are defined in `packages/shared/src/mail/types.ts` so FE and BE share them.

### 7.4 SSE events (add to `InternalEventMap` + SSE adapter)

| Event | Payload | Emitted when |
| --- | --- | --- |
| `mail.sync.progress` | `{ accountId, phase, processed, estimatedTotal }` | each backfill page |
| `mail.account.updated` | `{ accountId }` | phase/error/settings change |
| `mail.threads.changed` | `{ accountId, threadIds }` | persist/ops touch threads (debounce ~500ms per account) |

FE reaction: invalidate `['mail', 'threads', accountId]` / `['mail', 'accounts']` queries.

---

## 8. Gmail provider (`packages/mail/src/providers/gmail/`)

Endpoints (all under `https://gmail.googleapis.com/gmail/v1/users/me`, via `ctx.http`):

- `getProfile` → `historyId` for `snapshotCursor`.
- `labels.list` → `listLabels`.
- `messages.list` (`maxResults=500`, `pageToken`) → id pages for backfill; `q=after:<epochSec>` for `listMessagesSince`.
- `messages.get` — `format=full` inside body window, `format=metadata` (with
  `metadataHeaders=From,To,Cc,Bcc,Subject,Message-ID,In-Reply-To,References,Date`) outside. Fetched via
  **batch endpoint** `POST https://gmail.googleapis.com/batch/gmail/v1` (multipart/mixed, ≤50
  per batch — `batch.ts`). Each inner call still costs quota units; the coordinator must be
  charged per inner call (acquire before dispatching the batch with summed cost).
- `history.list` (`startHistoryId`, `historyTypes=messageAdded,messageDeleted,labelAdded,labelRemoved`)
  → `incrementalSync`. 404 → `{ status: 'cursor_expired' }`.
- `messages.attachments.get` → `fetchAttachment`.
- `drafts.create/update/delete/send`, `messages.send` (RFC 2822 base64url — reuse the encoding
  approach from `connectors/google/src/gmail/api.ts:sendMessage` as reference), `threads.trash/untrash`,
  `messages.modify` → ops provider.
- `parse.ts`: MIME walk → `bodyText`/`bodyHtml` + attachment meta. Port the recursive logic from
  `connectors/google/src/gmail/api.ts` (`extractBody`/`extractAttachments`) — copy, don't import.

Note: `resolveGmailQuotaCost` in `connectors/google/src/rate-limit.ts` returns DEFAULT(5) for
`history.list`/`getProfile`/threads/drafts paths; optionally extend costs there
(history.list=2, drafts.send=100, threads.trash=5) — small, isolated change, coordinate per §10.4.

---

## 9. Frontend (`apps/web`)

### 9.1 App registration

- `packages/shared/src/apps/types.ts`: `APP_IDS = ['browser', 'recordings', 'agenda', 'mail']`.
- Check `apps/web/src/components/onboarding/steps/apps-step.tsx` renders the new id sanely
  (label/icon map).

### 9.2 Settings page (`/settings/mail`)

- Route `apps/web/src/routes/settings/mail.tsx` (loader ensures `appEnabledStatesQueryOptions` —
  copy `settings/recordings.tsx` shape).
- `SETTINGS_PAGES` entry: `section: 'Apps'`, icon `Mail` (lucide).
- Component `apps/web/src/components/settings/mail-settings.tsx`:
  - `AppEnableSetting` toggle (existing component).
  - Enrolled accounts list: email, sync phase badge, progress bar during backfill
    (`mail.sync.progress` SSE), lastSyncedAt, error banner + retry, per-account
    `syncFrequencySeconds` + `backfillDays` inputs, Resync (full/incremental) buttons,
    Remove (confirm dialog: deletes local data only).
  - "Add account" — lists `GET /mail/eligible-accounts`; empty state links to `/connectors`
    to connect Google first.

### 9.3 Mail page (`/mail`)

- Routes: `apps/web/src/routes/mail/route.tsx` (app-enabled guard + accounts loader — copy
  `recordings/route.tsx` guard), `index.tsx` (thread list), `thread.$id.tsx` optional — prefer
  in-page selection state over a route param for v1 (simpler; matches a mail client's model).
- Activity bar: add to `TOP_ITEMS` in `activity-bar.tsx` (auto-hides when app disabled via
  existing `disabledAppIds` logic).
- Sidebar: `SIDEBAR_CONTENT['/mail']` in `app-sidebar.tsx` → `components/mail/mail-sidebar.tsx`:
  **account switcher** (dropdown, per-account view only) + label/folder list (Inbox, Sent,
  Drafts, Trash, then user labels) with unread counts. Selected account in a small zustand/context
  store or search param — follow whatever `/recordings` does for local UI state.
- Main components under `apps/web/src/components/mail/`:
  - `thread-list.tsx` — infinite query (`useInfiniteQuery` on `nextCursor`), virtualized if a
    virtualization util already exists in the repo; otherwise plain windowed list for v1.
  - `thread-view.tsx` — message stack, collapsed older messages.
  - `message-body.tsx` — **sandboxed iframe** (`sandbox=""`, no `allow-scripts`), `srcDoc` with
    injected base CSS; block remote images by default with a per-message "load images" action
    (rewrite `src` → blocked placeholder until allowed). Provider HTML is untrusted; never
    `dangerouslySetInnerHTML` into the app DOM.
  - `composer.tsx` — new/reply/draft; autosave drafts (debounced PATCH); send → optimistic close + toast.
  - Actions: archive is out of scope v1 (Gmail archive = remove INBOX label — trivial follow-up);
    mark read on open; trash/untrash; label picker.
- Data layer: `apps/web/src/lib/queries/mail.ts`, `apps/web/src/lib/mutations/mail.ts`.
  Query keys: `['mail','accounts']`, `['mail','labels',accountId]`,
  `['mail','threads',accountId,labelId]`, `['mail','thread',threadId]`, `['mail','drafts',accountId]`.
  SSE hook `apps/web/src/hooks/sse/use-mail-events.ts` (copy an existing SSE hook) → targeted
  invalidations.
- Styling: Tailwind + semantic tokens only (AGENTS.md). shadcn primitives from `components/ui/`.

---

## 10. Multi-agent coordination plan

### 10.1 Workstreams & dependency graph

```
WS1 (contracts & scaffold)          ── Wave 0, SOLO, blocks everything
 ├─→ WS2 gmail provider             ── Wave 1
 ├─→ WS3 sync engine + outbox       ── Wave 1
 ├─→ WS4 server integration/API     ── Wave 1 (stubs engine until WS3 lands)
 │     └─→ WS5 FE settings page     ── Wave 1 (codes against §7.3 contract + mocks)
 │     └─→ WS6 FE mail page         ── Wave 1 (same)
 └─→ WS7 integration & e2e          ── Wave 2, SOLO (coordinator)
```

| WS | Deliverables | Owns (exclusive write access) |
| --- | --- | --- |
| **WS1** | `packages/mail` scaffold, `contracts.ts`, `db/schema.ts` + generated migration, `db/client.ts`, `db/queries.ts` (signatures + impl), `registry.ts`, `packages/shared/src/mail/types.ts` (§7.3 view types), `packages/shared/src/apps/types.ts` edit, stub `providers/gmail/` files, `bun install` | everything it creates |
| **WS2** | Gmail provider: `providers/gmail/**` (api, batch, parse, provider) + tests (mock `MailHttpClient` with canned Gmail JSON) | `packages/mail/src/providers/**` |
| **WS3** | Engine: `sync/**`, `ops/**` + tests (fake provider impl of the contracts) | `packages/mail/src/sync/**`, `src/ops/**` |
| **WS4** | Server: `src/mail/wiring.ts` + service glue, `routes/mail.ts`, paths, init/shutdown, scheduler job, SSE events, electron-builder entry, optional rate-limit cost additions | `packages/server/src/mail/**`, `routes/mail.ts`, listed single-line edits in shared server files |
| **WS5** | `/settings/mail` route + components + queries/mutations (accounts slice) | `routes/settings/mail.tsx`, `components/settings/mail-*`, `SETTINGS_PAGES` entry |
| **WS6** | `/mail` page: routes, sidebar, thread list/view, composer, SSE hook, queries/mutations (threads/drafts slice) | `routes/mail/**`, `components/mail/**`, `hooks/sse/use-mail-events.ts`, activity-bar + app-sidebar entries |
| **WS7** | Merge order, real end-to-end pass with a live Gmail account, quota sanity check, fix-ups, final `bun run check` | repo-wide (after Wave 1 merges) |

Shared-file collision points (single-line additions only — keep edits minimal to merge cleanly):
`packages/server/src/index.ts` (WS4), `scheduler/runtime.ts` (WS4), `paths.ts` (WS4),
`settings-metadata.tsx` (WS5), `activity-bar.tsx` + `app-sidebar.tsx` (WS6),
`apps/web/src/lib/queries/mail.ts` (WS5 creates accounts slice; WS6 appends thread/draft slice —
WS6 merges after WS5).

### 10.2 Branching & merge order

- Integration branch: `feature/mail-sync-engine` (this branch — doc lives here).
- Each WS branches from it: `feature/mail-sync-engine--ws2-gmail-provider`, etc.
- Merge back in order: **WS1 → (WS2, WS3, WS4 any order) → WS5 → WS6 → WS7 fixups**.
- Every WS branch must pass `bun run check` (zero errors) before merge; run
  `bun run format:changed` if format fails. No merge with failing checks — no exceptions.
- Commits: conventional style, no agent attribution (AGENTS.md). Do not commit without the
  user's go-ahead on final merges to anything beyond the integration branch.

### 10.3 Contract discipline (the important rule)

- After WS1 merges, `packages/mail/src/contracts.ts`, `packages/shared/src/mail/types.ts`, and
  the route table in §7.3 are **frozen**.
- A WS needing a contract change must NOT edit these files. Instead: stop, report the needed
  change + reason to the coordinator (WS7 owner). Coordinator updates the contract + this doc in
  a dedicated commit on the integration branch; affected WS branches rebase.
- Consumers must not reach into another WS's internals: FE talks only to §7.3 routes; engine
  talks to providers only through `contracts.ts`; server talks to the engine only through
  `@stitch/mail`'s public exports (`initMailDb`, engine start/stop/trigger fns, ops fns,
  `registry`, `db/queries`). WS1 defines these exports in `package.json` `exports` up front —
  subpath exports (`./db`, `./engine`, `./contracts`, ...) following existing package patterns;
  no barrel re-export file.

### 10.4 Working agreements for every agent

1. Read this doc fully + the files in §2 relevant to your WS before writing code.
2. Stay inside your ownership column. If you must touch a shared file, make the minimal
   single-purpose edit listed for you, nothing else (AGENTS.md "surgical changes").
3. Test-first where the doc lists priority targets; colocated `*.test.ts`; mock at contract
   boundaries (fake `MailHttpClient` / fake provider), never hit real network in tests.
4. Schema changes: WS1 only. Post-WS1 schema needs go through the coordinator
   (new migration via `bunx drizzle-kit generate` in `packages/mail`).
5. Definition of done per WS: deliverables complete, tests pass, `bun run check` clean,
   short handoff note in the PR/summary: what changed, any contract friction encountered,
   anything WS7 must verify manually.
6. When blocked on another WS, stub against the contract and continue; list the stub in the
   handoff note so WS7 replaces it.

### 10.5 Milestones / acceptance

- **M1 (post WS1)**: `bun run check` green with empty package; migration applies to a fresh `mail.db`.
- **M2 (post Wave 1)**: enroll a real Gmail account via settings UI → backfill completes within
  rate limits → threads render; restart mid-backfill resumes from `backfillCursor`.
- **M3 (post WS7)**: mark read/trash/label reflect in Gmail web within one sync cycle; send +
  reply thread correctly; draft round-trips; cursor-expiry ladder verified by faking a 404;
  account removal purges `mail.db` rows and attachment files.

---

## 11. Phase roadmap (beyond this implementation)

1. **v1 (this doc)**: read/write/draft/trash, Gmail, settings + mail UI.
2. **v1.x**: archive action, local FTS5 search table, attachment previews, unread badge in nav.
3. **v2**: Outlook provider (`connectors/microsoft` for OAuth + a `MailProviderModule` using
   Graph delta queries — slots into the same contracts), agent tool exposure over `db/queries.ts`.
