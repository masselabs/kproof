#!/bin/bash

# mopro build script - React Native bindings (iOS + Android)
#
# Usage: ./scripts/mopro_build.sh
#
# Prerequisites:
# 1. mopro CLI 0.3.7 (WITH --locked), Zig 0.16.0 (Android linking) and the
#    pinned uniffi-bindgen-react-native (TypeScript bindings):
#      ./scripts/install-mopro-toolchain.sh
#    Without --locked it resolves mopro-ffi to the newest 0.3.x, whose API
#    moved, and fails to compile (no ReactNativeBindingsParams / expected
#    AndroidBindingsParams). This is dependency drift, not a Rust problem.
# 2. cargo-ndk, or the Android leg dies with "no such command: ndk":
#      cargo install cargo-ndk
# 3. Rust targets:
#      rustup target add aarch64-apple-ios aarch64-apple-ios-sim aarch64-linux-android
# 4. Android NDK matching android/build.gradle (27.1.12297006). Taken from
#    ANDROID_NDK_HOME, else found as $ANDROID_HOME/ndk/<pinned version>.
# 5. circuit JSON + SRS + VK files in mopro/test-vectors/noir/
#    (run ./scripts/generate_srs.sh first)

set -e

# The Rust crate is still named `proofport` (it came from the ZKProofport
# monorepo), so its libraries are libproofport.* and the generated module is
# proofport.ts. Renaming it renames every generated file and the bindings
# template that loads them; do that in one change, not piecemeal.

# Pinned with scripts/install-mopro-toolchain.sh; this script refuses others.
MOPRO_CLI_VERSION=0.3.7
ZIG_VERSION=0.16.0
command -v mopro >/dev/null 2>&1 || PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
[ -x "$HOME/.zig/$ZIG_VERSION/zig" ] && PATH="$HOME/.zig/$ZIG_VERSION:$PATH"
got_mopro=$(mopro --version 2>/dev/null | awk '{print $2}')
got_zig=$(zig version 2>/dev/null || echo "not found")
if [ "$got_mopro" != "$MOPRO_CLI_VERSION" ] || [ "$got_zig" != "$ZIG_VERSION" ]; then
    echo "Error: need mopro-cli $MOPRO_CLI_VERSION and Zig $ZIG_VERSION, have mopro '${got_mopro:-not found}' and zig '$got_zig'." >&2
    echo "  Install them: ./scripts/install-mopro-toolchain.sh" >&2
    exit 1
fi
UBRN_REV=f110658c9dc5d8ee7481341fff1165e4532c2c27
if ! cargo install --list | grep -q "^uniffi-bindgen-react-native .*#${UBRN_REV:0:8}"; then
    echo "Error: uniffi-bindgen-react-native is not the pinned build ${UBRN_REV:0:8} (see install-mopro-toolchain.sh)." >&2
    echo "  Install it: ./scripts/install-mopro-toolchain.sh" >&2
    exit 1
fi

PROJECT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
MOPRO_DIR="${PROJECT_HOME}/mopro"

# The NDK is the one the app pins (ndkVersion in android/build.gradle), found
# under ANDROID_HOME when ANDROID_NDK_HOME is not set. No other version is
# substituted: a different NDK links a different libc++.
if [ -z "${ANDROID_NDK_HOME:-}" ]; then
    NDK_VERSION=$(sed -n 's/.*ndkVersion *= *"\([^"]*\)".*/\1/p' "${PROJECT_HOME}/app/android/build.gradle" | head -1)
    if [ -n "${ANDROID_HOME:-}" ] && [ -n "$NDK_VERSION" ] && [ -d "${ANDROID_HOME}/ndk/${NDK_VERSION}" ]; then
        export ANDROID_NDK_HOME="${ANDROID_HOME}/ndk/${NDK_VERSION}"
    else
        echo "Error: ANDROID_NDK_HOME unset and NDK ${NDK_VERSION:-?} not under \$ANDROID_HOME/ndk." >&2
        exit 1
    fi
fi
export NDK_HOME="${NDK_HOME:-$ANDROID_NDK_HOME}"
echo "Android NDK: $ANDROID_NDK_HOME"

echo "=================================================="
echo "mopro build - KProof"
echo "=================================================="
echo ""
echo "Project: $PROJECT_HOME"
echo "mopro dir: $MOPRO_DIR"
echo ""

if [ ! -d "$MOPRO_DIR" ]; then
    echo "Error: mopro directory not found: $MOPRO_DIR"
    exit 1
fi

