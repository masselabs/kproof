import {AppError} from '../../errors';
import {CIRCUITS_SOURCE, CIRCUIT_IDS, artifactsFor, circuitFileUrl} from '../../config/circuits';
import type {ProofRequest} from '../../domain/request';
import {approveAndProve, decline, type AnswerFlowDeps} from '../answerFlow';
import {readHistory} from '../history';
import {createAnsweredStore} from '../answeredStore';
import {resetClaimsForTests} from '../relayAnswer';
import type {FsPort} from '../circuitFiles';
import type {Vault} from '../vault';
import {memoryKv} from '../../testing/memoryKv';

const request: ProofRequest = {
  requestId: '3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b',
  circuitId: 'mdl_kr_age',
  inputs: {circuitId: 'mdl_kr_age', scope: 'demo', ageThreshold: 19},
  callbackUrl: 'https://stg-api.koreanproof.com/api/v1/proof/callback',
  dappName: '데모',
  createdAt: '2026-10-27T00:00:00.000Z',
};

const vault: Vault = {
  v: 1,
  cards: [{type: 'comrc_v1_5', importedAt: 'x', fields: {ci: 'C'.repeat(88), name: '홍길동', birth: '19900101', address: '경기도 성남시'}}],
};

function okFs(): FsPort {
  const files = new Map<string, string>();
  const sha = (url: string) => {
    for (const id of CIRCUIT_IDS) {
      const a = artifactsFor(CIRCUITS_SOURCE, id);
      for (const f of [a.json, a.srs, a.vk]) if (url === circuitFileUrl(CIRCUITS_SOURCE, f)) return f.sha256;
    }
    throw new Error(url);
  };
  return {
    documentDir: '/d',
    exists: async (p) => files.has(p),
    mkdir: async () => undefined,
    unlink: async (p) => void files.delete(p),
    sha256: async (p) => files.get(p)!,
    download: async (url, p) => {
      files.set(p, sha(url));
      return 200;
    },
  };
}

function setup(over: Partial<AnswerFlowDeps> = {}, replies: number[] = [200]) {
  const posts: Array<Record<string, unknown>> = [];
  const kv = memoryKv();
  const order: string[] = [];
  const deps: AnswerFlowDeps = {
    relay: {
      fetch: (async (_u: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        order.push(`post:${body.status}`);
        const status = replies.length > 1 ? replies.shift()! : replies[0];
        return {ok: status < 300, status, text: async () => ''} as Response;
      }) as unknown as typeof fetch,
      answered: createAnsweredStore(kv, () => Date.now()),
      log: () => undefined,
    },
    openVault: async () => {
      order.push('auth');
      return vault;
    },
    fs: okFs(),
    prover: {
      generate: (_c, _s, inputs) => {
        order.push(`prove:${inputs.length}`);
        return new Uint8Array(64 + 4).buffer;
      },
      numPublicInputs: () => 2,
      split: () => ({proof: Uint8Array.from([0xab, 0xcd]).buffer, publicInputs: [Uint8Array.from([1]).buffer, Uint8Array.from([2]).buffer]}),
      readFile: async () => new ArrayBuffer(8),
      verify: (_c, full) => {
        order.push(`verify:${full.byteLength}`);
        return true;
      },
    },
    circuits: CIRCUITS_SOURCE,
    history: kv,
    now: () => new Date('2026-10-27T12:00:00Z'),
    yieldFrame: async () => undefined,
    log: () => undefined,
    ...over,
  };
  return {deps, posts, kv, order};
}

beforeEach(() => resetClaimsForTests());

