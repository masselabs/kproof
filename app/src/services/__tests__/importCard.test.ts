import {AppError} from '../../errors';
import {CARD_ORDER, CARD_TYPES, REQUEST_PROVIDER, cardType, parseVcTypeCodeList, keyForProvider, keyForReturnedProvider} from '../../config/cardTypes';
import {CardMismatchError, cardFromAnswer, isRealDate} from '../importCard';

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

describe('cardFromAnswer', () => {
  test('stores only the allow-listed fields', () => {
    const card = cardFromAnswer(good, NOW, 'comrc_v1_5');
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
        const r = codeOf(() => cardFromAnswer(data, NOW, key));
        expect(r.code).toBe('E6006');
        expect(r.detail).toContain(`'${field}'`);
        expect(codeOf(() => cardFromAnswer({...data, [field]: '  '}, NOW, key)).code).toBe('E6006');
      }
    }
  });

  test('a card without an address is stored', () => {
    const rest = {...good, address: undefined};
    expect(cardFromAnswer(rest, NOW, 'comrc_v1_5').fields.address).toBeUndefined();
  });

  test('birth must be a real date and fields must fit the circuit', () => {
    for (const birth of ['1990011', '19901301', '19900230', '1990-01-01', 'abcdefgh', '18991231']) {
      expect(codeOf(() => cardFromAnswer({...good, birth}, NOW, 'comrc_v1_5')).code).toBe('E6006');
    }
    expect(codeOf(() => cardFromAnswer({...good, ci: 'A'.repeat(89)}, NOW, 'comrc_v1_5')).code).toBe('E6006');
    expect(codeOf(() => cardFromAnswer({...good, name: '가'.repeat(22)}, NOW, 'comrc_v1_5')).code).toBe('E6006'); // 66 bytes
    expect(cardFromAnswer({...good, name: '가'.repeat(21)}, NOW, 'comrc_v1_5').fields.name).toHaveLength(21); // 63 bytes
    expect(codeOf(() => cardFromAnswer({...good, address: '가'.repeat(86)}, NOW, 'comrc_v1_5')).code).toBe('E6006'); // 258 bytes
    expect(codeOf(() => cardFromAnswer({...good, telno: '0'.repeat(17)}, NOW, 'comrc_v1_5')).code).toBe('E6006');
    expect(codeOf(() => cardFromAnswer({...good, sex: '남'}, NOW, 'comrc_v1_5')).code).toBe('E6006');
  });

  test('the card is stored only when it is the type the person chose', () => {
    // The request is the generic mobile-ID code (what the relay's web widget sends); the
    // government app sends the representative card; the choice is checked.
    expect(REQUEST_PROVIDER).toBe('coidentitydocument_v1.5');
    for (const key of CARD_ORDER) {
      expect(cardFromAnswer({...good, provider: CARD_TYPES[key].provider}, NOW, key).type).toBe(key);
    }
  });

  test('a different card than the one chosen is refused, naming both', () => {
    for (const chose of CARD_ORDER) {
      for (const sent of CARD_ORDER) {
        if (chose === sent) continue;
        let caught: unknown;
        try {
          cardFromAnswer({...good, provider: CARD_TYPES[sent].provider}, NOW, chose);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(CardMismatchError);
        const e = caught as CardMismatchError;
        expect(e.code).toBe('E6007');
        expect(e.chose).toBe(chose);
        expect(e.received).toBe(sent);
        expect(e.detail).toContain(CARD_TYPES[sent].provider);
      }
    }
    // The bare id the relay may send is matched too.
    expect(cardFromAnswer({...good, provider: 'comdl'}, NOW, 'comdl_v1_5').type).toBe('comdl_v1_5');
    expect(codeOf(() => cardFromAnswer({...good, provider: 'comdl'}, NOW, 'comrc_v1_5')).code).toBe('E6007');
  });

  test('a mismatch is refused before field checks, so a bad card of the wrong type still says mismatch', () => {
    expect(codeOf(() => cardFromAnswer({...good, provider: 'comdl_v1.5', birth: 'x'}, NOW, 'comrc_v1_5')).code).toBe('E6007');
  });

  test('the bare provider id is accepted as well as the versioned code', () => {
    for (const [p, key] of [['comrc', 'comrc_v1_5'], ['comdl', 'comdl_v1_5'], ['comnh_prod', 'comnh_v1_5'], ['comdc', 'comdc_v1_5']] as const) {
      expect(keyForReturnedProvider(p)).toBe(key);
    }
  });

  test('a card the relay does not name, or names unknown, is refused naming the value', () => {
    const missing = codeOf(() => cardFromAnswer({...good, provider: undefined}, NOW, 'comrc_v1_5'));
    expect(missing.code).toBe('E6005');
    expect(missing.detail).toMatch(/does not say which card/);
    for (const p of ['coidentitydocument', 'comxx_v1.5', '', '__proto__', 'toString']) {
      const r = codeOf(() => cardFromAnswer({...good, provider: p}, NOW, 'comrc_v1_5'));
      expect(r.code).toBe('E6005');
    }
    expect(codeOf(() => cardFromAnswer({...good, provider: 'comxx_v1.5'}, NOW, 'comrc_v1_5')).detail).toContain("'comxx_v1.5'");
  });

  describe('the generic mobile-ID answer (provider coidentitydocument)', () => {
    // The shape of a real driver's licence answer, 2026-10-28: provider echoes
    // the request and vcTypeCodeList names the card as a bracketed string.
    const licence = {...good, provider: 'coidentitydocument', vcTypeCodeList: '[mdriverlic]', dlno: 'x', asort: '2종보통'};

    test('vcTypeCodeList decides the type: mdriverlic is the driver licence', () => {
      expect(cardFromAnswer(licence, NOW, 'comdl_v1_5').type).toBe('comdl_v1_5');
      expect(cardFromAnswer({...licence, vcTypeCodeList: ['mdriverlic']}, NOW, 'comdl_v1_5').type).toBe('comdl_v1_5');
      expect(cardFromAnswer({...licence, vcTypeCodeList: ' [ mdriverlic , mdriverlic ] '}, NOW, 'comdl_v1_5').type).toBe('comdl_v1_5');
      expect(cardFromAnswer({...licence, provider: 'coidentitydocument_v1.5'}, NOW, 'comdl_v1_5').type).toBe('comdl_v1_5');
    });

    test('identitycard is the resident registration card', () => {
      const resident = {...good, provider: 'coidentitydocument', vcTypeCodeList: '[identitycard]'};
      const card = cardFromAnswer(resident, NOW, 'comrc_v1_5');
      expect(card.type).toBe('comrc_v1_5');
      expect(card.fields.ihidnum).toBeUndefined();
      let caught: unknown;
      try {
        cardFromAnswer(resident, NOW, 'comdl_v1_5');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(CardMismatchError);
      expect((caught as CardMismatchError).received).toBe('comrc_v1_5');
      expect((caught as CardMismatchError).detail).toContain('[identitycard]');
      expect(codeOf(() => cardFromAnswer({...resident, vcTypeCodeList: '[identitycard, mdriverlic]'}, NOW, 'comrc_v1_5')).code).toBe('E6005');
    });

    test('a licence when another card was chosen is refused (E6007), naming what came back', () => {
      let caught: unknown;
      try {
        cardFromAnswer(licence, NOW, 'comrc_v1_5');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(CardMismatchError);
      expect((caught as CardMismatchError).received).toBe('comdl_v1_5');
      expect((caught as CardMismatchError).detail).toContain('[mdriverlic]');
    });

    test('an unknown, missing, empty or hostile card code is refused by name (E6005), nothing stored', () => {
      for (const list of ['[mresidentreg]', '[__proto__]', '[toString]', '[]', '', '[ ]', undefined, 42, {}]) {
        const r = codeOf(() => cardFromAnswer({...licence, vcTypeCodeList: list}, NOW, 'comdl_v1_5'));
        expect(r.code).toBe('E6005');
      }
      expect(codeOf(() => cardFromAnswer({...licence, vcTypeCodeList: '[mresidentreg]'}, NOW, 'comrc_v1_5')).detail).toContain("'mresidentreg'");
      expect(codeOf(() => cardFromAnswer({...licence, vcTypeCodeList: '[mdriverlic, mresidentreg]'}, NOW, 'comdl_v1_5')).detail).toContain("'mresidentreg'");
    });

    test('the refusal carries no personal values', () => {
      const r = codeOf(() => cardFromAnswer({...licence, vcTypeCodeList: '[mresidentreg]'}, NOW, 'comrc_v1_5'));
      for (const v of [good.ci, good.name, good.birth, good.ihidnum, good.telno, good.address]) expect(r.detail).not.toContain(v);
    });

    test('parseVcTypeCodeList', () => {
      expect(parseVcTypeCodeList('[mdriverlic]')).toEqual(['mdriverlic']);
      expect(parseVcTypeCodeList('[a, b]')).toEqual(['a', 'b']);
      expect(parseVcTypeCodeList(['a', 1, ' b '])).toEqual(['a', 'b']);
      expect(parseVcTypeCodeList(null)).toEqual([]);
    });
  });

  test('isRealDate handles leap years', () => {
    expect(isRealDate('20000229')).toBe(true);
    expect(isRealDate('19000229')).toBe(false);
    expect(isRealDate('20240229')).toBe(true);
  });
});
