/** Korean phrasing of what a request asks, shared by Request, Done and History. */
import {ko} from '../i18n/ko';
import {cardType, type CardTypeKey} from '../config/cardTypes';
import type {RequestInputs} from '../domain/request';

export function questionText(inputs: RequestInputs): string {
  switch (inputs.circuitId) {
    case 'mdl_kr_ownership':
      return ko.request.question.mdl_kr_ownership;
    case 'mdl_kr_age':
      return ko.request.question.mdl_kr_age(inputs.ageThreshold);
    case 'mdl_kr_region':
      return ko.request.question.mdl_kr_region(inputs.targetRegion);
  }
}

export function factText(inputs: RequestInputs): string {
  switch (inputs.circuitId) {
    case 'mdl_kr_ownership':
      return ko.request.sendsFact.mdl_kr_ownership;
    case 'mdl_kr_age':
      return ko.request.sendsFact.mdl_kr_age(inputs.ageThreshold);
    case 'mdl_kr_region':
      return ko.request.sendsFact.mdl_kr_region(inputs.targetRegion);
  }
}

export function shortWhat(inputs: RequestInputs): string {
  switch (inputs.circuitId) {
    case 'mdl_kr_ownership':
      return ko.history.what.mdl_kr_ownership;
    case 'mdl_kr_age':
      return ko.history.what.mdl_kr_age(inputs.ageThreshold);
    case 'mdl_kr_region':
      return ko.history.what.mdl_kr_region(inputs.targetRegion);
  }
}

export function cardName(key: CardTypeKey): string {
  const row = ko.cardTypes[key];
  if (!row) throw new Error(`No display name for card type '${key}'`);
  return row.name;
}

export function cardPlain(key: CardTypeKey): string {
  const row = ko.cardTypes[key];
  if (!row) throw new Error(`No display name for card type '${key}'`);
  return row.plain;
}

export function cardShort(key: CardTypeKey): string {
  const row = ko.cardTypes[key];
  if (!row) throw new Error(`No display name for card type '${key}'`);
  return row.short;
}

export function cardColor(key: CardTypeKey): string {
  return cardType(key).color;
}

export function biometryLabel(kind: string): string {
  const label = ko.biometry[kind];
  // Display only: an unrecognised biometry name still reads as "생체 인증".
  return label === undefined ? ko.biometry.generic : label;
}

/** 2026.10.27 */
export function dateDots(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 10.27 19:12 */
export function shortStamp(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 19900101 -> 1990.01.01 */
export function birthDots(birth: string): string {
  return /^\d{8}$/.test(birth) ? `${birth.slice(0, 4)}.${birth.slice(4, 6)}.${birth.slice(6, 8)}` : birth;
}

/** 홍길동 -> 홍*동; HONG GILDONG -> H*** G******. Display masking only. */
export function maskName(name: string): string {
  const chars = Array.from(name);
  if (chars.length <= 1) return '*';
  if (/^[ㄱ-힝]+$/.test(name)) {
    return chars.length === 2 ? `${chars[0]}*` : `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
  }
  return name
    .split(' ')
    .map((w) => (w.length === 0 ? w : w[0] + '*'.repeat(Math.max(0, Array.from(w).length - 1))))
    .join(' ');
}
