/**
 * When the app locks. Not configurable: every cold start, and every return to
 * the foreground after at least LOCK_AFTER_MS in the background.
 */
export const LOCK_AFTER_MS = 60_000;

export type LockState = {locked: true} | {locked: false; backgroundedAt: number | null};

export const INITIAL_LOCK: LockState = {locked: true};

export function onUnlocked(): LockState {
  return {locked: false, backgroundedAt: null};
}

export function onBackground(state: LockState, now: number): LockState {
  if (state.locked) return state;
  // A second background event without a foreground in between keeps the first time.
  return {locked: false, backgroundedAt: state.backgroundedAt ?? now};
}

export function onForeground(state: LockState, now: number): LockState {
  if (state.locked) return state;
  if (state.backgroundedAt === null) return state;
  if (now - state.backgroundedAt >= LOCK_AFTER_MS) return {locked: true};
  return {locked: false, backgroundedAt: null};
}
