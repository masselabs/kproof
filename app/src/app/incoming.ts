/**
 * The single entry point for an incoming proof request, whatever brought it:
 * a tapped `kproof://` link, the QR scanner, or the 증명 tab's in-app request.
 *
 * One request id is one request on screen:
 *   - an id already on screen (or being checked right now) is focused, never
 *     opened a second time;
 *   - an id this phone already answered, or is answering, is refused with
 *     E1007 and never proved again.
 *   - a newer request never replaces one being proved: it waits and is shown
 *     when that one finishes (proofport-app App.tsx does the same). Only the
 *     newest waits; one it displaces is told so.
 * The in-flight claim is taken before the first await, so the same link
 * arriving twice at once (a scan and a tap, a resumed app) cannot slip
 * through the gap.
 */
import type {EnvRow} from '../config/env';
import {parseProofRequestUrl, type ProofRequest} from '../domain/request';
import {toAppError, type ErrorCode} from '../errors';
import type {AnsweredStore} from '../services/answeredStore';

export type IncomingOutcome = 'shown' | 'queued' | 'focused' | 'refused';

export interface IncomingDeps {
  env(): EnvRow;
  answered: Pick<AnsweredStore, 'has'>;
  /** True while this runtime is sending (or has sent) the terminal answer for the id. */
  isAnswering(requestId: string): boolean;
  pending(): ProofRequest | null;
  setPending(request: ProofRequest): void;
  /** True once the pending request was approved and until it is finished. */
  pendingIsBusy(): boolean;
  queued(): ProofRequest | null;
  setQueued(request: ProofRequest): void;
  /** Bring the request already on screen to the front. */
  focus(): void;
  showError(code: ErrorCode, detail: string): void;
  /** Tell the relay the request on screen was replaced by a newer one. */
  declineReplaced(previous: ProofRequest): Promise<void>;
  log(message: string): void;
}

export function createIncomingHandler(deps: IncomingDeps): (url: string) => Promise<IncomingOutcome> {
  const checking = new Set<string>();

  return async function handleIncoming(url) {
    let request: ProofRequest;
    try {
      request = parseProofRequestUrl(url, deps.env());
    } catch (err) {
      const e = toAppError(err, 'E1001');
      deps.showError(e.code, e.detail);
      return 'refused';
    }
    const id = request.requestId;

    if (checking.has(id) || deps.pending()?.requestId === id || deps.queued()?.requestId === id) {
      deps.log(`[link] request ${id} is already open; focusing it`);
      deps.focus();
      return 'focused';
    }
    if (deps.isAnswering(id)) {
      deps.showError('E1007', `request ${id} is being answered on this phone`);
      return 'refused';
    }

    checking.add(id);
    try {
      if (await deps.answered.has(id)) {
        deps.showError('E1007', `request ${id} was answered earlier on this phone`);
        return 'refused';
      }
      // Not the same id: every path that opens a request goes through this
      // handler, and `checking` covered the await above.
      if (deps.pendingIsBusy() || deps.queued()) {
        const displaced = deps.queued();
        if (displaced) await deps.declineReplaced(displaced);
        deps.log(`[link] request ${id} waits until the current request is finished`);
        deps.setQueued(request);
        return 'queued';
      }
      const previous = deps.pending();
      if (previous) {
        // One request on screen at a time; the one it replaces is told so.
        await deps.declineReplaced(previous);
      }
      deps.log(`[link] request ${id} for ${request.circuitId}`);
      deps.setPending(request);
      return 'shown';
    } finally {
      checking.delete(id);
    }
  };
}
