import { describe, expect, it, vi } from 'vitest';
import { CIRCUITS, NETWORKS, type CircuitId } from '../circuits';
import { encodeVerifyCall, koreanYear, readBytes, regionHash, scopeHash, verifyAnswer, verifyOnChain } from '../verify';

const NOW = new Date('2026-10-27T12:00:00Z');
const word = (n: number | bigint) => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const byteWords = (b: Uint8Array) => Array.from(b, (x) => word(x));
const PROOF = '0x' + 'ab'.repeat(200);
const NULLIFIER = new Uint8Array(32).map((_, i) => i + 1);

function rpc(result: string | { error: string }) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(typeof result === 'string' ? { jsonrpc: '2.0', id: 1, result } : { jsonrpc: '2.0', id: 1, error: { message: result.error } }), { status: 200 }));
}
const TRUE = '0x' + '0'.repeat(63) + '1';
const FALSE = '0x' + '0'.repeat(64);

function ageAnswer(over: { scope?: string; age?: number; year?: number } = {}) {
  return {
    status: 'completed', circuit: 'mdl_kr_age', proof: PROOF,
    publicInputs: [...byteWords(scopeHash(over.scope ?? 's')), ...byteWords(NULLIFIER), word(over.age ?? 19), word(over.year ?? 2026)],
  };
}
function regionAnswer(region: string) {
  return {
    status: 'completed', circuit: 'mdl_kr_region', proof: PROOF,
    publicInputs: [...byteWords(scopeHash('s')), ...byteWords(NULLIFIER), ...byteWords(regionHash(region))],
  };
}
function ownershipAnswer() {
  return {
    status: 'completed', circuit: 'mdl_kr_ownership', proof: PROOF,
    publicInputs: [...byteWords(scopeHash('s')), ...byteWords(NULLIFIER), word(0), ...byteWords(new Uint8Array(32))],
  };
}
const ageRequest = { circuitId: 'mdl_kr_age' as CircuitId, inputs: { scope: 's', ageThreshold: 19 } };
const failed = (o: { checks: { name: string; ok: boolean }[] }) => o.checks.filter((c) => !c.ok).map((c) => c.name);

describe('verifyAnswer: a correct answer', () => {
  it('passes every check, reads the nullifier, and asks the pinned verifier with the exact call', async () => {
    const fetchImpl = rpc(TRUE);
    const out = await verifyAnswer(ageRequest, ageAnswer(), { environment: 'staging', now: NOW, fetchImpl });
    expect(out.valid).toBe(true);
    expect(out.checks.map((c) => c.name)).toEqual(['status', 'circuit', 'public_input_count', 'public_input_format', 'scope', 'age_threshold', 'current_year', 'on_chain']);
    expect(out.nullifier).toBe('0x' + Array.from(NULLIFIER, (x) => x.toString(16).padStart(2, '0')).join(''));
    expect(out.issuerVerified).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(NETWORKS.staging.rpcUrl);
    const body = JSON.parse(init.body);
    expect(body.method).toBe('eth_call');
    expect(body.params[0].to).toBe(NETWORKS.staging.verifiers.mdl_kr_age);
    expect(body.params[0].data).toBe(encodeVerifyCall(PROOF, ageAnswer().publicInputs));
  });

  it.each(['서울특별시', '전북특별자치도', '제주특별자치도'])('region %s verifies', async (region) => {
    const out = await verifyAnswer({ circuitId: 'mdl_kr_region', inputs: { scope: 's', targetRegion: region } }, regionAnswer(region), { environment: 'staging', fetchImpl: rpc(TRUE) });
    expect(out.valid).toBe(true);
  });

  it('ownership verifies', async () => {
    const out = await verifyAnswer({ circuitId: 'mdl_kr_ownership', inputs: { scope: 's' } }, ownershipAnswer(), { environment: 'staging', fetchImpl: rpc(TRUE) });
    expect(out.valid).toBe(true);
  });

  it('a Korean/emoji scope hashes as UTF-8', async () => {
    const scope = '서비스-😀';
    const out = await verifyAnswer({ circuitId: 'mdl_kr_age', inputs: { scope, ageThreshold: 19 } }, ageAnswer({ scope }), { environment: 'staging', now: NOW, fetchImpl: rpc(TRUE) });
    expect(out.valid).toBe(true);
  });
});

