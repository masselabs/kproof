#!/bin/bash
# Build a Release KProof app for an iOS simulator and install it there.
#
#   scripts/build-simulator.sh <simulator-udid> <staging>
#
# Prerequisites: the same as scripts/build-device.sh (mopro_bindings built --
# the xcframework's ios-arm64-simulator slice --, `npm install` in app/ and the
# repository root, `bundle exec pod install` in app/ios/). No certificate and no
# App Store Connect keys are needed: the app is signed "to run locally" (ad hoc).
# Do not turn signing off. An unsigned app carries no application-identifier
# entitlement, so every Keychain call fails with -34018, the vault can never be
# read, and the lock screen answers E4003 on every unlock (seen 2026-10-28).
#
# Face ID on the simulator, without the host's mouse or keyboard:
#   xcrun simctl spawn <udid> notifyutil -s com.apple.BiometricKit.enrollmentChanged 1
#   xcrun simctl spawn <udid> notifyutil -p com.apple.BiometricKit.enrollmentChanged
#   xcrun simctl spawn <udid> notifyutil -p com.apple.BiometricKit_Sim.pearl.match  # while the prompt is up
#
# Release embeds the JS bundle, so no Metro is involved: the build does not
# depend on, or collide with, a packager another project has on port 8081.
# Only arm64 is built: the prover ships arm64 only.
#
# The simulator must be booted (`xcrun simctl boot <udid>`). Drive it with
# `xcrun simctl` (openurl, io screenshot) or idb touches sent to the device,
# never with the host's mouse or keyboard.
set -euo pipefail

UDID="${1:-}"
APP_ENV_NAME="${2:-}"
if [ -z "$UDID" ] || [ -z "$APP_ENV_NAME" ]; then
  echo "Usage: $0 <simulator-udid> <staging>" >&2
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
STATE="$(xcrun simctl list devices | grep -F "($UDID)" || true)"
case "$STATE" in
  *"(Booted)"*) ;;
  "") echo "No simulator $UDID (xcrun simctl list devices)" >&2; exit 1 ;;
  *) echo "Simulator $UDID is not booted: $STATE" >&2; exit 1 ;;
esac
LOG_DIR="${TMPDIR:-/tmp}/kproof-simulator-build"
mkdir -p "$LOG_DIR"

REPO="$(git -C "$APP_DIR" rev-parse --show-toplevel)"
(cd "$REPO" && env -u NODE_OPTIONS npm run build -w sdk > "$LOG_DIR/sdk-build.log" 2>&1) || { echo "SDK build failed:" >&2; cat "$LOG_DIR/sdk-build.log" >&2; exit 1; }
[ -f "$REPO/sdk/dist/index.js" ] || { echo "SDK build left no sdk/dist/index.js" >&2; exit 1; }

DERIVED="$APP_DIR/ios/build/simulator"
echo "Building Release for simulator $UDID; log: $LOG_DIR/xcodebuild.log"
# No NODE_OPTIONS for the script phases: see scripts/build-device.sh.
(cd "$APP_DIR/ios" && env -u NODE_OPTIONS xcodebuild \
  -workspace KProof.xcworkspace -scheme KProof -configuration Release \
  -sdk iphonesimulator -destination "id=$UDID" -derivedDataPath "$DERIVED" \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= \
  build > "$LOG_DIR/xcodebuild.log" 2>&1) || { echo "xcodebuild failed; tail of $LOG_DIR/xcodebuild.log:" >&2; tail -40 "$LOG_DIR/xcodebuild.log" >&2; exit 1; }

APP="$DERIVED/Build/Products/Release-iphonesimulator/KProof.app"
# Never trust the "BUILD SUCCEEDED" line alone: check the artifact.
[ -x "$APP/KProof" ] || { echo "No app binary at $APP" >&2; exit 1; }
[ -f "$APP/main.jsbundle" ] || { echo "$APP has no embedded main.jsbundle" >&2; exit 1; }
# A simulator build carries its entitlements in the binary's __TEXT,__entitlements
# section, not in the (ad hoc) signature, so read them from there.
ENTITLEMENTS="$(segedit "$APP/KProof" -extract __TEXT __entitlements /dev/stdout 2>&1 || true)"
case "$ENTITLEMENTS" in
  *application-identifier*) ;;
  *) echo "$APP has no application-identifier entitlement; the Keychain will refuse it:" >&2; echo "$ENTITLEMENTS" >&2; exit 1 ;;
esac
echo "Built $APP ($(du -sh "$APP" | cut -f1))"

xcrun simctl install "$UDID" "$APP"
xcrun simctl get_app_container "$UDID" com.masselabs.kproof > /dev/null || { echo "com.masselabs.kproof is not installed on $UDID after install" >&2; exit 1; }
echo "Installed on $UDID"
