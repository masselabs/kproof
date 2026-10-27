import {AppError} from '../../errors';
import {CARD_ORDER, CARD_TYPES, REQUEST_PROVIDER, cardType, keyForProvider, keyForReturnedProvider} from '../../config/cardTypes';
import {cardFromRaon, isRealDate} from '../importCard';

const NOW = new Date('2026-10-27T10:00:00.000Z');
const good = {
  ci: 'A'.repeat(88),
  name: '홍길동',
  birth: '19900101',
  telno: '01012345678',
  sex: 'M',
  address: '전북특별자치도 전주시 완산구',
  provider: 'comrc_v1.5',
  ihidnum: '9001011234567',
  vcTypeCode: 'X',
};

function codeOf(fn: () => unknown): {code: string; detail: string} {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return {code: err.code, detail: err.detail};
    throw err;
  }
  throw new Error('expected a refusal');
}

describe('card types', () => {
  test('unknown provider', () => {
    for (const p of ['comxx_v1.5', '__proto__', 'toString', '', undefined]) {
      expect(() => keyForProvider(p)).toThrow(/Unknown provider/);
    }
    for (const k of ['toString', '__proto__', 'comrc_v1.5']) {
      expect(() => cardType(k)).toThrow(/Unknown card type/);
    }
    expect(CARD_ORDER.map((k) => keyForProvider(CARD_TYPES[k].provider))).toEqual(CARD_ORDER);
  });
});

describe('cardFromRaon', () => {
  test('stores only the allow-listed fields', () => {
    const card = cardFromRaon(good, NOW);
    expect(card.type).toBe('comrc_v1_5');
    expect(card.importedAt).toBe(NOW.toISOString());
    expect(card.fields.ihidnum).toBeUndefined();
    expect(card.fields).toMatchObject({ci: good.ci, name: '홍길동', birth: '19900101', address: good.address});
    expect(Object.keys(card.fields).every((k) => (CARD_TYPES.comrc_v1_5.stored as readonly string[]).includes(k))).toBe(true);
  });

  test('required fields per card type', () => {
    for (const key of CARD_ORDER) {
      for (const field of CARD_TYPES[key].required) {
        const data: Record<string, unknown> = {...good, provider: CARD_TYPES[key].provider};
        delete data[field];
        const r = codeOf(() => cardFromRaon(data, NOW));
        expect(r.code).toBe('E6006');
        expect(r.detail).toContain(`'${field}'`);
        expect(codeOf(() => cardFromRaon({...data, [field]: '  '}, NOW)).code).toBe('E6006');
      }
    }
  });

  test('a card without an address is stored', () => {
    const rest = {...good, address: undefined};
    expect(cardFromRaon(rest, NOW).fields.address).toBeUndefined();
  });

  test('birth must be a real date and fields must fit the circuit', () => {
    for (const birth of ['1990011', '19901301', '19900230', '1990-01-01', 'abcdefgh', '18991231']) {
      expect(codeOf(() => cardFromRaon({...good, birth}, NOW)).code).toBe('E6006');
    }
    expect(codeOf(() => cardFromRaon({...good, ci: 'A'.repeat(89)}, NOW)).code).toBe('E6006');
    expect(codeOf(() => cardFromRaon({...good, name: '가'.repeat(22)}, NOW)).code).toBe('E6006'); // 66 bytes
    expect(cardFromRaon({...good, name: '가'.repeat(21)}, NOW).fields.name).toHaveLength(21); // 63 bytes
    expect(codeOf(() => cardFromRaon({...good, address: '가'.repeat(86)}, NOW)).code).toBe('E6006'); // 258 bytes
    expect(codeOf(() => cardFromRaon({...good, telno: '0'.repeat(17)}, NOW)).code).toBe('E6006');
    expect(codeOf(() => cardFromRaon({...good, sex: '남'}, NOW)).code).toBe('E6006');
  });

  test('the returned card decides the type, whatever was requested', () => {
    // The import requests comdl_v1.5; the government app sends the person's
    // representative card. On 2026-10-27 a real phone got a different card back.
    expect(REQUEST_PROVIDER).toBe('comdl_v1.5');
    expect(cardFromRaon({...good, provider: 'comrc_v1.5'}, NOW).type).toBe('comrc_v1_5');
    expect(cardFromRaon({...good, provider: 'comdl_v1.5'}, NOW).type).toBe('comdl_v1_5');
    expect(cardFromRaon({...good, provider: 'coresidence_v1.5'}, NOW).type).toBe('coresidence_v1_5');
    expect(cardFromRaon({...good, provider: 'comdc_v1.5'}, NOW).type).toBe('comdc_v1_5');
  });

  test('the bare provider id is accepted as well as the versioned code', () => {
    for (const [p, key] of [['comrc', 'comrc_v1_5'], ['comdl', 'comdl_v1_5'], ['comnh_prod', 'comnh_v1_5'], ['comdc', 'comdc_v1_5']] as const) {
      expect(keyForReturnedProvider(p)).toBe(key);
    }
  });

  test('a card RAON does not name, or names unknown, is refused naming the value', () => {
    const missing = codeOf(() => cardFromRaon({...good, provider: undefined}, NOW));
    expect(missing.code).toBe('E6005');
    expect(missing.detail).toMatch(/did not say which card/);
    for (const p of ['coidentitydocument', 'comxx_v1.5', '', '__proto__', 'toString']) {
      const r = codeOf(() => cardFromRaon({...good, provider: p}, NOW));
      expect(r.code).toBe('E6005');
    }
    expect(codeOf(() => cardFromRaon({...good, provider: 'comxx_v1.5'}, NOW)).detail).toContain("'comxx_v1.5'");
  });

  test('isRealDate handles leap years', () => {
    expect(isRealDate('20000229')).toBe(true);
    expect(isRealDate('19000229')).toBe(false);
    expect(isRealDate('20240229')).toBe(true);
  });
});
