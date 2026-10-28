#!/bin/bash
# Archive a Release KProof build and upload it to TestFlight.
#
#   scripts/testflight.sh <staging>
#
# Prerequisites:
#   - the same as scripts/build-device.sh (mopro_bindings built, npm install in
#     app/ and the repository root, bundle exec pod install in app/ios/)
#   - the App Store Connect app for com.masselabs.kproof, created by a person on
#     appstoreconnect.apple.com (the API cannot create apps)
#   - the team's Apple Distribution certificate with its private key in this
#     Mac's keychain
#   - ASC_KEY_ID / ASC_ISSUER_ID / ASC_API_KEY (base64 of the .p8) in the
#     environment: scripts/appstore-profile.py uses them for the profile and the
#     build number, and xcodebuild uses them for the upload
#
# The build number is one above the highest build App Store Connect has, so
# every upload is accepted; the version is MARKETING_VERSION in the project.
# The environment is the one src/config/buildEnv.ts names; this script refuses
# to build when that is not the environment asked for.
set -euo pipefail

APP_ENV_NAME="${1:-}"
if [ -z "$APP_ENV_NAME" ]; then
  echo "Usage: $0 <staging>" >&2
  exit 2
fi
case "$APP_ENV_NAME" in
  staging) ;;
  *) echo "Unknown environment '$APP_ENV_NAME'. Known: staging." >&2; exit 2 ;;
esac
for v in ASC_KEY_ID ASC_ISSUER_ID ASC_API_KEY; do
  [ -n "${!v:-}" ] || { echo "$v is not set" >&2; exit 1; }
done

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if ! grep -q "BUILD_ENV: EnvName = '$APP_ENV_NAME';" "$APP_DIR/src/config/buildEnv.ts"; then
  echo "src/config/buildEnv.ts does not name '$APP_ENV_NAME':" >&2
  grep -n "BUILD_ENV" "$APP_DIR/src/config/buildEnv.ts" >&2
  exit 1
fi
WORK="$(mktemp -d "${TMPDIR:-/tmp}/kproof-testflight.XXXXXX")"
KEY_FILE="$WORK/AuthKey_${ASC_KEY_ID}.p8"
trap 'rm -f "$KEY_FILE"' EXIT
echo "Logs: $WORK"

REPO="$(git -C "$APP_DIR" rev-parse --show-toplevel)"
(cd "$REPO" && env -u NODE_OPTIONS npm run build -w sdk > "$WORK/sdk-build.log" 2>&1) || { echo "SDK build failed:" >&2; cat "$WORK/sdk-build.log" >&2; exit 1; }
[ -f "$REPO/sdk/dist/index.js" ] || { echo "SDK build left no sdk/dist/index.js" >&2; exit 1; }

PROFILE_OUT="$(python3 "$APP_DIR/scripts/appstore-profile.py")" || { echo "$PROFILE_OUT" >&2; exit 1; }
echo "$PROFILE_OUT" | grep -vE '^(PROFILE_NAME|PROFILE_UUID|TEAM_ID|APP_ID|BUILD_NUMBER)='
eval "$(echo "$PROFILE_OUT" | grep -E '^(PROFILE_NAME|PROFILE_UUID|TEAM_ID|APP_ID|BUILD_NUMBER)=' | sed 's/^\([A-Z_]*\)=\(.*\)$/\1="\2"/')"
for v in PROFILE_NAME PROFILE_UUID TEAM_ID APP_ID BUILD_NUMBER; do
  [ -n "${!v:-}" ] || { echo "appstore-profile.py did not return $v" >&2; exit 1; }
done

VERSION="$(sed -n 's/.*MARKETING_VERSION = \(.*\);/\1/p' "$APP_DIR/ios/KProof.xcodeproj/project.pbxproj" | sort -u)"
[ "$(echo "$VERSION" | wc -l | tr -d ' ')" = 1 ] || { echo "MARKETING_VERSION differs between configurations: $VERSION" >&2; exit 1; }
ARCHIVE="$WORK/KProof.xcarchive"
echo "Archiving KProof $VERSION ($BUILD_NUMBER) with profile $PROFILE_NAME ($PROFILE_UUID)"
# NODE_OPTIONS is dropped for the reason given in scripts/build-device.sh.
(cd "$APP_DIR/ios" && env -u NODE_OPTIONS xcodebuild \
  -workspace KProof.xcworkspace -scheme KProof -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  ARCHS=arm64 \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_IDENTITY="Apple Distribution" PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  archive > "$WORK/archive.log" 2>&1) || { echo "archive failed; tail of $WORK/archive.log:" >&2; tail -40 "$WORK/archive.log" >&2; exit 1; }

