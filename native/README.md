# stitch-audio-capture

Rust workspace for native audio services used by `@stitch/audio-capture`.

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
cargo build --release --manifest-path native/Cargo.toml -p stitch-audio-capture
```

Expected output binaries:

- macOS/Linux: `native/target/release/stitch-audio-capture`, `native/target/release/stitch-meeting-watch`
- Windows: `native/target/release/stitch-audio-capture.exe`, `native/target/release/stitch-meeting-watch.exe`

## Monorepo helper build

From repo root, use the helper script to build and stage the binary for desktop packaging:

```bash
bun run audio-native:build
```

The script builds a platform-appropriate target and stages the result into:

- `native/target/release/stitch-audio-capture`
- `native/target/release/stitch-audio-capture.exe`
- `native/target/release/stitch-meeting-watch`
- `native/target/release/stitch-meeting-watch.exe`

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
