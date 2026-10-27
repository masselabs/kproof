/**
 * The vault: every imported card, in ONE Keychain item (Android: Keystore,
 * AES-GCM) whose access control requires the person.
 *
 * - Biometrics enrolled: BIOMETRY_CURRENT_SET. Re-enrolling invalidates the
 *   item; the person imports again (E4003).
 * - No biometrics, device passcode set: DEVICE_PASSCODE.
 * - Neither: the app refuses to hold an ID (E4002).
 *
 * Reading the item IS the unlock: the OS shows the prompt, and nothing is
 * readable without it. One item keeps it to one prompt per unlock.
 */
import {AppError} from '../errors';
import {isCardTypeKey} from '../config/cardTypes';
import type {StoredCard} from './importCard';

export const VAULT_SERVICE = 'com.masselabs.kproof.vault';
const VAULT_USER = 'kproof';

export interface Vault {
  v: 1;
  cards: StoredCard[];
}

export const EMPTY_VAULT: Vault = {v: 1, cards: []};

export type DeviceSecurity = {kind: 'biometry'; biometry: string} | {kind: 'passcode'} | {kind: 'none'};

/** The parts of react-native-keychain the vault uses, injected for tests. */
export interface KeychainPort {
  getSupportedBiometryType(): Promise<string | null>;
  isPasscodeAuthAvailable(): Promise<boolean>;
  hasGenericPassword(options: {service: string}): Promise<boolean>;
  getGenericPassword(options: {
    service: string;
    authenticationPrompt: {title: string; cancel: string};
  }): Promise<false | {password: string}>;
  setGenericPassword(
    username: string,
    password: string,
    options: {service: string; accessControl: 'BiometryCurrentSet' | 'DevicePasscode'},
  ): Promise<false | object>;
  resetGenericPassword(options: {service: string}): Promise<boolean>;
}

export async function deviceSecurity(kc: KeychainPort): Promise<DeviceSecurity> {
  const biometry = await kc.getSupportedBiometryType();
  if (biometry) return {kind: 'biometry', biometry};
  if (await kc.isPasscodeAuthAvailable()) return {kind: 'passcode'};
  return {kind: 'none'};
}

function accessControlFor(security: DeviceSecurity): 'BiometryCurrentSet' | 'DevicePasscode' {
  switch (security.kind) {
    case 'biometry':
      return 'BiometryCurrentSet';
    case 'passcode':
      return 'DevicePasscode';
    case 'none':
      throw new AppError('E4002', 'no biometrics and no device passcode');
  }
}

export function parseVault(text: string): Vault {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AppError('E4003', 'the vault is not JSON');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new AppError('E4003', 'the vault is not an object');
  }
  const obj = json as Record<string, unknown>;
  if (obj.v !== 1) throw new AppError('E4003', `unknown vault version '${String(obj.v)}'`);
  if (!Array.isArray(obj.cards)) throw new AppError('E4003', 'the vault has no card list');
  const seen = new Set<string>();
  const cards: StoredCard[] = obj.cards.map((c, i) => {
    if (typeof c !== 'object' || c === null) throw new AppError('E4003', `card ${i} is not an object`);
    const card = c as Record<string, unknown>;
    if (!isCardTypeKey(card.type)) throw new AppError('E4003', `card ${i} has unknown type '${String(card.type)}'`);
    if (seen.has(card.type)) throw new AppError('E4003', `card type ${card.type} appears twice`);
    seen.add(card.type);
    if (typeof card.importedAt !== 'string') throw new AppError('E4003', `card ${i} has no import time`);
    const fields = card.fields;
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
      throw new AppError('E4003', `card ${i} has no fields`);
    }
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v !== 'string') throw new AppError('E4003', `card ${i} field ${k} is not text`);
    }
    for (const k of ['ci', 'name', 'birth']) {
      if (typeof (fields as Record<string, unknown>)[k] !== 'string') {
        throw new AppError('E4003', `card ${i} is missing ${k}`);
      }
    }
    return {type: card.type, importedAt: card.importedAt, fields: fields as Record<string, string>};
  });
  return {v: 1, cards};
}

export async function writeVault(kc: KeychainPort, vault: Vault): Promise<void> {
  const security = await deviceSecurity(kc);
  let result: false | object;
  try {
    result = await kc.setGenericPassword(VAULT_USER, JSON.stringify(vault), {
      service: VAULT_SERVICE,
      accessControl: accessControlFor(security),
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('E5001', `Keychain write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (result === false) throw new AppError('E5001', 'Keychain write returned false');
}

/**
 * Read the vault through the OS prompt. Creates an empty vault on first run.
 * A cancelled or failed prompt is E4001 and nothing is returned.
 */
export async function openVault(kc: KeychainPort, prompt: {title: string; cancel: string}): Promise<Vault> {
  const security = await deviceSecurity(kc);
  if (security.kind === 'none') throw new AppError('E4002', 'no biometrics and no device passcode');

  let exists: boolean;
  try {
    exists = await kc.hasGenericPassword({service: VAULT_SERVICE});
  } catch (err) {
    throw new AppError('E4003', `Keychain lookup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!exists) await writeVault(kc, EMPTY_VAULT);
  let item: false | {password: string};
  try {
    item = await kc.getGenericPassword({service: VAULT_SERVICE, authenticationPrompt: prompt});
  } catch (err) {
    throw new AppError('E4001', `authentication did not complete: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (item === false) {
    // The item exists but cannot be read: on iOS, what a BIOMETRY_CURRENT_SET
    // item looks like after Face ID / Touch ID was re-enrolled.
    throw new AppError('E4003', 'the vault exists but could not be read');
  }
  return parseVault(item.password);
}

export async function resetVault(kc: KeychainPort): Promise<void> {
  await kc.resetGenericPassword({service: VAULT_SERVICE});
}

export function withCard(vault: Vault, card: StoredCard): Vault {
  return {v: 1, cards: [...vault.cards.filter((c) => c.type !== card.type), card]};
}

export function withoutCard(vault: Vault, type: string): Vault {
  return {v: 1, cards: vault.cards.filter((c) => c.type !== type)};
}