describe('approveAndProve', () => {
  test('re-authenticates before proving; sends generating then completed', async () => {
    const {deps, posts, order, kv} = setup();
    const steps: string[] = [];
    const r = await approveAndProve(deps, request, 'comrc_v1_5', (s) => steps.push(s));
    expect(r.ok).toBe(true);
    expect(order).toEqual(['auth', 'post:generating', 'prove:162', 'verify:68', 'post:completed']);
    expect(steps).toEqual(['files', 'inputs', 'prove', 'verify', 'send']);
    expect(posts[1]).toEqual({
      requestId: request.requestId,
      circuit: 'mdl_kr_age',
      status: 'completed',
      proof: '0xabcd',
      publicInputs: ['0x01', '0x02'],
    });
    const h = await readHistory(kv);
    expect(h[0]).toMatchObject({requestId: request.requestId, result: 'sent', card: 'comrc_v1_5'});
    expect(JSON.stringify(h)).not.toContain('홍길동');
  });

  test('a cancelled prompt sends nothing', async () => {
    const {deps, posts} = setup({openVault: async () => Promise.reject(new AppError('E4001', 'cancel'))});
    const r = await approveAndProve(deps, request, 'comrc_v1_5', () => undefined);
    expect(r).toMatchObject({ok: false, answered: false, code: 'E4001'});
    expect(posts).toHaveLength(0);
  });

  test('no card for the chosen type sends nothing (E2001)', async () => {
    const {deps, posts} = setup();
    expect(await approveAndProve(deps, request, 'comdl_v1_5', () => undefined)).toMatchObject({answered: false, code: 'E2001'});
    expect(posts).toHaveLength(0);
  });

  test('a card that cannot satisfy the request sends nothing (E2002)', async () => {
    const {deps, posts} = setup();
    const r = await approveAndProve(deps, {...request, inputs: {circuitId: 'mdl_kr_age', scope: 'd', ageThreshold: 40}}, 'comrc_v1_5', () => undefined);
    expect(r).toMatchObject({answered: false, code: 'E2002'});
    expect(posts).toHaveLength(0);
  });

  test('a proof the phone does not verify is never sent: error E2004 instead', async () => {
    for (const verify of [() => false, () => { throw new Error('VerifyError'); }]) {
      resetClaimsForTests();
      const {deps, posts} = setup();
      deps.prover.verify = verify;
      const r = await approveAndProve(deps, request, 'comrc_v1_5', () => undefined);
      expect(r).toMatchObject({ok: false, answered: true, code: 'E2004'});
      expect(posts.map((p) => p.status)).toEqual(['generating', 'error']);
      expect(posts.some((p) => 'proof' in p)).toBe(false);
    }
  });

  test('prover failure answers error E2004 exactly once', async () => {
    const {deps, posts, kv} = setup();
    deps.prover.generate = () => {
      throw new Error('NoirError');
    };
    const r = await approveAndProve(deps, request, 'comrc_v1_5', () => undefined);
    expect(r).toMatchObject({ok: false, answered: true, code: 'E2004'});
    expect(posts.map((p) => p.status)).toEqual(['generating', 'error']);
    expect(posts[1]).toMatchObject({errorCode: 'E2004'});
    expect((await readHistory(kv))[0]).toMatchObject({result: 'failed', errorCode: 'E2004'});
  });

  test('circuit file failure answers error E2003', async () => {
    const fs = okFs();
    fs.download = async () => 503;
    const {deps, posts} = setup({fs});
    expect(await approveAndProve(deps, request, 'comrc_v1_5', () => undefined)).toMatchObject({answered: true, code: 'E2003'});
    expect(posts[1]).toMatchObject({status: 'error', errorCode: 'E2003'});
  });

  test('relay refuses the proof: the person sees why', async () => {
    const expired = setup({}, [200, 409]);
    expect(await approveAndProve(expired.deps, request, 'comrc_v1_5', () => undefined)).toMatchObject({answered: true, code: 'E1007'});
    resetClaimsForTests();
    const down = setup({}, [500]);
    expect(await approveAndProve(down.deps, request, 'comrc_v1_5', () => undefined)).toMatchObject({answered: true, code: 'E3003'});
  });

  test('decline sends cancelled once and records it', async () => {
    const {deps, posts, kv} = setup();
    await decline(deps, request, 'The person declined the request', 'comrc_v1_5');
    await decline(deps, request, 'again', 'comrc_v1_5');
    expect(posts).toEqual([{requestId: request.requestId, circuit: 'mdl_kr_age', status: 'cancelled', error: 'The person declined the request'}]);
    expect(await readHistory(kv)).toHaveLength(1);
  });
});