describe('verifyAnswer: refusals name the reason', () => {
  const run = (answer: object, req: { circuitId: CircuitId; inputs: Record<string, unknown> } = ageRequest, fetchImpl = rpc(TRUE), now = NOW) =>
    verifyAnswer(req, answer as never, { environment: 'staging', now, fetchImpl });

  it('a different scope', async () => {
    const out = await run(ageAnswer({ scope: 'other' }));
    expect(out.valid).toBe(false);
    expect(failed(out)).toEqual(['scope']);
  });

  it.each([18, 20, 0, 151])('an age of %s when 19 was asked', async (age) => {
    expect(failed(await run(ageAnswer({ age })))).toEqual(['age_threshold']);
  });

  it.each([2025, 2027, 0])('the year %s in October 2026', async (year) => {
    expect(failed(await run(ageAnswer({ year })))).toEqual(['current_year']);
  });

  it('last year is accepted only within a day of the Korean New Year', async () => {
    const newYear = new Date('2026-12-31T15:30:00Z'); // 00:30 on 1 January 2027 in Korea
    expect(koreanYear(newYear)).toBe(2027);
    expect((await run(ageAnswer({ year: 2026 }), ageRequest, rpc(TRUE), newYear)).valid).toBe(true);
    expect((await run(ageAnswer({ year: 2027 }), ageRequest, rpc(TRUE), newYear)).valid).toBe(true);
    const later = new Date('2027-01-03T00:00:00Z');
    expect(failed(await run(ageAnswer({ year: 2026 }), ageRequest, rpc(TRUE), later))).toEqual(['current_year']);
  });

  it('a different region, including the retired name 전라북도', async () => {
    const req = { circuitId: 'mdl_kr_region' as CircuitId, inputs: { scope: 's', targetRegion: '전북특별자치도' } };
    expect(failed(await run(regionAnswer('서울특별시'), req))).toEqual(['region']);
    const old = { circuitId: 'mdl_kr_region' as CircuitId, inputs: { scope: 's', targetRegion: '전라북도' } };
    expect(failed(await run(regionAnswer('전라북도'), old))).toEqual(['region']);
  });

  it('an answer for another circuit', async () => {
    expect(failed(await run({ ...ageAnswer(), circuit: 'mdl_kr_region' }))).toContain('circuit');
  });

  it.each(['error', 'cancelled', 'expired', 'pending'])('status %s stops before anything else', async (status) => {
    const fetchImpl = rpc(TRUE);
    const out = await run({ ...ageAnswer(), status }, ageRequest, fetchImpl);
    expect(out.valid).toBe(false);
    expect(out.checks.map((c) => c.name)).toEqual(['status']);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([0, 65, 67, 1000])('%s public inputs', async (n) => {
    const words = Array.from({ length: n }, () => word(0));
    const out = await run({ ...ageAnswer(), publicInputs: words });
    expect(failed(out)).toEqual(['public_input_count']);
  });

  it('missing public inputs', async () => {
    expect(failed(await run({ ...ageAnswer(), publicInputs: undefined }))).toEqual(['public_input_count']);
  });

  it.each([
    ['short word', (w: string[]) => { w[3] = '0x1'; }],
    ['not hex', (w: string[]) => { w[3] = '0x' + 'zz'.repeat(32); }],
    ['no 0x', (w: string[]) => { w[3] = '00'.repeat(32); }],
  ])('a malformed word (%s)', async (_label, mutate) => {
    const a = ageAnswer();
    mutate(a.publicInputs);
    expect(failed(await run(a))).toEqual(['public_input_format']);
  });

  it('a scope word that is not a single byte', async () => {
    const a = ageAnswer();
    a.publicInputs[0] = word(256);
    expect(failed(await run(a))).toEqual(['scope']);
  });

  it.each(['', '0x', 'abcd', '0xabc', '<script>'])('a malformed proof %j', async (proof) => {
    expect(failed(await run({ ...ageAnswer(), proof }))).toEqual(['public_input_format']);
  });

  it('the verifier returns false', async () => {
    expect(failed(await run(ageAnswer(), ageRequest, rpc(FALSE)))).toEqual(['on_chain']);
  });

  it('the verifier reverts', async () => {
    const out = await run(ageAnswer(), ageRequest, rpc({ error: 'execution reverted' }));
    expect(out.checks.at(-1)).toMatchObject({ name: 'on_chain', ok: false, detail: expect.stringMatching(/reverted/) });
  });

  it('the RPC is down', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const out = await run(ageAnswer(), ageRequest, fetchImpl);
    expect(out.checks.at(-1)).toMatchObject({ name: 'on_chain', ok: false, detail: expect.stringMatching(/could not ask the verifier: fetch failed/) });
  });

  it('the RPC answers HTTP 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }));
    expect(failed(await run(ageAnswer(), ageRequest, fetchImpl))).toEqual(['on_chain']);
  });

  it('a request whose own inputs are invalid fails that check, not silently passes', async () => {
    const req = { circuitId: 'mdl_kr_age' as CircuitId, inputs: { scope: '', ageThreshold: 19 } };
    expect(failed(await run(ageAnswer({ scope: '' }), req))).toEqual(['scope']);
  });
});