APP="$ARCHIVE/Products/Applications/KProof.app"
[ -x "$APP/KProof" ] || { echo "No app binary at $APP" >&2; exit 1; }
[ -f "$APP/main.jsbundle" ] || { echo "$APP has no embedded main.jsbundle" >&2; exit 1; }
BUILT="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist")"
[ "$BUILT" = "$BUILD_NUMBER" ] || { echo "archived build number is $BUILT, expected $BUILD_NUMBER" >&2; exit 1; }
SIGNATURE="$(codesign -dv "$APP" 2>&1)"
case "$SIGNATURE" in
  *"TeamIdentifier=$TEAM_ID"*) ;;
  *) echo "$APP is not signed by team $TEAM_ID:" >&2; echo "$SIGNATURE" >&2; exit 1 ;;
esac

printf '%s' "$ASC_API_KEY" | base64 --decode > "$KEY_FILE"
chmod 600 "$KEY_FILE"
cat > "$WORK/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key>
  <dict><key>com.masselabs.kproof</key><string>$PROFILE_NAME</string></dict>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

echo "Uploading to App Store Connect (app $APP_ID)"
# Apple's gateway sometimes answers 502/503/504; xcodebuild then reports
# "No Accounts with App Store Connect Access", which reads like a missing
# account and is not one (seen 2026-10-28, Gateway Timeout). Retry only that.
attempt=1
until env -u NODE_OPTIONS xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$WORK/ExportOptions.plist" -exportPath "$WORK/export" \
  -authenticationKeyPath "$KEY_FILE" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  > "$WORK/upload.log" 2>&1; do
  if [ "$attempt" -lt 4 ] && grep -q "Gateway Timeout\|Bad Gateway\|Service Unavailable" "$WORK/upload.log"; then
    cp "$WORK/upload.log" "$WORK/upload.$attempt.log"
    echo "App Store Connect gateway error (attempt $attempt); retrying in $((attempt * 30))s"
    sleep $((attempt * 30))
    attempt=$((attempt + 1))
    continue
  fi
  echo "upload failed; tail of $WORK/upload.log:" >&2; tail -40 "$WORK/upload.log" >&2; exit 1
done
# xcodebuild's exit code is not the evidence: the log must say the upload succeeded.
grep -q "Upload succeeded\|EXPORT SUCCEEDED" "$WORK/upload.log" || { echo "no upload confirmation in $WORK/upload.log:" >&2; tail -40 "$WORK/upload.log" >&2; exit 1; }
echo "Uploaded KProof $VERSION ($BUILD_NUMBER); waiting for App Store Connect to list it"
# The upload log is not the end of it: App Store Connect must show the build.
APP_DIR="$APP_DIR" APP_ID="$APP_ID" BUILD_NUMBER="$BUILD_NUMBER" python3 - <<'PY'
import os, sys, time
sys.path.insert(0, os.path.join(os.environ['APP_DIR'], 'scripts'))
from asc_api import get
app, number = os.environ['APP_ID'], os.environ['BUILD_NUMBER']
deadline = time.time() + 30 * 60
state = None
while time.time() < deadline:
    found = [b for b in get(f'/v1/builds?filter[app]={app}&filter[version]={number}&limit=5')['data']]
    if found:
        state = found[0]['attributes'].get('processingState')
        if state == 'VALID':
            print(f'App Store Connect: build {number} is VALID and ready for TestFlight')
            sys.exit(0)
        if state in ('FAILED', 'INVALID'):
            sys.exit(f'App Store Connect: build {number} is {state}')
    time.sleep(30)
sys.exit(f'App Store Connect did not finish build {number} within 30 minutes (last state: {state})')
PY
