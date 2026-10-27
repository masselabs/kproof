#!/usr/bin/env python3
"""Register the KProof app id and install a development profile for one device.

    ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_API_KEY=... \\
      python3 scripts/dev-profile.py <device-udid>

Steps, each idempotent (an existing item is reused, never duplicated):
  1. bundle id com.masselabs.kproof (platform IOS), created if missing
  2. the device, which must already be registered on the team (this script
     does not add devices: a device slot is a yearly quota, so adding one is
     a decision for a person)
  3. a development certificate whose private key is in this Mac's keychain,
     matched by SHA-1 against `security find-identity`
  4. an IOS_APP_DEVELOPMENT profile named "KProof Development" for exactly
     that bundle id, certificate and device, replaced when it does not list
     the device or certificate, written to
     ~/Library/Developer/Xcode/UserData/Provisioning Profiles/<uuid>.mobileprovision

Prints the profile name and UUID for the xcodebuild call.
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
APP_NAME = 'KProof'
TEAM_ID = 'R4G32CVY29'
PROFILE_NAME = 'KProof Development'
PROFILE_DIR = os.path.join(os.path.expanduser('~'), 'Library', 'Developer', 'Xcode', 'UserData', 'Provisioning Profiles')


def local_identity_sha1s() -> set[str]:
    out = subprocess.run(['security', 'find-identity', '-v', '-p', 'codesigning'], capture_output=True, text=True, check=True).stdout
    return {line.split()[1].upper() for line in out.splitlines() if '"Apple Development' in line}


def bundle_id() -> str:
    found = get(f'/v1/bundleIds?filter[identifier]={BUNDLE_ID}&limit=5')['data']
    exact = [b for b in found if b['attributes']['identifier'] == BUNDLE_ID]
    if exact:
        print(f'bundle id {BUNDLE_ID}: exists ({exact[0]["id"]})')
        return exact[0]['id']
    created = request('POST', '/v1/bundleIds', {'data': {'type': 'bundleIds', 'attributes': {
        'identifier': BUNDLE_ID, 'name': APP_NAME, 'platform': 'IOS'}}})['data']
    print(f'bundle id {BUNDLE_ID}: created ({created["id"]})')
    return created['id']


def device(udid: str) -> str:
    found = get(f'/v1/devices?filter[udid]={udid}&limit=5')['data']
    if not found:
        sys.exit(f'device {udid} is not registered on team {TEAM_ID}; register it in the developer portal first')
    d = found[0]
    if d['attributes']['status'] != 'ENABLED':
        sys.exit(f'device {udid} is {d["attributes"]["status"]}, not ENABLED')
    print(f'device {udid}: {d["attributes"]["name"]} ({d["id"]})')
    return d['id']


def certificate() -> str:
    local = local_identity_sha1s()
    certs = get('/v1/certificates?filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT&limit=50')['data']
    for c in certs:
        der = base64.b64decode(c['attributes']['certificateContent'])
        sha1 = hashlib.sha1(der).hexdigest().upper()
        if sha1 in local:
            print(f'certificate: {c["attributes"]["name"]} ({c["id"]}), private key in this keychain')
            return c['id']
    sys.exit('no development certificate of this team has its private key in this keychain; '
             f'team certificates: {", ".join(c["attributes"]["name"] for c in certs) or "none"}')


def profile(bundle: str, cert: str, dev: str) -> tuple[str, str]:
    existing = get(f'/v1/profiles?filter[name]={PROFILE_NAME.replace(" ", "%20")}&include=devices,certificates&limit=10')
    for p in existing['data']:
        rel = p['relationships']
        devs = {r['id'] for r in rel['devices']['data']}
        certs = {r['id'] for r in rel['certificates']['data']}
        if p['attributes']['profileState'] == 'ACTIVE' and dev in devs and cert in certs:
            print(f'profile "{PROFILE_NAME}": reusing ({p["id"]})')
            return write(p['attributes'])
        print(f'profile "{PROFILE_NAME}" ({p["id"]}) lacks this device or certificate; deleting it')
        request('DELETE', f'/v1/profiles/{p["id"]}')
    created = request('POST', '/v1/profiles', {'data': {
        'type': 'profiles',
        'attributes': {'name': PROFILE_NAME, 'profileType': 'IOS_APP_DEVELOPMENT'},
        'relationships': {
            'bundleId': {'data': {'type': 'bundleIds', 'id': bundle}},
            'certificates': {'data': [{'type': 'certificates', 'id': cert}]},
            'devices': {'data': [{'type': 'devices', 'id': dev}]},
        },
    }})['data']
    print(f'profile "{PROFILE_NAME}": created ({created["id"]})')
    return write(created['attributes'])


def write(attrs: dict) -> tuple[str, str]:
    content = base64.b64decode(attrs['profileContent'])
    signed = subprocess.run(['security', 'cms', '-D'], input=content, capture_output=True, check=True).stdout
    plist = plistlib.loads(signed)
    if plist.get('TeamIdentifier') != [TEAM_ID]:
        sys.exit(f'profile team is {plist.get("TeamIdentifier")}, expected {TEAM_ID}')
    app_id = plist['Entitlements']['application-identifier']
    if app_id != f'{TEAM_ID}.{BUNDLE_ID}':
        sys.exit(f'profile is for {app_id}, expected {TEAM_ID}.{BUNDLE_ID}')
    os.makedirs(PROFILE_DIR, exist_ok=True)
    path = os.path.join(PROFILE_DIR, f'{plist["UUID"]}.mobileprovision')
    with open(path, 'wb') as fh:
        fh.write(content)
    print(f'installed {plist["Name"]} {plist["UUID"]} (expires {plist["ExpirationDate"]:%Y-%m-%d})')
    return plist['Name'], plist['UUID']


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit('usage: dev-profile.py <device-udid>')
    udid = sys.argv[1]
    bundle = bundle_id()
    dev = device(udid)
    cert = certificate()
    name, uuid = profile(bundle, cert, dev)
    print(f'PROFILE_NAME={name}\nPROFILE_UUID={uuid}\nTEAM_ID={TEAM_ID}')


if __name__ == '__main__':
    main()
