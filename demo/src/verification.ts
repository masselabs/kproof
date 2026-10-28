/**
 * Runs both verifications of an answer the app sent and reports each as it
 * settles: off-chain (the proof against its verification key, in this
 * browser) and the SDK's answer checks, which end with the on-chain verifier.
 *
 * Only the latest answer may draw. Every `show` or `cancel` takes a new
 * ticket, and a verification that settles under an older ticket is dropped,
 * so a slow check from a previous request never overwrites a newer result.
 */
import type { CircuitId, Environment, RequestStatus, VerifyOutcome } from '@kproof/sdk';
import type { OffChainResult } from '@kproof/sdk/offchain';
import { lookupNetwork } from '@kproof/sdk';

export type Step<T> = { state: 'checking' } | { state: 'done'; value: T } | { state: 'failed'; reason: string };

export interface Verification {
  chain: { name: string; chainId: number; verifier: string };
  offChain: Step<OffChainResult>;
  answer: Step<VerifyOutcome>;
}

export interface VerifyDeps {
  verifyAnswer: (request: { circuitId: CircuitId; inputs: Record<string, unknown> }, answer: RequestStatus, options: { environment: Environment }) => Promise<VerifyOutcome>;
  verifyOffChain: (circuitId: CircuitId, proof: unknown, publicInputs: unknown) => Promise<OffChainResult>;
}

export type Draw = (s: RequestStatus, verification: Verification | undefined) => void;

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createVerifier(environment: Environment, deps: VerifyDeps, draw: Draw) {
  let ticket = 0;

  function show(circuitId: CircuitId, inputs: Record<string, unknown>, s: RequestStatus): void {
    const mine = ++ticket;
    if (s.status !== 'completed') {
      draw(s, undefined);
      return;
    }
    const network = lookupNetwork(environment);
    let v: Verification = {
      chain: { name: network.name, chainId: network.chainId, verifier: network.verifiers[circuitId] },
      offChain: { state: 'checking' },
      answer: { state: 'checking' },
    };
    draw(s, v);
    const settle = (patch: Partial<Verification>) => {
      if (mine !== ticket) return;
      v = { ...v, ...patch };
      draw(s, v);
    };
    // Started inside a promise so a check that throws before returning one still settles as failed.
    Promise.resolve().then(() => deps.verifyAnswer({ circuitId, inputs }, s, { environment })).then(
      (value) => settle({ answer: { state: 'done', value } }),
      (err: unknown) => settle({ answer: { state: 'failed', reason: reason(err) } }),
    );
    Promise.resolve().then(() => deps.verifyOffChain(circuitId, s.proof, s.publicInputs)).then(
      (value) => settle({ offChain: { state: 'done', value } }),
      (err: unknown) => settle({ offChain: { state: 'failed', reason: reason(err) } }),
    );
  }

  /** Drops whatever is still running; nothing it settles will draw. */
  function cancel(): void {
    ticket++;
  }

  return { show, cancel };
}
