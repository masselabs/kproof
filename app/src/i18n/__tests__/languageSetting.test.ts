/**
 * The app comes up in the phone's language, a choice made in Settings wins
 * from then on, and switching re-renders what is already on screen.
 * Mirrors ZKProofport's theAppFollowsThePhoneUntilYouSayOtherwise and its
 * language-picker tests, run against behaviour instead of source text.
 *
 * EDGE-CASE MATRIX → coverage
 *   contract  → starts from getDeviceLanguage(), falls back to English
 *   contract  → a stored 'ko' / 'en' wins over the phone at the next start
 *   hostile   → an unknown stored code ('fr', '', 'ko_KR;drop', '<script>')
 *               throws at the lookup, naming the known codes, and the app
 *               stays in the phone's language (ZKProofport ignores it too)
 *   failure   → storage that throws on read: the phone's language, no crash
 *   boundary  → languageOption accepts 'ko-KR' / 'en-US', rejects 'kor', 'k'
 *   race      → the language changes even when the storage write never
 *               resolves; a failed write is reported (E5002) and the choice
 *               holds for this session
 *   contract  → the picker writes the key i18n reads at start
 *   integrity → an open error sheet re-renders in the new language
 *   display   → region names: official English names, Korean unchanged in ko;
 *               an unknown region throws
 */
import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';

