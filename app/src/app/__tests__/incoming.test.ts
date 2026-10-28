import {getEnv} from '../../config/env';
import {encodeBase64Url, utf8Encode} from '../../domain/bytes';
import type {ProofRequest} from '../../domain/request';
import {createIncomingHandler, type IncomingDeps} from '../incoming';

const ID = '3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const OTHER = '4f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b';

function link(requestId = ID): string {
  const req = {
    requestId,
    circuitId: 'mdl_kr_ownership',
    inputs: {scope: 'demo.koreanproof.com'},
    callbackUrl: 'https://stg-api.koreanproof.com/api/v1/proof/callback',
    createdAt: '2026-10-27T12:00:00.000Z',
  };
  return `kproof://proof-request?data=${encodeBase64Url(utf8Encode(JSON.stringify(req)))}`;
}

function setup(opts: {answered?: string[]; answering?: string[]} = {}) {
  let pending: ProofRequest | null = null;
  let queued: ProofRequest | null = null;
  let busy = false;
  const shown: string[] = [];
  const errors: string[] = [];
  const declined: string[] = [];
  let focused = 0;
  const deps: IncomingDeps = {
    env: () => getEnv('staging'),
    answered: {has: async (id) => (opts.answered ?? []).includes(id)},
    isAnswering: (id) => (opts.answering ?? []).includes(id),
    pending: () => pending,
    setPending: (r) => {
      pending = r;
      shown.push(r.requestId);
    },
    pendingIsBusy: () => busy && pending !== null,
    queued: () => queued,
    setQueued: (r) => {
      queued = r;
    },
    focus: () => void focused++,
    showError: (code) => void errors.push(code),
    declineReplaced: async (p) => void declined.push(p.requestId),
    log: () => undefined,
  };
  return {
    handle: createIncomingHandler(deps),
    shown,
    errors,
    declined,
    focused: () => focused,
    approve: () => void (busy = true),
    queued: () => queued?.requestId ?? null,
    pending: () => pending?.requestId ?? null,
  };
}

test('a valid link is shown once', async () => {
  const s = setup();
  expect(await s.handle(link())).toBe('shown');
  expect(s.shown).toEqual([ID]);
});

test('10 copies of the same link at once open one request', async () => {
  const s = setup();
  const outcomes = await Promise.all(Array.from({length: 10}, () => s.handle(link())));
  expect(s.shown).toEqual([ID]);
  expect(outcomes.filter((o) => o === 'shown')).toHaveLength(1);
  expect(outcomes.filter((o) => o === 'focused')).toHaveLength(9);
  expect(s.errors).toEqual([]);
  expect(s.declined).toEqual([]);
});

test('the same id while it is open is focused, not opened again', async () => {
  const s = setup();
  await s.handle(link());
  expect(await s.handle(link())).toBe('focused');
  expect(s.shown).toEqual([ID]);
  expect(s.focused()).toBe(1);
  expect(s.declined).toEqual([]);
});

test('an id answered earlier on this phone is E1007 and never shown', async () => {
  const s = setup({answered: [ID]});
  expect(await s.handle(link())).toBe('refused');
  expect(s.errors).toEqual(['E1007']);
  expect(s.shown).toEqual([]);
});

test('an id being answered right now is E1007 and never shown', async () => {
  const s = setup({answering: [ID]});
  expect(await s.handle(link())).toBe('refused');
  expect(s.errors).toEqual(['E1007']);
  expect(s.shown).toEqual([]);
});

test('a different id replaces the open one, which is declined', async () => {
  const s = setup();
  await s.handle(link());
  expect(await s.handle(link(OTHER))).toBe('shown');
  expect(s.declined).toEqual([ID]);
  expect(s.shown).toEqual([ID, OTHER]);
});

test('an invalid link is refused with its code', async () => {
  const s = setup();
  expect(await s.handle('https://example.com')).toBe('refused');
  expect(s.errors).toEqual(['E1001']);
});

test('10 copies of a new link while another request is open: one replacement, one decline', async () => {
  const s = setup();
  await s.handle(link(OTHER));
  const outcomes = await Promise.all(Array.from({length: 10}, () => s.handle(link())));
  expect(s.shown).toEqual([OTHER, ID]);
  expect(s.declined).toEqual([OTHER]);
  expect(outcomes.filter((o) => o === 'shown')).toHaveLength(1);
});

const THIRD = '5f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b';

describe('a request arriving while another is being proved (as proofport-app)', () => {
  test('waits instead of replacing the proof in progress, which is not declined', async () => {
    const s = setup();
    await s.handle(link());
    s.approve();
    expect(await s.handle(link(OTHER))).toBe('queued');
    expect(s.pending()).toBe(ID);
    expect(s.queued()).toBe(OTHER);
    expect(s.declined).toEqual([]);
    expect(s.shown).toEqual([ID]);
  });

  test('only the newest waits; the one it displaces is declined', async () => {
    const s = setup();
    await s.handle(link());
    s.approve();
    await s.handle(link(OTHER));
    expect(await s.handle(link(THIRD))).toBe('queued');
    expect(s.queued()).toBe(THIRD);
    expect(s.declined).toEqual([OTHER]);
    expect(s.pending()).toBe(ID);
  });

  test('the waiting id arriving again is focused, not queued twice or declined', async () => {
    const s = setup();
    await s.handle(link());
    s.approve();
    await s.handle(link(OTHER));
    const outcomes = await Promise.all(Array.from({length: 5}, () => s.handle(link(OTHER))));
    expect(outcomes.every((o) => o === 'focused')).toBe(true);
    expect(s.declined).toEqual([]);
  });

  test('the id being proved arriving again is focused, not queued', async () => {
    const s = setup();
    await s.handle(link());
    s.approve();
    expect(await s.handle(link())).toBe('focused');
    expect(s.queued()).toBeNull();
  });

  test('an answered id is still E1007 while a proof is in progress, and nothing is queued', async () => {
    const s = setup({answered: [OTHER]});
    await s.handle(link());
    s.approve();
    expect(await s.handle(link(OTHER))).toBe('refused');
    expect(s.errors).toEqual(['E1007']);
    expect(s.queued()).toBeNull();
  });

  test('a request in review (not approved) is still replaced and declined', async () => {
    const s = setup();
    await s.handle(link());
    expect(await s.handle(link(OTHER))).toBe('shown');
    expect(s.declined).toEqual([ID]);
    expect(s.queued()).toBeNull();
  });
});
