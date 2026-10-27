import { describe, expect, it } from 'vitest';
import { InputError, MAX_TEXT_LENGTH, SI_DO, buildInputs, checkAge, checkRegion, checkText } from '../requests';
import { lookupCircuit } from '../circuits';

const problem = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof InputError ? `${e.field}:${e.problem}` : 'other'; }
  return 'none';
};

describe('checkText', () => {
  it.each(['', '   ', '\t', undefined, null, 42])('refuses %j as empty', (raw) => {
    expect(problem(() => checkText('scope', raw))).toBe('scope:empty');
  });
  it('counts code points: 256 emoji pass, 257 fail', () => {
    expect(checkText('scope', '😀'.repeat(MAX_TEXT_LENGTH))).toHaveLength(MAX_TEXT_LENGTH * 2);
    expect(problem(() => checkText('scope', '😀'.repeat(MAX_TEXT_LENGTH + 1)))).toBe('scope:too_long');
    expect(problem(() => checkText('scope', 'a'.repeat(MAX_TEXT_LENGTH * 2)))).toBe('scope:too_long');
  });
  it.each(['a\nb', 'a\tb', 'a\u0000b', 'a\u007fb', 'a\u2028b'])('refuses control characters in %j', (raw) => {
    expect(problem(() => checkText('scope', raw))).toBe('scope:control_characters');
  });
  it.each(['%_\\', "' OR 1=1 --", '<script>alert(1)</script>', '서비스-svc-サービス-😀'])('keeps %s verbatim', (raw) => {
    expect(checkText('scope', raw)).toBe(raw);
  });
});

describe('checkAge', () => {
  it.each([[1, 1], [150, 150], ['19', 19], [' 20 ', 20]])('accepts %j', (raw, age) => {
    expect(checkAge(raw)).toBe(age);
  });
  it.each([0, 151, -1])('refuses %j as out of range', (raw) => {
    expect(problem(() => checkAge(raw))).toBe('ageThreshold:out_of_range');
  });
  it.each([1.5, '1.5', '1e2', '', 'abc', '９', NaN, Infinity, 2 ** 60, undefined])('refuses %j as not an integer', (raw) => {
    expect(problem(() => checkAge(raw))).toBe('ageThreshold:not_an_integer');
  });
});

describe('checkRegion', () => {
  it('accepts the 17 current names', () => {
    expect(SI_DO).toHaveLength(17);
    for (const r of SI_DO) expect(checkRegion(r)).toBe(r);
  });
  it.each(['전라북도', '강원도', '서울', 'Seoul'])('refuses %j', (raw) => {
    expect(problem(() => checkRegion(raw))).toBe('targetRegion:unknown_region');
  });
});

describe('buildInputs', () => {
  it('gives each circuit exactly its fields', () => {
    expect(buildInputs('mdl_kr_ownership', { scope: 's', ageThreshold: 'x' })).toEqual({ scope: 's' });
    expect(buildInputs('mdl_kr_age', { scope: 's', ageThreshold: 19 })).toEqual({ scope: 's', ageThreshold: 19 });
    expect(buildInputs('mdl_kr_region', { scope: 's', targetRegion: '경기도' })).toEqual({ scope: 's', targetRegion: '경기도' });
  });
  it.each(['coinbase_attestation', 'toString', '__proto__', ''])('refuses circuit %j by name', (id) => {
    expect(() => buildInputs(id as never, { scope: 's' })).toThrow(/Unknown circuit .* Known: mdl_kr_ownership, mdl_kr_age, mdl_kr_region\./);
    expect(() => lookupCircuit(id)).toThrow(/Unknown circuit/);
  });
});
