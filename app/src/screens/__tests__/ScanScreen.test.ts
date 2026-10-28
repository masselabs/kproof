/**
 * The scanner screen with the camera mocked: one code in front of the camera
 * is one request and one navigation, codes that are not KProof requests are
 * refused without leaving the scanner, and a camera the app may not use says
 * why (with a way to Settings when the person can change it).
 */
import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';

type Scanner = {onCodeScanned: (codes: Array<{value?: string}>) => void};
const mockScanners: Scanner[] = [];
const mockHandle = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockOpenSettings = jest.fn(async () => undefined);
const mockOpenURL = jest.fn();
const mockRequestPermission = jest.fn();
let mockStatus = 'granted';
let mockDevice: {id: string} | undefined = {id: 'back'};

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: {create: (s: unknown) => s, absoluteFill: {}, absoluteFillObject: {}},
  AppState: {currentState: 'active', addEventListener: () => ({remove: () => undefined})},
  Linking: {openSettings: () => mockOpenSettings(), openURL: (u: string) => mockOpenURL(u)},
}));
jest.mock('react-native-svg', () => ({__esModule: true, default: 'Svg', Svg: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect', SvgXml: 'SvgXml'}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 47, bottom: 34, left: 0, right: 0})}));
// `Camera` is used both as an element and for its static permission calls.
jest.mock('react-native-vision-camera', () => {
  const Camera = (props: unknown) => require('react').createElement('Camera', props);
  Camera.getCameraPermissionStatus = () => mockStatus;
  Camera.requestCameraPermission = () => mockRequestPermission();
  return {
    Camera,
    useCameraDevice: () => mockDevice,
    useCodeScanner: (scanner: Scanner) => {
      mockScanners.push(scanner);
      return scanner;
    },
  };
});
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: mockGoBack, dispatch: mockDispatch}),
  useIsFocused: () => true,
  StackActions: {replace: (name: string) => ({type: 'REPLACE', payload: {name}})},
}));
jest.mock('../../app/deepLinks', () => ({handleIncomingUrl: (url: string) => mockHandle(url)}));

import {getEnv} from '../../config/env';
import {encodeBase64Url, utf8Encode} from '../../domain/bytes';
import {parseProofRequestUrl} from '../../domain/request';
import {ko} from '../../i18n/ko';
import {session} from '../../state/session';
import {ScanScreen} from '../ScanScreen';

const LINK = `kproof://proof-request?data=${encodeBase64Url(
  utf8Encode(
    JSON.stringify({
      requestId: '3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b',
      circuitId: 'mdl_kr_ownership',
      inputs: {scope: 'demo.koreanproof.com'},
      callbackUrl: 'https://stg-api.koreanproof.com/api/v1/proof/callback',
      createdAt: '2026-10-27T12:00:00.000Z',
    }),
  ),
)}`;

let tree: ReactTestRenderer;

async function render() {
  await act(async () => {
    tree = create(React.createElement(ScanScreen));
  });
}

function scanner(): Scanner {
  return mockScanners[mockScanners.length - 1];
}

function texts(): string {
  return tree.root
    .findAll((n) => (n.type as unknown) === 'Text')
    .map((n) => [n.props.children].flat().join(''))
    .join('|');
}

function cameraActive(): boolean {
  return tree.root.findAll((n) => (n.type as unknown) === 'Camera')[0].props.isActive;
}

beforeEach(() => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  mockScanners.length = 0;
  [mockHandle, mockGoBack, mockDispatch, mockOpenSettings, mockOpenURL, mockRequestPermission].forEach((m) => m.mockReset());
  mockHandle.mockImplementation(async () => 'shown');
  mockStatus = 'granted';
  mockDevice = {id: 'back'};
  session.setPendingRequest(null);
  // The app starts locked; the scanner is only reachable once it is unlocked.
  session.unlocked({v: 1, cards: []});
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

// react-test-renderer warns that it is deprecated on every render; the warning is not about this screen.
const realError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    realError(...args);
  });
});

