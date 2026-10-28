/** How a request, a card, a region and a biometry kind read on screen, in the current language. */
import i18n from '../i18n';
import {cardType, isCardTypeKey, type CardTypeKey} from '../config/cardTypes';
import {isSiDo, SI_DO} from '../domain/regions';
import type {Infeasible} from '../domain/predicates';
import type {RequestInputs} from '../domain/request';
import {IN_APP_DAPP_NAME} from '../services/inAppProof';

const t = i18n.t.bind(i18n);

/**
 * A si/do as the person reads it: the Korean name in Korean, its official
 * English name in English. Display only — circuits and request inputs keep the
 * Korean name.
 */
export function regionName(region: string): string {
  if (!isSiDo(region)) throw new Error(`Unknown region '${region}'. Known: ${SI_DO.join(', ')}.`);
  return t(`regions.${region}`);
}

/** Why this card cannot answer the request, for the request screen. */
export function cannotText(why: Infeasible, inputs: RequestInputs): string {
  switch (why) {
    case 'noAddress':
      return t('cannot.noAddress');
    case 'ageBelow':
      if (inputs.circuitId !== 'mdl_kr_age') throw new Error(`'${why}' does not apply to ${inputs.circuitId}`);
      return t('cannot.ageBelow', {age: inputs.ageThreshold});
    case 'regionDiffers':
      if (inputs.circuitId !== 'mdl_kr_region') throw new Error(`'${why}' does not apply to ${inputs.circuitId}`);
      return t('cannot.regionDiffers', {region: regionName(inputs.targetRegion)});
  }
}

export function questionText(inputs: RequestInputs): string {
  switch (inputs.circuitId) {
    case 'mdl_kr_ownership':
      return t('request.question.mdl_kr_ownership');
    case 'mdl_kr_age':
      return t('request.question.mdl_kr_age', {age: inputs.ageThreshold});
    case 'mdl_kr_region':
      return t('request.question.mdl_kr_region', {region: regionName(inputs.targetRegion)});
  }
}

export function factText(inputs: RequestInputs): string {
  switch (inputs.circuitId) {
    case 'mdl_kr_ownership':
      return t('request.sendsFact.mdl_kr_ownership');
    case 'mdl_kr_age':
      return t('request.sendsFact.mdl_kr_age', {age: inputs.ageThreshold});
    case 'mdl_kr_region':
      return t('request.sendsFact.mdl_kr_region', {region: regionName(inputs.targetRegion)});
  }
}

export function shortWhat(inputs: RequestInputs): string {
  switch (inputs.circuitId) {
    case 'mdl_kr_ownership':
      return t('history.what.mdl_kr_ownership');
    case 'mdl_kr_age':
      return t('history.what.mdl_kr_age', {age: inputs.ageThreshold});
    case 'mdl_kr_region':
      return t('history.what.mdl_kr_region', {region: regionName(inputs.targetRegion)});
  }
}

/**
 * The requesting service's name. The app's own in-app requests carry a fixed
 * wire name and read as "KProof app" in the current language.
 */
export function serviceName(dappName: string | undefined): string {
  if (dappName === undefined) return t('request.unnamed');
  if (dappName === IN_APP_DAPP_NAME) return t('request.inAppName');
  return dappName;
}

function cardRow(key: CardTypeKey, field: 'name' | 'plain' | 'short'): string {
  if (!isCardTypeKey(key)) throw new Error(`No display name for card type '${key}'`);
  return t(`cardTypes.${key}.${field}`);
}

export function cardName(key: CardTypeKey): string {
  return cardRow(key, 'name');
}

export function cardPlain(key: CardTypeKey): string {
  return cardRow(key, 'plain');
}

export function cardShort(key: CardTypeKey): string {
  return cardRow(key, 'short');
}

export function cardColor(key: CardTypeKey): string {
  return cardType(key).color;
}

const BIOMETRY_KINDS = ['FaceID', 'TouchID', 'OpticID', 'Fingerprint', 'Face', 'Iris'] as const;
type BiometryKind = (typeof BIOMETRY_KINDS)[number];

export function biometryLabel(kind: string): string {
  // Display only: an unrecognised biometry name still reads as the generic label.
  if (!(BIOMETRY_KINDS as readonly string[]).includes(kind)) return t('biometry.generic');
  return t(`biometry.${kind as BiometryKind}`);
}

/** How long the phone's own check took: "under 0.01 s", "0.04 s", "1.8 s". */
export function durationText(ms: number): string {
  if (ms < 10) return t('done.underTenMs');
  return t('done.seconds', {seconds: ms < 1000 ? (ms / 1000).toFixed(2) : (ms / 1000).toFixed(1)});
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