if [ ! -d "${MOPRO_DIR}/test-vectors/noir" ] || [ -z "$(ls -A ${MOPRO_DIR}/test-vectors/noir/*.json 2>/dev/null)" ]; then
    echo "Error: test-vectors not found."
    echo "Run ./scripts/generate_srs.sh first."
    exit 1
fi

cd "$MOPRO_DIR"

echo "Starting build..."
echo ""
echo "Target architectures:"
echo "  - aarch64-apple-ios (iPhone device)"
echo "  - aarch64-apple-ios-sim (iPhone simulator)"
echo "  - aarch64-linux-android (Android ARM64)"
echo ""

# Every artifact checked below must be NEWER than this marker. Existence is
# not enough: on 2026-10-22 the Android leg failed (no Zig), mopro exited 0,
# and the September artifacts still on disk passed the old existence check.
BUILD_MARKER=$(mktemp)
trap 'rm -f "$BUILD_MARKER"' EXIT
sleep 1

mopro build --mode release \
  --platforms react-native \
  --architectures aarch64-apple-ios \
  --architectures aarch64-apple-ios-sim \
  --architectures aarch64-linux-android \
  --no-auto-update

# `mopro build` prints its failures and still exits 0, so `set -e` never fires.
# On 2026-09-04 the Android leg died with "no such command: ndk" and this script
# went on to print "Build complete!" and exit 0 — a clean green over a failed
# build. Check the artifacts instead of trusting the exit status.
BINDINGS_DIR="${MOPRO_DIR}/MoproReactNativeBindings"
missing=0
for f in \
  "${MOPRO_DIR}/target/aarch64-apple-ios/release/libproofport.a" \
  "${MOPRO_DIR}/target/aarch64-apple-ios-sim/release/libproofport.a" \
  "${MOPRO_DIR}/target/aarch64-linux-android/release/libproofport.so" \
  "${BINDINGS_DIR}/src/generated/proofport.ts"
do
  if [ ! -s "$f" ]; then
    echo "MISSING: $f" >&2
    missing=$((missing + 1))
  elif [ ! "$f" -nt "$BUILD_MARKER" ]; then
    echo "STALE (not rebuilt by this run): $f" >&2
    missing=$((missing + 1))
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "" >&2
  echo "mopro build did not produce $missing expected artifact(s)." >&2
  echo "Read the log above for the real error — mopro reports failures on" >&2
  echo "stdout while exiting 0, so the message is there even though nothing" >&2
  echo "propagated. Common cause: cargo-ndk not installed" >&2
  echo "(cargo install cargo-ndk)." >&2
  exit 1
fi

# Rebuild the xcframework with BOTH iOS slices.
#
# mopro CLI 0.3.2 runs `xcodebuild -create-xcframework` once per architecture,
# each time with a single -library and the SAME output path, so the simulator
# pass overwrites the device pass and the framework ends up holding whichever
# architecture ran last. The committed
# app/mopro_bindings/MoproFfiFramework.xcframework carries both
# ios-arm64 and ios-arm64-simulator, so that shape was previously produced by
# some step outside this script; this puts it back in the script.
XCFRAMEWORK="${BINDINGS_DIR}/MoproFfiFramework.xcframework"
echo "Rebuilding xcframework with both iOS slices..."
rm -rf "$XCFRAMEWORK"
xcodebuild -create-xcframework \
  -library "${MOPRO_DIR}/target/aarch64-apple-ios/release/libproofport.a" \
  -library "${MOPRO_DIR}/target/aarch64-apple-ios-sim/release/libproofport.a" \
  -output "$XCFRAMEWORK" >/dev/null

for slice in ios-arm64 ios-arm64-simulator; do
  if [ ! -s "${XCFRAMEWORK}/${slice}/libproofport.a" ]; then
    echo "ERROR: xcframework is missing the ${slice} slice" >&2
    exit 1
  fi
  echo "  ${slice}: $(du -h "${XCFRAMEWORK}/${slice}/libproofport.a" | awk '{print $1}')"
done

echo ""
echo "=================================================="
echo "mopro build complete!"
echo "=================================================="
echo ""
echo "Generated bindings: ${BINDINGS_DIR}/"
echo ""

# Since mopro 0.3.7 the Android library is the shared libproofport.so
# (ubrn's useSharedLibrary), so the old step here that swapped a 2.5 GB static
# archive for the .so and patched CMakeLists.txt is gone; the sync below
# refuses a static archive if one ever comes back.
"${PROJECT_HOME}/scripts/sync-mopro-bindings.sh"

echo ""
echo "=================================================="
echo "Build complete!"
echo "=================================================="
echo "Bindings: ${PROJECT_HOME}/app/mopro_bindings/ (mopro-ffi)"
echo "Next: npm install && (cd ios && pod install) in app/."
