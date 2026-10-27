# KProof demo

**English** | [한국어](README.ko.md)

A static page that plays the part of a service asking for a Korea Mobile ID
proof. It picks a question (ID ownership, minimum age, or si/do of residence),
asks kproof-server's relay for a request, shows the deep link as a QR code and
a button, and waits for the KProof app's answer over Socket.IO, polling as a
fallback. The app does not exist yet, so a real request ends at "waiting".

Staging: https://stg-demo.koreanproof.com, talking to https://stg-api.koreanproof.com.

## Build and run

The relay origin and the environment name are fixed at build time and have no
default; the build fails without them.

```bash
npm ci
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
| Empty, whitespace-only, 256 vs 257 characters (counted as characters, so emoji count once), Korean and mixed scripts, control characters incl. U+2028, SQL/HTML/wildcard text kept verbatim | `src/__tests__/requests.test.ts` |
| Age 0, 1, 150, 151, decimals, exponent, full-width digits; si/do outside the current list (전라북도 is refused, 전북특별자치도 accepted) | `src/__tests__/requests.test.ts` |
| Exact request body sent to the relay; 400/429/502/network failure messages; missing fields in answers; request id encoded in the poll URL | `src/__tests__/relay.test.ts` |
| Socket terminal answer stops polling; other requests' events ignored; 5xx and network errors keep polling; 404 becomes expired; unknown status refused | `src/__tests__/relay.test.ts` |
| Server text never becomes markup; completed answers show proof size and input count, and say what is missing | `src/__tests__/view.test.ts` |
| Real relay: each circuit's deep link carries exactly the request built; app answers generating then cancelled reach the page; a second answer is refused; hostile error text stays data; unknown circuit and a completed answer without a proof are refused | `e2e/demo.e2e.test.ts` |
| Served page: built for this relay only, CSP limits connections to it, brand assets and font served | `e2e/demo.e2e.test.ts` |

Not covered: verifying a proof (there is no KProof verifier yet; the page says
so), and a real phone answering (no app yet).

Brand assets in `public/brand` and the Pretendard font in `public/fonts` come
from the KProof brand kit v1.0 (`masselabs/kproof-website` `brand/`, commit
`d6eb2c1`). The MIT license of this repository does not cover them; the font
is under the SIL Open Font License (`public/fonts/OFL.txt`).
