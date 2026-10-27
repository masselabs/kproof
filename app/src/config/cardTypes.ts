/**
 * The mobile ID card types KProof can import, keyed by the RAON OACX provider
 * code (the codes proofport-app's MobileIdTypeSheet sends). One table; an
 * unknown provider throws.
 *
 * `required`: fields the answer must carry for the card to be stored. Every
 * circuit needs `ci` (nullifier) and the age circuit `birth`; `name` is shown
 * on the card. `address` is not required: a card without one is stored, and a
 * region request is told up front that it cannot be proven from it.
 *
 * `raon`: whether RAON's OACX server will start an import for this card type.
 * Measured 2026-10-27 by calling authen/app/request for each provider:
 * comdl_v1.5 answered OACX_SUCCESS; comrc_v1.5 and coresidence_v1.5 answered
 * OACX_NO_PARAM_PROVIDER ("인증사업자 값이 설정되지 않았습니다"); comnh_v1.5
 * answered OACX_SERVER_ERROR. Rows that are not 'available' are shown but
 * cannot be chosen. Re-measure when RAON (or the KOMSCO direct integration)
 * changes this.
 *
 * `stored`: the ONLY fields kept on the phone. Everything else RAON returns
 * (notably `ihidnum`, the resident registration number) is dropped on import.
 */
export const CARD_TYPES = {
  comrc_v1_5: {
    provider: 'comrc_v1.5',
    raon: 'not_configured',
    color: '#0047A0',
    required: ['ci', 'name', 'birth'],
    stored: ['ci', 'name', 'birth', 'telno', 'sex', 'address', 'issuanceDate', 'expirationDate', 'vcTypeCode', 'provider', 'jti', 'pri', 'iss', 'iat', 'exp'],
  },
  comdl_v1_5: {
    provider: 'comdl_v1.5',
    raon: 'available',
    color: '#161619',
    required: ['ci', 'name', 'birth'],
    stored: ['ci', 'name', 'birth', 'telno', 'sex', 'address', 'issuanceDate', 'expirationDate', 'vcTypeCode', 'provider', 'jti', 'pri', 'iss', 'iat', 'exp', 'asort'],
  },
  comnh_v1_5: {
    provider: 'comnh_v1.5',
    raon: 'server_error',
    color: '#CD2E3A',
    required: ['ci', 'name', 'birth'],
    stored: ['ci', 'name', 'birth', 'telno', 'sex', 'address', 'issuanceDate', 'expirationDate', 'vcTypeCode', 'provider', 'jti', 'pri', 'iss', 'iat', 'exp'],
  },
  coresidence_v1_5: {
    provider: 'coresidence_v1.5',
    raon: 'not_configured',
    color: '#10204B',
    required: ['ci', 'name', 'birth'],
    stored: ['ci', 'name', 'birth', 'telno', 'sex', 'address', 'issuanceDate', 'expirationDate', 'vcTypeCode', 'provider', 'jti', 'pri', 'iss', 'iat', 'exp'],
  },
} as const;

export type CardTypeKey = keyof typeof CARD_TYPES;
export type RaonAvailability = 'available' | 'not_configured' | 'server_error';
export type Provider = (typeof CARD_TYPES)[CardTypeKey]['provider'];
export type CardType = (typeof CARD_TYPES)[CardTypeKey];

/** Display order in the wallet and the import list. */
export const CARD_ORDER: readonly CardTypeKey[] = ['comrc_v1_5', 'comdl_v1_5', 'comnh_v1_5', 'coresidence_v1_5'];

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

/** True when RAON will start an import for this card type today. */
export function isImportable(key: CardTypeKey): boolean {
  const raon: RaonAvailability = CARD_TYPES[key].raon;
  return raon === 'available';
}
