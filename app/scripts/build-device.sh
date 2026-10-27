#!/bin/bash
# Build a Release KProof app for a physical iPhone and install it.
#
#   scripts/build-device.sh <device-udid> <staging>
#
# Prerequisites:
#   - app/mopro_bindings built (../scripts/mopro_build.sh) and `npm install`,
#     `bundle exec pod install` done in app/ and app/ios/
#   - ASC_KEY_ID / ASC_ISSUER_ID / ASC_API_KEY in the environment, for
#     scripts/dev-profile.py (registers the app id and installs the
#     "KProof Development" profile for this device; idempotent)
#   - the device paired and unlocked (`xcrun devicectl list devices`)
#
# Release embeds the JS bundle, so no Metro is involved. The environment is the
# one src/config/buildEnv.ts names; this script refuses to build when that is
# not the environment asked for. Only arm64 is built: the prover ships arm64 only.
set -euo pipefail

UDID="${1:-}"
APP_ENV_NAME="${2:-}"
if [ -z "$UDID" ] || [ -z "$APP_ENV_NAME" ]; then
  echo "Usage: $0 <device-udid> <staging>" >&2
  exit 2
fi
case "$APP_ENV_NAME" in
  staging) ;;
  *) echo "Unknown environment '$APP_ENV_NAME'. Known: staging." >&2; exit 2 ;;
esac

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if ! grep -q "BUILD_ENV: EnvName = '$APP_ENV_NAME';" "$APP_DIR/src/config/buildEnv.ts"; then
  echo "src/config/buildEnv.ts does not name '$APP_ENV_NAME':" >&2
  grep -n "BUILD_ENV" "$APP_DIR/src/config/buildEnv.ts" >&2
  exit 1
fi
LOG_DIR="${TMPDIR:-/tmp}/kproof-device-build"
mkdir -p "$LOG_DIR"

eval "$(python3 "$APP_DIR/scripts/dev-profile.py" "$UDID" | grep -E '^(PROFILE_NAME|PROFILE_UUID|TEAM_ID)=' | sed 's/^\([A-Z_]*\)=\(.*\)$/\1="\2"/')"
[ -n "${PROFILE_UUID:-}" ] || { echo "dev-profile.py did not return a profile" >&2; exit 1; }

DERIVED="$APP_DIR/ios/build/device"
echo "Building Release for $UDID with profile $PROFILE_NAME ($PROFILE_UUID); log: $LOG_DIR/xcodebuild.log"
# Xcode's script phases (Hermes, bundling) run Node and inherit NODE_OPTIONS.
# A terminal wrapper can leave a --require there that points at a file which no
# longer exists, and every Node call then dies with MODULE_NOT_FOUND inside
# the "Replace Hermes" phase (seen 2026-10-27). The build needs no NODE_OPTIONS.
(cd "$APP_DIR/ios" && env -u NODE_OPTIONS xcodebuild \
  -workspace KProof.xcworkspace -scheme KProof -configuration Release \
  -sdk iphoneos -destination "id=$UDID" -derivedDataPath "$DERIVED" \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_IDENTITY="Apple Development" PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME" \
  build > "$LOG_DIR/xcodebuild.log" 2>&1) || { echo "xcodebuild failed; tail of $LOG_DIR/xcodebuild.log:" >&2; tail -40 "$LOG_DIR/xcodebuild.log" >&2; exit 1; }

APP="$DERIVED/Build/Products/Release-iphoneos/KProof.app"
# Never trust the "BUILD SUCCEEDED" line alone: check the artifact and its signature.
[ -x "$APP/KProof" ] || { echo "No app binary at $APP" >&2; exit 1; }
# Captured first: `codesign | grep -q` under pipefail fails when grep exits
# early and codesign takes SIGPIPE, which read as "not signed" on 2026-10-27.
SIGNATURE="$(codesign -dv "$APP" 2>&1)"
case "$SIGNATURE" in
  *"TeamIdentifier=$TEAM_ID"*) ;;
  *) echo "$APP is not signed by team $TEAM_ID:" >&2; echo "$SIGNATURE" >&2; exit 1 ;;
esac
[ -f "$APP/main.jsbundle" ] || { echo "$APP has no embedded main.jsbundle" >&2; exit 1; }
echo "Built $APP ($(du -sh "$APP" | cut -f1)), signed by $TEAM_ID"

xcrun devicectl device install app --device "$UDID" "$APP" > "$LOG_DIR/install.log" 2>&1 || { cat "$LOG_DIR/install.log" >&2; exit 1; }
grep -q "App installed" "$LOG_DIR/install.log" || { cat "$LOG_DIR/install.log" >&2; exit 1; }
echo "Installed on $UDID"
