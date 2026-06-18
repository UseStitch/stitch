# Browser Toolset Analysis: Stitch vs. browser-use

A review of Stitch's browser toolset implementation compared against
[browser-use/browser-use](https://github.com/browser-use/browser-use), with
recommendations to make the agent better, faster, and more efficient.

## Files reviewed

- `packages/server/src/tools/toolsets/browser.ts` — tool schemas + execution logic
- `packages/server/src/lib/browser/browser-manager.ts` — server-side bridge
- `packages/server/src/lib/browser/instructions/browser.md` — agent prompt
- `packages/server/src/lib/browser/tool-config.ts` — prompt loader
- `packages/server/src/lib/browser/types.ts` — shared types
- `apps/desktop/src/main/browser-manager.ts` — Electron `WebContents` implementation

## Architecture comparison

| Dimension | Stitch | browser-use |
|---|---|---|
| Browser engine | Electron `WebContents` | Real Chrome via CDP (Chrome DevTools Protocol) |
| Page representation | DOM walk via injected JS (`SNAPSHOT_SCRIPT`), YAML-ish a11y tree | Fused DOM + Accessibility tree + DOMSnapshot (5-stage pipeline) |
| Element targeting | `ref` -> CSS selector (`nth-of-type` path) | Stable numeric `index` -> `selector_map` node |
| Multi-action | `browser_batch` (max 5) | Native multi-action list per step (default max 3) |
| Vision | `browser_screenshot` (manual) | Screenshot with bounding boxes as "ground truth"; auto/text/vision modes |
| State across steps | Stateless tools; agent context only | `todo.md`, `results.md`, `memory` field, `read_state`, agent history |
| Page-stability waiting | Manual `browser_wait` only | Automatic CDP lifecycle waits + wait-for-min-elements |
| Output structure | Free-form tool calls | Structured `evaluation_previous_goal` / `memory` / `next_goal` / `action[]` |

The overall design is solid. The toolset structure
(`snapshot`/`navigate`/`interact`/`wait`/`content`/`batch`) is clean, and the
serialized-queue + batch + stop-on-page-change logic is well thought out. The
gaps versus browser-use are concentrated in a few high-leverage areas.

## Findings: where browser-use is meaningfully better

### 1. Element targeting reliability (highest impact)

Refs map to a CSS selector built from `nth-of-type` paths
(`browser-manager.ts:127-141`). Clicks run
`document.querySelector(selector)?.click()` (`browser-manager.ts:493`). Failure
modes:

- **Silent no-ops**: `?.click()` returns `undefined` whether the element was
  found or not. The agent gets `"Clicked e5"` even when nothing happened. There
  is no verification that the selector matched.
- **Stale/fragile selectors**: `nth-of-type` chains break on any DOM reordering
  between snapshot and action.
- **Synthetic events != real input**: `type` sets `el.value = ...` and
  dispatches `input`/`change` (`browser-manager.ts:586`). Many React/Vue
  controlled inputs ignore programmatic value sets, and `submit` dispatches only
  a `keydown` (no real Enter). This breaks autocomplete and form submission
  silently.

browser-use clicks the actual node via CDP and dispatches real input events, so
interactions behave like a human.

Recommendations:

- Make `click`/`type` return success/failure based on whether the selector
  matched (throw `Element not found` instead of silent no-op).
- Use Electron's real input dispatch (`sendInputEvent` / focusing +
  `insertText`) for typing rather than `el.value =`, or at minimum set the value
  through the native property setter so React's value tracker fires.
- Store a stable backup identity per ref (tag + role + name + position) so the
  CSS selector can be re-resolved if it goes stale, and auto-retry once.

### 2. No automatic page-stability waiting

`navigate`/`click` resolve as soon as Electron's `loadURL` settles or the JS
runs; the agent must manually call `browser_wait`. The prompt tells it to
snapshot again "whenever navigation or DOM churn is likely." This costs extra
LLM round-trips (slower + more tokens) and produces stale snapshots when the
agent forgets.

browser-use auto-waits on CDP lifecycle events and can wait for a minimum number
of interactive elements before returning.

Recommendations:

- After `navigate`/`click`/`press`, auto-wait for `did-stop-loading` + a short
  network-idle/quiescence window before resolving.
