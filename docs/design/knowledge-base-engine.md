# Knowledge Base / Context Engine — Design

Status: Draft for review
Owner: —
Last updated: 2026-06-12

A new core primitive for Stitch: a local-first knowledge base ("KB") that acts as the
central knowledge store for the agent. It ingests recording transcripts/analyses and
user-uploaded files, builds an incremental knowledge graph + vector index on top of
them, and exposes retrieval to the LLM runtime via tools and automatic context
injection.

---

## 1. Goals & Non-Goals

### Goals

- **Graph RAG retrieval** over everything the agent should know: meeting transcripts,
  analyses, and user-dropped files.
- **Incremental by design**: new content merges into the existing graph without
  reprocessing the corpus (LightRAG-style set-union merging, not Microsoft-GraphRAG
  community rebuilds).
- **Event-driven ingestion pipeline** with idempotent, deduplicated, resumable
  processing (content hashing + status state machine).
- **First-class LLM runtime integration**: a `knowledge` toolset plus automatic
  retrieval injection into system context.
- **Flexible public API** (service layer + Hono routes) that supports future source
  types (connectors, web pages, emails) without schema rewrites.

### Non-Goals (v1)

- No community detection / community reports (Leiden, map-reduce global search).
  Designed so it can be layered on later as an enrichment job.
- No migration of the existing memory system (`packages/server/src/memory/`). Memory
  stays the store for _user facts_; KB is the store for _content knowledge_.
- No cloud sync, no multi-user concerns. Personal scale: tens of thousands of chunks,
  ~100k entities ceiling.
- No OCR / image understanding in v1 (extension point exists in the converter
  registry).

### Constraints

- **No SQLite extensions** → LanceDB (`@lancedb/lancedb`) for all vector + FTS search;
  SQLite (drizzle) for relational/graph structure and job state.
- **Embeddings required**: the KB is inert unless an embedding model is configured
  (same gate pattern as `hasConfiguredEmbeddingModel()` in
  `packages/server/src/memory/config.ts:22`).

---

## 2. Research Summary (why this shape)

| Approach                                                                    | Verdict           | Reason                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microsoft GraphRAG (Leiden communities + reports)                           | ❌ for v1         | Community hierarchy must be rebuilt when the graph changes; token cost is ~5k/community report and our KB ingests continuously. Non-reproducible partitions on sparse knowledge graphs.                                                                         |
| **LightRAG (entity/relation graph, dual-level retrieval, set-union merge)** | ✅ core design    | Incremental updates are a first-class citizen: new docs run the same extraction pipeline and merge nodes/edges by union. Dual-level (entity keywords + relation/theme keywords) retrieval covers both factoid and thematic queries without community summaries. |
| HippoRAG 2 (phrase + passage nodes, Personalized PageRank)                  | ✅ borrowed ideas | Dual-node insight: keep **chunk (passage) nodes linked to entity nodes** so graph traversal always lands back on full text, never bare triples. PPR-style weighted expansion is our graph-walk algorithm (personal-scale graphs fit in memory easily).          |
| Vector-only RAG                                                             | baseline          | Always available as `basic` query mode; graph modes augment, never replace. Practitioner consensus: route simple queries to vector search, use graph expansion for multi-hop/relational.                                                                        |

Other adopted practices:

- **Hybrid search (vector + BM25 FTS + RRF)** — LanceDB TS SDK supports FTS indexes,
  `query().nearestTo()/fullTextSearch()` and `.rerank()` with built-in RRF natively.
- **Entity resolution**: exact-name canonicalization at merge time + embedding
  similarity (cosine > 0.9) with cheap-LLM confirmation as a background maintenance
  job — mirrors Deep-GraphRAG's hybrid resolution strategy.
- **Cheap model for extraction**: entity/relation extraction uses
  `resolveCheapModel` (`packages/server/src/llm/provider/`), same as the memory
  processor, keeping indexing cost low.
- **Document lifecycle deltas** (Jigsaw-LightRAG): graph mutations are tracked per
  source document so re-ingestion/deletion only touches the affected subgraph.

---

## 3. Architecture Overview

```
                            ┌─────────────────────────────────────────────┐
                            │                KB ENGINE                    │
                            │        packages/server/src/knowledge/       │
  Sources                   │                                             │
┌──────────────┐  events    │  ┌───────────┐   ┌──────────┐   ┌────────┐  │
│ Recordings   ├───────────▶│  │ Ingestion │──▶│ Indexing │──▶│ Graph  │  │
│ (transcripts │            │  │  Queue    │   │ Pipeline │   │ Merge  │  │
│  + analyses) │            │  └───────────┘   └──────────┘   └────────┘  │
└──────────────┘            │        │              │              │      │
┌──────────────┐  HTTP      │        ▼              ▼              ▼      │
│ Electron file├───────────▶│   SQLite          LanceDB         SQLite    │
│ drops        │            │  (documents,    (chunk/entity/  (entities,  │
└──────────────┘            │   jobs)          relation       relations,  │
┌──────────────┐            │                  vectors+FTS)   mentions)   │
│ Future:      │            │                                             │
│ connectors,  │            │  ┌──────────────────────────────────────┐   │
│ web, email   │            │  │            Query Engine              │   │
└──────────────┘            │  │  basic | local | global | hybrid     │   │
                            │  └──────────────────────────────────────┘   │
                            └──────────┬───────────────────┬──────────────┘
                                       │                   │
                              ┌────────▼───────┐   ┌───────▼────────┐
                              │ knowledge      │   │ auto-context   │
                              │ toolset        │   │ retriever      │
                              │ (agent tools)  │   │ (prompt inject)│
                              └────────────────┘   └────────────────┘
```

