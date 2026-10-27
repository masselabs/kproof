import {ko} from './i18n/ko';

/**
 * Every user-facing failure has a code. The same code is what the relay
 * receives as `errorCode` when the failure ends a request, so the person and
 * the requesting service read the same thing.
 *
 * E1xxx request, E2xxx proof, E3xxx network, E4xxx device security,
 * E5xxx storage, E6xxx mobile ID import.
 */
export type ErrorCode = keyof typeof ko.errors;

export const ERROR_CODES = Object.keys(ko.errors) as ErrorCode[];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ko.errors, value);
}

/** An error that already knows which code the person should see. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    /** Developer detail: logged and sent to the relay as `error`. Never personal data. */
    readonly detail: string,
  ) {
    super(`[${code}] ${detail}`);
    this.name = 'AppError';
  }
}

export function toAppError(err: unknown, fallbackCode: ErrorCode): AppError {
  if (err instanceof AppError) return err;
  const detail = err instanceof Error ? err.message : String(err);
  return new AppError(fallbackCode, detail);
}
