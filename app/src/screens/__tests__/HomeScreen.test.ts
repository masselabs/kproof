/**
 * Removing an ID from the IDs tab, with React Native and the Keychain stood in
 * for: the remove control is a short button (not a sentence naming the card),
 * it only opens the confirm sheet, and confirming removes exactly the card on
 * the front and nothing else.
 *
 * EDGE-CASE MATRIX → coverage
 *   contract  → tapping remove writes nothing until the sheet is confirmed
 *   integrity → confirm removes only the front card; the other card and its fields stay
 *   integrity → the card brought to the front is the one removed, not the first
 *   boundary  → removing the last card leaves the empty state
 *   empty     → cancel closes the sheet and leaves the vault and the Keychain untouched
 *   race      → a second confirm tap after the first writes once
 *   failure   → a Keychain write that fails shows E5001 and keeps the card in memory
 *   UTF-8     → both languages: the label is short and does not carry the card name
 *   N/A authz / hostile input / large input: no input and no roles on this screen
 */
import React from 'react';
import {act, create, type ReactTestInstance, type ReactTestRenderer} from 'react-test-renderer';

const mockNavigate = jest.fn();
let mockWrites: string[] = [];
let mockWriteFails = false;

jest.mock('react-native', () => {
  const R = require('react');
  return {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    // Children exist only while the sheet is shown, as on a device.
    Modal: ({visible, children}: {visible: boolean; children: unknown}) => (visible ? R.createElement('Modal', null, children) : null),
    StyleSheet: {create: (s: unknown) => s, absoluteFill: {}, absoluteFillObject: {}},
  };
});
jest.mock('react-native-svg', () => ({__esModule: true, default: 'Svg', Svg: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect', SvgXml: 'SvgXml'}));
jest.mock('react-native-safe-area-context', () => ({SafeAreaView: 'SafeAreaView'}));
jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate})}));
jest.mock('../../services/keychainAdapter', () => ({
  keychain: {
    getSupportedBiometryType: async () => 'FaceID',
    isPasscodeAuthAvailable: async () => true,
    hasGenericPassword: async () => true,
    getGenericPassword: async () => false,
    setGenericPassword: async (_user: string, password: string) => {
      if (mockWriteFails) throw new Error('write refused');
      mockWrites.push(password);
      return {};
    },
    resetGenericPassword: async () => true,
  },
}));

import i18n from '../../i18n';
import type {StoredCard} from '../../services/importCard';
import {session} from '../../state/session';
import {HomeScreen} from '../HomeScreen';

const RESIDENT: StoredCard = {
  type: 'comrc_v1_5',
  importedAt: '2026-10-28T00:00:00.000Z',
  fields: {ci: 'C1', name: '홍길동', birth: '19900101', address: '서울특별시 강남구'},
};
const LICENSE: StoredCard = {type: 'comdl_v1_5', importedAt: '2026-10-27T00:00:00.000Z', fields: {ci: 'C2', name: '홍길동', birth: '19900101'}};

/** A host element by its mocked name ('View', 'Text', ...). */
function isHost(n: ReactTestInstance, name: string): boolean {
  return (n.type as unknown) === name;
}

function pressables(root: ReactTestRenderer): ReactTestInstance[] {
  return root.root.findAll((n) => isHost(n, 'Pressable'));
}

function byTestId(root: ReactTestRenderer, id: string): ReactTestInstance | undefined {
  return pressables(root).find((n) => n.props.testID === id);
}

function textOf(node: ReactTestInstance): string {
  return node
    .findAll((n) => isHost(n, 'Text'))
    .map((n) => n.children.filter((c) => typeof c === 'string').join(''))
    .join(' ');
}

async function press(node: ReactTestInstance | undefined): Promise<void> {
  if (!node) throw new Error('nothing to press');
  await act(async () => {
    node.props.onPress();
  });
}

async function render(): Promise<ReactTestRenderer> {
  let root: ReactTestRenderer | undefined;
  await act(async () => {
    root = create(React.createElement(HomeScreen));
  });
  return root!;
}

beforeEach(async () => {
  mockWrites = [];
  mockWriteFails = false;
  mockNavigate.mockReset();
  session.clearError();
  session.unlocked({v: 1, cards: [RESIDENT, LICENSE]});
  await i18n.changeLanguage('en');
});

