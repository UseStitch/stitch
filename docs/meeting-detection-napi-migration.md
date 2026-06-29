# Meeting Detection: External Binary → NAPI Migration Plan

> **Status:** Ready to implement.
> **Audience:** An autonomous coding agent. This document is self-contained — read it top to bottom, then execute the phases in order. Each phase has explicit file edits, acceptance checks, and rollback notes.

---

## 0. Goal & Constraints

### Goal

Replace the meeting-detection mechanism that currently runs as a **spawned external Rust binary** (`stitch-meeting-watch`, communicating via JSONL over stdout) with a **NAPI native addon** (`.node`) loaded **in-process** into the Electron main process via `require()` / `process.dlopen`.

The new code lives in a **new package** `packages/meeting-detection` (`@stitch/meeting-detection`). The old meeting-detection code is **deleted**.

### Hard constraints

1. **Recording stays 100% intact.** The `stitch-audio-capture` binary, the `audio-recording` / `audio-core` Rust crates, `packages/audio-capture/src/native-driver.ts`, and the `STITCH_AUDIO_CAPTURE_BIN` env path must not change behavior. Recording is a separate sidecar binary and must remain a sidecar binary.
2. **The meeting-detection engine + classifiers are pure TS** and their behavior must be preserved byte-for-byte. They move packages but their logic and tests are unchanged.
3. `bun run check` must pass with zero errors at the end (lint, test, typecheck, knip, format).
4. Follow `AGENTS.md`: kebab-case filenames, no barrel files, `.js` extensions on relative imports, strict equality, no `any`, surgical changes, run `bunx drizzle-kit generate` only if schema changes (it does not here).

### Decisions already made (do not re-litigate)

- **Event payload format:** Native objects via `#[napi(object)]`. The Rust callback delivers a typed object; the TS side does **not** `JSON.parse`.
- **Crate placement:** The new package's Rust crate is **standalone** (its own `Cargo.toml`, not a member of the `native/` workspace). It gets its own `cargo test` step in CI.
- **Crash isolation:** The watcher thread body is wrapped in `std::panic::catch_unwind`. On panic it emits an `error` event to JS rather than aborting the Electron process. The JS layer keeps a restart-on-error loop.

---

## 1. Current Architecture (background)

### Meeting detection (TO BE REPLACED)

| Layer | File | Role |
|---|---|---|
| Rust logic | `native/crates/audio-meeting-detect/src/lib.rs` | `run_meeting_watcher()` dispatch by OS |
| Rust logic | `native/crates/audio-meeting-detect/src/macos_meeting_watch.rs` | CoreAudio (`cidre`) mic-usage scan + JXA browser title scan |
| Rust logic | `native/crates/audio-meeting-detect/src/windows_meeting_watch.rs` | WASAPI (`wasapi`) active-session scan + `EnumWindows` titles |
| Rust output | `native/crates/audio-meeting-detect/src/watch_output.rs` | `WatchRow` / `WatchEvent` serde structs + `emit_snapshot`/`emit_watch_error` (println JSONL) |
| Rust bin | `native/crates/audio-cli/src/bin/stitch-meeting-watch.rs` | `fn main() { audio_meeting_detect::run_meeting_watcher() }` |
| TS transport | `packages/audio-capture/src/meeting-detection/watcher.ts` | spawns binary, buffers JSONL, classifies rows, feeds engine |
| TS engine | `packages/audio-capture/src/meeting-detection/engine.ts` | activation threshold / cooldown state machine (pure) |
| TS classify | `packages/audio-capture/src/meeting-detection/macos.ts` | maps `WatchRow[]` → `MeetingObservation[]` (pure) |
| TS classify | `packages/audio-capture/src/meeting-detection/windows.ts` | maps `WatchRow[]` → `MeetingObservation[]` (pure) |
| TS util | `packages/audio-capture/src/meeting-detection/observations.ts` | `mergeObservations` (pure) |
| TS binary resolve | `packages/audio-capture/src/native-binary.ts` | `resolveMeetingWatcherBinaryPath`, env `STITCH_MEETING_WATCH_BIN` |
| TS factory | `packages/audio-capture/src/index.ts` | `createMeetingDetector(platform, opts)` |
| TS types | `packages/audio-capture/src/types.ts` | `Meeting*` types |
| Desktop wiring | `apps/desktop/src/main/meeting-detection.ts` | `configureMeetingDetectionEnv`, `startMeetingDetection`, `stopMeetingDetection` |
| Desktop wiring | `apps/desktop/src/main/index.ts` | calls `configureMeetingDetectionEnv()` (L157) + `startMeetingDetection(...)` (L180) |
| Tests | `engine.test.ts`, `macos.test.ts`, `windows.test.ts` | colocated, pure |

### Recording (KEEP — do not touch behavior)

