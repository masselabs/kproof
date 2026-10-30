# KProof app

**English** | [한국어](README.ko.md)

The KProof mobile app (React Native 0.81.4, iOS first). It imports a Korea
Mobile ID (모바일 신분증) once, keeps it on the phone, and answers proof requests
from services with a zero-knowledge proof generated on the device.

- No wallet, no account, no server-side proving.
- Bundle id `com.masselabs.kproof`, display name `KProof`, URL scheme `kproof`.
- Circuits: `mdl_kr_ownership`, `mdl_kr_age`, `mdl_kr_region`, pinned to one
  commit of `zkproofport/circuits` (see "Circuits" below).

## What leaves the phone

| Data | Where it goes | When |
|---|---|---|
| The ID data (name, birth date, address, CI, phone number) | The mobile ID relay server, which returns the government mobile ID app's submission to the phone | Only while importing an ID ("신분증 추가") |
| A proof and its public inputs (scope hash, nullifier, the requested threshold or si/do hash) | The callback URL of the request, which must be a KProof relay on the allow-list | When the person approves a request |
| `generating`, `cancelled`, `error` + an error code | Same callback | While answering a request |
| Circuit files (download only) | `raw.githubusercontent.com/zkproofport/circuits/<pinned commit>` | First proof per circuit |

Nothing else is sent. The imported ID data is stored in ONE Keychain item
(Android: Keystore, AES-GCM) whose access control requires biometrics
(`BIOMETRY_CURRENT_SET`), or the device passcode on a device with no biometrics
enrolled. Re-enrolling Face ID / fingerprints invalidates the item; the app then
asks the person to import the ID again. History is kept on the phone only
(AsyncStorage, plain text: what was proven, to whom, when, and the outcome; no
ID data).

## Build

Prerequisites: Node `>=20.19.4` (`.nvmrc` says 24), Xcode with an iOS
simulator, Ruby from `.ruby-version` with Bundler (`Gemfile` pins CocoaPods
1.16.1), and for the prover the toolchain `../scripts/install-mopro-toolchain.sh`
installs.

```bash
../scripts/mopro_build.sh         # builds the prover from ../mopro into app/mopro_bindings
cd app
npm install                       # .npmrc: ignore-scripts (see below)
(cd ios && bundle install && bundle exec pod install)
npm run typecheck && npm test
npx react-native run-ios          # or open ios/KProof.xcworkspace
```

### The prover bindings (`mopro_bindings/`)

`package.json` depends on `"mopro-ffi": "file:./mopro_bindings"`. The binding
package's sources and templates (podspec, `package.json`, `cpp/`, `ios/`,
`src/`, `lib/`, Android build files) are tracked. The native libraries are build
output and are NOT committed: `MoproFfiFramework.xcframework/**/*.a` (~150 MB
per iOS slice) and `android/src/main/jniLibs/`. `../scripts/mopro_build.sh`
builds them from `../mopro` (mopro-ffi 0.3.7, noir_rs v1.0.0-beta.19,
barretenberg 4.2.0-aztecnr-rc.2 -- the barretenberg the circuit artifacts were
built with) and `../scripts/sync-mopro-bindings.sh` writes them here.

`.npmrc` sets `ignore-scripts=true`. The only install script in the tree is
lefthook's postinstall, pulled in through the binding package's
devDependencies; it wrote a `lefthook.yml` at the repository root and a git
hook into `.git/hooks` on the first install.

### Circuits

`src/config/circuits.ts` names ONE source, `{repo, commit, root}` --
`masselabs/kproof` at `2eecca9958c4527765111386645e1654408eb3a0`, under
`circuits/` -- and the sha256 of every file the app downloads from it (circuit
JSON, SRS, verification key), copied from that commit's `SHA256SUMS`. A file
whose digest differs is deleted and the proof stops; there is no branch, no
"latest", and no fallback source. The files there are byte-identical to
`zkproofport/circuits` `35a8df4`, from which the Base Sepolia verifiers the SDK
checks against were deployed; each verifier's bytecode embeds the `vk_hash` of
the pinned key.

## App icon and launch screen

`swift scripts/make-icons.swift` renders `assets/brand/app-icon.svg` (brand kit
v1.0, masselabs/kproof-website d6eb2c1) into the iOS app icon set, the iOS
launch logo and the Android launcher icons. The mark is drawn as supplied and
only scaled, as the brand kit asks.

## Physical iPhone