describe('the remove button', () => {
  it.each(['en', 'ko'] as const)('is short and does not repeat the card name (%s)', async (lang) => {
    await i18n.changeLanguage(lang);
    const root = await render();
    const label = textOf(byTestId(root, 'remove-card')!);
    expect(label).toBe(lang === 'en' ? 'Remove ID' : '신분증 삭제');
    expect(label).not.toContain(i18n.t('cardTypes.comrc_v1_5.name'));
  });

  it('opens the confirm sheet naming the card, and writes nothing yet', async () => {
    const root = await render();
    expect(root.root.findAll((n) => n.props.testID === 'remove-sheet' && isHost(n, 'View'))).toHaveLength(0);
    await press(byTestId(root, 'remove-card'));
    const sheet = root.root.find((n) => n.props.testID === 'remove-sheet' && isHost(n, 'View'));
    expect(textOf(sheet)).toContain('Remove the Mobile Resident Registration Card?');
    expect(mockWrites).toEqual([]);
    expect(session.get().vault?.cards).toHaveLength(2);
  });

  it('cancel closes the sheet and changes nothing', async () => {
    const root = await render();
    await press(byTestId(root, 'remove-card'));
    await press(byTestId(root, 'remove-sheet-cancel'));
    expect(byTestId(root, 'remove-sheet-confirm')).toBeUndefined();
    expect(mockWrites).toEqual([]);
    expect(session.get().vault?.cards.map((c) => c.type)).toEqual(['comrc_v1_5', 'comdl_v1_5']);
  });
});

describe('confirming the removal', () => {
  it('removes only the front card, in the Keychain and in memory', async () => {
    const root = await render();
    await press(byTestId(root, 'remove-card'));
    await press(byTestId(root, 'remove-sheet-confirm'));
    expect(mockWrites).toHaveLength(1);
    const written = JSON.parse(mockWrites[0]);
    expect(written).toEqual({v: 1, cards: [LICENSE]});
    expect(session.get().vault).toEqual({v: 1, cards: [LICENSE]});
    expect(byTestId(root, 'remove-sheet-confirm')).toBeUndefined();
  });

  it('removes the card brought to the front, not the first one', async () => {
    const root = await render();
    // The license sits behind as a tab; tapping it brings it to the front.
    const tab = pressables(root).find((n) => textOf(n).includes("Mobile Driver's License"));
    await press(tab);
    await press(byTestId(root, 'remove-card'));
    const sheet = root.root.find((n) => n.props.testID === 'remove-sheet' && isHost(n, 'View'));
    expect(textOf(sheet)).toContain("Remove the Mobile Driver's License?");
    await press(byTestId(root, 'remove-sheet-confirm'));
    expect(JSON.parse(mockWrites[0])).toEqual({v: 1, cards: [RESIDENT]});
    expect(session.get().vault?.cards).toEqual([RESIDENT]);
  });

  it('a second tap on confirm writes once', async () => {
    const root = await render();
    await press(byTestId(root, 'remove-card'));
    const confirm = byTestId(root, 'remove-sheet-confirm')!;
    await act(async () => {
      confirm.props.onPress();
      confirm.props.onPress();
    });
    expect(mockWrites).toHaveLength(1);
  });

  it('removing the last card shows the empty state', async () => {
    session.unlocked({v: 1, cards: [LICENSE]});
    const root = await render();
    await press(byTestId(root, 'remove-card'));
    await press(byTestId(root, 'remove-sheet-confirm'));
    expect(session.get().vault).toEqual({v: 1, cards: []});
    expect(byTestId(root, 'remove-card')).toBeUndefined();
    expect(textOf(root.root)).toContain(i18n.t('home.emptyTitle'));
  });

  it('a failed Keychain write shows E5001 and keeps the card', async () => {
    mockWriteFails = true;
    const root = await render();
    await press(byTestId(root, 'remove-card'));
    await press(byTestId(root, 'remove-sheet-confirm'));
    expect(session.get().error?.code).toBe('E5001');
    expect(session.get().vault?.cards).toHaveLength(2);
  });
});
