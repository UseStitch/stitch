#!/usr/bin/env bash

# Build all native components (Swift dylib + Rust N-API addon)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building Apple FM native components..."

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "Error: This library can only be built on macOS"
    exit 1
fi

# Require macOS 26+ (FoundationModels)
MACOS_MAJOR=$(sw_vers -productVersion | cut -d. -f1)
if (( MACOS_MAJOR < 26 )); then
  echo "Error: Need macOS 26.0+ (FoundationModels). Current: $(sw_vers -productVersion)" >&2
  exit 1
fi

# Create build directory
mkdir -p build

# Build Swift dylib
echo "Compiling Swift -> build/libappleai.dylib"
swiftc \
  -O -whole-module-optimization \
  -emit-library -emit-module -module-name AppleOnDeviceAI \
  -framework Foundation -framework FoundationModels \
  -target arm64-apple-macos26.0 \
  -Xlinker -install_name -Xlinker @rpath/libappleai.dylib \
  -Xlinker -rpath -Xlinker @loader_path \
  src/apple-ai.swift \
  -o build/libappleai.dylib

echo "Swift dylib built"

# Build Rust addon
echo "Compiling Rust N-API addon"
pushd native >/dev/null
cargo build --release --quiet
popd >/dev/null

# Copy and rename the compiled addon
ADDON_SRC="native/target/release/libapple_fm_napi.dylib"
ADDON_DST="build/apple_fm_napi.node"

if [[ -f "$ADDON_SRC" ]]; then
    cp "$ADDON_SRC" "$ADDON_DST"
    echo "Native addon: $ADDON_DST"
else
    echo "Warning: Rust addon not found at $ADDON_SRC"
fi

echo "All native components built"
