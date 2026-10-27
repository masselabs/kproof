import {AppError} from '../../errors';
import {CARD_ORDER, CARD_TYPES, cardType, keyForProvider} from '../../config/cardTypes';
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
    const card = cardFromRaon('comrc_v1_5', good, NOW);
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
        const r = codeOf(() => cardFromRaon(key, data, NOW));
        expect(r.code).toBe('E6006');
        expect(r.detail).toContain(`'${field}'`);
        expect(codeOf(() => cardFromRaon(key, {...data, [field]: '  '}, NOW)).code).toBe('E6006');
      }
    }
  });

  test('a card without an address is stored', () => {
    const rest = {...good, address: undefined};
    expect(cardFromRaon('comrc_v1_5', rest, NOW).fields.address).toBeUndefined();
  });

  test('birth must be a real date and fields must fit the circuit', () => {
    for (const birth of ['1990011', '19901301', '19900230', '1990-01-01', 'abcdefgh', '18991231']) {
      expect(codeOf(() => cardFromRaon('comrc_v1_5', {...good, birth}, NOW)).code).toBe('E6006');
    }
    expect(codeOf(() => cardFromRaon('comrc_v1_5', {...good, ci: 'A'.repeat(89)}, NOW)).code).toBe('E6006');
    expect(codeOf(() => cardFromRaon('comrc_v1_5', {...good, name: '가'.repeat(22)}, NOW)).code).toBe('E6006'); // 66 bytes
    expect(cardFromRaon('comrc_v1_5', {...good, name: '가'.repeat(21)}, NOW).fields.name).toHaveLength(21); // 63 bytes
    expect(codeOf(() => cardFromRaon('comrc_v1_5', {...good, address: '가'.repeat(86)}, NOW)).code).toBe('E6006'); // 258 bytes
    expect(codeOf(() => cardFromRaon('comrc_v1_5', {...good, telno: '0'.repeat(17)}, NOW)).code).toBe('E6006');
    expect(codeOf(() => cardFromRaon('comrc_v1_5', {...good, sex: '남'}, NOW)).code).toBe('E6006');
  });

  test('returned card type must match', () => {
    const r = codeOf(() => cardFromRaon('comdl_v1_5', good, NOW));
    expect(r.code).toBe('E6007');
    expect(cardFromRaon('comdl_v1_5', {...good, provider: 'comdl_v1.5'}, NOW).type).toBe('comdl_v1_5');
  });

  test('isRealDate handles leap years', () => {
    expect(isRealDate('20000229')).toBe(true);
    expect(isRealDate('19000229')).toBe(false);
    expect(isRealDate('20240229')).toBe(true);
  });
});
