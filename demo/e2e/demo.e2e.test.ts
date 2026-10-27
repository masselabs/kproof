/**
 * The demo against REAL services, over HTTP and Socket.IO. No mocks.
 *
 *   KPROOF_E2E_API_URL   kproof-server the page was built for
 *                        (https://stg-api.koreanproof.com, or a local stack)
 *   KPROOF_E2E_DEMO_URL  the served demo page (the container from this
 *                        directory's Dockerfile, or the deployed staging page)
 *
 * The app's part is played by POSTing to the relay's callback, exactly as the
 * app does, so the loop request -> deep link -> app answer -> page update runs
 * end to end on the real relay.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RelayClient, type RequestStatus } from '../src/relay';
import { CIRCUITS, type CircuitId } from '../src/requests';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the E2E run`);
  return value.replace(/\/$/, '');
}

const API = required('KPROOF_E2E_API_URL');
const DEMO = required('KPROOF_E2E_DEMO_URL');
const client = new RelayClient({ apiUrl: API, pollIntervalMs: 1000 });
const values = { scope: `kproof-demo-e2e:${Date.now()}`, ageThreshold: '19', targetRegion: '전북특별자치도' };

function decodeDeepLink(deepLink: string): Record<string, unknown> {
  const url = new URL(deepLink);
  expect(url.protocol).toBe('kproof:');
  expect(url.host).toBe('proof-request');
  const data = url.searchParams.get('data');
  if (!data) throw new Error(`deep link has no data: ${deepLink}`);
  return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
}

async function appAnswers(requestId: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${API}/api/v1/proof/callback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId, ...body }),
  });
}

describe('served page', () => {
  let html = '';
  let headers: Headers;
  beforeAll(async () => {
    const res = await fetch(`${DEMO}/`);
    expect(res.status).toBe(200);
    headers = res.headers;
    html = await res.text();
  });

  it('is the KProof demo', () => {
    expect(html).toContain('<title>KProof 데모</title>');
    expect(html).toContain('/brand/wordmark-color.svg');
  });

  it('was built for this relay, and only this relay', async () => {
    const script = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
    if (!script) throw new Error('no module script in the page');
    const bundle = await (await fetch(new URL(script, `${DEMO}/`))).text();
    expect(bundle).toContain(API);
    for (const other of ['https://stg-api.koreanproof.com', 'https://api.koreanproof.com'].filter((u) => u !== API)) {
      expect(bundle).not.toContain(other);
    }
  });

  it('sends a content security policy that only lets the page talk to its relay', () => {
    const csp = headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`connect-src 'self' ${API} ${API.replace(/^http/, 'ws')}`);
    expect(headers.get('x-content-type-options')).toBe('nosniff');
  });

  it.each(['/brand/favicon.svg', '/fonts/PretendardVariable.woff2'])('serves %s', async (path) => {
    expect((await fetch(`${DEMO}${path}`)).status).toBe(200);
  });

  it('answers an unknown path with the page, not a server error', async () => {
    expect((await fetch(`${DEMO}/no/such/page`)).status).toBeLessThan(500);
  });
});

describe('request -> app answer -> page update, on the real relay', () => {
  const stops: Array<() => void> = [];
  afterAll(() => stops.forEach((stop) => stop()));

  it.each(Object.keys(CIRCUITS) as CircuitId[])('%s: the deep link carries exactly the request the page built', async (id) => {
    const inputs = CIRCUITS[id].buildInputs(values);
    const created = await client.createRequest(id, inputs, 'KProof 데모');
    const request = decodeDeepLink(created.deepLink);
    expect(request).toMatchObject({ requestId: created.requestId, circuitId: id, inputs, scope: values.scope, dappName: 'KProof 데모' });
    expect(request.callbackUrl).toBe(`${API}/api/v1/proof/callback`);
    expect((await client.getStatus(created.requestId)).status).toBe('pending');
  });

  it('the page sees generating, then the app\'s terminal answer, over the socket or the poll', async () => {
    const created = await client.createRequest('mdl_kr_age', CIRCUITS.mdl_kr_age.buildInputs(values), 'KProof 데모');
    const seen: RequestStatus[] = [];
    const done = new Promise<RequestStatus>((resolve, reject) => {
      stops.push(client.watch(created.requestId, (s) => {
        seen.push(s);
        if (s.status === 'cancelled') resolve(s);
      }, reject));
    });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await appAnswers(created.requestId, { status: 'generating' })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1500));
    expect((await appAnswers(created.requestId, { status: 'cancelled', circuit: 'mdl_kr_age' })).status).toBe(200);
    const last = await done;
    expect(last.status).toBe('cancelled');
    expect(seen.map((s) => s.status)).toContain('generating');
    // A second answer is refused: the request already ended.
    expect((await appAnswers(created.requestId, { status: 'cancelled' })).status).toBe(409);
  });

  it('a hostile error message from the app reaches the page as plain data', async () => {
    const created = await client.createRequest('mdl_kr_ownership', CIRCUITS.mdl_kr_ownership.buildInputs(values), 'KProof 데모');
    const hostile = '<img src=x onerror=alert(1)> 실패 😀';
    expect((await appAnswers(created.requestId, { status: 'error', errorCode: 'E2007', error: hostile })).status).toBe(200);
    const status = await client.getStatus(created.requestId);
    expect(status).toMatchObject({ status: 'error', errorCode: 'E2007', error: hostile });
  });

  it('the relay refuses a circuit the demo does not offer', async () => {
    await expect(client.createRequest('coinbase_attestation', { scope: 's' }, 'KProof 데모')).rejects.toThrow(/HTTP 400.*Unknown circuit 'coinbase_attestation'/);
  });

  it('the relay refuses a completed answer with no proof', async () => {
    const created = await client.createRequest('mdl_kr_region', CIRCUITS.mdl_kr_region.buildInputs(values), 'KProof 데모');
    const res = await appAnswers(created.requestId, { status: 'completed' });
    expect(res.status).toBe(400);
    expect((await client.getStatus(created.requestId)).status).toBe('pending');
  });
});
