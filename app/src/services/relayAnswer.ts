/**
 * THE ONE PLACE A PROOF REQUEST IS ANSWERED. Carried over from proofport-app
 * src/utils/relayAnswer.ts, for kproof-server's callback
 * (POST <relay>/api/v1/proof/callback):
 *
 *   - `generating` may be sent once before the answer (intermediate status);
 *   - exactly ONE terminal answer per requestId: `completed` (proof,
 *     publicInputs, circuit), `error` (errorCode E\d{4} + error) or
 *     `cancelled`. The claim is taken synchronously, before the first await,
 *     and persisted, so a re-render, a retry or a re-opened link cannot send a
 *     second one;
 *   - only to a callback that passed the allow-list (request.ts) — the caller
 *     hands over a parsed ProofRequest, never a raw URL;
 *   - 409 from the relay: `{reason: 'expired'}` or `{reason: 'already_answered'}`
 *     (kproof-server alreadyFinished). Never retried.
 *   - never throws; every outcome is returned.
 */
import type {ErrorCode} from '../errors';
import type {ProofRequest} from '../domain/request';
import type {AnsweredStore} from './answeredStore';

export type RelayAnswer =
  | {status: 'completed'; proof: string; publicInputs: string[]}
  | {status: 'error'; errorCode: ErrorCode; error: string}
  | {status: 'cancelled'; reason: string};

export type AnswerOutcome =
  | {kind: 'delivered'}
  | {kind: 'expired'}
  | {kind: 'already-answered'}
  | {kind: 'duplicate'}
  | {kind: 'rejected'; status: number; body: string}
  | {kind: 'server-error'; status: number; body: string}
  | {kind: 'network-error'; error: string};

export interface RelayDeps {
  fetch: typeof fetch;
  answered: AnsweredStore;
  log(message: string): void;
}

/** In-memory claims for this runtime, taken before any await. */
const claimed = new Set<string>();

/** Whether this runtime has taken the terminal answer for the id. */
export function isClaimed(requestId: string): boolean {
  return claimed.has(requestId);
}

export function resetClaimsForTests(): void {
  claimed.clear();
}

export function bodyFor(request: ProofRequest, answer: RelayAnswer): Record<string, unknown> {
  const envelope = {requestId: request.requestId, circuit: request.circuitId};
  switch (answer.status) {
    case 'completed':
      return {...envelope, status: 'completed', proof: answer.proof, publicInputs: answer.publicInputs};
    case 'error':
      return {...envelope, status: 'error', errorCode: answer.errorCode, error: answer.error};
    case 'cancelled':
      return {...envelope, status: 'cancelled', error: answer.reason};
  }
}

async function post(deps: RelayDeps, url: string, body: Record<string, unknown>): Promise<AnswerOutcome> {
  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {kind: 'network-error', error: err instanceof Error ? err.message : String(err)};
  }
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  if (res.ok) return {kind: 'delivered'};
  if (res.status === 409) {
    let reason: unknown;
    try {
      reason = (JSON.parse(text) as {reason?: unknown}).reason;
    } catch {
      reason = undefined;
    }
    return reason === 'expired' ? {kind: 'expired'} : {kind: 'already-answered'};
  }
  if (res.status >= 500) return {kind: 'server-error', status: res.status, body: text};
  return {kind: 'rejected', status: res.status, body: text};
}

/** `generating`: best effort, never blocks the proof, never counts as the answer. */
export async function sendGenerating(deps: RelayDeps, request: ProofRequest): Promise<AnswerOutcome> {
  const outcome = await post(deps, request.callbackUrl, {
    requestId: request.requestId,
    circuit: request.circuitId,
    status: 'generating',
  });
  deps.log(`[relay] generating for ${request.requestId}: ${outcome.kind}`);
  return outcome;
}

export async function answerRequest(deps: RelayDeps, request: ProofRequest, answer: RelayAnswer): Promise<AnswerOutcome> {
  const id = request.requestId;
  if (claimed.has(id)) {
    deps.log(`[relay] ${id} already answered in this run; not sending ${answer.status}`);
    return {kind: 'duplicate'};
  }
  claimed.add(id);
  try {
    if (await deps.answered.has(id)) {
      deps.log(`[relay] ${id} was answered in an earlier run; not sending ${answer.status}`);
      return {kind: 'duplicate'};
    }
    await deps.answered.add(id);
  } catch (err) {
    // The persisted list is a second guard; the in-memory claim already holds.
    deps.log(`[relay] answered-list storage failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const body = bodyFor(request, answer);
  deps.log(
    `[relay] answering ${id}: status=${answer.status}` +
      (answer.status === 'error' ? ` errorCode=${answer.errorCode} error=${answer.error}` : '') +
      (answer.status === 'completed' ? ` proofBytes=${(answer.proof.length - 2) / 2} publicInputs=${answer.publicInputs.length}` : ''),
  );
  const outcome = await post(deps, request.callbackUrl, body);
  deps.log(`[relay] ${id}: ${outcome.kind}${'status' in outcome ? ` HTTP ${outcome.status} ${outcome.body}` : ''}${outcome.kind === 'network-error' ? ` ${outcome.error}` : ''}`);
  return outcome;
}

/** Which error the person sees for an outcome, when one is needed. */
export function outcomeErrorCode(outcome: AnswerOutcome): ErrorCode | null {
  switch (outcome.kind) {
    case 'delivered':
      return null;
    case 'expired':
      return 'E1003';
    case 'already-answered':
    case 'duplicate':
      return 'E1007';
    case 'rejected':
      return 'E3002';
    case 'server-error':
      return 'E3003';
    case 'network-error':
      return 'E3001';
  }
}
