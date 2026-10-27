import {AppError} from '../../errors';
import {runRaonImport, type RaonDeps} from '../raon';

type Answer = {status?: number; json?: unknown; text?: string; throws?: string};

function response(a: Answer): Response {
  const status = a.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (a.text !== undefined) throw new SyntaxError('Unexpected token');
      return a.json;
    },
  } as unknown as Response;
}

const OK = 'OACX_SUCCESS';
const trans = {oacxCode: OK, token: 't1', txId: 'tx'};
const appReq = {oacxCode: OK, token: 't2', cxId: 'cx', data: {iosLink: 'mobileid://open?tx=SECRET', androidLink: 'mobileid://a?tx=SECRET'}};
const pending = {oacxCode: 'OACX_PENDING'};
const verified = {oacxCode: OK, token: 't3', data: {verified: true}};
const parsed = {oacxCode: OK, data: {ci: 'CI', name: '홍길동', birth: '19900101'}};

function setup(script: Record<string, Answer[]>, over: Partial<RaonDeps> = {}) {
  const calls: Array<{path: string; body: unknown}> = [];
  let clock = 0;
  const logs: string[] = [];
  const deps: RaonDeps = {
    baseUrl: 'https://raon.test',
    fetch: (async (url: string, init: RequestInit) => {
      const path = url.replace('https://raon.test', '');
      calls.push({path, body: JSON.parse(String(init.body))});
      const queue = script[path];
      if (!queue || queue.length === 0) throw new Error(`no scripted answer for ${path}`);
      const next = queue.length > 1 ? queue.shift()! : queue[0];
      if (next.throws) throw new Error(next.throws);
      return response(next);
    }) as unknown as typeof fetch,
    platform: 'ios',
    canOpenURL: async () => true,
    openURL: async () => undefined,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    log: (m) => logs.push(m),
    ...over,
  };
  return {deps, calls, logs};
}

const happy = () => ({
  '/oacx/api/v1.0/trans': [{json: trans}],
  '/oacx/api/v1.0/authen/app/request': [{json: appReq}],
  '/oacx/api/v1.0/authen/app/result': [{json: pending}, {json: verified}],
  '/oacx/api/v1.0/trans/token': [{json: parsed}],
});

const opts = (signal = new AbortController().signal) => ({provider: 'comrc_v1.5' as const, signal, timeoutMs: 30_000, pollIntervalMs: 3_000});

async function codeOf(p: Promise<unknown>): Promise<{code: string; detail: string}> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return {code: err.code, detail: err.detail};
    throw err;
  }
  throw new Error('expected a failure');
}

