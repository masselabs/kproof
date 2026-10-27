import {ENV, getEnv} from '../env';
import {CIRCUIT_IDS, isCircuitId} from '../circuits';
import {SYMBOL_COLOR, WORDMARK_COLOR} from '../../ui/brandMarks';
import {ko} from '../../i18n/ko';
import {ERROR_CODES} from '../../errors';

// Node built-ins, typed locally so node's types do not leak into app code.
declare const __dirname: string;
declare function require(id: 'fs'): {readFileSync(path: string, encoding: 'utf8'): string};
declare function require(id: 'path'): {join(...parts: string[]): string};
const fs = require('fs');
const path = require('path');

describe('environment table', () => {
  test('unknown environment names throw', () => {
    for (const name of ['production', 'toString', '__proto__', '', undefined, 'STAGING']) {
      expect(() => getEnv(name)).toThrow(/Unknown environment/);
    }
    expect(getEnv('staging').relays.map((r) => r.host)).toEqual(['stg-api.koreanproof.com']);
  });

  test('only the development row allows plain http', () => {
    for (const [name, row] of Object.entries(ENV)) {
      for (const r of row.relays) {
        if (r.protocol === 'http:') expect([name, r.host]).toEqual(['development', 'localhost']);
      }
    }
  });

  test('circuit ids are the canonical three', () => {
    expect(CIRCUIT_IDS).toEqual(['mdl_kr_ownership', 'mdl_kr_age', 'mdl_kr_region']);
    for (const bad of ['toString', '__proto__', 'mdl-kr-age']) expect(isCircuitId(bad)).toBe(false);
  });
});

describe('copy and assets', () => {
  test('brand marks equal the files in assets/brand', () => {
    const dir = path.join(__dirname, '..', '..', '..', 'assets', 'brand');
    expect(WORDMARK_COLOR).toBe(fs.readFileSync(path.join(dir, 'wordmark-color.svg'), 'utf8').replace(/\n$/, ''));
    expect(SYMBOL_COLOR).toBe(fs.readFileSync(path.join(dir, 'symbol-color.svg'), 'utf8').replace(/\n$/, ''));
  });

  test('every error code has Korean text and the relay format', () => {
    for (const code of ERROR_CODES) {
      expect(code).toMatch(/^E\d{4}$/);
      expect(ko.errors[code].title.length).toBeGreaterThan(0);
    }
  });
});