**Storage split** (mirrors the proven memory-system pattern, but graph-aware):

- **SQLite (drizzle)** — source of truth for: documents, chunks (text + metadata),
  entities, relations, mentions (chunk↔entity edges), ingestion jobs. Graph traversal
  reads adjacency from here into memory (personal scale: trivial).
- **LanceDB** (`PATHS.dataDir/knowledge.lance`) — derived search indexes only:
  chunk embeddings (+ FTS on text), entity embeddings (name + description), relation
  embeddings (keywords + description). Rebuildable at any time from SQLite.

This "SQLite = truth, LanceDB = index" split avoids LanceDB schema-migration pain
(the existing `db/lance-migrations/` machinery shows this is already a known cost)
and makes embedding-model changes a re-embed job rather than a data migration.

---

## 4. Package Layout

```
packages/server/src/knowledge/
├── config.ts              # settings-backed KbConfig + isKnowledgeActive() gate
├── service.ts             # public API facade (the "primitive" surface)
├── types.ts               # re-exports from @stitch/shared/knowledge/types
├── ingest/
│   ├── queue.ts           # job claiming/state machine over kb_ingest_jobs
│   ├── worker.ts          # scheduler-registered drain loop
│   ├── chunker.ts         # structure-aware markdown chunking
│   ├── extractor.ts       # LLM entity/relation extraction (cheap model)
│   └── sources/
│       ├── recording.ts   # transcript+analysis → KbSourceDocument
│       └── file.ts        # reads file, calls @stitch/markdown-convert
├── graph/
│   ├── merge.ts           # set-union entity/relation merging + delta tracking
│   ├── traversal.ts       # in-memory adjacency, weighted PPR-style expansion
│   └── resolution.ts      # background entity dedup (embed sim + LLM confirm)
├── store/
│   ├── connection.ts      # lancedb.connect(PATHS.dataDir/knowledge.lance)
│   ├── tables.ts          # arrow schemas: kb_chunks, kb_entities, kb_relations
│   └── search.ts          # hybrid (vector+FTS+RRF) search helpers
├── query/
│   ├── engine.ts          # query orchestrator (mode routing)
│   ├── keywords.ts        # LLM dual-level keyword extraction from query
│   └── assemble.ts        # context packing, token budgeting, citations
├── retriever.ts           # auto-context injection for chat turns
└── maintenance.ts         # re-embed, entity resolution sweep, orphan GC

packages/server/src/db/schema/knowledge.ts    # drizzle tables (below)
packages/server/src/routes/knowledge.ts       # Hono routes
packages/server/src/tools/toolsets/knowledge.ts  # agent toolset
packages/shared/src/knowledge/                # shared types + SSE event payloads

packages/markdown-convert/                    # @stitch/markdown-convert (§7.1)
├── package.json           # ESM, exports map (no barrel), workspace:* consumers
└── src/
    ├── convert.ts          # convertToMarkdown() entry + chain runner
    ├── registry.ts         # Converter interface, priority-ordered resolution
    ├── types.ts            # ConversionInput / ConversionResult
    └── converters/
        ├── text.ts         # md/txt/code passthrough + normalization
        ├── office.ts       # pdf/docx/xlsx/pptx/csv via office-md
        ├── html.ts         # generic turndown
        └── html-arxiv.ts   # example specialized layer (later; see §7.1)
```

---

## 5. Data Model

### 5.1 SQLite (drizzle) — `packages/server/src/db/schema/knowledge.ts`

ID conventions follow the existing `PrefixedString<'…'>` pattern
(`packages/server/src/db/schema/recordings.ts:27`).

```ts
// Source documents: one row per logical knowledge item
kb_documents {
  id: text PrefixedString<'kbdoc'> PK
  sourceType: text          // 'recording' | 'file' | (future: 'connector', 'web', …)
  sourceId: text            // e.g. recordingId, or file content hash
  sourceUri: text | null    // original file path / URL (display only, not identity)
  title: text
  contentHash: text         // sha256 of canonical markdown — dedupe + change detection
  markdown: text            // canonical converted content (truth for re-indexing)
  metadata: blob json       // source-specific (platform, durationMs, mimeType, …)
  plan: blob json           // KbIndexingPlan — which pipeline stages apply (§6.2)
  status: text              // 'pending' | 'processing' | 'indexed' | 'failed'
  error: text | null
  indexedAt: integer | null
  indexVersion: integer     // pipeline version that produced current index
  extractionConfigHash: text | null  // hash of extraction settings at index time (§10.4)
  indexUsage: blob json | null       // aggregated LanguageModelUsage of last index run
  indexCostUsd: real        // cost of last index run (LLM + embedding), default 0
  createdAt / updatedAt: integer
  UNIQUE(sourceType, sourceId)
}

// Chunks: ordered segments of a document
kb_chunks {
  id: text PrefixedString<'kbchk'> PK
  documentId: FK → kb_documents (cascade delete)
  ordinal: integer          // position within document
  text: text
  tokenCount: integer
  heading: text | null      // structural breadcrumb ("Meeting > Decisions")
  startOffset / endOffset: integer  // char offsets into markdown
  createdAt: integer
}

// Entities: canonical graph nodes
kb_entities {
  id: text PrefixedString<'kbent'> PK
  name: text                // canonical name
  type: text                // open vocabulary, normalized lowercase
                            // seeded: person, organization, project, concept,
                            // technology, event, location, product
  description: text         // merged/accumulated description
  aliases: blob json string[]   // alternate surface forms folded in by resolution
  mentionCount: integer     // degree proxy for ranking
  createdAt / updatedAt: integer
  INDEX(name)
}

// Relations: typed, weighted edges
kb_relations {
  id: text PrefixedString<'kbrel'> PK
  sourceEntityId: FK → kb_entities
  targetEntityId: FK → kb_entities
  description: text         // natural language relationship statement
  keywords: text            // high-level theme keywords (LightRAG "global" index)
  weight: real              // accumulated strength (bumped on re-observation)
  createdAt / updatedAt: integer
  UNIQUE(sourceEntityId, targetEntityId)   // undirected-canonical: ordered pair
}

// Mentions: provenance — which chunk evidenced which entity/relation
kb_mentions {
  id: text PrefixedString<'kbmen'> PK
  chunkId: FK → kb_chunks (cascade delete)
  entityId: FK → kb_entities | null
  relationId: FK → kb_relations | null
  createdAt: integer
  INDEX(entityId), INDEX(relationId), INDEX(chunkId)
}

// Ingestion jobs: the event/queue backbone
kb_ingest_jobs {
  id: text PrefixedString<'kbjob'> PK
  documentId: FK → kb_documents
  kind: text                // 'index' | 'reindex' | 'remove'
  status: text              // 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
  attempt: integer          // retry counter (max 3, exponential backoff)
  dedupeKey: text           // documentId+kind+contentHash → idempotency
  error: text | null
  startedAt / endedAt: integer | null
  createdAt / updatedAt: integer
  UNIQUE(dedupeKey) WHERE status IN ('queued','running')   // partial unique index
}
```

