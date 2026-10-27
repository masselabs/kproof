#!/usr/bin/env python3
"""Install the App Store distribution profile for KProof and print the next build number.

    ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_API_KEY=... python3 scripts/appstore-profile.py

Steps, each idempotent:
  1. the App Store Connect app for com.masselabs.kproof, which a person creates
     on the App Store Connect website (the API cannot create apps)
  2. a DISTRIBUTION certificate of team R4G32CVY29 whose private key is in this
     Mac's keychain, matched by SHA-1 against `security find-identity`
  3. an IOS_APP_STORE profile named "KProof App Store" for that bundle id and
     certificate, replaced when it lists another certificate, written to
     ~/Library/Developer/Xcode/UserData/Provisioning Profiles/<uuid>.mobileprovision
  4. the next build number: one above the highest build App Store Connect has
     for the app (1 when there is none)

Prints PROFILE_NAME, PROFILE_UUID, TEAM_ID, APP_ID and BUILD_NUMBER lines.
"""
import base64
import hashlib
import os
import plistlib
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_api import get, request  # noqa: E402

BUNDLE_ID = 'com.masselabs.kproof'
TEAM_ID = 'R4G32CVY29'
PROFILE_NAME = 'KProof App Store'
PROFILE_DIR = os.path.join(os.path.expanduser('~'), 'Library', 'Developer', 'Xcode', 'UserData', 'Provisioning Profiles')


def local_distribution_sha1s() -> set[str]:
    out = subprocess.run(['security', 'find-identity', '-v', '-p', 'codesigning'], capture_output=True, text=True, check=True).stdout
    return {line.split()[1].upper() for line in out.splitlines() if f'"Apple Distribution:' in line and f'({TEAM_ID})"' in line}


def app_id() -> str:
    found = [a for a in get(f'/v1/apps?filter[bundleId]={BUNDLE_ID}&limit=5')['data'] if a['attributes']['bundleId'] == BUNDLE_ID]
    if not found:
        sys.exit(f'no App Store Connect app for {BUNDLE_ID}; create it on appstoreconnect.apple.com (Apps > + > New App)')
    print(f'app: {found[0]["attributes"]["name"]} ({found[0]["id"]})')
    return found[0]['id']


def bundle_id() -> str:
    found = [b for b in get(f'/v1/bundleIds?filter[identifier]={BUNDLE_ID}&limit=5')['data'] if b['attributes']['identifier'] == BUNDLE_ID]
    if not found:
        sys.exit(f'bundle id {BUNDLE_ID} is not registered; run scripts/dev-profile.py first')
    return found[0]['id']


def certificate() -> str:
    local = local_distribution_sha1s()
    certs = get('/v1/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION&limit=50')['data']
    for c in certs:
        sha1 = hashlib.sha1(base64.b64decode(c['attributes']['certificateContent'])).hexdigest().upper()
        if sha1 in local:
            print(f'certificate: {c["attributes"]["name"]} ({c["id"]}), private key in this keychain')
            return c['id']
    sys.exit('no distribution certificate of this team has its private key in this keychain; '
             f'team certificates: {", ".join(c["attributes"]["name"] for c in certs) or "none"}')


def profile(bundle: str, cert: str) -> tuple[str, str]:
    existing = get(f'/v1/profiles?filter[name]={PROFILE_NAME.replace(" ", "%20")}&include=certificates&limit=10')
    for p in existing['data']:
        certs = {r['id'] for r in p['relationships']['certificates']['data']}
        if p['attributes']['profileState'] == 'ACTIVE' and cert in certs:
            print(f'profile "{PROFILE_NAME}": reusing ({p["id"]})')
            return write(p['attributes'])
        print(f'profile "{PROFILE_NAME}" ({p["id"]}) is not active or lacks this certificate; deleting it')
        request('DELETE', f'/v1/profiles/{p["id"]}')
    created = request('POST', '/v1/profiles', {'data': {
        'type': 'profiles',
        'attributes': {'name': PROFILE_NAME, 'profileType': 'IOS_APP_STORE'},
        'relationships': {
            'bundleId': {'data': {'type': 'bundleIds', 'id': bundle}},
            'certificates': {'data': [{'type': 'certificates', 'id': cert}]},
        },
    }})['data']
    print(f'profile "{PROFILE_NAME}": created ({created["id"]})')
    return write(created['attributes'])


def write(attrs: dict) -> tuple[str, str]:
    content = base64.b64decode(attrs['profileContent'])
    plist = plistlib.loads(subprocess.run(['security', 'cms', '-D'], input=content, capture_output=True, check=True).stdout)
    if plist.get('TeamIdentifier') != [TEAM_ID]:
        sys.exit(f'profile team is {plist.get("TeamIdentifier")}, expected {TEAM_ID}')
    if plist['Entitlements']['application-identifier'] != f'{TEAM_ID}.{BUNDLE_ID}':
        sys.exit(f'profile is for {plist["Entitlements"]["application-identifier"]}, expected {TEAM_ID}.{BUNDLE_ID}')
    if plist.get('ProvisionedDevices'):
        sys.exit('profile lists devices: it is not an App Store profile')
    os.makedirs(PROFILE_DIR, exist_ok=True)
    with open(os.path.join(PROFILE_DIR, f'{plist["UUID"]}.mobileprovision'), 'wb') as fh:
        fh.write(content)
    print(f'installed {plist["Name"]} {plist["UUID"]} (expires {plist["ExpirationDate"]:%Y-%m-%d})')
    return plist['Name'], plist['UUID']


def next_build(app: str) -> int:
    builds = get(f'/v1/builds?filter[app]={app}&limit=200')['data']
    numbers = []
    for b in builds:
        v = b['attributes'].get('version', '')
        if not v.isdigit():
            sys.exit(f'build {b["id"]} has version {v!r}, not a whole number; this script numbers builds 1, 2, 3, ...')
        numbers.append(int(v))
    return max(numbers, default=0) + 1


def main() -> None:
    app = app_id()
    cert = certificate()
    name, uuid = profile(bundle_id(), cert)
    print(f'PROFILE_NAME={name}\nPROFILE_UUID={uuid}\nTEAM_ID={TEAM_ID}\nAPP_ID={app}\nBUILD_NUMBER={next_build(app)}')


if __name__ == '__main__':
    main()