afterEach(() => {
  act(() => tree.unmount());
  session.setPendingRequest(null);
});

describe('one code is one request', () => {
  test('10 rapid identical callbacks: one handling, one navigation, camera stops', async () => {
    await render();
    expect(cameraActive()).toBe(true);
    act(() => {
      for (let i = 0; i < 10; i++) scanner().onCodeScanned([{value: LINK}]);
    });
    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(mockHandle).toHaveBeenCalledWith(LINK);
    expect(cameraActive()).toBe(false);

    // The request reaches the session; the scanner hands its place to it once.
    await act(async () => {
      session.setPendingRequest(parseProofRequestUrl(LINK, getEnv('staging')));
    });
    act(() => {
      for (let i = 0; i < 10; i++) scanner().onCodeScanned([{value: LINK}]);
    });
    await act(async () => {
      session.focusRequest();
    });
    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({type: 'REPLACE', payload: {name: 'Request'}});
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  test('a request that is refused after the scan (already answered) closes the scanner once', async () => {
    mockHandle.mockImplementation(async () => 'refused');
    await render();
    await act(async () => {
      for (let i = 0; i < 10; i++) scanner().onCodeScanned([{value: LINK}]);
    });
    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe('codes that are not KProof requests', () => {
  test.each([
    'https://example.com',
    'javascript:alert(1)',
    'zkproofport://proof-request?data=abc',
    '안녕 🙂',
    'a\u0000b',
    'x'.repeat(100_000),
  ])('%#: refused on the scanner, nothing opened, scanning continues', async (value) => {
    await render();
    act(() => scanner().onCodeScanned([{value}]));
    expect(texts()).toContain(ko.errors.E1008.title);
    expect(mockHandle).not.toHaveBeenCalled();
    expect(mockOpenURL).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(cameraActive()).toBe(true);
    act(() => scanner().onCodeScanned([{value: LINK}]));
    expect(mockHandle).toHaveBeenCalledTimes(1);
  });
});

describe('camera permission', () => {
  test('denied: explains and offers Settings', async () => {
    mockStatus = 'denied';
    await render();
    expect(texts()).toContain(ko.scan.deniedTitle);
    expect(tree.root.findAll((n) => (n.type as unknown) === 'Camera')).toHaveLength(0);
    act(() => tree.root.findByProps({testID: 'scan-open-settings'}).props.onPress());
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });

  test('restricted: explains, and offers no Settings button it cannot honour', async () => {
    mockStatus = 'restricted';
    await render();
    expect(texts()).toContain(ko.scan.restrictedTitle);
    expect(tree.root.findAllByProps({testID: 'scan-open-settings'})).toHaveLength(0);
  });

  test('not asked yet: asks once, then shows the camera when allowed', async () => {
    mockStatus = 'not-determined';
    mockRequestPermission.mockResolvedValue('granted');
    await render();
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(cameraActive()).toBe(true);
  });

  test('not asked yet and refused: the denied explanation', async () => {
    mockStatus = 'not-determined';
    mockRequestPermission.mockResolvedValue('denied');
    await render();
    expect(texts()).toContain(ko.scan.deniedTitle);
  });

  test('no camera on the device', async () => {
    mockDevice = undefined;
    await render();
    expect(texts()).toContain(ko.scan.noCameraTitle);
  });

  test('a locked app keeps the camera off', async () => {
    await render();
    await act(async () => {
      session.background(0);
      session.foreground(10 * 60 * 1000);
    });
    expect(session.get().lock.locked).toBe(true);
    expect(cameraActive()).toBe(false);
  });
});

test('the close button leaves once', async () => {
  await render();
  const close = tree.root.findByProps({testID: 'scan-close'});
  act(() => {
    close.props.onPress();
    close.props.onPress();
  });
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});
