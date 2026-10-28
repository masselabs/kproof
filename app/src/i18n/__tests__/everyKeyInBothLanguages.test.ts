/**
 * Every string exists in both languages, with the same shape.
 *
 * i18next falls back to English for a key missing from ko.json, and to the
 * key itself for one missing from both — neither fails, both put the wrong
 * words on a screen. These checks are what catches a key added to one file.
 *
 * EDGE-CASE MATRIX → coverage
 *   integrity → same key set in en and ko (both directions)
 *   empty     → no empty or whitespace-only string in either file
 *   boundary  → arrays (bullet lists) have the same length in both
 *   contract  → each string takes the same {{variables}} in both, so a call
 *               site passing {card} is not silently ignored by one language
 *   integrity → Korean particle formatting appears in ko.json only
 */
import en from '../locales/en.json';
import ko from '../locales/ko.json';

type Leaf = string | string[];

function leaves(node: unknown, prefix = ''): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  if (typeof node === 'string' || Array.isArray(node)) {
    out.set(prefix, node as Leaf);
    return out;
  }
  if (node === null || typeof node !== 'object') throw new Error(`Unexpected value at '${prefix}': ${String(node)}`);
  for (const [k, v] of Object.entries(node)) {
    for (const [kk, vv] of leaves(v, prefix ? `${prefix}.${k}` : k)) out.set(kk, vv);
  }
  return out;
}

/** The variable names a string interpolates, without format suffixes: {{card, josa(p: 로)}} -> card. */
function variables(value: Leaf): string[] {
  const text = Array.isArray(value) ? value.join('\n') : value;
  return [...new Set([...text.matchAll(/\{\{\s*(\w+)[^}]*\}\}/g)].map((m) => m[1]))].sort();
}

const EN = leaves(en);
const KO = leaves(ko);

describe('every key in both languages', () => {
  it('read a realistic number of keys (an empty map would pass everything below)', () => {
    expect(EN.size).toBeGreaterThan(200);
    expect(KO.size).toBeGreaterThan(200);
  });

  it('every English key has a Korean string', () => {
    expect([...EN.keys()].filter((k) => !KO.has(k))).toEqual([]);
  });

  it('every Korean key has an English string', () => {
    expect([...KO.keys()].filter((k) => !EN.has(k))).toEqual([]);
  });

  it.each([
    ['en', EN],
    ['ko', KO],
  ])('%s has no empty or whitespace-only string', (_lang, map) => {
    const empty = [...map].filter(([, v]) => (Array.isArray(v) ? v.length === 0 || v.some((s) => !s.trim()) : !v.trim()));
    expect(empty.map(([k]) => k)).toEqual([]);
  });

  it('lists have the same number of items in both languages', () => {
    const differ = [...EN].filter(([k, v]) => Array.isArray(v) && (!Array.isArray(KO.get(k)) || (KO.get(k) as string[]).length !== v.length));
    expect(differ.map(([k]) => k)).toEqual([]);
  });

  it('each string takes the same variables in both languages', () => {
    const differ = [...EN]
      .filter(([k, v]) => KO.has(k) && variables(v).join(',') !== variables(KO.get(k)!).join(','))
      .map(([k, v]) => `${k}: en {${variables(v)}} ko {${variables(KO.get(k)!)}}`);
    expect(differ).toEqual([]);
  });

  it('English has no Korean particle formatting, and no Korean text outside proper names', () => {
    expect(JSON.stringify(en)).not.toMatch(/josa/);
    const hangul = [...EN].filter(([k, v]) => !k.startsWith('regions.') && /[가-힣]/.test(Array.isArray(v) ? v.join('') : v));
    // The language picker shows each language in its own script ("한국어") from
    // languages.ts, not from en.json, so nothing in en.json should be Korean.
    expect(hangul.map(([k]) => k)).toEqual([]);
  });

  it('Korean says something different from English where words are translated', () => {
    // Brand and biometry product names (Face ID) are the same in both; a
    // sentence that is identical in both was copied and not translated.
    const same = [...EN].filter(([k, v]) => typeof v === 'string' && v.length > 12 && KO.get(k) === v).map(([k]) => k);
    expect(same).toEqual([]);
  });
});