| File | Role |
|---|---|
| `native/crates/audio-cli/src/main.rs` | `stitch-audio-capture` bin entry (recording). Does **NOT** use `audio_meeting_detect`. |
| `native/crates/audio-recording/*`, `native/crates/audio-core/*` | recording crates |
| `packages/audio-capture/src/native-driver.ts` | recording driver (spawns `stitch-audio-capture`) |
| `packages/audio-capture/src/stream-json.ts` | JSONL buffer — **shared, used by `native-driver.ts`; stays in `audio-capture`** |
| `packages/audio-capture/src/native-binary.ts` | `resolveNativeBinaryPath` (capture) stays; only the meeting-watch parts are removed |

### Critical observations

- `native/crates/audio-cli/Cargo.toml:12` declares `audio-meeting-detect = { path = "../audio-meeting-detect" }`, **but `main.rs` never references it.** The dependency exists *only* to compile the `stitch-meeting-watch` bin. It can be cleanly severed.
- `stream-json.ts` is shared with recording (`native-driver.ts:4`). It must **stay** in `audio-capture`. The new `watcher.ts` will not need it (no stdout parsing).
- `createJsonLineBuffer` is the only thing the old `watcher.ts` imports cross-module besides the engine/binary-resolver.

### Data contract that must be preserved

```ts
// Row shape (Rust emits camelCase via serde)
type WatchRow = { pid?: number; processName?: string; windowTitle?: string | null };
// Event union
type WatchEvent =
  | { type: 'snapshot'; rows: WatchRow[] }
  | { type: 'error'; message: string };
```

The classifiers consume `WatchRow[]`. Keep these field names exactly (`pid`, `processName`, `windowTitle`).

---

## 2. Target Architecture

```
packages/meeting-detection/
├── Cargo.toml               # standalone cdylib crate (napi + napi-derive)
├── build.rs                 # napi_build::setup()
├── package.json             # @stitch/meeting-detection, @napi-rs/cli build
├── tsconfig.json
├── napi/                    # (generated) index.js loader (committed or .gitignored — see §6.3)
├── *.node                   # (generated, gitignored) native binary
├── src-rs/                  # Rust sources for the addon
│   ├── lib.rs               # #[napi] start_watcher / stop_watcher + ThreadsafeFunction
│   ├── macos.rs             # moved from audio-meeting-detect/macos_meeting_watch.rs
│   ├── windows.rs           # moved from audio-meeting-detect/windows_meeting_watch.rs
│   └── watch_output.rs      # WatchRow/WatchEvent as #[napi(object)] structs
└── src/                     # TypeScript
    ├── native.ts            # loads the .node addon, typed wrapper
    ├── types.ts             # Meeting* types (moved from audio-capture)
    ├── index.ts             # exports createMeetingDetector
    └── meeting-detection/
        ├── engine.ts        # moved, unchanged
        ├── engine.test.ts   # moved, unchanged
        ├── macos.ts         # moved, unchanged
        ├── macos.test.ts    # moved, unchanged
        ├── windows.ts       # moved, unchanged
        ├── windows.test.ts  # moved, unchanged
        ├── observations.ts  # moved, unchanged
        └── watcher.ts       # REWRITTEN to drive the addon
```

> **Naming note:** napi-rs by default expects Rust sources under `src/` and emits `index.js`/`index.d.ts` at the package root. To avoid colliding with the TypeScript `src/`, put Rust under `src-rs/` and point `Cargo.toml`'s `lib.path` at it, and configure the napi output explicitly. See §4.1 for the exact config. If this proves fiddly, the fallback is to keep Rust at the crate root in a `crate/` subdir. Pick whichever builds cleanly; the directory name is not load-bearing.

### NAPI Rust surface

```rust
#[napi(object)]
pub struct WatchRow {
  pub pid: u32,
  pub process_name: String,        // -> processName in JS
  pub window_title: Option<String>,// -> windowTitle in JS
}

#[napi(object)]
pub struct WatchEvent {
  // "snapshot" | "error"
  pub kind: String,
  pub rows: Option<Vec<WatchRow>>,   // present when kind == "snapshot"
  pub message: Option<String>,       // present when kind == "error"
}

#[napi]
pub fn start_watcher(
  callback: ThreadsafeFunction<WatchEvent, ()>,
) -> napi::Result<()>;

#[napi]
pub fn stop_watcher() -> napi::Result<()>;
```

> napi-rs converts `process_name` → `processName` automatically (camelCase). We deliberately name the discriminant `kind` (not `type`) to avoid the TS reserved-ish `type` ergonomics; the TS wrapper maps `kind` → the existing `{ type }` union so the classifiers stay unchanged. (Alternatively keep `type` — napi allows it, but `kind` is cleaner in Rust. The TS adapter normalizes either way.)

### TS data flow (after)

```
addon.startWatcher((event) => {
  if (event.kind === 'error') { log + schedule restart }
  else { engine.ingest(classify(event.rows)) }
})
```

The `MeetingDetector` interface (`start/stop/subscribe/getActive`) is **unchanged**, so `createMacosMeetingDetector` / `createWindowsMeetingDetector` / `createMeetingDetector` keep their signatures. Only `watcher.ts` internals change.

---

## 3. Execution Phases

Do them in this order. After each phase, run the listed acceptance check before moving on.

### Phase 1 — Scaffold the new package (Rust + TS shells)

1. Create `packages/meeting-detection/package.json`:

