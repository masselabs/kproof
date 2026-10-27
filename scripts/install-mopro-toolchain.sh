#!/bin/bash
# Install the mopro CLI and the Zig that scripts/mopro_build.sh pins.
#
#   ./scripts/install-mopro-toolchain.sh
#
# Zig is needed since mopro 0.3.7: the barretenberg-rs prebuilt that noir-rs
# v1.0.0-beta.19 links is built against Zig's libc++ (std::__1), so the
# Android library must be linked with Zig; the NDK's libc++ (std::__ndk1) is
# ABI-incompatible. mopro's own CI uses Zig 0.16.0. Zig goes to
# ~/.zig/<version>/ (checked against ziglang.org's published SHA-256) so it
# does not displace another Zig on PATH; mopro_build.sh puts it first.
#
# uniffi-bindgen-react-native generates the TypeScript bindings. mopro installs
# it only when it is missing, from zkmopro's fork at whatever main is that day,
# so an old copy stays forever: on 2026-10-22 the one from mopro 0.3.2 (uniffi
# 0.31) read 0.32 metadata and died with "Unexpected metadata type code: 110".
# It is pinned to fork commit f110658 (2026-07-08): uniffi 0.32.0, the version
# mopro 0.3.7 pins, and the commit mopro's own React Native example was
# regenerated with, locking the JS runtime at 0.31.0-3. Later fork commits
# (from 2026-07-23) emit TypeScript that imports `Cursor`, which no 0.31.0-3
# runtime exports, while the template's podspec still demands 0.31.0-3 -- so
# generator and runtime stop matching. Replaced when the installed commit
# differs.
set -eu

MOPRO_CLI_VERSION=0.3.7
ZIG_VERSION=0.16.0
UBRN_GIT=https://github.com/zkmopro/uniffi-bindgen-react-native
UBRN_REV=f110658c9dc5d8ee7481341fff1165e4532c2c27

# rustup puts cargo in ~/.cargo/bin and edits only interactive shell profiles.
command -v cargo >/dev/null 2>&1 || PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
command -v cargo >/dev/null 2>&1 || { echo "cargo not found; install Rust (rustup)" >&2; exit 1; }
cargo install mopro-cli --version "$MOPRO_CLI_VERSION" --locked
if ! cargo install --list | grep -q "^uniffi-bindgen-react-native .*#${UBRN_REV:0:8}"; then
  cargo install --git "$UBRN_GIT" --rev "$UBRN_REV" --locked --force uniffi-bindgen-react-native
fi

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  ZIG_TARGET=aarch64-macos ;;
  Darwin-x86_64) ZIG_TARGET=x86_64-macos ;;
  Linux-x86_64)  ZIG_TARGET=x86_64-linux ;;
  Linux-aarch64) ZIG_TARGET=aarch64-linux ;;
  *) echo "No Zig build known for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

ZIG_DIR="$HOME/.zig/$ZIG_VERSION"
if [ ! -x "$ZIG_DIR/zig" ]; then
  meta=$(curl -fsSL https://ziglang.org/download/index.json | python3 -c "
import json, sys
d = json.load(sys.stdin)['$ZIG_VERSION']['$ZIG_TARGET']
print(d['tarball'], d['shasum'])")
  url=${meta% *}; sum=${meta#* }
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "$url" -o "$tmp/zig.tar.xz"
  got=$(shasum -a 256 "$tmp/zig.tar.xz" | awk '{print $1}')
  [ "$got" = "$sum" ] || { echo "Zig tarball SHA-256 $got, expected $sum" >&2; exit 1; }
  mkdir -p "$ZIG_DIR"
  tar -xJf "$tmp/zig.tar.xz" -C "$ZIG_DIR" --strip-components 1
fi
echo "mopro $(mopro --version), ubrn ${UBRN_REV:0:8}, zig $("$ZIG_DIR/zig" version)"
