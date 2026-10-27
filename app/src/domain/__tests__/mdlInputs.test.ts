import {keccak_256} from '@noble/hashes/sha3';
import {toHex, utf8Encode} from '../bytes';
import {buildCircuitInputs, FLAT_LENGTH, nullifierParts, type CardSecrets} from '../mdlInputs';
import {canProve, birthYear} from '../predicates';
import {firstAddressToken} from '../regions';

const card: CardSecrets = {
  ci: 'TestCi0123456789TestCi0123456789TestCi0123456789TestCi0123456789TestCi0123456789ABCDEFG=',
  name: '홍길동',
  birth: '20070315',
  telno: '01012345678',
  sex: 'M',
  address: '전북특별자치도 전주시 완산구 효자로 225',
};

const toBytes = (xs: string[]) => Uint8Array.from(xs.map(Number));

describe('circuit inputs', () => {
  test('keccak is Ethereum keccak-256, not SHA3-256', () => {
    expect(toHex(keccak_256(new Uint8Array()))).toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  });

  test('flat lengths match the main() signatures', () => {
    expect(buildCircuitInputs(card, {circuitId: 'mdl_kr_ownership', scope: 's'}, 2026)).toHaveLength(FLAT_LENGTH.mdl_kr_ownership);
    expect(buildCircuitInputs(card, {circuitId: 'mdl_kr_age', scope: 's', ageThreshold: 19}, 2026)).toHaveLength(FLAT_LENGTH.mdl_kr_age);
    expect(buildCircuitInputs(card, {circuitId: 'mdl_kr_region', scope: 's', targetRegion: '전북특별자치도'}, 2026)).toHaveLength(
      FLAT_LENGTH.mdl_kr_region,
    );
    expect(FLAT_LENGTH).toEqual({mdl_kr_ownership: 274, mdl_kr_age: 162, mdl_kr_region: 440});
  });

  test('nullifier = keccak(keccak(ci padded to 88) || keccak(scope))', () => {
    const p = nullifierParts(card.ci, 'demo.koreanproof.com');
    const ci = new Uint8Array(88);
    ci.set(utf8Encode(card.ci));
    const expected = keccak_256(Uint8Array.from([...keccak_256(ci), ...keccak_256(utf8Encode('demo.koreanproof.com'))]));
    expect(toHex(p.nullifier)).toBe(toHex(expected));
    expect(toHex(nullifierParts(card.ci, 'other').nullifier)).not.toBe(toHex(expected));
  });

  test('field order per circuit', () => {
    const age = buildCircuitInputs(card, {circuitId: 'mdl_kr_age', scope: 's', ageThreshold: 19}, 2026);
    const base = nullifierParts(card.ci, 's');
    expect(toBytes(age.slice(0, 32))).toEqual(base.scope);
    expect(toBytes(age.slice(32, 64))).toEqual(base.nullifier);
    expect(age.slice(64, 66)).toEqual(['19', '2026']);
    expect(toBytes(age.slice(66, 154))).toEqual(base.ci);
    expect(String.fromCharCode(...toBytes(age.slice(154)))).toBe('20070315');

    const own = buildCircuitInputs(card, {circuitId: 'mdl_kr_ownership', scope: 's'}, 2026);
    expect(own[64]).toBe('0'); // disclose_flags: anonymous
    expect(own.slice(65, 97).every((x) => x === '0')).toBe(true); // owner_commit
    expect(own[own.length - 1]).toBe(String('M'.charCodeAt(0)));

    const region = buildCircuitInputs(card, {circuitId: 'mdl_kr_region', scope: 's', targetRegion: '전북특별자치도'}, 2026);
    const padded = new Uint8Array(64);
    padded.set(utf8Encode('전북특별자치도'));
    expect(toBytes(region.slice(64, 96))).toEqual(keccak_256(padded));
    expect(region.slice(184).length).toBe(256);
  });

  test('oversized fields and a missing address are refused', () => {
    expect(() => buildCircuitInputs({...card, ci: 'x'.repeat(89)}, {circuitId: 'mdl_kr_age', scope: 's', ageThreshold: 1}, 2026)).toThrow(/88/);
    const noAddress = {...card, address: undefined};
    expect(() => buildCircuitInputs(noAddress, {circuitId: 'mdl_kr_region', scope: 's', targetRegion: '경기도'}, 2026)).toThrow(/address/);
  });
});

describe('feasibility before proving', () => {
  test('age uses the birth year, as assert_age does', () => {
    expect(birthYear('20070315')).toBe(2007);
    const age = (n: number) => ({circuitId: 'mdl_kr_age' as const, scope: 's', ageThreshold: n});
    expect(canProve(card, age(19), 2026).ok).toBe(true); // 2026 - 2007 = 19
    expect(canProve(card, age(20), 2026).ok).toBe(false);
    expect(canProve(card, age(1), 2006).ok).toBe(false); // birth year after the current year
  });

  test('region compares the first address token', () => {
    const region = (r: '전북특별자치도' | '경기도') => ({circuitId: 'mdl_kr_region' as const, scope: 's', targetRegion: r});
    expect(canProve(card, region('전북특별자치도'), 2026).ok).toBe(true);
    expect(canProve(card, region('경기도'), 2026).ok).toBe(false);
    expect(canProve({...card, address: '전라북도 전주시'}, region('전북특별자치도'), 2026).ok).toBe(false);
    const noAddress = {...card, address: undefined};
    expect(canProve(noAddress, region('경기도'), 2026)).toEqual({ok: false, reason: expect.stringContaining('주소가 없어')});
    expect(firstAddressToken('  \t경기도\t성남시')).toBe('경기도');
    expect(firstAddressToken('')).toBe('');
  });

  test('ownership needs nothing more', () => {
    expect(canProve(card, {circuitId: 'mdl_kr_ownership', scope: 's'}, 2026).ok).toBe(true);
  });
});