```json
{
  "name": "@stitch/meeting-detection",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "napi build --release --platform --js native/binding.cjs --dts native/binding.d.ts",
    "build:debug": "napi build --platform --js native/binding.cjs --dts native/binding.d.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "devDependencies": {
    "@napi-rs/cli": "catalog:",
    "@types/bun": "catalog:",
    "typescript": "catalog:"
  }
}
```

> Add `@napi-rs/cli` to the root catalog (or pin a concrete version `^3` if the catalog has no entry). Install with `bun add -D @napi-rs/cli` **inside the package** so it lands in the right place; verify it resolves. Confirm the catalog mechanism by inspecting how `typescript`/`@types/bun` are pinned in the root `package.json` `catalog`.

2. Create `packages/meeting-detection/tsconfig.json` (copy from `packages/audio-capture/tsconfig.json` verbatim).

3. Create `packages/meeting-detection/Cargo.toml`:

```toml
[package]
name = "stitch-meeting-detection"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]
path = "src-rs/lib.rs"

[dependencies]
napi = { version = "2", default-features = false, features = ["napi6"] }
napi-derive = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sysinfo = "0.37"

[target.'cfg(target_os = "windows")'.dependencies]
wasapi = "0.23"
windows = { version = "0.61", features = ["Win32_Foundation", "Win32_UI_WindowsAndMessaging"] }

[target.'cfg(target_os = "macos")'.dependencies]
cidre = { version = "0.15", features = ["av", "sc", "blocks", "async"] }

[build-dependencies]
napi-build = "2"
```

> Versions for `napi`/`napi-derive`/`napi-build`: use whatever `@napi-rs/cli` v3 expects. If using napi-rs v3, the crate is `napi = "3"` / `napi-derive = "3"` / `napi-build = "2"`. **Verify the matching versions** by running `napi --version` after install and checking the napi-rs docs for the CLI↔crate version pairing. Do not guess — mismatched CLI/crate versions cause obscure build failures.

4. Create `packages/meeting-detection/build.rs`:

```rust
fn main() {
  napi_build::setup();
}
```

5. Create stub `src-rs/lib.rs` that compiles but does nothing yet:

```rust
#[macro_use]
extern crate napi_derive;

#[napi]
pub fn ping() -> bool {
  true
}
```

6. Create `packages/meeting-detection/.gitignore`:

```
*.node
target/
```

**Acceptance check (Phase 1):**
- `bun install` succeeds.
- `bun run --filter @stitch/meeting-detection build:debug` produces a `.node` file and `native/binding.cjs` + `native/binding.d.ts`.
- In a scratch script, `require('./native/binding.cjs').ping()` returns `true` under Node. (Bun support is a bonus; Electron main = Node ABI is the real target.)

> If the napi CLI flags differ in the installed version, adjust `--js`/`--dts`/`--platform`. The intent: emit a CJS loader + d.ts into `native/` and the platform `.node` into the package. Read `napi build --help`.

---

### Phase 2 — Port the Rust watcher logic into the addon

1. **Create `src-rs/watch_output.rs`** — replace the println-based emitter with napi structs + a callback-based emitter.

```rust
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};

#[napi(object)]
#[derive(Clone)]
pub struct WatchRow {
  pub pid: u32,
  pub process_name: String,
  pub window_title: Option<String>,
}

#[napi(object)]
#[derive(Clone)]
pub struct WatchEvent {
  pub kind: String, // "snapshot" | "error"
  pub rows: Option<Vec<WatchRow>>,
  pub message: Option<String>,
}

pub type Emitter = ThreadsafeFunction<WatchEvent, ()>;

pub fn emit_snapshot(tsfn: &Emitter, rows: Vec<WatchRow>) {
  let event = WatchEvent { kind: "snapshot".into(), rows: Some(rows), message: None };
  tsfn.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
}

pub fn emit_watch_error(tsfn: &Emitter, message: impl Into<String>) {
  let event = WatchEvent { kind: "error".into(), rows: None, message: Some(message.into()) };
  tsfn.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
}
```

> Carry over the serde serialization unit tests from the old `watch_output.rs` where still meaningful (the camelCase assertions now apply to napi conversion, which is implicit — so those specific serde tests can be dropped). Keep a Rust unit test that constructs a `WatchEvent`/`WatchRow` and asserts the discriminant strings, since `kind` values are a contract.

2. **Create `src-rs/macos.rs`** — port `macos_meeting_watch.rs`. Changes from the original:
   - `pub fn run_macos_meeting_watcher()` → `pub fn run(tsfn: Emitter, stop: Arc<AtomicBool>)`.
   - Replace every `emit_snapshot(...)` / `emit_watch_error(...)` (which used the module-level println versions) with the `tsfn`-based versions, passing `&tsfn`.
   - The main loop (`loop { sleep(DEBOUNCE_MS); ... }`) must check `stop.load(Ordering::Relaxed)` each iteration and `return` when set, so `stop_watcher()` can unblock it within ~250ms.
   - Keep the CoreAudio listener registration, JXA browser-title scan, and `build_watch_rows()` logic **verbatim** otherwise.
   - The `WatchRow` construction now uses the napi struct (`pid: u32`, `process_name: String`, `window_title: Option<String>`) — field names already match.

