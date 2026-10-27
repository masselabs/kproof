import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { RelayClient, RelayError, type RequestStatus } from '../relay';

const API = 'https://stg-api.koreanproof.com';
const RID = '30924642-c99c-4349-b0bb-09e5641fe281';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fake socket that records handlers and lets the test fire events. */
function fakeSocket() {
  const handlers = new Map<string, (data?: unknown) => void>();
  const socket = {
    on: vi.fn((event: string, fn: (data?: unknown) => void) => { handlers.set(event, fn); return socket; }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
  return { socket: socket as unknown as Socket, raw: socket, fire: (event: string, data?: unknown) => handlers.get(event)?.(data) };
}

describe('createRequest', () => {
  it('asks for a challenge, then sends exactly the request the relay expects', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, { requestId: RID, challenge: '0xabc', expiresAt: 1 }))
      .mockResolvedValueOnce(json(201, { requestId: RID, deepLink: 'kproof://proof-request?data=x', status: 'pending' }));
    const client = new RelayClient({ apiUrl: API, fetchImpl });

    const created = await client.createRequest('mdl_kr_age', { scope: 's', ageThreshold: 19 }, 'KProof demo');

    expect(created).toEqual({ requestId: RID, deepLink: 'kproof://proof-request?data=x' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]![0]).toBe(`${API}/api/v1/challenge`);
    expect(fetchImpl.mock.calls[1]![0]).toBe(`${API}/api/v1/proof/request`);
    expect(JSON.parse(fetchImpl.mock.calls[1]![1].body)).toEqual({
      requestId: RID, challenge: '0xabc', circuitId: 'mdl_kr_age',
      inputs: { scope: 's', ageThreshold: 19 }, scope: 's', dappName: 'KProof demo',
    });
  });

  it('surfaces the relay\'s reason when it refuses', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, { requestId: RID, challenge: '0xabc' }))
      .mockResolvedValueOnce(json(400, { error: "Unknown circuit 'x'. Known: mdl_kr_age." }));
    await expect(new RelayClient({ apiUrl: API, fetchImpl }).createRequest('x', {}, 'd'))
      .rejects.toThrow(/HTTP 400.*Unknown circuit 'x'/);
  });

  it('says plainly when it is rate limited', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(429, { error: 'Too many requests' }));
    await expect(new RelayClient({ apiUrl: API, fetchImpl }).createRequest('mdl_kr_age', {}, 'd'))
      .rejects.toMatchObject({ kind: 'rate_limited', status: 429 });
  });

  it('reports an unreachable server instead of hanging', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await new RelayClient({ apiUrl: API, fetchImpl }).createRequest('mdl_kr_age', {}, 'd').catch((e) => e);
    expect(err).toBeInstanceOf(RelayError);
    expect(err.status).toBe(0);
    expect(err.kind).toBe('network');
    expect(err.message).toMatch(/Cannot reach the relay: Failed to fetch/);
  });

  it.each([
    [{ requestId: RID }, /challenge/],
    [{}, /challenge/],
  ])('refuses a challenge answer missing fields %j', async (body, re) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(200, body));
    await expect(new RelayClient({ apiUrl: API, fetchImpl }).createRequest('mdl_kr_age', {}, 'd')).rejects.toThrow(re);
  });

  it('refuses a request answer without a deep link', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, { requestId: RID, challenge: '0xabc' }))
      .mockResolvedValueOnce(json(201, { requestId: RID }));
    await expect(new RelayClient({ apiUrl: API, fetchImpl }).createRequest('mdl_kr_age', {}, 'd')).rejects.toThrow(/deepLink/);
  });

  it('handles a non-JSON error body', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('<html>502</html>', { status: 502, statusText: 'Bad Gateway' }));
    await expect(new RelayClient({ apiUrl: API, fetchImpl }).createRequest('mdl_kr_age', {}, 'd')).rejects.toThrow(/HTTP 502.*Bad Gateway/);
  });
});

