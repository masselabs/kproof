/**
 * What the QR scanner does with the codes the camera reports.
 *
 * A scanned code goes through the same parser a tapped `kproof://` link does
 * (parseProofRequestUrl); there is no second set of rules for the camera. A
 * code that is not a KProof request is refused with a code and scanning goes
 * on: nothing scanned is ever opened as a URL.
 *
 * The camera reports the code it sees on every frame, and several frames can
 * arrive before the screen re-renders, so the gate, not React state, decides
 * that one code is one request: after the first accepted code it ignores
 * everything until reset.
 */
import type {EnvRow} from '../config/env';
import {APP_SCHEME, parseProofRequestUrl} from '../domain/request';
import {toAppError, type ErrorCode} from '../errors';

/** How long the same refused code stays quiet before it is refused again. */
export const REFUSAL_QUIET_MS = 3000;

export type ScanOutcome =
  | {kind: 'accepted'; url: string}
  | {kind: 'refused'; code: ErrorCode; detail: string}
  | {kind: 'ignored'};

export interface ScanGateDeps {
  env: EnvRow;
  now: () => number;
  /** Called once, with the first code that is a valid KProof request. */
  onAccept: (url: string) => void;
  /** Called when a code is refused; scanning continues. */
  onRefuse: (code: ErrorCode, detail: string) => void;
}

export interface ScanGate {
  offer(codes: ReadonlyArray<{value?: string | null}>): ScanOutcome;
  /** Allows the next code (the scanner was shown again). */
  reset(): void;
}

const SCHEME_PREFIX = `${APP_SCHEME}://`;

function judge(value: string, env: EnvRow): ScanOutcome {
  if (value.slice(0, SCHEME_PREFIX.length).toLowerCase() !== SCHEME_PREFIX) {
    // The scanned text itself is never logged: it can be anything, including personal data.
    return {kind: 'refused', code: 'E1008', detail: `scanned code is not a ${SCHEME_PREFIX} link (${value.length} characters)`};
  }
  try {
    parseProofRequestUrl(value, env);
    return {kind: 'accepted', url: value};
  } catch (err) {
    const e = toAppError(err, 'E1001');
    return {kind: 'refused', code: e.code, detail: `scanned link: ${e.detail}`};
  }
}

export function createScanGate(deps: ScanGateDeps): ScanGate {
  let done = false;
  let lastRefused: {value: string; at: number} | null = null;

  return {
    offer(codes) {
      if (done) return {kind: 'ignored'};
      const values = codes
        .map((c) => c.value)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
      if (values.length === 0) return {kind: 'ignored'};
      const now = deps.now();
      // The code refused a moment ago is still in view: say nothing new about it.
      const quietValue = lastRefused !== null && now - lastRefused.at < REFUSAL_QUIET_MS ? lastRefused.value : null;
      const fresh = values.filter((v) => v !== quietValue);
      if (fresh.length === 0) return {kind: 'ignored'};

      // Several codes in one frame: a valid request among them wins.
      const verdicts = fresh.map((value) => ({value, verdict: judge(value, deps.env)}));
      const accepted = verdicts.find((v) => v.verdict.kind === 'accepted');
      if (accepted) {
        done = true;
        deps.onAccept(accepted.value);
        return accepted.verdict;
      }

      const {value, verdict} = verdicts[0];
      lastRefused = {value, at: now};
      if (verdict.kind === 'refused') deps.onRefuse(verdict.code, verdict.detail);
      return verdict;
    },
    reset() {
      done = false;
      lastRefused = null;
    },
  };
}