3. **Create `src-rs/windows.rs`** — port `windows_meeting_watch.rs`. Same transformation:
   - `pub fn run(tsfn: Emitter, stop: Arc<AtomicBool>)`.
   - Replace emitters with `tsfn` versions.
   - The polling thread + main loop must observe `stop` and exit. Note the original spawns an inner polling thread (`SESSION_POLL_INTERVAL`) — make that thread also observe `stop` (clone the `Arc`), and have the main loop `return` on stop. Ensure the spawned inner thread terminates (it currently loops forever; give it a `stop` check).
   - Keep WASAPI session scan, `EnumWindows` title collection, and `build_watch_rows()` verbatim.

4. **Rewrite `src-rs/lib.rs`**:

```rust
#[macro_use]
extern crate napi_derive;

mod watch_output;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use watch_output::{Emitter, WatchEvent};

struct WatcherHandle {
  stop: Arc<AtomicBool>,
  join: JoinHandle<()>,
}

static HANDLE: Mutex<Option<WatcherHandle>> = Mutex::new(None);

#[napi]
pub fn start_watcher(callback: Emitter) -> napi::Result<()> {
  let mut guard = HANDLE.lock().unwrap_or_else(|e| e.into_inner());
  if guard.is_some() {
    return Ok(()); // already running; idempotent
  }

  let stop = Arc::new(AtomicBool::new(false));
  let stop_for_thread = stop.clone();
  let tsfn = callback;

  let join = std::thread::spawn(move || {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
      run_platform(tsfn.clone(), stop_for_thread.clone());
    }));
    if result.is_err() {
      watch_output::emit_watch_error(&tsfn, "meeting watcher thread panicked");
    }
  });

  *guard = Some(WatcherHandle { stop, join });
  Ok(())
}

#[napi]
pub fn stop_watcher() -> napi::Result<()> {
  let handle = {
    let mut guard = HANDLE.lock().unwrap_or_else(|e| e.into_inner());
    guard.take()
  };
  if let Some(handle) = handle {
    handle.stop.store(true, Ordering::Relaxed);
    let _ = handle.join.join();
  }
  Ok(())
}

#[cfg(target_os = "macos")]
fn run_platform(tsfn: Emitter, stop: Arc<AtomicBool>) {
  macos::run(tsfn, stop);
}

#[cfg(target_os = "windows")]
fn run_platform(tsfn: Emitter, stop: Arc<AtomicBool>) {
  windows::run(tsfn, stop);
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn run_platform(_tsfn: Emitter, stop: Arc<AtomicBool>) {
  while !stop.load(Ordering::Relaxed) {
    std::thread::sleep(std::time::Duration::from_millis(250));
  }
}
```

> **ThreadsafeFunction generics:** the exact type signature (error strategy, return type) depends on the napi-rs version. The intent: a non-fatal, non-blocking TSFN that takes a `WatchEvent`. Consult `napi build`-generated `binding.d.ts` and napi-rs docs for the correct `ThreadsafeFunction<WatchEvent, ...>` form. If the version uses `#[napi(ts_args_type = ...)]` or a closure-based builder, follow that idiom. Do **not** block the OS callback thread — use `NonBlocking`.

> **`tsfn.clone()` inside the thread:** TSFN is cloneable and reference-counted; cloning is how the panic handler can still emit after `run_platform` consumed its copy. Adjust to the version's ownership model.

5. **Delete** the now-duplicated logic from the old crate location only in Phase 4 (keep it until the new one compiles, to diff against).

**Acceptance check (Phase 2):**
- `cargo test --manifest-path packages/meeting-detection/Cargo.toml` passes (will run on the host OS; macOS-only/Windows-only modules compile under `cfg`).
- `bun run --filter @stitch/meeting-detection build:debug` produces a `.node`.
- On the host OS (Windows here), a scratch script that calls `startWatcher(cb)`, waits ~3s, prints received events, then `stopWatcher()` and confirms the process exits cleanly (thread joined, no hang).

---

### Phase 3 — Move & rewire the TypeScript

1. **Move files** (git mv to preserve history) from `packages/audio-capture/src/meeting-detection/` to `packages/meeting-detection/src/meeting-detection/`:
   - `engine.ts`, `engine.test.ts`
   - `macos.ts`, `macos.test.ts`
   - `windows.ts`, `windows.test.ts`
   - `observations.ts`
   - `watcher.ts` (will be rewritten in step 4)

2. **Move meeting types.** Cut the `Meeting*` types from `packages/audio-capture/src/types.ts` (lines covering `MeetingPlatform`, `MeetingKind`, `MeetingDetection`, `MeetingDetectedEvent`, `MeetingEndedEvent`, `MeetingDetectionEvent`, `MeetingDetectionListener`, `MeetingDetectionOptions`, `MeetingDetector`) into a new `packages/meeting-detection/src/types.ts`. Keep `StitchLogger` — it is referenced by `MeetingDetectionOptions`; either copy the `StitchLogger` type into the new `types.ts` or move it if it is not used elsewhere in `audio-capture`.
   - **Verify** `StitchLogger` usage in `audio-capture` before moving: `grep -rn "StitchLogger" packages/audio-capture`. If used elsewhere (e.g. native-driver), **copy** rather than move.
   - The moved classifier/engine files import these types via `../types.js` — update those import paths to the new location (`../types.js` still works since structure is mirrored).

