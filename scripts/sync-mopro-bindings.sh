#!/bin/bash
# Copy freshly built mopro React Native bindings into the app.
#
#   ./scripts/sync-mopro-bindings.sh
#
# Source: mopro/MoproReactNativeBindings (written by scripts/mopro_build.sh).
# Target: app/mopro_bindings, which the app installs as the `mopro-ffi`
# package (`file:./mopro_bindings`). Git tracks its sources and template files;
# the native libraries (the xcframework's .a files, jniLibs/*.so) are build
# output and are ignored, so every machine runs ./scripts/mopro_build.sh.
#
# Copied: the native libraries, the generated C++/TypeScript, and the template
# files mopro ships with each version (podspec, CMakeLists, package.json, ...),
# because the generated code and the template change together -- mopro 0.3.7's
# TypeScript imports `@ubjs/core`, which only its package.json declares.
#
# Kept as the app has them:
#   ubrn.config.yaml      mopro writes absolute paths into it; the app's copy
#                         is relative to the project home.
#   android/build.gradle  the app's copy builds arm64-v8a only, the one ABI
#                         mopro_build.sh produces; the template lists four, and
#                         CMake would then look for libraries that do not exist.
# Not copied:
#   src/index.web.ts      the web (wasm) entry; no wasm is built.
#   rust_modules/         mopro's scratch.
#
# Then rebuilds lib/ with the app's react-native-builder-bob.
set -eu

PROJECT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${PROJECT_HOME}/mopro/MoproReactNativeBindings"
DST="${PROJECT_HOME}/app/mopro_bindings"
BOB="${PROJECT_HOME}/app/node_modules/.bin/bob"

[ -d "$SRC" ] || { echo "Error: $SRC not found; run ./scripts/mopro_build.sh" >&2; exit 1; }
[ -d "$DST" ] || { echo "Error: $DST not found" >&2; exit 1; }
[ -x "$BOB" ] || { echo "Error: $BOB not found; run npm install in app/" >&2; exit 1; }

REPLACE_DIRS="
MoproFfiFramework.xcframework
android/src/main/jniLibs
android/src/main/java
cpp
ios
src/generated
"
REPLACE_FILES="
MoproFfi.podspec
package.json
babel.config.js
tsconfig.json
tsconfig.build.json
turbo.json
android/CMakeLists.txt
android/src/main/AndroidManifest.xml
src/index.tsx
src/NativeMoproFfi.ts
"

for d in $REPLACE_DIRS; do
  [ -d "$SRC/$d" ] || { echo "Error: $SRC/$d missing from the build output" >&2; exit 1; }
  rm -rf "${DST:?}/$d"
  mkdir -p "$(dirname "$DST/$d")"
  cp -R "$SRC/$d" "$DST/$d"
done
for f in $REPLACE_FILES; do
  [ -f "$SRC/$f" ] || { echo "Error: $SRC/$f missing from the build output" >&2; exit 1; }
  cp "$SRC/$f" "$DST/$f"
done

# The Android library must be the shared one; a static archive here is the
# 2.5 GB pre-0.3.7 shape and would not load through the IMPORTED SHARED target.
for abi_dir in "$DST"/android/src/main/jniLibs/*/; do
  [ -s "${abi_dir}libproofport.so" ] || { echo "Error: ${abi_dir}libproofport.so missing" >&2; exit 1; }
  [ ! -e "${abi_dir}libproofport.a" ] || { echo "Error: ${abi_dir}libproofport.a present" >&2; exit 1; }
done

# Nothing copied may name this machine's home directory.
if grep -rl "$HOME" "$DST" --exclude-dir=node_modules --exclude-dir=lib \
     --exclude-dir=MoproFfiFramework.xcframework --exclude-dir=jniLibs --exclude-dir=.cxx --exclude-dir=build >/dev/null 2>&1; then
  echo "Error: a copied file contains an absolute home path:" >&2
  grep -rl "$HOME" "$DST" --exclude-dir=node_modules --exclude-dir=lib \
     --exclude-dir=MoproFfiFramework.xcframework --exclude-dir=jniLibs --exclude-dir=.cxx --exclude-dir=build >&2
  exit 1
fi

# The JS runtime must be the release the generator wrote code for. The podspec
# pins the native side exactly; the template's package.json asks for a caret
# range, which npm resolves to the newest release -- a runtime the generated
# code was not written against. Pin both npm packages to the podspec's version.
RUNTIME_VERSION=$(sed -n 's/.*s\.dependency *"uniffi-bindgen-react-native", *"\([^"]*\)".*/\1/p' "$DST/MoproFfi.podspec")
[ -n "$RUNTIME_VERSION" ] || { echo "Error: no uniffi-bindgen-react-native version in MoproFfi.podspec" >&2; exit 1; }
node -e '
  const fs = require("fs"), [file, v] = process.argv.slice(1);
  const p = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const k of ["@ubjs/core", "uniffi-bindgen-react-native"]) {
    if (!(k in p.dependencies)) throw new Error(`package.json has no ${k} dependency`);
    p.dependencies[k] = v;
  }
  fs.writeFileSync(file, JSON.stringify(p, null, 2) + "\n");
' "$DST/package.json" "$RUNTIME_VERSION"

rm -rf "$DST/lib"
# bob looks for tsc under the package's own node_modules or on PATH; the
# bindings have no node_modules of their own, so lend it the app's.
(cd "$DST" && PATH="$(dirname "$BOB"):$PATH" "$BOB" build)
[ -s "$DST/lib/module/generated/proofport.js" ] || { echo "Error: bob did not write lib/" >&2; exit 1; }

echo "Synced $SRC -> $DST"
echo "Runtime packages the bindings declare:"
node -p "JSON.stringify(require('$DST/package.json').dependencies)"