```bash
# ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY (base64 .p8) in the environment
scripts/build-device.sh <device-udid> staging
```

`scripts/dev-profile.py` (called by the build script) registers the app id
`com.masselabs.kproof` on team R4G32CVY29 and installs the "KProof
Development" profile for that device, reusing what already exists. The device
must already be registered on the team. The build is Release (the JS bundle is
embedded, no Metro) and is checked for its signature and bundle before
`devicectl` installs it. First run 2026-10-27: iPhone 16 Pro Max, profile valid
to 2027-10-27.

## TestFlight

```bash
# ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY (base64 .p8) in the environment
scripts/testflight.sh staging      # archive, upload, wait until App Store Connect lists the build as VALID
python3 scripts/testflight-group.py   # internal group "Internal" with ZKProofport's internal testers (idempotent)
```

`scripts/appstore-profile.py` (called by `testflight.sh`) installs the
"KProof App Store" profile and picks the build number: one above the highest
build App Store Connect has. App Store Connect app: KProof (6827592413).

## Environments

`src/config/env.ts` holds one row per environment (`development`, `staging`):
the relay callback allow-list, the circuits commit, and the mobile ID relay URL. An
unknown environment name throws. The build's environment is set in
`src/config/buildEnv.ts`.

## Edge cases (written before the code; each row names its test)

Deep link (`kproof://proof-request?data=<base64url JSON>`), parsed by
`src/domain/request.ts`:

| Case | Expected | Test |
|---|---|---|
| No `data` parameter; empty `data` | refused, E1001 | `request.test.ts` "refuses a link without data" |
| `data` not base64url (`+`, `/`, `=`, spaces, `%`) | refused, E1001 | `request.test.ts` "refuses non-base64url data" |
| Valid base64url but not JSON; JSON but not an object (array, string, null) | refused, E1001 | `request.test.ts` "refuses data that is not a JSON object" |
| Other scheme / host / path (`kproof://other`, `https://...`) | refused, E1001 | `request.test.ts` "refuses another route" |
| `data` longer than 16384 characters | refused before decoding, E1006 | `request.test.ts` "refuses an oversized payload" (16384 accepted, 16385 refused) |
| `requestId` missing or not a v4 UUID | refused, E1001 | `request.test.ts` "requestId must be a v4 UUID" |
| Unknown `circuitId`, including `toString`, `__proto__`, `constructor`, empty, non-string | refused naming the id, E1002 | `request.test.ts` "unknown circuit ids are refused by name" |
| `callbackUrl` host not on the environment's allow-list; look-alike hosts (`stg-api.koreanproof.com.evil.com`, `evil.com/stg-api.koreanproof.com`, userinfo `stg-api.koreanproof.com@evil.com`) | refused naming the host, E1004 | `request.test.ts` "callbackUrl host must be on the allow-list" |
| `callbackUrl` `http://` instead of `https://`, other port, other path, query or fragment | refused, E1004 | `request.test.ts` "callbackUrl must be exactly the relay callback" |
| `inputs.scope` missing, not a string, empty, whitespace-only, 257 characters, control characters | refused, E1005 | `request.test.ts` "scope rules" |
| Top-level `scope` present and different from `inputs.scope` | refused, E1005 | `request.test.ts` "a top-level scope must equal inputs.scope" |
| `ageThreshold` 0, 1, 150, 151, 19.5, `"19"`, NaN, missing | 1 and 150 accepted; the rest refused, E1005 | `request.test.ts` "age threshold boundaries" |
| `targetRegion` `전라북도` (retired), `강원도` (retired), padded with spaces, not in the 17 current names | refused, E1005; `전북특별자치도`, `강원특별자치도` accepted | `request.test.ts` "region must be one of the 17 current si/do names" |
| Extra keys in `inputs` the circuit does not take | refused, E1005 | `request.test.ts` "unknown input keys are refused" |
| `dappName` / `message` with control characters, over 100 / 500 characters | refused, E1005 | `request.test.ts` "display text rules" |
| Korean, emoji and mixed-script `dappName`, `message`, `scope` | accepted unchanged | `request.test.ts` "keeps Korean and emoji text" |
| HTML / SQL-shaped text in `dappName` | accepted as plain text (React Native renders no markup) | `request.test.ts` "keeps hostile text as data" |
| `returnScheme` not a bare custom scheme (`https://`, `bank://pay?x`) | refused, E1005 | `request.test.ts` "returnScheme rules" |
| Same `requestId` already answered on this phone | not shown again, not re-answered, E1007 | `relayAnswer.test.ts` "a second answer for the same request is not sent", "an answer from an earlier run blocks a new one (persisted)", "answeredStore" |