3. **Create `packages/meeting-detection/src/native.ts`** — the typed addon loader:

```ts
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// binding.cjs is emitted by @napi-rs/cli and resolves the correct platform .node
const native = require('../native/binding.cjs') as {
  startWatcher: (cb: (err: unknown, event: NativeWatchEvent) => void) => void;
  stopWatcher: () => void;
};

export type NativeWatchRow = {
  pid: number;
  processName: string;
  windowTitle: string | null;
};

export type NativeWatchEvent = {
  kind: 'snapshot' | 'error';
  rows?: NativeWatchRow[];
  message?: string;
};

export const startWatcher = native.startWatcher;
export const stopWatcher = native.stopWatcher;
```

> The TSFN callback signature in napi (error-first vs value-only) depends on the chosen `ErrorStrategy`. Match `native.ts` to the generated `binding.d.ts`. Prefer importing the generated types from `binding.d.ts` directly instead of hand-writing them if the CLI emits good types.

4. **Rewrite `packages/meeting-detection/src/meeting-detection/watcher.ts`.** Replace the spawn/JSONL implementation with addon-driven logic. Preserve the public function `createNativeWatcherMeetingDetector(classify, options)` and the exported `WatchRow` type (re-export it to keep classifier imports working — they import `WatchRow` from `./watcher.js`).

```ts
import { startWatcher, stopWatcher } from '../native.js';
import { createMeetingDetectionEngine } from './engine.js';

import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';
import type { MeetingObservation } from './engine.js';
import type { NativeWatchEvent } from '../native.js';

const RESTART_DELAY_MS = 2_000;
const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

export type WatchRow = {
  pid?: number;
  processName?: string;
  windowTitle?: string | null;
};

type RowClassifier = (rows: WatchRow[]) => MeetingObservation[];

export function createNativeWatcherMeetingDetector(
  classify: RowClassifier,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  const engine = createMeetingDetectionEngine(options);
  const log = options.logger ?? noopLogger;
  let running = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  function handleEvent(event: NativeWatchEvent): void {
    if (event.kind === 'error') {
      log.error({ message: event.message ?? 'unknown' }, 'native watcher error');
      scheduleRestart();
      return;
    }
    engine.ingest(classify(event.rows ?? []));
  }

  function scheduleRestart(): void {
    if (!running || restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!running) return;
      stopWatcher();
      startWatcher((_err, event) => handleEvent(event));
    }, RESTART_DELAY_MS);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      startWatcher((_err, event) => handleEvent(event));
    },
    stop(): void {
      running = false;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      stopWatcher();
    },
    subscribe: engine.subscribe.bind(engine),
    getActive: engine.getActive.bind(engine),
  };
}
```

> Match the `startWatcher` callback arity to the generated binding (error-first vs single-arg). Adjust the closure accordingly.

5. **Create `packages/meeting-detection/src/index.ts`** — move `createMeetingDetector` from `audio-capture/src/index.ts`:

```ts
import { createMacosMeetingDetector } from './meeting-detection/macos.js';
import { createWindowsMeetingDetector } from './meeting-detection/windows.js';

import type {
  MeetingDetection,
  MeetingDetectionListener,
  MeetingDetectionOptions,
  MeetingDetector,
} from './types.js';

export type {
  MeetingDetection,
  MeetingDetectionEvent,
  MeetingDetectionListener,
  MeetingDetectionOptions,
  MeetingDetector,
  MeetingKind,
  MeetingPlatform,
} from './types.js';

export function createMeetingDetector(
  platform: NodeJS.Platform = process.platform,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  if (platform === 'darwin') return createMacosMeetingDetector(options);
  if (platform === 'win32') return createWindowsMeetingDetector(options);
  return {
    start(): void {},
    stop(): void {},
    subscribe(_listener: MeetingDetectionListener): () => void {
      return () => {};
    },
    getActive(): MeetingDetection | null {
      return null;
    },
  };
}
```

**Acceptance check (Phase 3):**
- `bun run --filter @stitch/meeting-detection test` — all moved tests pass unchanged.
- `bun run --filter @stitch/meeting-detection typecheck` passes.

---

### Phase 4 — Delete the old meeting-detection code

1. **`packages/audio-capture/src/index.ts`:** remove `createMeetingDetector` (lines ~90–112), the macos/windows detector imports (lines 1–2), the meeting type imports (lines 18–23), and remove `resolveMeetingWatcherBinaryPath` from the re-export on line 4 (keep `resolveNativeBinaryPath`).

