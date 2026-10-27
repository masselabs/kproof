# @kproof/sdk

**English** | [한국어](README.ko.md)

Ask a KProof user for a Korea Mobile ID proof, wait for the answer, and verify
it. Used by the demo in this repository; not published to npm yet.

```ts
import { RelayClient, NETWORKS, buildInputs, verifyAnswer } from '@kproof/sdk';

const relay = new RelayClient({ apiUrl: NETWORKS.staging.relayUrl });
const inputs = buildInputs('mdl_kr_age', { scope: 'my-service:signup', ageThreshold: 19 });
const { requestId, deepLink } = await relay.createRequest('mdl_kr_age', inputs, 'My service');
// Show deepLink as a QR code or a link that opens the KProof app.
relay.watch(requestId, async (status) => {
  if (status.status !== 'completed') return;
  const outcome = await verifyAnswer({ circuitId: 'mdl_kr_age', inputs }, status, { environment: 'staging' });
  // outcome.valid, outcome.checks (every check, passed or not), outcome.nullifier
}, console.error);
```

## What `verifyAnswer` checks

Every check is returned, passed or not; `valid` is true only when all pass.

| Check | Refuses |
|---|---|
| status | an answer that is not `completed` (nothing else is checked) |
| circuit | an answer for another circuit than the request's |
| public_input_count | the wrong number of public inputs for the circuit (97 / 66 / 96) |
| public_input_format | a word that is not 32-byte hex, a proof that is not hex |
| scope | a proof made for another scope (keccak256 of the UTF-8 scope) |
| age_threshold | a proof for another age than requested |
| current_year | a year other than this Korean year (last year only within a day of New Year) |
| region | a proof for another si/do (keccak256 of the name zero-padded to 64 bytes) |
| on_chain | anything but an explicit `true` from the circuit's verifier on Base Sepolia |

**Not checked yet: that a government issued the ID data.** The mobile ID
circuits do not verify an issuer signature until the KOMSCO message spec is
read, so `issuerVerified` is always `false`.

Unknown circuit ids and environments throw by name. There is no production
environment yet.

## Tests

```bash
npm test            # unit (mocked RPC), every check passing and failing
npm run test:e2e    # real proofs (fixtures/) against the deployed verifiers
```

`fixtures/mdl_*` are the proofs zkproofport/circuits builds for each circuit;
they verify on chain (`circuits/scripts/verify-onchain.sh`, 2026-10-27).