Mobile ID import (`src/services/idImport.ts`, `src/services/importCard.ts`):

| Case | Expected | Test |
|---|---|---|
| Each stage (`trans`, `authen/app/request`, `trans/token`) answers HTTP 5xx, non-JSON, a non-object, a non-success answer code (`trans`, `trans/token`), a missing field, or the network fails | stops with E6001 naming the stage | `idImport.test.ts` "each stage failure names the stage" |
| `authen/app/request` answers a non-success code | E6008 naming the requested code and the relay's own code and message | `idImport.test.ts` "the relay refusing the request is its own error" |
| Poll never reports success | E6002 after the timeout (fake clock) | `idImport.test.ts` "poll times out" |
| Person cancels (taps 취소 in KProof, or returns from the government app without submitting) | polling stops, E6003, nothing stored | `idImport.test.ts` "cancel stops polling" |
| Poll answers errors while the person is still in the government app | keeps polling | `idImport.test.ts` "keeps polling through errors" |
| No `iosLink` / `androidLink`; government app not installed (`canOpenURL` false) | E6004 naming the scheme only | `idImport.test.ts` "missing or unopenable deep link" |
| Unknown provider code (`comxx_v1.5`, `__proto__`) | refused before any network call, E6005 | `importCard.test.ts` "unknown provider" |
| Returned data missing `ci`, `name`, `birth` (per card type); `birth` not a real YYYYMMDD date; `ci` over 88 bytes; name over 64 bytes; address over 256 bytes | E6006 naming the field, nothing stored | `importCard.test.ts` "required fields per card type" |
| The government app returns another card than the one the person chose (its representative card) | refused, nothing stored, E6007 tells the person to make the chosen card their representative card | `importCard.test.ts` "a different card than the one chosen is refused, naming both" |
| Returned `provider` missing or unknown | E6005 naming the value, nothing stored | `importCard.test.ts` "a card the relay does not name, or names unknown" |
| Resident registration number (`ihidnum`) and other unused fields in the answer | not stored | `importCard.test.ts` "stores only the allow-listed fields" |

Storage and lock (`src/services/vault.ts`, `src/domain/lock.ts`):

| Case | Expected | Test |
|---|---|---|
| Biometric prompt cancelled / failed | stays locked, E4001, nothing read | `vault.test.ts` "a cancelled prompt leaves it locked" |
| No biometrics and no device passcode | blocked with E4002 (the app cannot protect the ID) | `vault.test.ts` "no device security is a blocker" |
| Vault item missing (first run) | an empty vault is created, then read through the prompt | `vault.test.ts` "first run creates an empty vault, then reads it through the prompt" |
| Vault item present but not JSON / wrong shape / unknown card type inside; item exists but cannot be read (biometrics re-enrolled) | E4003; the lock screen offers to wipe and start again; never treated as empty silently | `vault.test.ts` "a corrupted vault is reported", "an item that exists but cannot be read is E4003", "a Keychain that cannot be queried is E4003, not a cancelled prompt" |
| Card deleted | removed from the vault; requests needing it show E2001 | `vault.test.ts` "round trip, replacing a card of the same type, and deleting a card", `answerFlow.test.ts` "no card for the chosen type sends nothing (E2001)" |
| Background 59 s / 59.999 s / 60 s / 61 s / 1 h | locks at 60 s and above | `lock.test.ts` "background for %i ms" |
| Cold start | locked | `lock.test.ts` "starts locked" |
| Proof without re-authentication | impossible: the proof path re-reads the vault through the prompt | `answerFlow.test.ts` "re-authenticates before proving; sends generating then completed" |

Proving and answering (`src/services/answerFlow.ts`, `src/services/relayAnswer.ts`, `src/services/circuitFiles.ts`):

