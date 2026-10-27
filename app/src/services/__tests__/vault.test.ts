import {AppError} from '../../errors';
import {EMPTY_VAULT, VAULT_SERVICE, openVault, parseVault, withCard, withoutCard, writeVault, type KeychainPort} from '../vault';
import type {StoredCard} from '../importCard';

const PROMPT = {title: 't', cancel: 'c'};

function fakeKeychain(over: Partial<KeychainPort> = {}) {
  const items = new Map<string, {password: string; accessControl: string}>();
  const calls: string[] = [];
  const kc: KeychainPort = {
    getSupportedBiometryType: async () => 'FaceID',
    isPasscodeAuthAvailable: async () => true,
    hasGenericPassword: async ({service}) => items.has(service),
    getGenericPassword: async ({service}) => {
      calls.push('get');
      const it = items.get(service);
      return it ? {password: it.password} : false;
    },
    setGenericPassword: async (_u, password, {service, accessControl}) => {
      calls.push(`set:${accessControl}`);
      items.set(service, {password, accessControl});
      return {service};
    },
    resetGenericPassword: async ({service}) => items.delete(service),
    ...over,
  };
  return {kc, items, calls};
}

const card: StoredCard = {type: 'comrc_v1_5', importedAt: '2026-10-27T00:00:00.000Z', fields: {ci: 'C', name: 'N', birth: '19900101'}};

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
  throw new Error('expected a failure');
}

describe('vault', () => {
  test('first run creates an empty vault, then reads it through the prompt', async () => {
    const {kc, calls} = fakeKeychain();
    expect(await openVault(kc, PROMPT)).toEqual(EMPTY_VAULT);
    expect(calls).toEqual(['set:BiometryCurrentSet', 'get']);
  });

  test('biometrics enrolled: BIOMETRY_CURRENT_SET; passcode only: DEVICE_PASSCODE', async () => {
    const bio = fakeKeychain();
    await writeVault(bio.kc, EMPTY_VAULT);
    expect(bio.items.get(VAULT_SERVICE)!.accessControl).toBe('BiometryCurrentSet');
    const pass = fakeKeychain({getSupportedBiometryType: async () => null});
    await writeVault(pass.kc, EMPTY_VAULT);
    expect(pass.items.get(VAULT_SERVICE)!.accessControl).toBe('DevicePasscode');
  });

  test('no device security is a blocker', async () => {
    const {kc, calls} = fakeKeychain({getSupportedBiometryType: async () => null, isPasscodeAuthAvailable: async () => false});
    expect(await codeOf(openVault(kc, PROMPT))).toBe('E4002');
    expect(await codeOf(writeVault(kc, EMPTY_VAULT))).toBe('E4002');
    expect(calls).toEqual([]);
  });

  test('a cancelled prompt leaves it locked', async () => {
    const {kc} = fakeKeychain({
      hasGenericPassword: async () => true,
      getGenericPassword: async () => Promise.reject(new Error('User canceled the operation.')),
    });
    expect(await codeOf(openVault(kc, PROMPT))).toBe('E4001');
  });

  test('an item that exists but cannot be read is E4003', async () => {
    const {kc} = fakeKeychain({hasGenericPassword: async () => true, getGenericPassword: async () => false});
    expect(await codeOf(openVault(kc, PROMPT))).toBe('E4003');
  });

  test('a corrupted vault is reported', async () => {
    const bad = [
      'not json',
      '[]',
      '{"v":2,"cards":[]}',
      '{"v":1}',
      '{"v":1,"cards":[{"type":"toString","importedAt":"x","fields":{}}]}',
      '{"v":1,"cards":[{"type":"comrc_v1_5","importedAt":"x","fields":{"ci":"c","name":"n"}}]}',
      '{"v":1,"cards":[{"type":"comrc_v1_5","importedAt":"x","fields":{"ci":"c","name":"n","birth":1}}]}',
      JSON.stringify({v: 1, cards: [card, card]}),
    ];
    for (const text of bad) {
      expect(() => parseVault(text)).toThrow(AppError);
      try {
        parseVault(text);
      } catch (err) {
        expect((err as AppError).code).toBe('E4003');
      }
    }
    const {kc, items} = fakeKeychain();
    items.set(VAULT_SERVICE, {password: '{"v":1,"cards":"x"}', accessControl: 'BiometryCurrentSet'});
    expect(await codeOf(openVault(kc, PROMPT))).toBe('E4003');
  });

  test('a Keychain that cannot be queried is E4003, not a cancelled prompt', async () => {
    const {kc} = fakeKeychain({hasGenericPassword: async () => Promise.reject(new Error("Internal error when a required entitlement isn't present."))});
    expect(await codeOf(openVault(kc, PROMPT))).toBe('E4003');
  });

  test('a write that fails is E5001', async () => {
    const {kc} = fakeKeychain({setGenericPassword: async () => false});
    expect(await codeOf(writeVault(kc, EMPTY_VAULT))).toBe('E5001');
    const {kc: kc2} = fakeKeychain({setGenericPassword: async () => Promise.reject(new Error('disk'))});
    expect(await codeOf(writeVault(kc2, EMPTY_VAULT))).toBe('E5001');
  });

  test('round trip, replacing a card of the same type, and deleting a card', async () => {
    const {kc} = fakeKeychain();
    const v1 = withCard(EMPTY_VAULT, card);
    const v2 = withCard(v1, {...card, fields: {...card.fields, name: 'M'}});
    expect(v2.cards).toHaveLength(1);
    await writeVault(kc, v2);
    expect(await openVault(kc, PROMPT)).toEqual(v2);
    expect(withoutCard(v2, 'comrc_v1_5').cards).toEqual([]);
  });
});