Why `kb_mentions` matters: deletion/reindex of a document cascades chunks → mentions,
and the merge layer decrements `mentionCount`/`weight`, garbage-collecting entities
and relations whose evidence count reaches zero (Jigsaw-style delta updates). No
full-graph rebuild, ever.

### 5.2 LanceDB tables — `knowledge/store/tables.ts`

Arrow schemas follow `packages/server/src/memory/store/tables.ts` conventions.
All tables carry `indexVersion` and are droppable/rebuildable from SQLite.

| Table          | Vector content                  | FTS columns       | Purpose                                 |
| -------------- | ------------------------------- | ----------------- | --------------------------------------- |
| `kb_chunks`    | chunk text                      | `text`            | basic + hybrid retrieval, entry points  |
| `kb_entities`  | `name + ': ' + description`     | `name`, `aliases` | local-mode entry points, entity linking |
| `kb_relations` | `keywords + ': ' + description` | `keywords`        | global-mode (thematic) entry points     |

FTS indexes are created via LanceDB native BM25 (`table.createIndex` FTS variant);
hybrid queries use `.nearestTo(vec)` + `.fullTextSearch(q)` + RRF rerank.

Plan support (§6.2): chunks from documents with `embed: false` are stored with a
zero vector and `hasVector: 0`. The vector half of every hybrid query prefilters
`.where('hasVector = 1')`; the FTS half covers all rows. One table, no parallel
code paths.

---

## 6. Ingestion Pipeline

### 6.1 Event flow & dedupe

```
recording-stopped (final transcript ready)           file dropped via route
recording-analysis-updated (status=completed)                │
            │                                                ▼
            ▼                                      @stitch/markdown-convert →
   sources/recording.ts builds                     canonical markdown
   transcript doc (search-only plan)               (full plan)
   / analysis doc (full plan)                                │
            └──────────────┬─────────────────────────────────┘
                           ▼
              service.upsertDocument()
              1. contentHash = sha256(markdown)
              2. UNIQUE(sourceType, sourceId) upsert:
                 - new → insert kb_documents(status=pending)
                 - hash unchanged → no-op (job 'skipped')   ← duplicate guard #1
                 - hash changed → status=pending, enqueue 'reindex'
              3. enqueue kb_ingest_jobs with dedupeKey       ← duplicate guard #2
                 (partial unique index swallows double-enqueue)
                           │
                           ▼ emit('kb-document-updated')  (SSE → UI status)
              ingest/worker.ts (scheduler job, interval ~5s when queue non-empty,
              maxConcurrency: 1 document at a time; chunks fan out internally)
```

- The worker is registered via the existing scheduler
  (`packages/scheduler`, pattern of `RegisteredJob` in
  `packages/scheduler/src/types.ts`) — no new infra. Job state lives in
  `kb_ingest_jobs`, so restarts resume cleanly: `running` jobs older than a lease
  timeout are reset to `queued`.
- Recording listener (`packages/server/src/lib/events.ts:11`) upserts **two
  documents** per recording, on independent triggers (each with its own plan,
  §6.2):
  - `sourceId = '<recordingId>/transcript'` — raw transcript markdown,
    **search-only plan**. Ingests on `recording-stopped` once the final
    transcript is available (from the transcript store) — **not** gated on
    analysis, since the search-only plan costs no LLM calls. Recordings that are
    never analyzed are still keyword-searchable.
  - `sourceId = '<recordingId>/analysis'` — analysis markdown (summary, topic
    sections, decisions, action items), **full plan**. Ingests on
    `recording-analysis-updated` with `status === 'completed'`.
    Re-running transcription/analysis produces changed hashes → clean `reindex` of
    the affected document.
- **Reprocessing**: `POST /knowledge/documents/:id/reindex` (and `force` flag)
  enqueues a `reindex` regardless of hash — used after pipeline upgrades
  (`indexVersion` mismatch sweep is a maintenance job).

