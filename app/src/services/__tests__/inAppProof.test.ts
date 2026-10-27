import {InputError} from '@kproof/sdk';
import {IN_APP_DAPP_NAME, IN_APP_SCOPE, createInAppRequest, verifyInAppAnswer, type InAppRequest} from '../inAppProof';

const RELAY = 'https://stg-api.koreanproof.com/api/v1';
const REQUEST_ID = '9b2f6c1e-4d3a-4f5b-8c7d-1e2f3a4b5c6d';

type Call = {url: string; init?: RequestInit};

function fakeFetch(answers: Record<string, unknown[]>): {fetchImpl: typeof fetch; calls: Call[]} {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({url, init});
    const queue = answers[url];
    if (!queue || queue.length === 0) throw new Error(`unexpected fetch ${url}`);
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return {ok: true, status: 200, json: async () => next, text: async () => JSON.stringify(next)} as Response;
  }) as unknown as typeof fetch;
  return {fetchImpl, calls};
}

function creating(): Record<string, unknown[]> {
  return {
    [`${RELAY}/challenge`]: [{requestId: REQUEST_ID, challenge: 'c'.repeat(64)}],
    [`${RELAY}/proof/request`]: [{requestId: REQUEST_ID, deepLink: `kproof://proof-request?data=x`}],
  };
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init?.body));
}

describe('createInAppRequest', () => {
  test('creates a real request on the build environment relay, with the in-app scope and name', async () => {
    const {fetchImpl, calls} = fakeFetch(creating());
    const r = await createInAppRequest({environment: 'staging', fetchImpl}, {circuitId: 'mdl_kr_ownership'});
    expect(calls.map((c) => c.url)).toEqual([`${RELAY}/challenge`, `${RELAY}/proof/request`]);
    const body = bodyOf(calls[1]);
    expect(body).toMatchObject({circuitId: 'mdl_kr_ownership', inputs: {scope: IN_APP_SCOPE}, dappName: IN_APP_DAPP_NAME, challenge: 'c'.repeat(64)});
    expect(r).toEqual({requestId: REQUEST_ID, deepLink: 'kproof://proof-request?data=x', circuitId: 'mdl_kr_ownership', inputs: {scope: IN_APP_SCOPE}});
  });

  test('age and region carry exactly their own input', async () => {
    let f = fakeFetch(creating());
    await createInAppRequest({environment: 'staging', fetchImpl: f.fetchImpl}, {circuitId: 'mdl_kr_age', ageThreshold: 19});
    expect(bodyOf(f.calls[1]).inputs).toEqual({scope: IN_APP_SCOPE, ageThreshold: 19});
    f = fakeFetch(creating());
    await createInAppRequest({environment: 'staging', fetchImpl: f.fetchImpl}, {circuitId: 'mdl_kr_region', targetRegion: '전북특별자치도'});
    expect(bodyOf(f.calls[1]).inputs).toEqual({scope: IN_APP_SCOPE, targetRegion: '전북특별자치도'});
  });

  test('an age the SDK refuses never reaches the relay', async () => {
    for (const n of [0, 151, 19.5, Number.NaN]) {
      const {fetchImpl, calls} = fakeFetch(creating());
      await expect(createInAppRequest({environment: 'staging', fetchImpl}, {circuitId: 'mdl_kr_age', ageThreshold: n})).rejects.toBeInstanceOf(InputError);
      expect(calls).toHaveLength(0);
    }
  });

  test('an environment the SDK has no network for throws, naming it', async () => {
    for (const env of ['development', 'production', '__proto__', '']) {
      const {fetchImpl, calls} = fakeFetch(creating());
      await expect(createInAppRequest({environment: env, fetchImpl}, {circuitId: 'mdl_kr_ownership'})).rejects.toThrow(`'${env}'`);
      expect(calls).toHaveLength(0);
    }
  });

  test('a relay that is down surfaces its error', async () => {
    const {fetchImpl} = fakeFetch({[`${RELAY}/challenge`]: [new TypeError('Network request failed')]});
    await expect(createInAppRequest({environment: 'staging', fetchImpl}, {circuitId: 'mdl_kr_ownership'})).rejects.toThrow();
  });
});

describe('verifyInAppAnswer', () => {
  const request: InAppRequest = {requestId: REQUEST_ID, deepLink: 'x', circuitId: 'mdl_kr_ownership', inputs: {scope: IN_APP_SCOPE}};

  test('reads the answer back from the relay and lets the SDK judge it', async () => {
    const {fetchImpl, calls} = fakeFetch({[`${RELAY}/proof/${REQUEST_ID}`]: [{requestId: REQUEST_ID, status: 'cancelled'}]});
    const outcome = await verifyInAppAnswer({environment: 'staging', fetchImpl}, request, new Date('2026-10-27T12:00:00Z'));
    expect(calls.map((c) => c.url)).toEqual([`${RELAY}/proof/${REQUEST_ID}`]);
    expect(outcome.valid).toBe(false);
    expect(outcome.checks.find((c) => c.name === 'status')).toMatchObject({ok: false});
    expect(outcome.network.chainId).toBe(84532);
  });

  test('a completed answer with the wrong scope is not valid', async () => {
    const words = Array.from({length: 97}, () => `0x${'00'.repeat(32)}`);
    const {fetchImpl, calls} = fakeFetch({
      [`${RELAY}/proof/${REQUEST_ID}`]: [{requestId: REQUEST_ID, status: 'completed', circuit: 'mdl_kr_ownership', proof: '0xabcd', publicInputs: words}],
      'https://sepolia.base.org': [{jsonrpc: '2.0', id: 1, result: `0x${'00'.repeat(31)}01`}],
    });
    const outcome = await verifyInAppAnswer({environment: 'staging', fetchImpl}, request, new Date('2026-10-27T12:00:00Z'));
    expect(outcome.valid).toBe(false);
    expect(outcome.checks.find((c) => c.name === 'scope')).toMatchObject({ok: false});
    expect(calls[0].url).toBe(`${RELAY}/proof/${REQUEST_ID}`);
  });
});