const mockGoBack = jest.fn();
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Modal: 'Modal',
  StyleSheet: {create: (s: unknown) => s, absoluteFill: {}, absoluteFillObject: {}},
  Platform: {OS: 'ios'},
  NativeModules: {},
}));
jest.mock('react-native-svg', () => ({__esModule: true, default: 'Svg', Svg: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect', SvgXml: 'SvgXml'}));
jest.mock('react-native-safe-area-context', () => ({SafeAreaView: 'SafeAreaView'}));
jest.mock('@react-navigation/native', () => ({useNavigation: () => ({goBack: mockGoBack})}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, {LANGUAGE_KEY, readStoredLanguage} from '..';
import {languageOption} from '../languages';
import en from '../locales/en.json';
import ko from '../locales/ko.json';
import {SI_DO} from '../../domain/regions';
import {session} from '../../state/session';
import {durationText, regionName} from '../../ui/describe';
import {ErrorModal} from '../../ui/ErrorModal';
import {SettingsLanguageScreen} from '../../screens/SettingsLanguageScreen';

const flush = () => new Promise<void>((r) => setTimeout(() => r(), 0));

/** Loads a fresh copy of the i18n module with this phone language and this stored value. */
async function startWith(phone: string, stored: string | null | 'throw'): Promise<string> {
  let language = '';
  const realIntl = globalThis.Intl;
  globalThis.Intl = {DateTimeFormat: () => ({resolvedOptions: () => ({locale: phone})})} as unknown as typeof Intl;
  try {
    await jest.isolateModulesAsync(async () => {
      const loaded = require('@react-native-async-storage/async-storage');
      const storage = loaded.default ?? loaded;
      if (stored === 'throw') storage.getItem.mockImplementationOnce(async () => { throw new Error('disk'); });
      else if (stored !== null) await storage.setItem(LANGUAGE_KEY, stored);
      const fresh = require('..').default as typeof i18n;
      expect(fresh.language).toBe(phone.startsWith('ko') ? 'ko' : 'en');
      await flush();
      await flush();
      language = fresh.language;
    });
  } finally {
    globalThis.Intl = realIntl;
  }
  return language;
}

let tree: ReactTestRenderer;
function texts(): string {
  return tree.root
    .findAll((n) => (n.type as unknown) === 'Text')
    .map((n) => [n.props.children].flat().join(''))
    .join('|');
}

beforeAll(() => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const realError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    realError(...args);
  });
});

beforeEach(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await AsyncStorage.clear();
  jest.mocked(AsyncStorage.setItem).mockClear();
  await i18n.changeLanguage('en');
  session.clearError();
  mockGoBack.mockReset();
});

afterEach(() => {
  if (tree) act(() => tree.unmount());
});

describe('which language the app starts in', () => {
  it('a Korean phone with nothing stored → ko', async () => {
    expect(await startWith('ko-KR', null)).toBe('ko');
  });

  it('a phone in any other language with nothing stored → en', async () => {
    expect(await startWith('ja-JP', null)).toBe('en');
    expect(await startWith('en-US', null)).toBe('en');
  });

  it('a stored choice wins over the phone, both ways', async () => {
    expect(await startWith('ko-KR', 'en')).toBe('en');
    expect(await startWith('en-US', 'ko')).toBe('ko');
  });

  it.each(['fr', '', 'ko_KR;drop', '<script>', 'kor'])('an unknown stored code %p is not applied; the phone decides', async (stored) => {
    expect(await startWith('en-US', stored)).toBe('en');
    expect(await startWith('ko-KR', stored)).toBe('ko');
  });

  it('storage that fails to read leaves the phone language, without crashing', async () => {
    expect(await startWith('ko-KR', 'throw')).toBe('ko');
  });

  it('the lookup throws on an unknown stored code and names the known ones', async () => {
    await AsyncStorage.setItem(LANGUAGE_KEY, 'fr');
    await expect(readStoredLanguage()).rejects.toThrow("Unknown language 'fr'. Known: en, ko.");
    await AsyncStorage.setItem(LANGUAGE_KEY, 'ko');
    await expect(readStoredLanguage()).resolves.toBe('ko');
  });
});

describe('languageOption', () => {
  it.each([
    ['en', 'English'],
    ['en-US', 'English'],
    ['ko', '한국어'],
    ['ko-KR', '한국어'],
  ])('%s → %s', (code, label) => {
    expect(languageOption(code).label).toBe(label);
  });

  it.each(['kor', 'k', '', 'EN', 'zh-Hant'])('%p is unknown and throws', (code) => {
    expect(() => languageOption(code)).toThrow(/Unknown language .* Known: en, ko\./);
  });
});

describe('the Settings language picker', () => {
  async function render() {
    await act(async () => {
      tree = create(React.createElement(SettingsLanguageScreen));
    });
  }
  const option = (code: string) => tree.root.findByProps({testID: `settings-language-option-${code}`});

  it('switches immediately and stores the choice under the key i18n reads', async () => {
    await render();
    expect(option('en').props.accessibilityState.selected).toBe(true);
    await act(async () => option('ko').props.onPress());
    expect(i18n.language).toBe('ko');
    expect(option('ko').props.accessibilityState.selected).toBe(true);
    expect(texts()).toContain(ko.settings.languageDescription);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(LANGUAGE_KEY, 'ko');
    expect(await readStoredLanguage()).toBe('ko');
  });

  it('switches even when the storage write never resolves', async () => {
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise(() => undefined));
    await render();
    await act(async () => option('ko').props.onPress());
    expect(i18n.language).toBe('ko');
    expect(session.get().error).toBeNull();
  });

  it('a failed write is reported and the choice holds for this session', async () => {
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async () => {
      throw new Error('disk full');
    });
    await render();
    await act(async () => option('ko').props.onPress());
    await act(async () => {
      await flush();
    });
    expect(i18n.language).toBe('ko');
    expect(session.get().error?.code).toBe('E5002');
  });

  it('tapping the language already in use writes nothing', async () => {
    await render();
    await act(async () => option('en').props.onPress());
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe('switching re-renders what is on screen', () => {
  it('an open error sheet changes language with the app', async () => {
    session.showError('E1008', 'test');
    await act(async () => {
      tree = create(React.createElement(ErrorModal));
    });
    expect(texts()).toContain(en.errors.E1008.title);
    expect(texts()).toContain('Error code E1008');
    await act(async () => {
      await i18n.changeLanguage('ko');
    });
    expect(texts()).toContain(ko.errors.E1008.title);
    expect(texts()).toContain('오류 코드 E1008');
    expect(texts()).not.toContain(en.errors.E1008.title);
  });
});

describe('words that depend on the language', () => {
  it('every si/do has an official English name and keeps its Korean name in Korean', async () => {
    const english = SI_DO.map((r) => regionName(r));
    expect(english).toEqual(['Seoul', 'Busan', 'Daegu', 'Incheon', 'Gwangju', 'Daejeon', 'Ulsan', 'Sejong', 'Gyeonggi-do', 'Gangwon State',
      'Chungcheongbuk-do', 'Chungcheongnam-do', 'Jeonbuk State', 'Jeollanam-do', 'Gyeongsangbuk-do', 'Gyeongsangnam-do', 'Jeju']);
    await i18n.changeLanguage('ko');
    expect(SI_DO.map((r) => regionName(r))).toEqual([...SI_DO]);
  });

  it('an unknown or outdated region name throws, naming the known ones', () => {
    expect(() => regionName('전라북도')).toThrow(/Unknown region '전라북도'\. Known: 서울특별시, /);
    expect(() => regionName('')).toThrow(/Unknown region/);
  });

  it('the off-chain check time never reads 0.0', async () => {
    expect(durationText(0)).toBe('under 0.01 s');
    expect(durationText(9)).toBe('under 0.01 s');
    expect(durationText(42)).toBe('0.04 s');
    expect(durationText(1830)).toBe('1.8 s');
    await i18n.changeLanguage('ko');
    expect(i18n.t('done.passIn', {time: durationText(0)})).toBe('통과 · 0.01초 미만');
    expect(i18n.t('done.passIn', {time: durationText(42)})).toBe('통과 · 0.04초');
    expect(i18n.t('done.passIn', {time: durationText(1830)})).toBe('통과 · 1.8초');
  });
});