### 6.2 Indexing plans — per-source pipeline control

Not every source should pay for every pipeline stage. Each document carries a
`KbIndexingPlan` (part of `KbDocumentInput`, persisted on `kb_documents.plan` so
reindex reuses it) that gates which stages the worker runs:

```ts
type KbIndexingPlan = {
  chunking: 'structural' | 'coarse' | 'none';
  // structural: heading-aware ~600-token packing (default)
  // coarse:     large blocks on natural boundaries (speaker turns, sections)
  // none:       single chunk row (small documents only)
  embed: boolean; // vector embeddings → semantic + hybrid retrieval
  fts: boolean; // BM25 row registration → keyword retrieval
  extract: boolean; // entity/relation extraction → graph (local/global modes)
};

const FULL_PLAN: KbIndexingPlan = { chunking: 'structural', embed: true, fts: true, extract: true };
const SEARCH_ONLY_PLAN: KbIndexingPlan = {
  chunking: 'coarse',
  embed: false,
  fts: true,
  extract: false,
};
```

Validation at `upsertDocument`: at least one of `embed`/`fts` must be true
(otherwise the document is invisible to retrieval), and `extract` requires
`embed` (graph nodes need entity embeddings for local-mode entry points).

Source defaults (callers can override via the API):

| Source                   | Default plan       | Rationale                                                                                                                                                                                       |
| ------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recording transcript     | `SEARCH_ONLY_PLAN` | Verbatim speech is noisy for entity extraction and weak for semantic chunks; its value is exact-phrase recall ("who said X") via BM25. Skipping embed+extract makes transcript ingestion ~free. |
| Recording analysis       | `FULL_PLAN`        | Distilled decisions/action items/topics — exactly what the graph should know.                                                                                                                   |
| File upload              | `FULL_PLAN`        | User-curated content; full retrieval power.                                                                                                                                                     |
| `kb_ingest_text` (agent) | `FULL_PLAN`        | Deliberate capture.                                                                                                                                                                             |

Retrieval interaction: FTS-only chunks surface through the BM25 half of `basic`/
`hybrid` queries (and `kb_get_document`); they never appear in vector results or
graph traversal (see §5.2 `hasVector` prefilter). Cost guard interaction:
`knowledge.ingest.maxDocumentTokens` applies to extraction-bearing plans;
search-only documents get a much higher ceiling since they cost no LLM calls.

### 6.3 Index job steps (per document, gated by plan)

1. **Chunking** (`chunker.ts`) — per `plan.chunking`: structure-aware markdown
   splitting (split on headings first, pack siblings to ~600 tokens with 100-token
   overlap, never split mid-sentence), `coarse` blocks on natural boundaries
   (speaker turns, topic sections), or a single chunk (`none`).
2. **Embed + store chunks** — chunks always written to SQLite; if `plan.embed`,
   batch-embed via `createEmbedder()`
   (`packages/server/src/models/embedding/factory.ts`) and write vectors to
   LanceDB; if `plan.fts` only, write rows with zero vector + `hasVector: 0`
   (§5.2). Skip LanceDB entirely only if both are false (disallowed by validation).
3. **Extraction** (`extractor.ts`) — only if `plan.extract`: per chunk, cheap-model
   `generateText` + `Output.object` (same structured-output pattern as the memory
   processor / analysis service) with schema:

   ```ts
   {
     entities: { name, type, description }[],
     relations: { source, target, description, keywords, strength: 1-10 }[]
   }
   ```

   One LLM call per chunk; chunks processed with bounded concurrency (e.g. 4).
   A second "gleaning" pass is **not** done in v1 (cost; LightRAG shows single-pass
   is adequate with a good prompt).

4. **Graph merge** (`graph/merge.ts`) — only if `plan.extract`:
   - Entity: canonical key = `normalize(name)` (casefold, trim, strip articles).
     Existing → append description (LLM-summarize when > ~1500 chars), bump
     `mentionCount`, record alias if surface form differs. New → insert.
   - Relation: canonical ordered pair of entity IDs. Existing → `weight += strength`,
     merge keywords/description. New → insert.
   - Write `kb_mentions` provenance rows.
   - Upsert changed entities/relations into LanceDB (delete-by-id + add).
5. Mark document `indexed`, set `indexVersion`, emit `kb-document-updated`.

Failure handling: any step throws → job `failed`, `attempt++`, re-queued with
backoff up to 3 attempts, then document `status=failed` with error surfaced to UI.
Steps 2–4 are idempotent per document because reindex first deletes the document's
chunks/mentions and decrements graph counters (delta removal), then re-adds.

### 6.4 Remove job

`remove` job: delete chunks + mentions, decrement `mentionCount`/`weight`,
GC zero-evidence entities/relations, delete LanceDB rows, delete document row.

### 6.5 Cost & usage accounting

All KB spend lands in the existing usage ledger and surfaces on the usage
dashboard.

**LLM calls** — every call records via `recordLlmUsage`
(`packages/server/src/usage/ledger.ts`), same fire-and-forget pattern as the
memory processor. New sources added to `USAGE_SOURCES`
(`packages/shared/src/usage/types.ts`) and `normalizeEventSource`
(`packages/server/src/usage/service.ts`):

| Source                  | Calls                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| `knowledge_extraction`  | per-chunk entity/relation extraction, description summarization  |
| `knowledge_query`       | dual-level keyword extraction in `local`/`global`/`hybrid` modes |
| `knowledge_maintenance` | entity-resolution LLM confirmations                              |

The dashboard's cost chart renders new sources automatically once registered.