2. **`packages/audio-capture/src/native-binary.ts`:** remove the `'meeting-watch'` handling. Specifically: drop the `meeting-watch` branch in `getBinaryName` (lines 9–11), simplify `NativeBinary` to just `'capture'`, and delete `resolveMeetingWatcherBinaryPath` (lines 65–67). Keep `resolveNativeBinaryPath`. Simplify `resolveBinary`/`getBinaryName`/candidate helpers to no longer be parameterized by binary if that reduces complexity (per AGENTS.md "simplicity first") — but keep it surgical; minimal viable removal is acceptable.

3. **`packages/audio-capture/src/types.ts`:** delete the moved `Meeting*` types (and `StitchLogger` if and only if it is not used elsewhere in `audio-capture` — verify first).

4. **Delete files:** `packages/audio-capture/src/meeting-detection/` entire directory (already moved in Phase 3 — confirm git shows them as moved, not duplicated).

5. **Delete Rust:** remove directory `native/crates/audio-meeting-detect/` entirely.

6. **`native/Cargo.toml`:** remove `"crates/audio-meeting-detect"` from `members`.

7. **`native/crates/audio-cli/Cargo.toml`:** remove line 12 `audio-meeting-detect = { path = "../audio-meeting-detect" }`.

8. **Delete bin:** `native/crates/audio-cli/src/bin/stitch-meeting-watch.rs`. If `src/bin/` becomes empty, remove the dir.

**Acceptance check (Phase 4):**
- `cargo build --manifest-path native/Cargo.toml --workspace` succeeds (recording binary still builds; meeting-detect gone).
- `cargo test --manifest-path native/Cargo.toml --workspace` passes.
- `bun run --filter @stitch/audio-capture typecheck` passes.
- `grep -rn "stitch-meeting-watch\|STITCH_MEETING_WATCH_BIN\|resolveMeetingWatcherBinaryPath\|audio-meeting-detect" .` returns **only** matches in this doc and (temporarily) build/release files about to be edited in Phase 6. No matches in `packages/audio-capture`, `native/crates/audio-cli`, or `apps/desktop`.

---

### Phase 5 — Rewire the desktop app

1. **`apps/desktop/package.json`:** add dependency `"@stitch/meeting-detection": "workspace:*"`. (Keep `@stitch/audio-capture` — recording still uses it.)

2. **`apps/desktop/src/main/meeting-detection.ts`:**
   - Change import on line 1 from `@stitch/audio-capture` to:
     ```ts
     import { createMeetingDetector } from '@stitch/meeting-detection';
     ```
     (drop `resolveMeetingWatcherBinaryPath`).
   - **Delete** `configureMeetingDetectionEnv` entirely (lines 17–23) — there is no binary path to resolve anymore.
   - Keep `startMeetingDetection` / `stopMeetingDetection` and the detector construction (lines 9–12) unchanged.

3. **`apps/desktop/src/main/index.ts`:**
   - Remove `configureMeetingDetectionEnv` from the import block (line 16) and the call site (line 157).
   - Leave `startMeetingDetection(...)` (line 180) and `configureRecordingCaptureEnv()` (line 158) intact.

4. **`apps/desktop/electron.vite.config.ts`:** add the new package to the main process bundle exclusions so the native addon is not bundled by Vite:
   ```ts
   externalizeDeps: {
     exclude: ['@stitch/audio-capture', '@stitch/meeting-detection'],
   },
   ```
   > Verify whether the `.node`/`binding.cjs` `require` survives Vite bundling. Because `@stitch/meeting-detection` is in `exclude` (i.e. bundled), the `createRequire`-based dynamic require of `../native/binding.cjs` must resolve relative to the installed package at runtime. If Vite rewrites the path, switch `native.ts` to resolve the addon via an absolute path derived from the package location, or mark the binding as external. **Test the packaged app** (Phase 7) to confirm the addon loads.

**Acceptance check (Phase 5):**
- `bun run --filter @stitch/desktop typecheck` passes.
- `bun install` re-links the new workspace dependency.

---

### Phase 6 — Build system (local) & release workflow

#### 6.1 `scripts/build-audio-native.mjs` — strip meeting-watch

Remove all `stitch-meeting-watch` staging from the recording build script:
- Delete `resolveMeetingWatcherBinaryName` (lines 42–44).
- Delete `meetingWatcherBinaryName` (line 48) usage.
- Delete the meeting-watch existence check + staging (lines 79–91).
- Delete the meeting-watch console log (line 94).

The script now builds and stages **only** `stitch-audio-capture`.

#### 6.2 New `scripts/build-meeting-detection.mjs`

Create a script that builds the addon and stages it for electron-builder. Model it on the existing script structure (resolve target, run, copy).

```js
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const pkgDir = join(repoRoot, 'packages/meeting-detection');

const result = spawnSync('bun', ['run', 'build'], {
  cwd: pkgDir,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
```

> `napi build` already emits the `.node` next to `binding.cjs` and names it with the platform triple. Decide staging strategy in §6.4.

#### 6.3 `packages/meeting-detection/package.json` scripts & turbo

- Ensure `build` (napi) is registered. turbo's root `build` task has `outputs: ["dist/**", "out/**", ...]` — add `"*.node"` and `"native/**"` to this package's outputs if you want turbo caching, by adding a `turbo.json` override or extending root outputs. Minimum viable: rely on the explicit `build:meeting-detection` script chain in desktop's `package` script (below), and let turbo handle TS typecheck/test.
- The Rust `cargo test` for this crate is **not** part of `bun run check` by default (check runs TS tooling). Add it to CI explicitly (§6.5). Optionally add a `test:rust` script.

