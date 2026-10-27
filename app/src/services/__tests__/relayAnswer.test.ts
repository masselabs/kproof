import {createAnsweredStore, KEEP_MS, MAX_ENTRIES, type KeyValueStore} from '../answeredStore';
import {answerRequest, bodyFor, outcomeErrorCode, resetClaimsForTests, sendGenerating, type RelayDeps} from '../relayAnswer';
import type {ProofRequest} from '../../domain/request';
import {memoryKv} from '../../testing/memoryKv';


const request: ProofRequest = {
  requestId: '3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b',
  circuitId: 'mdl_kr_age',
  inputs: {circuitId: 'mdl_kr_age', scope: 's', ageThreshold: 19},
  callbackUrl: 'https://stg-api.koreanproof.com/api/v1/proof/callback',
  createdAt: '2026-10-27T00:00:00.000Z',
};

type Reply = {status: number; body?: string} | {throws: string};

function deps(replies: Reply[], kv = memoryKv()) {
  const posts: Array<{url: string; body: Record<string, unknown>}> = [];
  const d: RelayDeps = {
    fetch: (async (url: string, init: RequestInit) => {
      posts.push({url, body: JSON.parse(String(init.body))});
      const r = replies.length > 1 ? replies.shift()! : replies[0];
      if ('throws' in r) throw new Error(r.throws);
      return {ok: r.status < 300, status: r.status, text: async () => r.body ?? ''} as Response;
    }) as unknown as typeof fetch,
    answered: createAnsweredStore(kv, () => Date.now()),
    log: () => undefined,
  };
  return {d, posts, kv};
}

beforeEach(() => resetClaimsForTests());

describe('relay answers', () => {
  test('bodies match kproof-server callback fields', () => {
    expect(bodyFor(request, {status: 'completed', proof: '0xab', publicInputs: ['0x01']})).toEqual({
      requestId: request.requestId,
      circuit: 'mdl_kr_age',
      status: 'completed',
      proof: '0xab',
      publicInputs: ['0x01'],
    });
    expect(bodyFor(request, {status: 'error', errorCode: 'E2004', error: 'prover'})).toEqual({
      requestId: request.requestId,
      circuit: 'mdl_kr_age',
      status: 'error',
      errorCode: 'E2004',
      error: 'prover',
    });
    expect(bodyFor(request, {status: 'cancelled', reason: 'no'})).toMatchObject({status: 'cancelled', error: 'no'});
  });

  test('generating is sent to the callback and is not the answer', async () => {
    const {d, posts} = deps([{status: 200}]);
    await sendGenerating(d, request);
    expect(posts[0]).toEqual({url: request.callbackUrl, body: {requestId: request.requestId, circuit: 'mdl_kr_age', status: 'generating'}});
    expect((await answerRequest(d, request, {status: 'cancelled', reason: 'x'})).kind).toBe('delivered');
  });

  test('a second answer for the same request is not sent', async () => {
    const {d, posts} = deps([{status: 200}]);
    const [a, b] = await Promise.all([
      answerRequest(d, request, {status: 'cancelled', reason: 'x'}),
      answerRequest(d, request, {status: 'error', errorCode: 'E2004', error: 'y'}),
    ]);
    expect([a.kind, b.kind]).toEqual(['delivered', 'duplicate']);
    expect(posts).toHaveLength(1);
  });

  test('an answer from an earlier run blocks a new one (persisted)', async () => {
    const kv = memoryKv();
    await deps([{status: 200}], kv).d.answered.add(request.requestId);
    const {d, posts} = deps([{status: 200}], kv);
    expect((await answerRequest(d, request, {status: 'cancelled', reason: 'x'})).kind).toBe('duplicate');
    expect(posts).toHaveLength(0);
  });

  test.each([
    [{status: 409, body: '{"error":"x","reason":"expired"}'}, 'expired', 'E1003'],
    [{status: 409, body: '{"error":"x","reason":"already_answered"}'}, 'already-answered', 'E1007'],
    [{status: 409, body: 'not json'}, 'already-answered', 'E1007'],
    [{status: 400, body: '{"error":"bad"}'}, 'rejected', 'E3002'],
    [{status: 404, body: ''}, 'rejected', 'E3002'],
    [{status: 500, body: 'oops'}, 'server-error', 'E3003'],
    [{status: 503, body: ''}, 'server-error', 'E3003'],
    [{throws: 'Network request failed'}, 'network-error', 'E3001'],
  ] as Array<[Reply, string, string]>)('relay reply %j -> %s / %s, never retried', async (reply, kind, code) => {
    const {d, posts} = deps([reply]);
    const outcome = await answerRequest(d, request, {status: 'completed', proof: '0xab', publicInputs: []});
    expect(outcome.kind).toBe(kind);
    expect(outcomeErrorCode(outcome)).toBe(code);
    expect(posts).toHaveLength(1);
  });

  test('a storage failure does not stop the answer', async () => {
    const kv: KeyValueStore = {getItem: async () => Promise.reject(new Error('io')), setItem: async () => undefined};
    const {d, posts} = deps([{status: 200}], kv as ReturnType<typeof memoryKv>);
    expect((await answerRequest(d, request, {status: 'cancelled', reason: 'x'})).kind).toBe('delivered');
    expect(posts).toHaveLength(1);
  });
});

describe('answeredStore', () => {
  test('forgets old entries, caps the list, survives garbage', async () => {
    const kv = memoryKv();
    let now = 0;
    const store = createAnsweredStore(kv, () => now);
    await store.add('a');
    now = KEEP_MS + 1;
    expect(await store.has('a')).toBe(false);
    for (let i = 0; i < MAX_ENTRIES + 5; i++) await store.add(`id${i}`);
    expect(JSON.parse(kv.data.get('@kproof:answeredRequests')!)).toHaveLength(MAX_ENTRIES);
    expect(await store.has(`id${MAX_ENTRIES + 4}`)).toBe(true);
    expect(await store.has('id0')).toBe(false);
    kv.data.set('@kproof:answeredRequests', '{broken');
    expect(await store.has('x')).toBe(false);
  });
});
