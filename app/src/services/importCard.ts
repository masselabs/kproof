/**
 * Turns the ID data RAON returned into the card KProof stores, or refuses it.
 * Nothing is stored unless every required field is present and fits the
 * circuits' buffers.
 */
import {AppError} from '../errors';
import {CARD_TYPES, keyForReturnedProvider, type CardTypeKey} from '../config/cardTypes';
import {utf8Encode} from '../domain/bytes';
import {ADDRESS_MAX, CI_LEN, NAME_MAX, TELNO_MAX} from '../domain/mdlInputs';

export interface StoredCard {
  type: CardTypeKey;
  /** ISO time the card was imported. */
  importedAt: string;
  /** Allow-listed fields only (CARD_TYPES[type].stored), as strings. */
  fields: Record<string, string>;
}

const BYTE_CAPS: Readonly<Record<string, number>> = {
  ci: CI_LEN,
  name: NAME_MAX,
  telno: TELNO_MAX,
  address: ADDRESS_MAX,
};

export function isRealDate(yyyymmdd: string): boolean {
  if (!/^\d{8}$/.test(yyyymmdd)) return false;
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  if (y < 1900 || m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

export function cardFromRaon(data: Record<string, unknown>, now: Date): StoredCard {
  // The government app submits the person's representative card, whatever was
  // asked for; RAON names it in `provider`, and that decides the card type.
  let type: CardTypeKey;
  try {
    type = keyForReturnedProvider(data.provider);
  } catch (err) {
    throw new AppError('E6005', err instanceof Error ? err.message : String(err));
  }
  const spec = CARD_TYPES[type];

  for (const key of spec.required) {
    const v = asText(data[key]);
    if (v === undefined || v.trim().length === 0) {
      throw new AppError('E6006', `${spec.provider}: required field '${key}' is missing`);
    }
  }

  const fields: Record<string, string> = {};
  for (const key of spec.stored) {
    const v = asText(data[key]);
    if (v !== undefined && v.length > 0) fields[key] = v;
  }

  if (!isRealDate(fields.birth)) {
    throw new AppError('E6006', `${spec.provider}: 'birth' is not a YYYYMMDD date`);
  }
  for (const [key, cap] of Object.entries(BYTE_CAPS)) {
    const v = fields[key];
    if (v !== undefined && utf8Encode(v).length > cap) {
      throw new AppError('E6006', `${spec.provider}: '${key}' is longer than the circuit's ${cap} bytes`);
    }
  }
  if (fields.sex !== undefined && fields.sex.length > 0 && fields.sex.charCodeAt(0) > 0xff) {
    throw new AppError('E6006', `${spec.provider}: 'sex' is not a single-byte character`);
  }

  return {type, importedAt: now.toISOString(), fields};
}
