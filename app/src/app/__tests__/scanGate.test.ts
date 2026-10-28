import {getEnv} from '../../config/env';
import {encodeBase64Url, utf8Encode} from '../../domain/bytes';
import {createScanGate, REFUSAL_QUIET_MS} from '../scanGate';

const staging = getEnv('staging');

function link(over: Record<string, unknown> = {}): string {
  const req = {
    requestId: '3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b',
    circuitId: 'mdl_kr_age',
    inputs: {scope: 'demo.koreanproof.com', ageThreshold: 19},
    callbackUrl: 'https://stg-api.koreanproof.com/api/v1/proof/callback',
    createdAt: '2026-10-27T12:00:00.000Z',
    ...over,
  };
  return `kproof://proof-request?data=${encodeBase64Url(utf8Encode(JSON.stringify(req)))}`;
}

function setup() {
  let t = 1_000;
  const accepted: string[] = [];
  const refused: Array<{code: string; detail: string}> = [];
  const gate = createScanGate({
    env: staging,
    now: () => t,
    onAccept: (url) => accepted.push(url),
    onRefuse: (code, detail) => refused.push({code, detail}),
  });
  return {gate, accepted, refused, advance: (ms: number) => (t += ms)};
}

const VALID = link();

describe('a valid request code', () => {
  test('is accepted once', () => {
    const {gate, accepted} = setup();
    expect(gate.offer([{value: VALID}])).toEqual({kind: 'accepted', url: VALID});
    expect(accepted).toEqual([VALID]);
  });

  test.each([2, 10, 60])('%i identical frames are one request', (n) => {
    const {gate, accepted} = setup();
    for (let i = 0; i < n; i++) gate.offer([{value: VALID}]);
    expect(accepted).toHaveLength(1);
  });

  test('a different valid code after the first is ignored until reset', () => {
    const {gate, accepted} = setup();
    gate.offer([{value: VALID}]);
    const other = link({requestId: '4f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b'});
    expect(gate.offer([{value: other}])).toEqual({kind: 'ignored'});
    gate.reset();
    gate.offer([{value: other}]);
    expect(accepted).toEqual([VALID, other]);
  });

  test('wins over a non-request code in the same frame', () => {
    const {gate, accepted, refused} = setup();
    gate.offer([{value: 'https://example.com'}, {value: VALID}]);
    expect(accepted).toEqual([VALID]);
    expect(refused).toEqual([]);
  });
});

describe('codes that are not a KProof request are refused and scanning goes on', () => {
  const huge = 'A'.repeat(200_000);
  const notOurs: Array<[string, string]> = [
    ['https URL', 'https://example.com/menu'],
    ['http URL', 'http://192.168.0.1/'],
    ['javascript: URL', 'javascript:alert(1)'],
    ['ZKProofport link', 'zkproofport://proof-request?data=abc'],
    ['plain text', 'hello'],
    ['Korean and emoji', '안녕하세요 🙂 증명'],
    ['control characters', 'a\u0000b\u0007c\u001b'],
    ['line breaks', 'kproof\n://proof-request?data=x'],
    ['whitespace only', '   '],
    ['huge payload', huge],
    ['look-alike scheme', 'kproofx://proof-request?data=abc'],
    ['leading space', ` ${VALID}`],
  ];
  test.each(notOurs)('%s → E1008', (_name, value) => {
    const {gate, accepted, refused} = setup();
    expect(gate.offer([{value}])).toMatchObject({kind: 'refused', code: 'E1008'});
    expect(accepted).toEqual([]);
    expect(refused).toHaveLength(1);
    // The scanned text never reaches the detail (it is logged).
    if (value.trim().length > 3) expect(refused[0].detail).not.toContain(value);
  });

  const brokenOurs: Array<[string, string, string]> = [
    ['wrong route', 'kproof://other?data=abc', 'E1001'],
    ['upper-case scheme', VALID.replace('kproof', 'KPROOF'), 'E1001'],
    ['no data', 'kproof://proof-request?', 'E1001'],
    ['not base64', 'kproof://proof-request?data=!!!', 'E1001'],
    ['unknown circuit', link({circuitId: 'coinbase_attestation'}), 'E1002'],
    ['foreign callback', link({callbackUrl: 'https://evil.example/api/v1/proof/callback'}), 'E1004'],
    ['control char in message', link({message: 'a\u0000b'}), 'E1005'],
    ['oversized data', `kproof://proof-request?data=${'A'.repeat(20_000)}`, 'E1006'],
  ];
  test.each(brokenOurs)('%s → %s from the shared parser', (_name, value, code) => {
    const {gate, accepted} = setup();
    expect(gate.offer([{value}])).toMatchObject({kind: 'refused', code});
    expect(accepted).toEqual([]);
  });

  test('a valid code after a refused one is still accepted', () => {
    const {gate, accepted} = setup();
    gate.offer([{value: 'https://example.com'}]);
    gate.offer([{value: VALID}]);
    expect(accepted).toEqual([VALID]);
  });

  test('the same refused code stays quiet while in view, then is refused again', () => {
    const {gate, refused, advance} = setup();
    for (let i = 0; i < 30; i++) {
      gate.offer([{value: 'hello'}]);
      advance(30);
    }
    expect(refused).toHaveLength(1);
    advance(REFUSAL_QUIET_MS);
    gate.offer([{value: 'hello'}]);
    expect(refused).toHaveLength(2);
  });

  test('a different refused code is refused at once', () => {
    const {gate, refused} = setup();
    gate.offer([{value: 'hello'}]);
    gate.offer([{value: 'https://example.com'}]);
    expect(refused).toHaveLength(2);
  });
});

describe('frames without a readable code', () => {
  test.each([[[]], [[{}]], [[{value: ''}]], [[{value: null}]]])('%j is ignored and does not lock the gate', (codes) => {
    const {gate, accepted, refused} = setup();
    expect(gate.offer(codes as Array<{value?: string | null}>)).toEqual({kind: 'ignored'});
    gate.offer([{value: VALID}]);
    expect(accepted).toEqual([VALID]);
    expect(refused).toEqual([]);
  });
});
