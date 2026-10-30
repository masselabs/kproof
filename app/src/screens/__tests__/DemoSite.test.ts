/**
 * The demo site link: a button in the home screen's "what this ID can prove"
 * section, and the screen it opens, which introduces the demo and opens its
 * address from the build's environment row.
 *
 * EDGE-CASE MATRIX → coverage
 *   empty     → an environment without a demo site shows no button on home and no open button on the screen
 *   boundary  → collapsed section shows no button; expanding shows it
 *   contract  → the button navigates to Demo; open calls openURL with exactly the row's address
 *   failure   → openURL rejecting shows E3004, nothing thrown
 *   integrity → the screen lists the three checks, in both languages, naming no brand or store
 *   UTF-8     → Korean and English wording comes from the locale files
 *   N/A authz / hostile / large input: no input on these screens; the address is a constant of the build
 */
import React from 'react';
import {act, create, type ReactTestInstance, type ReactTestRenderer} from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockOpenURL = jest.fn();
let mockDemoUrl: string | null = 'https://stg-demo.koreanproof.com';

jest.mock('react-native', () => {
  const R = require('react');
  return {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Modal: ({visible, children}: {visible: boolean; children: unknown}) => (visible ? R.createElement('Modal', null, children) : null),
    StyleSheet: {create: (s: unknown) => s, absoluteFill: {}, absoluteFillObject: {}},
    Linking: {openURL: (u: string) => mockOpenURL(u)},
  };
});
jest.mock('react-native-svg', () => ({__esModule: true, default: 'Svg', Svg: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect', SvgXml: 'SvgXml'}));
jest.mock('react-native-safe-area-context', () => ({SafeAreaView: 'SafeAreaView'}));
jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack})}));
jest.mock('../../services/keychainAdapter', () => ({keychain: {}}));
jest.mock('../../config/buildEnv', () => {
  const {getEnv} = jest.requireActual('../../config/env');
  return {currentEnv: () => ({...getEnv('staging'), demoUrl: mockDemoUrl})};
});

import i18n from '../../i18n';
import en from '../../i18n/locales/en.json';
import ko from '../../i18n/locales/ko.json';
import type {StoredCard} from '../../services/importCard';
import {session} from '../../state/session';
import {DEMO_TRIES, DemoScreen} from '../DemoScreen';
import {HomeScreen} from '../HomeScreen';

const CARD: StoredCard = {
  type: 'comrc_v1_5',
  importedAt: '2026-10-28T00:00:00.000Z',
  fields: {ci: 'C1', name: '홍길동', birth: '19900101', address: '서울특별시 강남구'},
};

const isHost = (n: ReactTestInstance, name: string) => (n.type as unknown) === name;
const byTestId = (root: ReactTestRenderer, id: string) => root.root.findAll((n) => isHost(n, 'Pressable') && n.props.testID === id)[0];
const textOf = (node: ReactTestInstance) =>
  node
    .findAll((n) => isHost(n, 'Text'))
    .map((n) => n.children.filter((c) => typeof c === 'string').join(''))
    .join(' ');

async function render(component: React.ComponentType): Promise<ReactTestRenderer> {
  let root: ReactTestRenderer | undefined;
  await act(async () => {
    root = create(React.createElement(component));
  });
  return root!;
}
async function press(node: ReactTestInstance | undefined): Promise<void> {
  if (!node) throw new Error('nothing to press');
  await act(async () => {
    node.props.onPress();
  });
}

beforeEach(async () => {
  mockNavigate.mockReset();
  mockOpenURL.mockReset().mockResolvedValue(true);
  mockDemoUrl = 'https://stg-demo.koreanproof.com';
  session.clearError();
  session.unlocked({v: 1, cards: [CARD]});
  await i18n.changeLanguage('ko');
});

describe('home: the demo site button in "what this ID can prove"', () => {
  it('appears only when the section is open, and opens the Demo screen', async () => {
    const root = await render(HomeScreen);
    expect(byTestId(root, 'open-demo')).toBeUndefined();
    await press(byTestId(root, 'facts-toggle'));
    const button = byTestId(root, 'open-demo');
    expect(textOf(button!)).toBe('데모 사이트');
    await press(button);
    expect(mockNavigate).toHaveBeenCalledWith('Demo');
  });

  it('is absent for an environment without a demo site', async () => {
    mockDemoUrl = null;
    const root = await render(HomeScreen);
    await press(byTestId(root, 'facts-toggle'));
    expect(byTestId(root, 'open-demo')).toBeUndefined();
  });

  it('reads "Demo site" in English', async () => {
    await i18n.changeLanguage('en');
    const root = await render(HomeScreen);
    await press(byTestId(root, 'facts-toggle'));
    expect(textOf(byTestId(root, 'open-demo')!)).toBe('Demo site');
  });
});

describe('the Demo screen', () => {
  it.each([
    ['ko', ['나이 확인', '본인 확인', '거주 지역 확인'], '데모 사이트 열기'],
    ['en', ['Age check', 'Identity check', 'Region of residence check'], 'Open the demo site'],
  ] as const)('introduces the demo and lists what can be tried (%s)', async (lang, tries, open) => {
    await i18n.changeLanguage(lang);
    const root = await render(DemoScreen);
    const text = textOf(root.root);
    expect(text).toContain(i18n.t('demo.title'));
    expect(text).toContain(i18n.t('demo.body'));
    for (const item of tries) expect(text).toContain(item);
    expect(textOf(byTestId(root, 'demo-open')!)).toBe(open);
    expect(text).toContain('stg-demo.koreanproof.com');
  });

  it('names no brand, store or payment in either language', () => {
    for (const locale of [ko, en]) {
      const words = [locale.home.demo, ...Object.values(locale.demo)].join(' ');
      expect(words).not.toMatch(/CU|dKRW|Budweiser|버드와이저|결제|payment|checkout|store|편의점|매장/i);
    }
    expect(DEMO_TRIES).toEqual(['demo.tryAge', 'demo.tryIdentity', 'demo.tryRegion']);
  });

  it('opens exactly the environment\'s demo address', async () => {
    const root = await render(DemoScreen);
    await press(byTestId(root, 'demo-open'));
    expect(mockOpenURL).toHaveBeenCalledWith('https://stg-demo.koreanproof.com');
    expect(session.get().error).toBeNull();
  });

  it('shows E3004 when the browser does not open it', async () => {
    mockOpenURL.mockRejectedValue(new Error('no handler'));
    const root = await render(DemoScreen);
    await press(byTestId(root, 'demo-open'));
    expect(session.get().error?.code).toBe('E3004');
  });

  it('shows no open button without a demo site', async () => {
    mockDemoUrl = null;
    const root = await render(DemoScreen);
    expect(byTestId(root, 'demo-open')).toBeUndefined();
  });

  it('back returns', async () => {
    const root = await render(DemoScreen);
    await press(byTestId(root, 'demo-back'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});