describe('verifyAnswer: unknown keys throw by name', () => {
  it.each(['production', 'prod', '', 'toString', '__proto__'])('environment %j', async (environment) => {
    await expect(verifyAnswer(ageRequest, ageAnswer(), { environment: environment as never, fetchImpl: rpc(TRUE) })).rejects.toThrow(/Unknown KProof environment .* Known: staging\./);
  });

  it.each(['coinbase_attestation', 'mdl_kr', 'toString', '__proto__'])('circuit %j', async (circuitId) => {
    await expect(verifyAnswer({ circuitId: circuitId as never, inputs: {} }, ageAnswer(), { environment: 'staging', fetchImpl: rpc(TRUE) })).rejects.toThrow(/Unknown circuit/);
  });
});

describe('encoding helpers', () => {
  it('lays out verify(bytes,bytes32[]) as the deployed contracts expect', () => {
    const data = encodeVerifyCall('0x' + 'ff'.repeat(33), [word(1), word(2)]);
    expect(data.slice(0, 10)).toBe('0xea50d0e4');
    const body = data.slice(10);
    const at = (i: number) => body.slice(i * 64, (i + 1) * 64);
    expect(BigInt('0x' + at(0))).toBe(64n);           // offset of proof
    expect(BigInt('0x' + at(1))).toBe(64n + 32n * 3n); // after proof length + 2 padded words
    expect(BigInt('0x' + at(2))).toBe(33n);           // proof length
    expect(at(3)).toBe('ff'.repeat(32));
    expect(at(4)).toBe('ff' + '00'.repeat(31));       // padded
    expect(BigInt('0x' + at(5))).toBe(2n);            // array length
    expect(at(6)).toBe(word(1).slice(2));
  });

  it('regionHash refuses a name longer than 64 bytes', () => {
    expect(() => regionHash('가'.repeat(22))).toThrow(/66 bytes, more than 64/);
    expect(regionHash('가'.repeat(21))).toHaveLength(32);
  });

  it('readBytes reports a missing word', () => {
    expect(() => readBytes([word(1)], 0, 2)).toThrow(/public input 1 is missing/);
  });

  it('every circuit layout adds up to its public input count', () => {
    for (const layout of Object.values(CIRCUITS)) {
      const end = Math.max(layout.nullifier + 32, ...Object.values(layout.extra).map((f) => f.offset + f.words));
      expect(end).toBe(layout.publicInputs);
    }
  });

  it('verifyOnChain treats anything but exactly true as false', async () => {
    for (const result of ['0x', '0x02', FALSE, '0x' + '1'.repeat(64)]) {
      expect((await verifyOnChain('https://rpc', '0x1', PROOF, [], rpc(result))).ok).toBe(false);
    }
    expect((await verifyOnChain('https://rpc', '0x1', PROOF, [], rpc(TRUE))).ok).toBe(true);
  });
});
