/**
 * App-wide state: the lock, the unlocked vault (in memory only while
 * unlocked), the request waiting to be shown, and the error modal.
 */
import {useSyncExternalStore} from 'react';
import {INITIAL_LOCK, onBackground, onForeground, onUnlocked, type LockState} from '../domain/lock';
import type {ProofRequest} from '../domain/request';
import type {ErrorCode} from '../errors';
import type {DeviceSecurity, Vault} from '../services/vault';
import type {InAppRequest} from '../services/inAppProof';

export interface ShownError {
  code: ErrorCode;
  detail: string;
}

export interface SessionState {
  lock: LockState;
  vault: Vault | null;
  security: DeviceSecurity | null;
  pendingRequest: ProofRequest | null;
  /**
   * The pending request's id once the person approved it, until it is done.
   * While set, a newer request never replaces it: it waits in queuedRequest
   * and is shown when this one finishes (as proofport-app does).
   */
  provingRequestId: string | null;
  /** The newest request that arrived while pendingRequest was being proved. */
  queuedRequest: ProofRequest | null;
  /** A request this app created for itself from the 증명 tab; its answer is verified on the done screen. */
  inAppRequest: InAppRequest | null;
  /** Bumped when an incoming link names the request already open, so it is brought to the front. */
  requestFocus: number;
  error: ShownError | null;
}

let state: SessionState = {
  lock: INITIAL_LOCK,
  vault: null,
  security: null,
  pendingRequest: null,
  provingRequestId: null,
  queuedRequest: null,
  inAppRequest: null,
  requestFocus: 0,
  error: null,
};
const listeners = new Set<() => void>();
const unlockWaiters: Array<(vault: Vault) => void> = [];

function set(next: Partial<SessionState>): void {
  state = {...state, ...next};
  listeners.forEach((l) => l());
}

export const session = {
  get: () => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setSecurity(security: DeviceSecurity): void {
    set({security});
  },
  unlocked(vault: Vault): void {
    set({lock: onUnlocked(), vault});
    unlockWaiters.splice(0).forEach((w) => w(vault));
  },
  setVault(vault: Vault): void {
    set({vault});
  },
  background(now: number): void {
    set({lock: onBackground(state.lock, now)});
  },
  foreground(now: number): void {
    const lock = onForeground(state.lock, now);
    // Locking drops the cards from memory; they come back only through the prompt.
    set(lock.locked ? {lock, vault: null} : {lock});
  },
  /** Resolves with the vault once the person has unlocked (immediately if unlocked). */
  whenUnlocked(): Promise<Vault> {
    if (!state.lock.locked && state.vault) return Promise.resolve(state.vault);
    return new Promise((resolve) => unlockWaiters.push(resolve));
  },
  /**
   * Shows `request`, or with null finishes the one shown; a request queued
   * behind it then takes its place.
   */
  setPendingRequest(request: ProofRequest | null): void {
    if (request === null && state.queuedRequest) {
      set({pendingRequest: state.queuedRequest, queuedRequest: null, provingRequestId: null});
      return;
    }
    set({pendingRequest: request, provingRequestId: null});
  },
  /** The person approved the pending request; it is now being proved. */
  startProving(requestId: string): void {
    set({provingRequestId: requestId});
  },
  /** Proving ended without an answer; the request is back in review. */
  stopProving(): void {
    set({provingRequestId: null});
  },
  setQueuedRequest(request: ProofRequest): void {
    set({queuedRequest: request});
  },
  focusRequest(): void {
    set({requestFocus: state.requestFocus + 1});
  },
  setInAppRequest(request: InAppRequest | null): void {
    set({inAppRequest: request});
  },
  showError(code: ErrorCode, detail: string): void {
    console.log(`[error] ${code}: ${detail}`);
    set({error: {code, detail}});
  },
  clearError(): void {
    set({error: null});
  },
};

export function useSession<T>(select: (s: SessionState) => T): T {
  return useSyncExternalStore(session.subscribe, () => select(session.get()));
}
