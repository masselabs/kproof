import { describe, expect, it } from 'vitest';
import { CIRCUITS, InputError, MAX_TEXT_LENGTH, SI_DO, checkAge, checkRegion, checkText, lookupCircuit } from '../requests';

const values = (over: Partial<{ scope: string; ageThreshold: string; targetRegion: string }> = {}) => ({
  scope: 'kproof-demo:staging', ageThreshold: '19', targetRegion: '서울특별시', ...over,
});

describe('checkText (scope)', () => {
  it.each(['', '   ', '\t'])('refuses empty or whitespace-only %j', (raw) => {
    expect(() => checkText('scope', 'scope', raw)).toThrow(InputError);
  });

  it('trims surrounding spaces', () => {
    expect(checkText('scope', 'scope', '  a  ')).toBe('a');
  });

  it('counts characters, not UTF-16 units: 256 emoji pass, 257 fail', () => {
    expect(checkText('scope', 'scope', '😀'.repeat(MAX_TEXT_LENGTH))).toHaveLength(MAX_TEXT_LENGTH * 2);
    expect(() => checkText('scope', 'scope', '😀'.repeat(MAX_TEXT_LENGTH + 1))).toThrow(/256자 이하/);
  });

  it('allows Korean and mixed scripts up to the cap', () => {
    expect(checkText('scope', 'scope', '가'.repeat(MAX_TEXT_LENGTH))).toHaveLength(MAX_TEXT_LENGTH);
    expect(checkText('scope', 'scope', '서비스-svc-サービス-😀')).toBe('서비스-svc-サービス-😀');
    expect(() => checkText('scope', 'scope', 'a'.repeat(MAX_TEXT_LENGTH * 2))).toThrow(/256자 이하/);
  });

  it.each(['a\nb', 'a\tb', 'a\u0000b', 'a\u007fb', 'a\u2028b', 'a\rb'])('refuses control characters in %j', (raw) => {
    expect(() => checkText('scope', 'scope', raw)).toThrow(/제어 문자/);
  });

  it.each(['%_\\', "' OR 1=1 --", '<script>alert(1)</script>'])('keeps hostile-looking text verbatim: %s', (raw) => {
    expect(checkText('scope', 'scope', raw)).toBe(raw);
  });
});

describe('checkAge', () => {
  it.each([['1', 1], ['19', 19], ['150', 150], [' 20 ', 20]])('accepts %j', (raw, age) => {
    expect(checkAge(raw)).toBe(age);
  });

  it.each(['0', '151', '300', '-1', '1.5', '1e2', '', '  ', 'abc', '９', '99999999999999999999'])('refuses %j', (raw) => {
    expect(() => checkAge(raw)).toThrow(/1~150 사이의 정수/);
  });
});

describe('checkRegion', () => {
  it('accepts every listed si/do', () => {
    for (const name of SI_DO) expect(checkRegion(name)).toBe(name);
  });

  it('uses the current official names', () => {
    expect(SI_DO).toContain('전북특별자치도');
    expect(SI_DO).toContain('강원특별자치도');
    expect(SI_DO).not.toContain('전라북도');
    expect(SI_DO).not.toContain('강원도');
    expect(SI_DO).toHaveLength(17);
  });

  it.each(['전라북도', '서울', 'Seoul', '', '서울\n특별시', '서울특별시 '.repeat(2)])('refuses %j', (raw) => {
    expect(() => checkRegion(raw)).toThrow(InputError);
  });

  it('trims surrounding whitespace before matching the list', () => {
    expect(checkRegion(' 서울특별시\n')).toBe('서울특별시');
  });
});

describe('CIRCUITS', () => {
  it('builds each circuit\'s inputs with exactly its own fields', () => {
    expect(CIRCUITS.mdl_kr_ownership.buildInputs(values())).toEqual({ scope: 'kproof-demo:staging' });
    expect(CIRCUITS.mdl_kr_age.buildInputs(values())).toEqual({ scope: 'kproof-demo:staging', ageThreshold: 19 });
    expect(CIRCUITS.mdl_kr_region.buildInputs(values())).toEqual({ scope: 'kproof-demo:staging', targetRegion: '서울특별시' });
  });

  it('reports which field was wrong', () => {
    try {
      CIRCUITS.mdl_kr_age.buildInputs(values({ ageThreshold: '0' }));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InputError);
      expect((err as InputError).field).toBe('ageThreshold');
    }
  });

  it('ownership ignores the age and region fields even when they are invalid', () => {
    expect(CIRCUITS.mdl_kr_ownership.buildInputs(values({ ageThreshold: 'x', targetRegion: '' }))).toEqual({ scope: 'kproof-demo:staging' });
  });
});

describe('lookupCircuit', () => {
  it.each(['coinbase_attestation', 'mdl_kr', '', 'toString', '__proto__', 'constructor'])('refuses %j by name', (id) => {
    expect(() => lookupCircuit(id)).toThrow(/Unknown circuit .* Known: mdl_kr_ownership, mdl_kr_age, mdl_kr_region\./);
  });
});
