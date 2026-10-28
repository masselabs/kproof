/**
 * The mobile ID card types KProof can import, keyed by the relay's provider
 * code (the codes proofport-app's MobileIdTypeSheet sends). One table; an
 * unknown provider throws.
 *
 * `required`: fields the answer must carry for the card to be stored. Every
 * circuit needs `ci` (nullifier) and the age circuit `birth`; `name` is shown
 * on the card. `address` is not required: a card without one is stored, and a
 * region request is told up front that it cannot be proven from it.
 *
 * `stored`: the ONLY fields kept on the phone. Everything else the relay returns
 * (notably `ihidnum`, the resident registration number) is dropped on import.
 */
export const CARD_TYPES = {
  comrc_v1_5: {
    provider: 'comrc_v1.5',
    color: '#0047A0',
    required: ['ci', 'name', 'birth'],
    stored: ['ci', 'name', 'birth', 'telno', 'sex', 'address', 'issuanceDate', 'expirationDate', 'vcTypeCode', 'provider', 'jti', 'pri', 'iss', 'iat', 'exp'],
  },
  comdl_v1_5: {
    provider: 'comdl_v1.5',
    color: '#161619',
    required: ['ci', 'name', 'birth'],
    stored: ['ci', 'name', 'birth', 'telno', 'sex', 'address', 'issuanceDate', 'expirationDate', 'vcTypeCode', 'provider', 'jti', 'pri', 'iss', 'iat', 'exp', 'asort'],
  },
  comnh_v1_5: {
    provider: 'comnh_v1.5',
    color: '#CD2E3A',
    required: ['ci', 'name', 'birth'],
    stored: ['ci', 'name', 'birth', 'telno', 'sex', 'address', 'issuanceDate', 'expirationDate', 'vcTypeCode', 'provider', 'jti', 'pri', 'iss', 'iat', 'exp'],
  },
  comdc_v1_5: {
    provider: 'comdc_v1.5',
    color: '#3264DA',
    required: ['ci', 'name', 'birth'],
    stored: ['ci', 'name', 'birth', 'telno', 'sex', 'address', 'issuanceDate', 'expirationDate', 'vcTypeCode', 'provider', 'jti', 'pri', 'iss', 'iat', 'exp'],
  },
  coresidence_v1_5: {
    provider: 'coresidence_v1.5',
    color: '#10204B',
    required: ['ci', 'name', 'birth'],
    stored: ['ci', 'name', 'birth', 'telno', 'sex', 'address', 'issuanceDate', 'expirationDate', 'vcTypeCode', 'provider', 'jti', 'pri', 'iss', 'iat', 'exp'],
  },
} as const;

export type CardTypeKey = keyof typeof CARD_TYPES;
export type Provider = (typeof CARD_TYPES)[CardTypeKey]['provider'];
export type CardType = (typeof CARD_TYPES)[CardTypeKey];

/** Display order in the wallet and the import list. */
export const CARD_ORDER: readonly CardTypeKey[] = ['comrc_v1_5', 'comdl_v1_5', 'comnh_v1_5', 'comdc_v1_5', 'coresidence_v1_5'];

export function isCardTypeKey(key: unknown): key is CardTypeKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(CARD_TYPES, key);
}

export function cardType(key: unknown): CardType {
  if (!isCardTypeKey(key)) {
    throw new Error(`Unknown card type '${String(key)}'. Known: ${Object.keys(CARD_TYPES).join(', ')}.`);
  }
  return CARD_TYPES[key];
}

export function keyForProvider(provider: unknown): CardTypeKey {
  const key = CARD_ORDER.find((k) => CARD_TYPES[k].provider === provider);
  if (!key) {
    throw new Error(
      `Unknown provider '${String(provider)}'. Known: ${CARD_ORDER.map((k) => CARD_TYPES[k].provider).join(', ')}.`,
    );
  }
  return key;
}


/**
 * The code every import request carries: 모바일 신분증 (coidentitydocument), the
 * generic mobile-ID code. The government app submits the person's
 * representative card (대표신분증); the answer names it (see keyForReturnedCard)
 * and cardFromAnswer refuses a card of another type than the one chosen
 * (E6007). Card-specific codes are refused by the relay on this path
 * (measured 2026-10-27).
 */
export const REQUEST_PROVIDER = 'coidentitydocument_v1.5';
export type RequestProvider = typeof REQUEST_PROVIDER;

/**
 * The card type the relay says it returned. Accepts the versioned code
 * (`comrc_v1.5`) and the bare provider id (`comrc`), since which one the
 * answer carries is not documented; anything else throws naming the value.
 */
export function keyForReturnedProvider(provider: unknown): CardTypeKey {
  if (typeof provider !== 'string' || provider.length === 0) {
    throw new Error(`the answer does not say which card it is (provider=${String(provider)})`);
  }
  const base = provider.split('_')[0];
  const key = CARD_ORDER.find((k) => CARD_TYPES[k].provider.split('_')[0] === base);
  if (!key) {
    throw new Error(
      `unknown card '${provider}'. Known: ${CARD_ORDER.map((k) => CARD_TYPES[k].provider).join(', ')}.`,
    );
  }
  return key;
}

/** The `provider` the relay answers when the request was the generic mobile-ID code: it names no card. */
export const GENERIC_PROVIDER = 'coidentitydocument';

/**
 * The card codes in the answer's `vcTypeCodeList`, which names the card the
 * government app submitted when `provider` is the generic code. Only codes
 * seen in a real answer are listed: `mdriverlic` from a driver's licence import
 * on a real phone, 2026-10-28 (vcTypeCodeList = "[mdriverlic]"), and
 * `identitycard` from a resident registration card import, 2026-10-28. Any
 * other code is refused by name, and is added here once an answer shows it.
 */
export const VC_TYPE_CODES: Readonly<Record<string, CardTypeKey>> = {
  mdriverlic: 'comdl_v1_5',
  identitycard: 'comrc_v1_5',
};

/** the relay sends the list as a string like "[mdriverlic]" (seen 2026-10-28); an array is accepted too. */
export function parseVcTypeCodeList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((c): c is string => typeof c === 'string').map((c) => c.trim()).filter((c) => c.length > 0);
  if (typeof raw !== 'string') return [];
  return raw.replace(/^\s*\[/, '').replace(/\]\s*$/, '').split(',').map((c) => c.trim()).filter((c) => c.length > 0);
}

/** The card type of a the relay answer: from `vcTypeCodeList` for the generic code, else from `provider`. */
export function keyForReturnedCard(data: Record<string, unknown>): CardTypeKey {
  const provider = data.provider;
  if (typeof provider !== 'string' || provider.split('_')[0] !== GENERIC_PROVIDER) {
    return keyForReturnedProvider(provider);
  }
  const codes = parseVcTypeCodeList(data.vcTypeCodeList);
  if (codes.length === 0) {
    throw new Error(`the answer '${provider}' has no card code (vcTypeCodeList=${JSON.stringify(data.vcTypeCodeList)})`);
  }
  const keys = new Set<CardTypeKey>();
  for (const code of codes) {
    if (!Object.prototype.hasOwnProperty.call(VC_TYPE_CODES, code)) {
      throw new Error(`unknown card code '${code}'. Known: ${Object.keys(VC_TYPE_CODES).join(', ')}.`);
    }
    keys.add(VC_TYPE_CODES[code]);
  }
  if (keys.size !== 1) {
    throw new Error(`more than one card type: ${codes.join(', ')}`);
  }
  return [...keys][0];
}
