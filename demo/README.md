# KProof demo

**English** | [한국어](README.ko.md)

A static page that plays the part of a service asking for a Korea Mobile ID
proof, built on `@kproof/sdk` (`../sdk`). It picks a question (ID ownership, minimum age, or si/do of residence),
asks kproof-server's relay for a request, shows the deep link as a QR code and
a button, and waits for the KProof app's answer over Socket.IO, polling as a
fallback. When an answer arrives, the page verifies it twice and shows each
result as it settles: off-chain in the browser against the circuit's
verification key, and on-chain through the circuit's verifier contract on Base
Sepolia (chain and contract address shown), followed by every other check
(scope, age or region, year).

Staging: https://stg-demo.koreanproof.com, talking to https://stg-api.koreanproof.com.

## Tabs

The tab comes from `?tab=` (`src/tabs.ts`): the bare address is the proof
request demo above; `?tab=cu` is the CU × KProof checkout; any other value
shows an unknown-tab panel naming it, never another tab. Switching tabs keeps
each tab's state and the address, and Back/Forward return to the previous tab.

The CU checkout (`src/cu/`, React, loaded on first open) sells one age-19+ item:
it asks for an `mdl_kr_age` proof with `ageThreshold: 19` and a fresh scope
(`kproof-demo:cu:checkout:<uuid>`), shows the QR and the app link, and opens the
received proof two seconds after it arrives. The buyer then verifies it
on-chain (which completes a dKRW payment receipt, presentation only: no wallet,
no transfer) or off-chain in the browser; both first refuse an answer that is
not for this request (`checkAnswer` in the SDK) without calling a verifier.
Korean and English, chosen in the checkout and kept in local storage. It uses
the same relay and environment as the rest of the page. Ported from
zkproofport/proofport-app-demo (20d631c, dca9e53, by hsy822).

## Build and run

The relay origin and the environment name are fixed at build time and have no
default; the build fails without them.

```bash
npm ci   # at the repository root (npm workspace)
VITE_KPROOF_API_URL=https://stg-api.koreanproof.com VITE_KPROOF_ENV=staging npm run dev
npm test                                           # unit tests (jsdom)
scripts/e2e.sh https://stg-api.koreanproof.com staging   # E2E, see below
```

`scripts/e2e.sh` builds the nginx image for that relay, serves it from a local
container and runs `e2e/` against the container and the real relay. The app's
side is played by posting to the relay's callback, as the app does. Set
`KPROOF_E2E_DEMO_URL` to test a deployed page instead of a local container.

Deploy: `.github/workflows/deploy-demo.yml` (workflow_dispatch, main only). It
checks that `/version.txt` on the public page reports the commit it built.

## What the tests hold

| Case | Where |
|---|---|
| Missing, non-https, path/query/credential relay URL; unknown environment name (incl. `toString`, `__proto__`) | `src/__tests__/config.test.ts` |
| Input rules, the relay client and answer verification | the SDK's own tests (`sdk/`) |
| Every SDK error code and check has Korean words; an unknown one throws | `src/__tests__/view.test.ts` |
| Server text never becomes markup; completed answers show proof size and input count, and say what is missing | `src/__tests__/view.test.ts` |
| Off-chain and on-chain lines: checking, passed with time / chain / contract, failed with the reason (verifier load failure, RPC failure, rejected proof); verified only when both pass | `src/__tests__/view.test.ts` |
| Both verifications start for a completed answer only; an older request's late result never overwrites a newer one; nothing draws after reset; a check that throws settles as failed | `src/__tests__/verification.test.ts` |
| Real relay: each circuit's deep link carries exactly the request built; app answers generating then cancelled reach the page; a second answer is refused; hostile error text stays data; unknown circuit and a completed answer without a proof are refused | `e2e/demo.e2e.test.ts` |
| A completed answer with a REAL proof: relay → SDK → Base Sepolia verifier returns true; only the unknown fixture scope fails | `e2e/demo.e2e.test.ts` |
| Served page: built for this relay only, CSP limits connections to the relay, the verification RPC and where verification keys are read, brand assets and font served | `e2e/demo.e2e.test.ts` |
| Tabs: bare address, each tab id, unknown values (empty, case, `toString`, `__proto__`, markup, UTF-8, 10 000 chars) never resolve to a tab; unknown text stays text; click, Back, modified click; CU loads once, lazily, and retries after a failed load; tab bar follows the checkout language | `src/__tests__/tabs.test.ts` |
| CU checkout: request shape and fresh scope, the page's relay and environment, the two-second hold, cancel/expire/unmount leaks, each verifier alone and both, mismatched scope/age/year/circuit and malformed answers refused before any verifier, verifier failure and timeout, the presentation receipt only after on-chain success, Korean/English | `src/__tests__/cu.test.tsx` |
| CU on the real relay: Korean and English request names reach the deep link exactly; a real proof made for another request is refused by `checkAnswer`; its assets and lazy chunk are served, and the chunk names no relay of its own | `e2e/demo.e2e.test.ts` |

Brand assets in `public/brand` and the Pretendard font in `public/fonts` come
from the KProof brand kit v1.0 (`masselabs/kproof-website` `brand/`, commit
`d6eb2c1`). The MIT license of this repository does not cover them; the font
is under the SIL Open Font License (`public/fonts/OFL.txt`).

`public/cu/` holds the CU tab's artwork: `cu-symbol.svg`, vector geometry from
the CU brand colour guide (CU marks belong to BGF Retail), and
`budweiser.png`, an unchanged Budweiser product photograph (rights belong to
AB InBev). Neither is covered by this repository's license.
