# stitch-audio-capture

Rust sidecar binary for native audio capture used by `@stitch/audio-capture`.

## Current status

- Command protocol scaffold implemented (`start`, `stop`, `status`)
- Process lifecycle events implemented over stdout JSON-lines
- Native audio stream backends are not implemented yet

## Planned backends

- Mic input: `cpal`
- Windows speaker/system audio: `wasapi`
- macOS speaker/system audio: CoreAudio tap + aggregate device
- Dual stream join/sync and optional AEC

## Local build

```bash
cargo build --release
```

Expected output binary:

- macOS/Linux: `target/release/stitch-audio-capture`
- Windows: `target/release/stitch-audio-capture.exe`

## Monorepo helper build

From repo root, use the helper script to build and stage the binary for desktop packaging:

```bash
bun run audio-native:build
```

The script builds a platform-appropriate target and stages the result into:

- `packages/audio-native/target/release/stitch-audio-capture`
- `packages/audio-native/target/release/stitch-audio-capture.exe`

### Override target for cross-builds

```bash
STITCH_AUDIO_NATIVE_TARGET=x86_64-apple-darwin bun run audio-native:build
```

Supported defaults:

- macOS arm64 -> `aarch64-apple-darwin`
- macOS x64 -> `x86_64-apple-darwin`
- Windows x64 -> `x86_64-pc-windows-msvc`

For runtime override during local testing, set:

- `STITCH_AUDIO_CAPTURE_BIN=/absolute/path/to/stitch-audio-capture`
