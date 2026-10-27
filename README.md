# KProof

**English** | [한국어](README.ko.md)

KProof makes zero-knowledge proofs from Korean credentials. It starts with the
Korea Mobile ID (모바일 신분증): a user proves a fact about themselves, such as
being over a certain age, and the service that asked learns that fact and
nothing else from the ID.

The proof is generated on the user's phone. The ID data it is built from stays
on the device.

## Status

Early development, staging only. Everything below exists and is tested: the app
(imports a mobile ID through RAON's App2App flow, proves on the device, answers
the relay), the SDK and demo page, the three circuits and the prover crate.
Not yet verified on a real phone, and the circuits do not check the
government's signature on the ID data yet: that waits for the KOMSCO message
spec. The design is being worked out alongside the Korea Mobile ID integration
with KOMSCO (한국조폐공사), which issues and operates the mobile ID verification
service.

## Structure

This is one repository for everything public in KProof, so a change to a
circuit lands in the app, the SDK and the circuits in a single commit.

```
app/        KProof mobile app (iOS, Android): reads the mobile ID and proves on the device (exists)
sdk/        SDK for services: create a proof request and verify the answer (exists)
circuits/   Noir circuits for Korea Mobile ID proofs (exists: mdl/kr-ownership, kr-age, kr-region)
mopro/      Rust crate for the on-device prover; scripts/mopro_build.sh builds app/mopro_bindings
demo/       Demo page: creates a proof request and waits for the answer (exists)
```

The server (proof request relay and the SP module that talks to KOMSCO) lives in
a separate, private repository, `kproof-server`.

## Building the prover and circuits

- Circuits: toolchain pinned in `circuits/toolchain.env` (nargo 1.0.0-beta.19,
  bb 4.2.0-aztecnr-rc.2); `circuits/scripts/install-toolchain.sh`, then
  `circuits/scripts/build.sh mdl/kr-age`. The committed `target/` files are the
  CI builds copied from zkproofport/circuits (commit 973b9e9; `mdl/` unchanged
  since 35a8df4, which the Base Sepolia verifiers were deployed from). A local
  rebuild produces the same bytecode and verification key; only the absolute
  source paths nargo records in `file_map` differ, so local builds are not
  committed.
- On-device prover: `scripts/install-mopro-toolchain.sh`, then
  `scripts/mopro_build.sh`. It writes the native libraries into
  `app/mopro_bindings/`; those binaries are build output and are not committed.

## Links

- Website: [koreanproof.com](https://koreanproof.com) (in preparation)
- Server API: `api.koreanproof.com` (planned), staging `stg-api.koreanproof.com`
- Demo (staging): [stg-demo.koreanproof.com](https://stg-demo.koreanproof.com)

## License

[MIT](LICENSE). The license covers the code only; the KProof name and brand
artwork are not licensed by it.

## Contact

KProof is built by Masse Labs ([masselabs](https://github.com/masselabs) on
GitHub). Questions and reports: open an issue in this repository.