- Optionally return a fresh snapshot automatically as part of page-changing
  actions (see #4).

### 3. The snapshot omits visibility/viewport signal the model needs

The snapshot is good (refs, roles, names, scroll pages above/below). But
everything visible is dumped up to 3000 nodes, with no indication of what is in
the viewport vs. off-screen, and no "new since last snapshot" marker.

browser-use marks new elements (`*[`) and filters by viewport with a threshold,
which both reduces tokens and tells the model where to look.

Recommendations:

- Add an in-viewport flag per element (`getBoundingClientRect` is already
  computed).
- Mark elements that are new compared to the previous snapshot.
- Consider paint-order/occlusion filtering so the model doesn't target covered
  elements.

### 4. Snapshot/action round-trip overhead

The flow is `snapshot -> interact -> snapshot -> interact...`. Each snapshot is a
separate tool call. The single biggest speed win is collapsing this.

Recommendation — auto-snapshot on state change: when a page-changing action
completes, append the fresh snapshot to that action's result. This eliminates
roughly half the tool calls in a typical task. browser-use effectively does this
by feeding fresh browser state every step.

### 5. Missing high-value actions

browser-use has several actions Stitch lacks that frequently matter:

- **`upload_file`** — no file upload path exists today.
- **`get_dropdown_options` / `select_dropdown` by text** — `select` only matches
  by value/text crudely; dropdown discovery is missing.
- **`extract` with an output schema / link & image extraction** — `extract` is
  plain `innerText`. Structured extraction is far more token-efficient for data
  tasks.

### 6. Prompt: no state/memory/verification scaffolding

`browser.md` (69 lines) is clean but assumes the model self-manages. browser-use
enforces `evaluation_previous_goal` + `memory` + `next_goal`, a `todo.md` for
long tasks, loop detection ("same URL 3+ steps -> change approach"), and a
pre-done verification checklist.

Recommendations for `browser.md`:

- Add loop/stuck detection guidance (same page N steps, same action failing
  twice -> change strategy or ask user).
- Add an explicit pre-completion checklist ("re-read original request; confirm
  each requirement via snapshot/content").
- For long multi-step tasks, instruct the agent to maintain a running plan/todo
  in its working notes.
- Tell it to prefer `browser_content`/`search_page` over full snapshots for
  verification (already present — strengthen it).

### 7. Dialogs and `evaluate` are stubbed/weak

`dialogState` always returns `{ open: false }` and `handleDialog` is a no-op
(`browser-manager.ts:549-552`). The prompt tells the agent to use
`browser_dialog` for blocking dialogs, but it does nothing. `alert`/`confirm`/
`beforeunload` will actually hang the agent.

Recommendation: wire real dialog handling via `WebContents`
`'-dialog'`/`will-prevent-unload`, or by overriding
`window.alert/confirm/prompt` in the injected script and surfacing state.

## What Stitch does well (keep)

- **Serialized execution queue** (`runSerialized`) — prevents interleaved
  actions cleanly.
- **`browser_batch` with `stopOnPageChange`/`stopOnError`** — good design;
  auto-snapshot after stop would make it even better.
- **Human-control epoch detection** (`withAgentControl`) — a nice touch
  browser-use doesn't emphasize.
- **WebAuthn/passkey + auth-popup interception** — genuinely strong, real-world
  auth handling.
- **`search_page` / `find_elements`** — token-cheap verification primitives;
  browser-use added equivalents.

## Prioritized recommendations

Tier 1 — correctness & speed (do first):

1. Fix silent click/type failures: return real match status, use native value
   setter + real Enter.
2. Auto-wait for page stability after navigate/click/press.
3. Auto-append fresh snapshot to page-changing action results (cut round-trips
   ~half).

Tier 2 — model effectiveness:

4. Add viewport + "new element" markers to snapshots.
5. Add `upload_file`, dropdown option discovery, and schema-based `extract`.
6. Implement real dialog handling.

Tier 3 — prompt:

7. Add loop detection, pre-done verification checklist, and a running-plan
   instruction to `browser.md`.

## Suggested next step

Start with Tier 1: it addresses silent-failure bugs and delivers the biggest
speed wins. Per the bug-fix workflow, write reproducible tests first before
changing click/type behavior.