**Embedding calls — closing an existing gap.** Embeddings are not tracked
anywhere today (`ProviderEmbedder` never touches the ledger). Fix at the factory
level so every consumer benefits, including memory:

- New `embedding_usage_events` table (modality-specific, mirroring
  `stt_usage_events` in `db/schema/usage.ts`): `source`
  (`knowledge_index` | `knowledge_query` | `memory`), `providerId`, `modelId`,
  `tokens`, `costUsd`, `startedAt`, `durationMs`.
- `createEmbedder()` wraps the embedder in a tracking decorator that records per
  batch call. Cost from per-token pricing in the embedding registry when present,
  else `costUsd = 0` with tokens still recorded.
- Usage dashboard gains an "Embeddings" section alongside the existing STT
  section (`usage-dashboard-page.tsx`).

**Per-document rollup** — each index run aggregates its LLM + embedding usage
onto `kb_documents.indexUsage` / `indexCostUsd` (pattern:
`recording_analyses.usage`/`costUsd`), shown in the KB page table (§10.5) so
users see what each document cost to index.

---

## 7. Markdown Conversion & File Uploads

### 7.1 `@stitch/markdown-convert` — internal conversion package

Document-to-markdown conversion is a standalone internal package
(`packages/markdown-convert`, conventions of `@stitch/scheduler`: ESM,
exports map — no barrel files, `workspace:*` consumers, colocated `bun test`).
It is **pure**: buffers in, markdown out — no DB, no settings, no network.

```ts
type ConversionInput = {
  data: Uint8Array;
  fileName?: string;     // extension hint
  mimeType?: string;
  sourceUrl?: string;    // enables URL-specialized converters (e.g. arxiv)
};

type ConversionResult = {
  markdown: string;
  converterId: string;   // which converter produced the output
  metadata: { title?: string; pageCount?: number; sheetNames?: string[] };
  warnings: string[];
};

// throws UnsupportedFormatError when no converter matches
convertToMarkdown(input: ConversionInput, registry?: ConverterRegistry): Promise<ConversionResult>
```

**Layered converter chain** — the core design requirement. Converters are
priority-ordered; specialized converters outrank generic ones and can fall through:

```ts
type Converter = {
  id: string;
  priority: number; // higher = tried first
  matches(input: ConversionInput): boolean;
  // null → fall through to the next matching converter (recoverable errors too)
  convert(input: ConversionInput): Promise<ConversionResult | null>;
};
```

Example: HTML from `arxiv.org` matches `html-arxiv` (priority 100 — extracts
clean paper markdown, strips nav/MathML noise) before generic `html`
(priority 0 — turndown). If the specialized converter bails (`null`), the generic
one still produces output. The same pattern covers future layers: structured PDF
extraction above plain-text PDF fallback, a README-aware ZIP layer, etc.

Default converters (v1):

| Converter | Priority | Formats                                   | Implementation                                         |
| --------- | -------- | ----------------------------------------- | ------------------------------------------------------ |
| `text`    | 0        | `.md`, `.txt`, code/text files            | passthrough + normalization                            |
| `office`  | 0        | `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.csv` | `office-md` (native Node/Bun bindings, markdown-first) |
| `html`    | 0        | `.html`                                   | `turndown`                                             |
| unknown   | —        | —                                         | `UnsupportedFormatError` with clear message            |

> Decision point: `office-md` is the recommended primary (native, no Python
> sidecar, Bun-compatible, built for LLM pipelines). Fallback candidate:
> `docstream` (pure-TS, broader legacy format support). Verify Windows prebuilds
> for `office-md` during the Phase 2 spike; the `Converter` interface isolates
> the choice to one file.

Boundaries:

- **Fetching stays with callers.** For web sources, the caller fetches bytes and
  passes `sourceUrl` so URL-specialized converters apply. If a specialized source
  needs a _different_ acquisition strategy (e.g., fetching the arxiv e-print
  instead of the abstract page), that logic lives in the future
  `knowledge/ingest/sources/web.ts` — the package never touches the network.
- Conversion deps (`office-md`, `turndown`) live in this package, not the server.
- Existing conversion code in the server (`tools/core/webfetch.ts` turndown usage,
  chat attachment text extraction) are migration candidates **later** — out of
  scope for this project (surgical changes).

### 7.2 File uploads (Electron)

The desktop app and server share a filesystem (attachments already flow as absolute
paths, per `apps/desktop/src/main/ipc/files.ts` + `sendMessage`). Same approach:

1. Renderer uses existing `dialog:openPath` IPC (or drag-drop, which yields paths in
   Electron) to get absolute paths.
2. `POST /knowledge/files { paths: string[] }` — server reads each file directly.
3. `sources/file.ts` calls `convertToMarkdown()` from `@stitch/markdown-convert`
   to produce canonical markdown.
4. `sourceType='file'`, `sourceId = contentHash` → re-dropping the same file is a
   natural no-op; a moved/renamed file with identical content dedupes for free.
5. Original file is **not** retained; the canonical markdown in `kb_documents` is
   the persistent copy (plus `sourceUri` for display).

---

## 8. Query Engine

### 8.1 Modes

```ts
type KbQueryMode = 'basic' | 'local' | 'global' | 'hybrid'; // default: 'hybrid'
```

- **basic** — hybrid (vector+FTS+RRF) search over `kb_chunks` only. Fast path; no
  LLM call. FTS-only chunks (e.g. transcripts, §6.2) compete via the BM25 half.
