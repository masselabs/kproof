# KProof

**English** | [한국어](README.ko.md)

KProof makes zero-knowledge proofs from Korean credentials. It starts with the
Korea Mobile ID (모바일 신분증): a user proves a fact about themselves, such as
being over a certain age, and the service that asked learns that fact and
nothing else from the ID.

The proof is generated on the user's phone. The ID data it is built from stays
on the device.

## Status

Pre-development. This repository holds no code yet. The design is being worked
out alongside the Korea Mobile ID integration with KOMSCO (한국조폐공사), which
issues and operates the mobile ID verification service.

## Planned structure

This is one repository for everything public in KProof, so a change to a
circuit lands in the app, the SDK and the circuits in a single commit.

```
app/        KProof mobile app (iOS, Android): reads the mobile ID and proves on the device
sdk/        SDK for services: create a proof request and verify the answer
circuits/   Noir circuits for Korea Mobile ID proofs
```

The server (proof request relay and the SP module that talks to KOMSCO) lives in
a separate, private repository, `kproof-server`.

## Links

- Website: [koreanproof.com](https://koreanproof.com) (in preparation)
- Server API: `api.kproof.kr` (planned)

## License

Not chosen yet. Until a license is added, no rights to use, copy or modify this
code are granted.

## Contact

KProof is built by Masse Labs ([masselabs](https://github.com/masselabs) on
GitHub). Questions and reports: open an issue in this repository.