describe('runRaonImport', () => {
  test('runs the five stages in order and returns the parsed data', async () => {
    const {deps, calls} = setup(happy());
    const data = await runRaonImport(deps, opts());
    expect(data).toEqual(parsed.data);
    expect(calls.map((c) => c.path)).toEqual([
      '/oacx/api/v1.0/trans',
      '/oacx/api/v1.0/authen/app/request',
      '/oacx/api/v1.0/authen/app/result',
      '/oacx/api/v1.0/authen/app/result',
      '/oacx/api/v1.0/trans/token',
    ]);
    expect(calls[1].body).toMatchObject({provider: 'comrc_v1.5', token: 't1', txId: 'tx', ci: true, telno: true});
    expect(calls[2].body).toEqual({provider: 'comrc_v1.5', token: 't2', txId: 'tx', cxId: 'cx'});
    expect(calls[4].body).toEqual({token: 't3'});
  });

  test('never logs the deep link token', async () => {
    const {deps, logs} = setup(happy());
    await runRaonImport(deps, opts());
    expect(logs.join('\n')).not.toContain('SECRET');
  });

  test('each stage failure names the stage', async () => {
    const cases: Array<[string, Answer, string]> = [
      ['/oacx/api/v1.0/trans', {status: 503}, 'trans'],
      ['/oacx/api/v1.0/trans', {text: '<html>'}, 'trans'],
      ['/oacx/api/v1.0/trans', {json: {oacxCode: 'OACX_FAIL', clientMessage: 'nope'}}, 'trans'],
      ['/oacx/api/v1.0/trans', {json: [1]}, 'trans'],
      ['/oacx/api/v1.0/trans', {throws: 'offline'}, 'trans'],
      ['/oacx/api/v1.0/authen/app/request', {status: 500}, 'app/request'],
      ['/oacx/api/v1.0/authen/app/request', {json: {oacxCode: 'OACX_FAIL'}}, 'app/request'],
      ['/oacx/api/v1.0/authen/app/request', {json: {oacxCode: OK, token: 't2'}}, 'app/request'],
      ['/oacx/api/v1.0/trans/token', {status: 502}, 'trans/token'],
      ['/oacx/api/v1.0/trans/token', {json: {oacxCode: 'OACX_FAIL'}}, 'trans/token'],
      ['/oacx/api/v1.0/trans/token', {json: {oacxCode: OK}}, 'trans/token'],
    ];
    for (const [path, answer, stage] of cases) {
      const script = happy() as Record<string, Answer[]>;
      script[path] = [answer];
      const {deps} = setup(script);
      const r = await codeOf(runRaonImport(deps, opts()));
      expect(r.code).toBe('E6001');
      expect(r.detail).toContain(`RAON ${stage} failed`);
    }
  });

  test('a card type RAON has no provider for is its own error, not a generic failure', async () => {
    // RAON's real answer for comrc_v1.5 / coresidence_v1.5 on 2026-10-27.
    const script = happy() as Record<string, Answer[]>;
    script['/oacx/api/v1.0/authen/app/request'] = [{json: {oacxCode: 'OACX_NO_PARAM_PROVIDER', resultCode: '303', clientMessage: '인증사업자 값이 설정되지 않았습니다.</br>서비스 관리자에게 문의하세요'}}];
    const r = await codeOf(runRaonImport(setup(script).deps, opts()));
    expect(r.code).toBe('E6008');
    expect(r.detail).toContain('provider not configured');
  });

  test('keeps polling through errors', async () => {
    const script = happy() as Record<string, Answer[]>;
    script['/oacx/api/v1.0/authen/app/result'] = [{status: 500}, {throws: 'socket hang up'}, {json: pending}, {json: verified}];
    const {deps, calls} = setup(script);
    await runRaonImport(deps, opts());
    expect(calls.filter((c) => c.path.endsWith('app/result'))).toHaveLength(4);
  });

  test('poll times out', async () => {
    const script = happy() as Record<string, Answer[]>;
    script['/oacx/api/v1.0/authen/app/result'] = [{json: pending}];
    const {deps, calls} = setup(script);
    const r = await codeOf(runRaonImport(deps, opts()));
    expect(r.code).toBe('E6002');
    expect(calls.filter((c) => c.path.endsWith('app/result'))).toHaveLength(10);
    expect(calls.some((c) => c.path.endsWith('trans/token'))).toBe(false);
  });

  test('cancel stops polling', async () => {
    const controller = new AbortController();
    const script = happy() as Record<string, Answer[]>;
    script['/oacx/api/v1.0/authen/app/result'] = [{json: pending}];
    let polls = 0;
    const {deps, calls} = setup(script, {
      sleep: async () => {
        polls++;
        if (polls === 2) controller.abort();
      },
    });
    const r = await codeOf(runRaonImport(deps, opts(controller.signal)));
    expect(r.code).toBe('E6003');
    expect(calls.filter((c) => c.path.endsWith('app/result'))).toHaveLength(2);
  });

  test('cancel before start sends nothing', async () => {
    const controller = new AbortController();
    controller.abort();
    const {deps, calls} = setup(happy());
    expect((await codeOf(runRaonImport(deps, opts(controller.signal)))).code).toBe('E6003');
    expect(calls).toHaveLength(0);
  });

  test('missing or unopenable deep link', async () => {
    const noLink = happy() as Record<string, Answer[]>;
    noLink['/oacx/api/v1.0/authen/app/request'] = [{json: {...appReq, data: {androidLink: 'mobileid://a'}}}];
    expect((await codeOf(runRaonImport(setup(noLink).deps, opts()))).code).toBe('E6004');

    const cannot = setup(happy(), {canOpenURL: async () => false});
    const r = await codeOf(runRaonImport(cannot.deps, opts()));
    expect(r.code).toBe('E6004');
    expect(r.detail).toContain('"mobileid:"');
    expect(r.detail).not.toContain('SECRET');

    const throws = setup(happy(), {openURL: async () => Promise.reject(new Error('denied'))});
    expect((await codeOf(runRaonImport(throws.deps, opts()))).code).toBe('E6004');
  });

  test('Android uses androidLink, never ssPayLink', async () => {
    const script = happy() as Record<string, Answer[]>;
    script['/oacx/api/v1.0/authen/app/request'] = [{json: {...appReq, data: {ssPayLink: 'samsungpay://x', androidLink: 'mobileid://a'}}}];
    const opened: string[] = [];
    const {deps} = setup(script, {platform: 'android', openURL: async (u) => void opened.push(u)});
    await runRaonImport(deps, opts());
    expect(opened).toEqual(['mobileid://a']);
  });
});