#### 6.4 `apps/desktop/package.json` & `electron-builder.config.ts`

`apps/desktop/package.json`:
- Add script:
  ```json
  "build:meeting-detection": "bun ../../scripts/build-meeting-detection.mjs"
  ```
- Chain it into `package` and `package:x64` **before** `electron-builder`:
  ```json
  "package": "bun run build:web && bun run build && bun run build:sidecar && bun run build:audio-native && bun run build:meeting-detection && electron-builder --config electron-builder.config.ts",
  "package:x64": "bun run build:web && bun run build && bun run build:sidecar:x64 && bun run build:audio-native:x64 && bun run build:meeting-detection && electron-builder --config electron-builder.config.ts --x64"
  ```

`apps/desktop/electron-builder.config.ts`:
- **Remove** `stitch-meeting-watch` from `audioCaptureBinaryFilter` (lines 6–8): leave only `stitch-audio-capture(.exe)`.
- **Remove** `'Contents/Resources/audio-capture/stitch-meeting-watch'` from `mac.binaries` (line 100).
- **Add** the addon. Because `@stitch/meeting-detection` is a workspace dep bundled into the main process, the `.node` lives under the package. Add an `extraResources` entry to ship it predictably, OR rely on `node_modules` packaging. Recommended explicit approach — stage the addon to a known resources path and load from there:
  - Add to `extraResources`:
    ```ts
    {
      from: '../../packages/meeting-detection/native',
      to: 'meeting-detection',
      filter: ['*.node', 'binding.cjs'],
    }
    ```
  - On macOS, **add the `.node` to `mac.binaries`** so it is code-signed under hardened runtime (unsigned addons fail to load):
    ```ts
    'Contents/Resources/meeting-detection/*.node'
    ```
    (Confirm electron-builder accepts a glob here; if not, the path includes the triple, e.g. `stitch-meeting-detection.darwin-arm64.node` — derive the exact filename from `napi build` output and list it explicitly.)
  - If you ship via `extraResources`, update `native.ts` to resolve the addon from `process.resourcesPath` when packaged (mirror the pattern already in `native-binary.ts`: prefer `resourcesPath`, fall back to the local `../native/binding.cjs` in dev). This is the most robust approach and avoids Vite-bundling path issues. **Prefer this.**

> **macOS signing is the highest-risk item.** An in-process `.node` under hardened runtime must be signed or `dlopen` fails. The `mac.binaries` array is exactly for this. Test a packaged build before declaring done.

#### 6.5 `.github/workflows/release.yml`

- **`check` job** (matrix windows-2022 + macos-14): after the existing "Run Rust tests" step (line 73–74), add:
  ```yaml
  - name: Run meeting-detection Rust tests
    run: cargo test --manifest-path packages/meeting-detection/Cargo.toml
  ```
  Also extend the `Swatinem/rust-cache` `workspaces` input to include the new crate path, or add a second cache. Simplest: set `workspaces: |` multi-line with `native` and `packages/meeting-detection`.
- **`build` job** (matrix windows-2022 x64 + macos-14 arm64): the runners already install the Rust toolchain with `targets: ${{ matrix.rust_target }}`. The `bun run package` step (line 247–257) now includes `build:meeting-detection` via the chained script, so **no separate CI step is strictly required**. However, add `napi`'s dependency `@napi-rs/cli` is installed via `bun install` (it is a devDependency) — confirm `setup-bun` action runs `bun install`. If `bun install` is implicit in the package step, ensure the CLI is present. If you want an explicit, cache-friendly step, add before "Build desktop package":
  ```yaml
  - name: Build meeting-detection addon
    run: bun run --filter @stitch/meeting-detection build
  ```
  Per-platform runners build the correct-arch `.node` natively → **no cross-compilation needed**.
- Extend the rust-cache `shared-key` so the addon crate's deps (`cidre`, `wasapi`, `windows`) are cached. These are the same heavy deps as the deleted crate, so cache cost is net-neutral.
- **No change** to `build-linux-server`, `version`, `release`, or notarization key prep beyond the `mac.binaries` config in electron-builder.

**Acceptance check (Phase 6):**
- `bun run --filter @stitch/desktop build:meeting-detection` produces the addon.
- `grep -rn "stitch-meeting-watch\|STITCH_MEETING_WATCH_BIN" .` returns no matches outside this doc.
- The release workflow YAML is valid (lint with `actionlint` if available, else careful review).

---

### Phase 7 — Verify end to end

Run in order; all must pass:

1. `cargo test --manifest-path packages/meeting-detection/Cargo.toml`
2. `cargo test --manifest-path native/Cargo.toml --workspace`
3. `bun run --filter @stitch/meeting-detection test` (engine/macos/windows classifier tests)
4. `bun run check` (lint, test, typecheck, knip, format:changed) — **zero errors**. If format fails, `bun run format:changed`.
5. **Local dev smoke (Windows host):** `bun run --filter @stitch/meeting-detection build:debug`, then launch the desktop app via `bun run dev` (or a scratch harness) and confirm a real meeting (e.g. join a Google Meet in Chrome) produces a `meeting:call-detected` IPC event. Confirm `stopMeetingDetection()` cleanly stops the watcher thread (no hung process on quit).
6. **Packaged build:** `bun run --filter @stitch/desktop package`. Launch the packaged app and confirm the addon loads (no `dlopen`/`require` error in logs) and detection works. On macOS specifically, confirm the signed `.node` loads under hardened runtime.

---

## 4. Reference: napi-rs specifics (resolve during implementation)

- **CLI↔crate version pairing:** run `napi --version`; match `napi`/`napi-derive`/`napi-build` crate versions accordingly. napi-rs v3 CLI ↔ napi v3 crate; v2 CLI ↔ napi v2. Do not mix.
- **ThreadsafeFunction:** the canonical pattern (confirmed via napi-rs docs) is: accept the JS callback as a `ThreadsafeFunction`, clone it into the spawned thread, call `tsfn.call(value, ThreadsafeFunctionCallMode::NonBlocking)` per event. TSFN auto-releases on drop. The error-first vs value-only callback shape is governed by the `ErrorStrategy` generic — pick one and mirror it in `native.ts`.
- **Loadability:** `@napi-rs/cli` emits a `binding.cjs` (or `index.js`) loader that `require`s the correct platform `.node`. This works in Node, Electron (Node ABI), and Bun (Bun implements ~95% of Node-API and supports `require('./x.node')` / `process.dlopen`).
- **Cross-compile:** not needed — CI uses per-platform runners (windows-2022 x64, macos-14 arm64). Each builds its own native addon.

---

## 5. File-change checklist (quick audit before PR)

**New:**
- `packages/meeting-detection/{package.json,tsconfig.json,Cargo.toml,build.rs,.gitignore}`
- `packages/meeting-detection/src-rs/{lib.rs,macos.rs,windows.rs,watch_output.rs}`
- `packages/meeting-detection/src/{native.ts,types.ts,index.ts}`
- `packages/meeting-detection/src/meeting-detection/{engine,macos,windows,observations,watcher}.ts` + tests (moved)
- `scripts/build-meeting-detection.mjs`

**Modified:**
- `packages/audio-capture/src/{index.ts,native-binary.ts,types.ts}` (remove meeting bits)
- `native/Cargo.toml` (drop member)
- `native/crates/audio-cli/Cargo.toml` (drop dep)
- `apps/desktop/package.json` (add dep + scripts)
- `apps/desktop/src/main/{meeting-detection.ts,index.ts}` (rewire, drop env config)
- `apps/desktop/electron.vite.config.ts` (externalize new pkg)
- `apps/desktop/electron-builder.config.ts` (swap meeting-watch binary → addon resource + signing)
- `scripts/build-audio-native.mjs` (strip meeting-watch)
- `.github/workflows/release.yml` (cargo test step + cache + optional addon build step)
- root `package.json` catalog (add `@napi-rs/cli`) — verify catalog mechanism

**Deleted:**
- `native/crates/audio-meeting-detect/` (whole dir)
- `native/crates/audio-cli/src/bin/stitch-meeting-watch.rs`
- meeting code in `packages/audio-capture/src/meeting-detection/` (moved, ensure no leftovers)

---

## 6. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| macOS hardened-runtime fails to load unsigned `.node` | **High** | Add the `.node` to `electron-builder` `mac.binaries`; test a packaged + notarized build early (Phase 7.6). |
| In-process crash kills Electron main (was isolated in sidecar) | Medium | `catch_unwind` in the watcher thread → emit `error` event; JS restart loop. CoreAudio/WASAPI `extern` callbacks must not panic across FFI — keep them allocation/lock-failure tolerant (they already use `unwrap_or_else(into_inner)`). |
| Vite bundling rewrites the addon `require` path | Medium | Resolve addon from `process.resourcesPath` when packaged (mirror `native-binary.ts`), fall back to local path in dev. Externalize the package in `electron.vite.config.ts`. |
| napi CLI/crate version mismatch | Medium | Pin matching versions; verify with `napi --version`; read `napi build --help`. |
| Windows inner polling thread never stops | Low | Pass the `stop` `Arc` into the inner thread and check it; ensure `stop_watcher` joins cleanly. |
| `StitchLogger` moved but still used in audio-capture | Low | Grep before moving; copy instead of move if shared. |

---

## 7. Out of scope (do not change)

- Recording pipeline: `stitch-audio-capture`, `audio-recording`, `audio-core`, `native-driver.ts`, `recording-capture.ts`, STT server route.
- `stream-json.ts` (shared with recording).
- `resolveNativeBinaryPath` / `STITCH_AUDIO_CAPTURE_BIN`.
- `build-linux-server` job, version-bump job, release/notarization secrets flow.
- The meeting IPC payload types in `@stitch/shared/recordings/meeting-ipc` and the renderer banner component — they consume the unchanged `MeetingDetection` shape.
