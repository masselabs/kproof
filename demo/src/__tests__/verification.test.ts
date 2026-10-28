import { describe, expect, it, vi } from 'vitest';
import type { RequestStatus, VerifyOutcome } from '@kproof/sdk';
import { NETWORKS } from '@kproof/sdk';
import type { OffChainResult } from '@kproof/sdk/offchain';
import { createVerifier, type Verification, type VerifyDeps } from '../verification';

const answer = (requestId: string): RequestStatus => ({
  requestId, status: 'completed', circuit: 'mdl_kr_age', proof: '0x' + 'ab'.repeat(64), publicInputs: ['0x' + '0'.repeat(64)],
});
const outcome = (verifier: string): VerifyOutcome => ({
  valid: true, checks: [{ name: 'on_chain', ok: true, detail: verifier }], issuerVerified: false, network: { chainId: 84532, verifier },
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Deps whose results the test releases by hand, one pair per call. */
function manual() {
  const answers: Array<ReturnType<typeof deferred<VerifyOutcome>>> = [];
  const offChains: Array<ReturnType<typeof deferred<OffChainResult>>> = [];
  const deps: VerifyDeps = {
    verifyAnswer: vi.fn(() => {
      const d = deferred<VerifyOutcome>();
      answers.push(d);
      return d.promise;
    }),
    verifyOffChain: vi.fn(() => {
      const d = deferred<OffChainResult>();
      offChains.push(d);
      return d.promise;
    }),
  };
  const draws: Array<[RequestStatus, Verification | undefined]> = [];
  const verifier = createVerifier('staging', deps, (s, v) => draws.push([s, v]));
  return { deps, answers, offChains, draws, verifier };
}

describe('createVerifier', () => {
  it('starts both verifications for a completed answer, with the request and the answer as sent', async () => {
    const { deps, draws, verifier } = manual();
    const s = answer('a');
    verifier.show('mdl_kr_age', { scope: 's', ageThreshold: 19 }, s);
    await flush();
    expect(deps.verifyAnswer).toHaveBeenCalledWith({ circuitId: 'mdl_kr_age', inputs: { scope: 's', ageThreshold: 19 } }, s, { environment: 'staging' });
    expect(deps.verifyOffChain).toHaveBeenCalledWith('mdl_kr_age', s.proof, s.publicInputs);
    expect(draws).toHaveLength(1);
    expect(draws[0]![1]).toEqual({
      chain: { name: 'Base Sepolia', chainId: 84532, verifier: NETWORKS.staging.verifiers.mdl_kr_age },
      offChain: { state: 'checking' },
      answer: { state: 'checking' },
    });
  });

  it('draws each verification as it settles, in either order', async () => {
    const { answers, offChains, draws, verifier } = manual();
    verifier.show('mdl_kr_age', {}, answer('a'));
    await flush();
    offChains[0]!.resolve({ valid: true, ms: 120 });
    await flush();
    expect(draws.at(-1)![1]).toMatchObject({ offChain: { state: 'done', value: { valid: true, ms: 120 } }, answer: { state: 'checking' } });
    answers[0]!.resolve(outcome('x'));
    await flush();
    expect(draws.at(-1)![1]).toMatchObject({ offChain: { state: 'done' }, answer: { state: 'done', value: outcome('x') } });
    expect(draws).toHaveLength(3);
  });

  it('a newer answer is never overwritten by an older verification that settles later', async () => {
    const { answers, offChains, draws, verifier } = manual();
    verifier.show('mdl_kr_age', {}, answer('old'));
    verifier.show('mdl_kr_region', {}, answer('new'));
    await flush();
    answers[1]!.resolve(outcome('new'));
    offChains[1]!.resolve({ valid: true, ms: 1 });
    await flush();
    const settled = draws.length;
    answers[0]!.resolve(outcome('old'));
    offChains[0]!.reject(new Error('old failure'));
    await flush();
    expect(draws).toHaveLength(settled);
    expect(draws.at(-1)![0].requestId).toBe('new');
    expect(draws.at(-1)![1]).toMatchObject({ answer: { state: 'done', value: outcome('new') }, offChain: { state: 'done' } });
  });

  it('nothing draws after cancel', async () => {
    const { answers, offChains, draws, verifier } = manual();
    verifier.show('mdl_kr_age', {}, answer('a'));
    await flush();
    verifier.cancel();
    answers[0]!.resolve(outcome('a'));
    offChains[0]!.resolve({ valid: true, ms: 1 });
    await flush();
    expect(draws).toHaveLength(1);
  });

  it('a verifier that fails to load, or an RPC that throws, settles as failed with the reason', async () => {
    const { answers, offChains, draws, verifier } = manual();
    verifier.show('mdl_kr_age', {}, answer('a'));
    await flush();
    offChains[0]!.reject(new Error('could not load the proof verifier: chunk failed'));
    answers[0]!.reject('RPC down');
    await flush();
    expect(draws.at(-1)![1]).toMatchObject({
      offChain: { state: 'failed', reason: 'could not load the proof verifier: chunk failed' },
      answer: { state: 'failed', reason: 'RPC down' },
    });
  });

  it('a check that throws instead of rejecting still settles as failed', async () => {
    const draws: Array<Verification | undefined> = [];
    const deps: VerifyDeps = {
      verifyAnswer: () => {
        throw new Error('sync answer');
      },
      verifyOffChain: () => {
        throw new Error("Unknown circuit 'x'");
      },
    };
    createVerifier('staging', deps, (_s, v) => draws.push(v)).show('mdl_kr_age', {}, answer('a'));
    await flush();
    expect(draws.at(-1)).toMatchObject({ offChain: { state: 'failed', reason: "Unknown circuit 'x'" }, answer: { state: 'failed', reason: 'sync answer' } });
  });

  it.each(['error', 'cancelled', 'expired'] as const)('a %s answer draws once and verifies nothing', async (status) => {
    const { deps, draws, verifier } = manual();
    verifier.show('mdl_kr_age', {}, { requestId: 'a', status });
    await flush();
    expect(draws).toEqual([[{ requestId: 'a', status }, undefined]]);
    expect(deps.verifyAnswer).not.toHaveBeenCalled();
    expect(deps.verifyOffChain).not.toHaveBeenCalled();
  });

  it('refuses an unknown environment by name', () => {
    const { deps } = manual();
    expect(() => createVerifier('production' as never, deps, () => undefined).show('mdl_kr_age', {}, answer('a'))).toThrow(/Unknown KProof environment 'production'/);
  });
});
