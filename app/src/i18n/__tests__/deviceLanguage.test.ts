/**
 * A Korean phone gets a Korean app; every other phone gets English.
 * Mirrors the ZKProofport app's test of the same function.
 *
 * EDGE-CASE MATRIX → coverage
 *   contract  → Intl says ko → ko
 *   contract  → Intl says en → en, without consulting the bridge
 *   integrity → a resolved non-Korean locale is an ANSWER, not a miss
 *   failure   → no Intl at all → falls back to the bridge
 *   failure   → neither → 'en', and does not throw
 *   boundary  → ko, ko-KR, KO-kr, ko-Hang-KR all count as Korean
 *   hostile   → a locale merely CONTAINING "ko" (en-KO, sko) is not Korean
 */

const nativeModules: Record<string, unknown> = {};
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  get NativeModules() {
    return nativeModules;
  },
}));

import { getDeviceLanguage } from '../deviceLanguage';

/** Replace `Intl.DateTimeFormat` for one case. `null` removes Intl entirely. */
function withIntl(locale: string | null | 'throw', run: () => void) {
  const real = globalThis.Intl;
  if (locale === null) {
    // @ts-expect-error — deliberately removing it, which is the no-intl build.
    delete globalThis.Intl;
  } else {
    globalThis.Intl = {
      DateTimeFormat: () => ({
        resolvedOptions: () => {
          if (locale === 'throw') throw new Error('no intl data');
          return { locale };
        },
      }),
    } as unknown as typeof Intl;
  }
  try {
    run();
  } finally {
    globalThis.Intl = real;
  }
}

beforeEach(() => {
  for (const k of Object.keys(nativeModules)) delete nativeModules[k];
});

describe('the phone language decides the app language', () => {
  it('CONTRACT: Intl says ko-KR → ko', () => {
    // THE defect. Before the fix this returned 'en' on exactly this input.
    withIntl('ko-KR', () => expect(getDeviceLanguage()).toBe('ko'));
  });

  it('CONTRACT: Intl says en-US → en', () => {
    withIntl('en-US', () => expect(getDeviceLanguage()).toBe('en'));
  });

  it('INTEGRITY: a resolved non-Korean locale is an ANSWER, not a miss', () => {
    /*
     * The bridge must not get a second vote. If it did, a phone that resolved
     * `ja-JP` through Intl but had a stale `ko` on the legacy module would come
     * out Korean — two sources of truth disagreeing, with the wrong one winning
     * because it ran last.
     */
    nativeModules.I18nManager = { localeIdentifier: 'ko-KR' };
    withIntl('ja-JP', () => expect(getDeviceLanguage()).toBe('en'));
  });

  it.each([
    ['ko', 'ko'],
    ['ko-KR', 'ko'],
    ['KO-kr', 'ko'],
    ['ko-Hang-KR', 'ko'],
  ])('BOUNDARY: %s is Korean', (locale, expected) => {
    // Case and script subtags vary by platform and OS version; all of these are
    // the same language to a person.
    withIntl(locale, () => expect(getDeviceLanguage()).toBe(expected));
  });

  it.each(['en-KO', 'sko', 'tok', 'en-US-u-ca-korean'])(
    'HOSTILE: %s merely contains "ko" and is NOT Korean',
    (locale) => {
      // A substring match here would put an English speaker in a Korean app —
      // the same defect pointing the other way.
      withIntl(locale, () => expect(getDeviceLanguage()).toBe('en'));
    },
  );

  it('FAILURE: no Intl in this build → the bridge is consulted', () => {
    /*
     * The fallback is not decoration. An older Hermes without `intl` is a real
     * configuration, and on the OLD architecture the bridge is what answers.
     */
    nativeModules.I18nManager = { localeIdentifier: 'ko-KR' };
    withIntl(null, () => expect(getDeviceLanguage()).toBe('ko'));
  });

  it('FAILURE: Intl that throws → the bridge is consulted', () => {
    nativeModules.I18nManager = { localeIdentifier: 'ko-KR' };
    withIntl('throw', () => expect(getDeviceLanguage()).toBe('ko'));
  });

  it('FAILURE: neither source answers → en, and it does not throw', () => {
    /*
     * The state the phone was ACTUALLY in: the module present, the property
     * missing. English is the right default — it is the fallback language — but
     * only after both sources were genuinely asked.
     */
    nativeModules.I18nManager = {}; // present, no localeIdentifier
    withIntl('throw', () => {
      expect(() => getDeviceLanguage()).not.toThrow();
      expect(getDeviceLanguage()).toBe('en');
    });
  });

  it('REPETITION: twenty calls on a Korean phone all say ko', () => {
    // Called on every cold start and after every language change; a decision
    // that drifted would show as an app that changes language by itself.
    withIntl('ko-KR', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 20; i++) seen.add(getDeviceLanguage());
      expect([...seen]).toEqual(['ko']);
    });
  });
});