- **local** (entity-focused, LightRAG low-level) —
  1. Cheap-LLM extracts low-level keywords/entities from the query (one call,
     shared with global).
  2. Hybrid-search `kb_entities` for entry nodes.
  3. Weighted 1–2 hop expansion in `graph/traversal.ts` (in-memory adjacency;
     edge weight × node mentionCount, PPR-flavored scoring, capped fan-out).
  4. Collect evidence chunks via `kb_mentions` for the top entities/relations.
- **global** (thematic, LightRAG high-level) — high-level keywords →
  hybrid-search `kb_relations` → top relations + their endpoint entities + evidence
  chunks.
- **hybrid** — one keyword-extraction call produces both keyword levels; run
  local + global + basic in parallel (`Promise.all`), merge with RRF, dedupe chunks.

### 8.2 Context assembly (`query/assemble.ts`)

- Token-budgeted packing (configurable, default ~4k tokens): interleave
  (a) entity cards (`name (type): description`), (b) relation statements,
  (c) evidence chunks with source attribution.
- Every item carries provenance: `{ documentId, title, sourceType, chunkId }` so
  the agent can cite ("from meeting _Sprint Planning_, 2026-06-02") and follow up
  with `kb_get_document`.
- Result shape:

  ```ts
  type KbQueryResult = {
    mode: KbQueryMode;
    entities: KbEntityHit[];
    relations: KbRelationHit[];
    chunks: KbChunkHit[]; // each with score + provenance
    contextText: string; // packed, citation-annotated, budgeted
    stats: { latencyMs: number; candidatesScanned: number };
  };
  ```

---

## 9. LLM Runtime Integration

### 9.1 `knowledge` toolset — `tools/toolsets/knowledge.ts`

Follows the `Toolset` contract (`packages/server/src/tools/toolsets/types.ts:27`)
and the recordings toolset shape (`tools/toolsets/recordings.ts`):

| Tool                | Purpose                                                                                                                                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kb_search`         | `{ query, mode?, limit?, sourceTypes?, after?/before? }` → KbQueryResult (compact). Primary retrieval tool.                                                                                                                                                                                    |
| `kb_get_document`   | `{ documentId, range? }` → full/partial canonical markdown. Follow-up reads after search.                                                                                                                                                                                                      |
| `kb_explore_entity` | `{ entityName }` → entity card + neighbors + top evidence. Multi-hop navigation without crafting queries.                                                                                                                                                                                      |
| `kb_list_documents` | `{ sourceTypes?, status?, limit? }` → inventory (what does the KB know?).                                                                                                                                                                                                                      |
| `kb_ingest_text`    | `{ title, text }` → agent-initiated knowledge capture (e.g. "remember this spec"). Goes through the same pipeline. **Requires user approval** via the existing tool permission middleware (`.use(permissionMiddleware())`, same as the bash tool) — the agent never writes to the KB silently. |

Toolset `instructions` teach the pattern: search first → explore/get for depth →
cite sources.

### 9.2 Auto-context — `knowledge/retriever.ts`

Mirrors the memory retriever pattern (`packages/server/src/memory/retriever.ts`,
injected into system context per turn):

- On each user turn: run **basic mode only** (no LLM keyword call — latency) against
  the last user message; if top hit score ≥ threshold, inject a compact
  `Relevant knowledge:` block (default budget ~800 tokens) with source attributions
  and a hint that `kb_search` can go deeper.
- Settings-gated (`knowledge.retrieval.autoInject`, default on), score threshold
  prevents noise injection on irrelevant turns.

This split keeps auto-context cheap/silent and reserves graph traversal for
deliberate agent tool calls — matching the practitioner consensus on query routing.

---

## 10. Public API

### 10.1 Service facade (`knowledge/service.ts`) — the primitive surface

```ts
// Ingestion
// KbDocumentInput = { sourceType, sourceId, title, markdown, metadata?,
//                     plan?: KbIndexingPlan }   // plan defaults per source (§6.2)
upsertDocument(input: KbDocumentInput): Promise<Result<{ document; queued: boolean }>>
ingestFiles(paths: string[]): Promise<Result<KbIngestReceipt[]>>
reindexDocument(id, opts?: { force }): Promise<Result<void>>
removeDocument(id): Promise<Result<void>>

// Query
query(input: { query; mode?; limit?; filters? }): Promise<Result<KbQueryResult>>
getDocument(id): Promise<Result<KbDocument>>
listDocuments(filters?): Promise<Result<KbDocumentSummary[]>>
exploreEntity(name): Promise<Result<KbEntityNeighborhood>>

