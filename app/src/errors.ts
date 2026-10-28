/**
 * Every user-facing failure has a code. The same code is what the relay
 * receives as `errorCode` when the failure ends a request, so the person and
 * the requesting service read the same thing.
 *
 * E1xxx request, E2xxx proof, E3xxx network, E4xxx device security,
 * E5xxx storage, E6xxx mobile ID import.
 *
 * Each code's title and body live in every locale file under `errors`
 * (checked by everyErrorCodeHasWordsInBothLanguages.test.ts).
 */
export const ERROR_CODES = [
  'E1001',
  'E1002',
  'E1003',
  'E1004',
  'E1005',
  'E1006',
  'E1007',
  'E1008',
  'E2001',
  'E2002',
  'E2003',
  'E2004',
  'E3001',
  'E3002',
  'E3003',
  'E4001',
  'E4002',
  'E4003',
  'E5001',
  'E5002',
  'E6001',
  'E6002',
  'E6003',
  'E6004',
  'E6005',
  'E6006',
  'E6007',
  'E6008',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
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
