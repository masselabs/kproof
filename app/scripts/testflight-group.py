#!/usr/bin/env python3
"""Give KProof the same internal TestFlight group ZKProofport has.

    ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_API_KEY=... python3 scripts/testflight-group.py

Idempotent: creates the internal group "Internal" (access to every build) on
the KProof app when missing, and adds the members of ZKProofport's "Internal"
group that are not in it yet. Internal testers must be App Store Connect users
of the team, which ZKProofport's already are.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_api import get, request  # noqa: E402

GROUP = 'Internal'


def app(bundle: str) -> str:
    found = [a for a in get(f'/v1/apps?filter[bundleId]={bundle}&limit=5')['data'] if a['attributes']['bundleId'] == bundle]
    if not found:
        sys.exit(f'no App Store Connect app for {bundle}')
    return found[0]['id']


def group(app_id: str) -> str | None:
    found = [g for g in get(f'/v1/apps/{app_id}/betaGroups?limit=50')['data'] if g['attributes']['name'] == GROUP]
    return found[0]['id'] if found else None


def testers(group_id: str) -> dict[str, str]:
    return {t['id']: t['attributes'].get('email') for t in get(f'/v1/betaGroups/{group_id}/betaTesters?limit=200')['data']}


def main() -> None:
    source = group(app('com.masselabs.zkproofport'))
    if source is None:
        # Seen 2026-10-27: App Store Connect once answered an empty group list
        # for an app that has the group. Absence is not trusted on one read.
        sys.exit(f'App Store Connect listed no "{GROUP}" group for ZKProofport; run again before concluding it is gone')
    kproof = app('com.masselabs.kproof')
    target = group(kproof)
    if target is None:
        target = request('POST', '/v1/betaGroups', {'data': {
            'type': 'betaGroups',
            'attributes': {'name': GROUP, 'isInternalGroup': True, 'hasAccessToAllBuilds': True},
            'relationships': {'app': {'data': {'type': 'apps', 'id': kproof}}},
        }})['data']['id']
        print(f'group "{GROUP}": created ({target})')
    else:
        print(f'group "{GROUP}": exists ({target})')
    want = testers(source)
    if not want:
        sys.exit(f'App Store Connect listed no testers in ZKProofport\'s "{GROUP}" group; run again before concluding it is empty')
    have = testers(target)
    # POST to the group's betaTesters relationship answers 409 "Tester(s) cannot
    # be assigned" for an internal group; creating the tester with the group
    # attached is the call App Store Connect accepts. A 409 here can also mean
    # "already there", so the group is read back below instead of trusting it.
    for tester_id, email in want.items():
        if tester_id in have or email in have.values():
            continue
        try:
            request('POST', '/v1/betaTesters', {'data': {
                'type': 'betaTesters',
                'attributes': {'email': email},
                'relationships': {'betaGroups': {'data': [{'type': 'betaGroups', 'id': target}]}},
            }})
            print(f'added {email}')
        except SystemExit as err:
            print(f'{email}: {err}')
    final = testers(target)
    print(f'testers in "{GROUP}": {len(final)} ({", ".join(sorted(e or "?" for e in final.values()))})')
    missing = sorted(set(want.values()) - set(final.values()))
    if missing:
        sys.exit(f'not in "{GROUP}": {", ".join(missing)}')


if __name__ == '__main__':
    main()