// Ops
getStats(): Promise<KbStats>            // counts, index health, last job times
runMaintenance(kind): Promise<Result<void>>  // 'entity-resolution' | 'reembed' | 'gc'
```

All mutations check `isKnowledgeActive(config)` (enabled + embeddings configured)
and return a typed `embedding_not_configured` error otherwise — the UI uses this to
show the "configure an embedding model" call-to-action.

### 10.2 HTTP routes (`routes/knowledge.ts`)

Hono + `zValidator`, delegating to the service (matches `routes/chat.ts` pattern):

```
POST   /knowledge/files                   { paths[] } → receipts (202)
POST   /knowledge/documents               { title, text|markdown, metadata?, plan? }
GET    /knowledge/documents               ?sourceType=&status=&q=&limit=&offset=
GET    /knowledge/documents/:id
POST   /knowledge/documents/:id/reindex   { force? }
DELETE /knowledge/documents/:id
POST   /knowledge/query                   { query, mode?, limit?, filters? }
GET    /knowledge/entities/:name
GET    /knowledge/stats
POST   /knowledge/maintenance             { kind }
```

### 10.3 Events (SSE) — `packages/shared/src/knowledge/events.ts`

```
kb-document-updated   { documentId, status, title }     // pipeline progress → UI
kb-ingest-progress    { documentId, stage, current, total }  // chunk-level progress
kb-stats-changed      { documents, entities, relations }
```

Registered in `SSE_EVENT_NAMES` alongside recordings/chat events so the existing
SSE bridge picks them up unchanged.

### 10.4 User configuration (`knowledge.*` settings, pattern of `memory.*`)

#### Extraction guidance — the headline knobs

```
knowledge.extraction.entityTypes     JSON: { name, description? }[]
knowledge.extraction.domainContext   free text, default ""
```

- **`entityTypes`** — the entity-type vocabulary injected into the extraction
  prompt. Seeded defaults: person, organization, project, concept, technology,
  event, location, product; users add/remove/describe types ("ticket: a Jira
  issue key like ABC-123"). Extraction is **guided, not strict**: the model may
  still emit entities outside the vocabulary (typed `other`) so unanticipated
  knowledge isn't silently dropped — ontology-guided extraction measurably
  improves graph quality (OMD-GraphRAG), but hard-closed schemas lose information.
  Type names are normalized lowercase at merge time.
- **`domainContext`** — a free-text description of the user's world ("PM at Acme;
  key projects: Atlas, Beacon; team: Dana, Wei…"), prepended to every extraction
  prompt. The single biggest quality lever for personal corpora: it anchors
  entity canonicalization (the model maps "the atlas thing" → project _Atlas_).
- **Relations stay free-form** (description + theme keywords). No user-defined
  relation types in v1: typed edge vocabularies complicate set-union merging and
  add little to the dual-level index. Revisit only if a strict-ontology mode is
  demanded.

**Config-change semantics**: extraction settings are hashed and stamped on each
document at index time (`kb_documents.extractionConfigHash`). Changing them does
**not** auto-reindex (cost); new ingests use the new config, and the UI surfaces
"N documents indexed with older extraction settings" with a bulk-reindex action
that reuses the normal reindex machinery.

#### Everything else

```
knowledge.enabled                       (default true)
knowledge.embedding.providerId/modelId  (shared default with memory's, overridable)
knowledge.extraction.providerId/modelId (optional override; default: cheap-model resolution)
knowledge.ingest.autoIngestRecordings   (default true; future per-source toggles slot here)
knowledge.ingest.maxDocumentTokens      (guard: giant files require explicit confirm in UI)
knowledge.ingest.chunkTokens / chunkOverlapTokens
knowledge.retrieval.autoInject (default true) / autoInjectBudgetTokens / minScore
knowledge.query.defaultMode / contextBudgetTokens
```

**Deliberately not exposed** (internal tuning, not user choices): graph traversal
depth/fan-out, RRF weights, entity-resolution similarity thresholds, job
concurrency. Exposing these invites misconfiguration with no meaningful upside;
they live as constants until proven otherwise.

### 10.5 Web UI — Knowledge Base page

Route `apps/web/src/routes/knowledge.tsx`, components under
`apps/web/src/components/knowledge/`. v1 scope is deliberately small: a simple
paginated documents table plus file-drop.

**Documents table** — follows the recordings list pattern
(`apps/web/src/components/recordings/list/`: Tanstack React Table + shadcn table
components, offset-based pagination via the shared pagination component, backed
by `GET /knowledge/documents?limit=&offset=`):

| Column  | Content                                                                   |
| ------- | ------------------------------------------------------------------------- |
| Title   | document title + `sourceType` badge                                       |
| Status  | `pending` / `processing` (spinner) / `indexed` / `failed` (error tooltip) |
| Indexed | `indexedAt` relative time                                                 |
| Cost    | `indexCostUsd` (from §6.5 rollup)                                         |
| Actions | reindex, delete                                                           |

**Live updates** — register `kb-document-updated` in `ServerEventSync`
(`apps/web/src/hooks/sse/server-event-sync.ts`), invalidating
`['knowledge', 'documents']` exactly like the recordings handlers do; the table
refetches its current page as documents move through the pipeline.
`kb-ingest-progress` is ignored by the table in v1 (status badge is enough) and
reserved for a future per-document detail view.

**File drop** — drop zone + "Add files" button (existing `dialog:openPath` IPC)
posting to `POST /knowledge/files`. When embeddings are unconfigured, the page
shows the configure-embedding call-to-action instead (typed
`embedding_not_configured` error from §10.1).

---

## 11. Maintenance Jobs (scheduler-registered)

| Job                    | Schedule                             | What                                                                                                                                  |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `kb-ingest-drain`      | interval 5s (skips when queue empty) | Claims and runs queued ingest jobs                                                                                                    |
| `kb-entity-resolution` | daily                                | Embedding-similarity candidate pairs (cosine > 0.9) → cheap-LLM same-entity confirmation → merge nodes (union aliases/mentions/edges) |
| `kb-maintenance`       | daily                                | Orphan GC, `indexVersion` mismatch re-enqueue, LanceDB optimize/compact                                                               |
| `kb-reembed`           | manual trigger                       | Embedding model changed → re-embed all LanceDB tables from SQLite truth                                                               |

---

## 12. Future Extensions (designed-for, not built)

- **Community layer**: optional Leiden/k-core clustering + report generation as a
  periodic enrichment job over the existing graph tables → enables map-reduce
  "summarize everything" queries. Pure addition: new tables, new query mode.
- **New source types**: connectors (Drive/Notion), web clipper, email — each is just
  a new `sources/*.ts` producing `KbDocumentInput`; pipeline unchanged.
- **Session digests**: opt-in ingestion of chat-session summaries (compaction
  summaries + title) on session close as `sourceType='session'`.
- **Web source + specialized converters**: `sources/web.ts` (fetch + sourceUrl-aware
  conversion); `@stitch/markdown-convert` gains specialized layers like `html-arxiv`
  with source-specific acquisition strategies living in the source, not the package.
- **Temporal knowledge** (Graphiti-style): `validFrom/validTo` on relations for
  time-aware queries; schema reserves no columns now but migration is additive.
- **Reranker**: cross-encoder rerank stage in `query/assemble.ts` once a local
  reranker story exists.
- **Memory convergence**: memory could become a KB collection later; deliberately
  out of scope.

---

## 13. Implementation Phases

Each phase ends green on `bun run check` and is independently shippable.

### Phase 1 — Foundation & storage (no LLM)

- `db/schema/knowledge.ts` + drizzle migration; shared types/events package.
- `knowledge/config.ts`, `store/` (connection, arrow tables, hybrid search helpers).
- `service.ts` skeleton: upsertDocument (hash dedupe, `KbIndexingPlan` validation),
  listDocuments, removeDocument.
- `ingest/queue.ts` + `worker.ts` (scheduler job) with plan-gated chunk+embed+fts
  stages (no graph).
- Embedding usage tracking (§6.5): `embedding_usage_events` table + tracking
  decorator in `createEmbedder()`.
- `routes/knowledge.ts` for documents CRUD + `query` in `basic` mode.
- Tests: chunker (all three chunking strategies), queue state machine (dedupe,
  retry, resume), hash idempotency, plan validation + stage gating.

### Phase 2 — Sources & conversion package

- Create `packages/markdown-convert` (`@stitch/markdown-convert`): registry,
  text/office/html converters, layered-resolution chain; `office-md` spike on
  Windows (fallback: `docstream`).
- Recording listeners: transcript doc on `recording-stopped` (search-only plan),
  analysis doc on `recording-analysis-updated` completed (full plan), with
  markdown builders for each.
- File ingestion route (`sources/file.ts` → package).
- SSE progress events; KB page with paginated documents table + file drop (§10.5),
  `kb-document-updated` invalidation in `ServerEventSync`.
- Tests: converter chain resolution (priority + fall-through), recording-source
  markdown builder, duplicate-drop no-op.

### Phase 3 — Graph extraction & merge

- `extractor.ts` (cheap-model structured extraction, prompts driven by
  `knowledge.extraction.entityTypes` + `domainContext`, stamps
  `extractionConfigHash`) + `graph/merge.ts`
  (set-union merge, mentions provenance, delta removal on reindex/delete).
- Usage ledger integration: `knowledge_extraction` source via `recordLlmUsage`,
  registered in `USAGE_SOURCES` / `normalizeEventSource` (dashboard chart picks it
  up automatically) + per-document `indexUsage`/`indexCostUsd` rollup (§6.5);
  cost column in KB table.
- Entity/relation LanceDB tables + upsert flow.
- Tests: merge idempotency, reindex delta correctness (counters return to baseline),
  GC of zero-evidence nodes.

### Phase 4 — Graph retrieval

- `query/keywords.ts`, `graph/traversal.ts`, `local`/`global`/`hybrid` modes,
  `assemble.ts` token budgeting + citations.
- `knowledge_query` usage source for keyword-extraction calls.
- Tests: traversal scoring on fixture graphs, budget packing, mode routing.

### Phase 5 — Agent integration

- `knowledge` toolset (5 tools) + registration in default toolsets;
  `kb_ingest_text` wrapped with `permissionMiddleware()`.
- `retriever.ts` auto-context injection wired into the chat turn pipeline
  (alongside memory retrieval), settings-gated (default on).
- Tests: tool I/O shapes, injection threshold behavior, permission gating on
  `kb_ingest_text`.

### Phase 6 — Hardening & maintenance

- Entity-resolution job (usage source `knowledge_maintenance`), reembed job,
  indexVersion sweeps, LanceDB compaction.
- Usage dashboard: "Embeddings" section alongside STT (§6.5); remaining
  `knowledge_query` / `knowledge_maintenance` source registrations.
- Extraction-settings UI (entity types editor, domain context) + staleness
  indicator (`extractionConfigHash` mismatch count) with bulk-reindex action.
- Stats endpoint + UI health panel.

---

## 14. Risks

| Risk                                          | Mitigation                                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extraction cost on large file dumps           | Cheap model, single-pass, per-chunk token cap; surface projected cost in UI before bulk ingest; future: skeleton indexing (KET-RAG style, extract on top ~30% of chunks only) |
| `office-md` Windows/Bun prebuild availability | Spike in Phase 2; the package's `Converter` interface isolates the choice; `docstream` fallback is pure TS                                                                    |
| Entity drift (same person, many names)        | Aliases + nightly resolution job; conservative merge (LLM confirm)                                                                                                            |
| LanceDB FTS/hybrid maturity in TS SDK         | Verified: native BM25 FTS + `.rerank()` RRF exist in `@lancedb/lancedb`; pin version, wrap in `store/search.ts` so a manual RRF fallback is one file                          |
| Auto-inject noise                             | Score threshold + small budget + setting to disable; basic-mode only                                                                                                          |
| Embedding model switch invalidates vectors    | `indexVersion` + `kb-reembed` job; SQLite holds truth so it's cheap to recover                                                                                                |
