# @kproof/sdk

**English** | [한국어](README.ko.md)

Ask a KProof user for a Korea Mobile ID proof, wait for the answer, and verify
it. Used by the demo and the app in this repository.

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

Unknown circuit ids and environments throw by name.

## Off-chain verification

```ts
import { verifyOffChain } from '@kproof/sdk/offchain';

const { valid, ms } = await verifyOffChain('mdl_kr_age', status.proof, status.publicInputs);
```

Checks the proof against the circuit's verification key where the caller runs,
with no chain involved. The key is read from this repository at the commit the
app downloads circuits from and refused unless its SHA-256 matches the one
pinned in `CIRCUITS`. The verifier (about 3 MB) loads on the first call only,
so importing the package index never pulls it in. It rejects, naming the
reason, when the check cannot run: an unknown circuit, a proof or public inputs
of the wrong shape, a key that cannot be read or does not match.

## Tests

```bash
npm test            # unit (mocked RPC), every check passing and failing; off-chain on the real fixtures
npm run test:e2e    # real proofs (fixtures/) against the deployed verifiers
```

`fixtures/mdl_*` are the proofs zkproofport/circuits builds for each circuit;
they verify on chain (`circuits/scripts/verify-onchain.sh`, 2026-10-27).
