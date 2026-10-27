/**
 * Circuit inputs for the three Korea Mobile ID circuits, flattened in the
 * order of each circuit's `main()` at the pinned circuits commit:
 *
 *   mdl_kr_ownership(scope, nullifier_value, disclose_flags, owner_commit, ci, name, birth_date, telno, sex)
 *   mdl_kr_age      (scope, nullifier_value, age_threshold, current_year, ci, birth_date)
 *   mdl_kr_region   (scope, nullifier_value, region_code, ci, address)
 *
 * Ported from proofport-app src/utils/mdlKr.ts (v4 layout), with ethers
 * replaced by @noble/hashes. Byte layouts and padding must match
 * mdl/kr-common/src/lib.nr exactly:
 *   nullifier   = keccak(keccak(ci[88]) || keccak(utf8(scope)))
 *   region_code = keccak(targetRegion zero-padded to 64 bytes)
 *
 * KProof answers ownership requests anonymously (disclose_flags = 0,
 * owner_commit = 32 zero bytes); nothing about the holder is disclosed.
 */
import {keccak_256} from '@noble/hashes/sha3';
import {concatBytes, utf8Encode} from './bytes';
import type {RequestInputs} from './request';

export const CI_LEN = 88;
export const NAME_MAX = 64;
export const TELNO_MAX = 16;
export const BIRTH_LEN = 8;
export const REGION_MAX = 64;
export const ADDRESS_MAX = 256;

/** The stored card fields the circuits read. */
export interface CardSecrets {
  ci: string;
  name: string;
  birth: string;
  telno?: string;
  sex?: string;
  address?: string;
}

function padZero(field: string, value: string, total: number): Uint8Array {
  const bytes = utf8Encode(value);
  if (bytes.length > total) {
    throw new Error(`${field} is ${bytes.length} bytes; the circuit takes at most ${total}`);
  }
  const out = new Uint8Array(total);
  out.set(bytes, 0);
  return out;
}

function dec(bytes: Uint8Array): string[] {
  return Array.from(bytes, (b) => b.toString());
}

export function nullifierParts(ci: string, scope: string): {scope: Uint8Array; nullifier: Uint8Array; ci: Uint8Array} {
  const ciBytes = padZero('ci', ci, CI_LEN);
  const scopeHash = keccak_256(utf8Encode(scope));
  const nullifier = keccak_256(concatBytes([keccak_256(ciBytes), scopeHash]));
  return {scope: scopeHash, nullifier, ci: ciBytes};
}

/**
 * The flat input array for `generateNoirProof`. `currentYear` is passed in:
 * the age circuit compares it with the birth year, and it is a public input
 * the verifier sees.
 */
export function buildCircuitInputs(card: CardSecrets, request: RequestInputs, currentYear: number): string[] {
  const base = nullifierParts(card.ci, request.scope);
  switch (request.circuitId) {
    case 'mdl_kr_ownership': {
      const name = padZero('name', card.name, NAME_MAX);
      const birth = padZero('birth', card.birth, BIRTH_LEN);
      const telno = padZero('telno', card.telno ?? '', TELNO_MAX);
      const sex = card.sex && card.sex.length > 0 ? card.sex.charCodeAt(0) : 0;
      if (sex > 0xff) throw new Error('sex must be a single-byte character');
      return [
        ...dec(base.scope),
        ...dec(base.nullifier),
        '0',
        ...dec(new Uint8Array(32)),
        ...dec(base.ci),
        ...dec(name),
        ...dec(birth),
        ...dec(telno),
        String(sex),
      ];
    }
    case 'mdl_kr_age': {
      const birth = padZero('birth', card.birth, BIRTH_LEN);
      return [
        ...dec(base.scope),
        ...dec(base.nullifier),
        String(request.ageThreshold),
        String(currentYear),
        ...dec(base.ci),
        ...dec(birth),
      ];
    }
    case 'mdl_kr_region': {
      if (card.address === undefined) throw new Error('the card has no address');
      const regionCode = keccak_256(padZero('targetRegion', request.targetRegion, REGION_MAX));
      const address = padZero('address', card.address, ADDRESS_MAX);
      return [
        ...dec(base.scope),
        ...dec(base.nullifier),
        ...dec(regionCode),
        ...dec(base.ci),
        ...dec(address),
      ];
    }
  }
}

/** Expected flat lengths, from the `main()` signatures above. */
export const FLAT_LENGTH = {
  mdl_kr_ownership: 32 + 32 + 1 + 32 + CI_LEN + NAME_MAX + BIRTH_LEN + TELNO_MAX + 1,
  mdl_kr_age: 32 + 32 + 1 + 1 + CI_LEN + BIRTH_LEN,
  mdl_kr_region: 32 + 32 + 32 + CI_LEN + ADDRESS_MAX,
} as const;