| Case | Expected | Test |
|---|---|---|
| Card's birth year makes the age below the threshold; card has no address; address's si/do differs | not proven, nothing sent; the Request screen says why and only decline is possible (E2002) | `mdlInputs.test.ts` "feasibility before proving", `answerFlow.test.ts` "a card that cannot satisfy the request sends nothing (E2002)" |
| Circuit file digest differs from the pinned one; HTTP error; dropped download; unpinned source | file deleted, E2003 / throws | `circuitFiles.test.ts` |
| Prover throws | `error` + E2004 sent once | `answerFlow.test.ts` "prover failure answers error E2004 exactly once" |
| Relay answers 409 `already_answered` / `expired` | no retry; E1007 / E1003 shown | `relayAnswer.test.ts` "relay reply ..." (8 cases) |
| Relay answers other 4xx | no retry; E3002 shown | `relayAnswer.test.ts` |
| Relay answers 5xx; network down | E3003 / E3001 shown; nothing crashes | `relayAnswer.test.ts` |
| Two answers for one request (double tap, error after cancel) | the second is not sent | `relayAnswer.test.ts` |
| `generating` is sent before the proof, `completed` carries `proof`, `publicInputs`, `circuit` | exact bodies asserted | `answerFlow.test.ts`, `relayAnswer.test.ts` "bodies match kproof-server callback fields" |
| In-app proof (증명 tab, "앱에서 증명해 보기"): the SDK creates a real request on the build environment's relay with scope `kproof-app:in-app-proof`; its deep link goes through the ordinary link handler | exact relay calls and bodies asserted | `inAppProof.test.ts` "creates a real request ...", "age and region carry exactly their own input" |
| In-app proof with an age the SDK refuses (0, 151, 19.5, NaN) | refused before any relay call | `inAppProof.test.ts` "an age the SDK refuses never reaches the relay" |
| In-app proof in an environment the SDK has no network for (`development`, `production`, `__proto__`, empty) | throws naming it, no relay call | `inAppProof.test.ts` "an environment the SDK has no network for" |
| In-app proof with the relay down | the relay error is shown (E3001 / E3002 / E3003) | `inAppProof.test.ts` "a relay that is down surfaces its error"; the code mapping is on the screen and was checked on the device only |
| After answering an in-app request, the done screen reads the answer back from the relay and runs the SDK's `verifyAnswer` (including `eth_call` on the verifier) | each check shown; a non-completed answer or a wrong scope is not valid | `inAppProof.test.ts` "reads the answer back ...", "a completed answer with the wrong scope is not valid"; a real proof end to end only on the device |
| Delete one card from the Home screen | confirmation sheet; only that card leaves the vault; history stays | `vault.test.ts` "... deleting a card"; the screen was checked on the device only |
| Demo site link (Home, "What this ID can prove" open → Demo screen) | shown only when the build environment has a `demoUrl` (staging: stg-demo.koreanproof.com; development: none); opens exactly that address in the browser; a failed open shows E3004 | `DemoSite.test.ts`, `config.test.ts` "the demo site ..." |
| Input layout per circuit (field order and count, nullifier = keccak(keccak(ci) ‖ keccak(scope))) | matches the Noir `main()` signatures | `mdlInputs.test.ts`; also checked once by `nargo execute` on the pinned circuits (witness solves for all three; age 20 for a 2007 birth year fails `assert_age`) |

### End-to-end (needs a person and a physical phone)

The government mobile ID app only runs on a real device, so the full path is a
manual E2E run on a phone with the mobile ID installed:

1. Import each card type (주민등록증, 운전면허증, 국가보훈등록증, 외국인등록증) and
   confirm the stored fields on the Home screen.
2. On https://stg-demo.koreanproof.com create one request per circuit, open the
   deep link on the phone, approve, and confirm the demo receives `completed`
   and the SDK verifies the proof against the pinned Base Sepolia verifier.
3. In the app's 증명 tab, tap "앱에서 증명해 보기" for each fact; approve, and
   confirm the done screen shows every SDK check passing, 온체인 검증 included.
4. Decline one request (demo shows `cancelled`), let one expire (demo shows
   `expired`, the app shows E1003 on a late answer), and re-open an answered
   link (app shows E1007, sends nothing).

## Importing a mobile ID

The person picks a card type. The import asks for 모바일 신분증
(`coidentitydocument_v1.5`, the generic mobile-ID code), and the government
app submits the person's representative card, which the answer names in
`vcTypeCodeList`. A card of another type than the one chosen is not stored; the
person is told to make the chosen card their representative card (E6007).

The age proof compares birth year with the current year (연 나이); the UI says
"N세 이상 (출생 연도 기준)".

## License

Code: MIT ([../LICENSE](../LICENSE)). Pretendard (`assets/fonts`, unmodified
static OTFs from the v1.3.9 release) is under the SIL Open Font License
(`assets/fonts/OFL.txt`). The KProof marks in `assets/brand` come from the
brand kit and are not covered by the MIT license.