describe('watch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('subscribes on connect and stops everything at the socket\'s terminal result', async () => {
    const s = fakeSocket();
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { requestId: RID, status: 'pending' }));
    const client = new RelayClient({ apiUrl: API, fetchImpl, connect: () => s.socket, pollIntervalMs: 1000 });
    const updates: RequestStatus[] = [];
    client.watch(RID, (u) => updates.push(u), () => {});

    s.fire('connect');
    expect(s.raw.emit).toHaveBeenCalledWith('proof:subscribe', { requestId: RID });
    await vi.advanceTimersByTimeAsync(0);
    s.fire('proof:result', { requestId: RID, status: 'completed', proof: '0x' + 'ab'.repeat(10), publicInputs: ['0x1'], circuit: 'mdl_kr_age' });

    expect(updates.at(-1)).toMatchObject({ status: 'completed', publicInputs: ['0x1'] });
    expect(s.raw.disconnect).toHaveBeenCalled();
    const calls = fetchImpl.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });

  it('ignores socket events for another request', async () => {
    const s = fakeSocket();
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { requestId: RID, status: 'pending' }));
    const updates: RequestStatus[] = [];
    new RelayClient({ apiUrl: API, fetchImpl, connect: () => s.socket }).watch(RID, (u) => updates.push(u), () => {});
    await vi.advanceTimersByTimeAsync(0);
    s.fire('proof:result', { requestId: 'other', status: 'completed', proof: '0x1', publicInputs: [] });
    expect(updates.every((u) => u.status === 'pending')).toBe(true);
  });

  it('keeps polling through 5xx and network errors, and ends on a terminal poll', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(500, { error: 'Internal server error' }))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(json(200, { requestId: RID, status: 'generating' }))
      .mockResolvedValueOnce(json(200, { requestId: RID, status: 'error', error: 'E2007 cancelled by user', errorCode: 'E2007' }));
    const updates: RequestStatus[] = [];
    const onError = vi.fn();
    new RelayClient({ apiUrl: API, fetchImpl, connect: () => { throw new Error('no socket'); }, pollIntervalMs: 1000 })
      .watch(RID, (u) => updates.push(u), onError);
    await vi.advanceTimersByTimeAsync(5000);
    expect(updates.map((u) => u.status)).toEqual(['generating', 'error']);
    expect(updates[1]).toMatchObject({ errorCode: 'E2007' });
    expect(onError).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('turns a 404 into expired', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(404, { error: 'Request not found or expired' }));
    const updates: RequestStatus[] = [];
    new RelayClient({ apiUrl: API, fetchImpl, connect: () => { throw new Error('x'); } }).watch(RID, (u) => updates.push(u), () => {});
    await vi.advanceTimersByTimeAsync(10_000);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.status).toBe('expired');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops and reports on a 4xx other than 404/429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(400, { error: 'requestId must be a request id this server issued (a UUID)' }));
    const onError = vi.fn();
    new RelayClient({ apiUrl: API, fetchImpl, connect: () => { throw new Error('x'); } }).watch('bad', () => {}, onError);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a status it does not know rather than showing it', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, { requestId: RID, status: 'hacked' }))
      .mockResolvedValueOnce(json(200, { requestId: RID, status: 'cancelled' }));
    const updates: RequestStatus[] = [];
    new RelayClient({ apiUrl: API, fetchImpl, connect: () => { throw new Error('x'); }, pollIntervalMs: 1000 })
      .watch(RID, (u) => updates.push(u), () => {});
    await vi.advanceTimersByTimeAsync(3000);
    expect(updates.map((u) => u.status)).toEqual(['cancelled']);
  });

  it('the returned function stops polling and closes the socket', async () => {
    const s = fakeSocket();
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { requestId: RID, status: 'pending' }));
    const stop = new RelayClient({ apiUrl: API, fetchImpl, connect: () => s.socket, pollIntervalMs: 1000 })
      .watch(RID, () => {}, () => {});
    await vi.advanceTimersByTimeAsync(0);
    stop();
    const calls = fetchImpl.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl.mock.calls.length).toBe(calls);
    expect(s.raw.disconnect).toHaveBeenCalled();
  });

  it('encodes the request id into the poll URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(400, { error: 'bad' }));
    new RelayClient({ apiUrl: API, fetchImpl, connect: () => { throw new Error('x'); } }).watch('../admin?x=1', () => {}, () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl.mock.calls[0]![0]).toBe(`${API}/api/v1/proof/..%2Fadmin%3Fx%3D1`);
  });
});
