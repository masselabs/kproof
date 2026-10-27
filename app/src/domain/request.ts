/**
 * Parsing and validating a proof request deep link:
 *
 *   kproof://proof-request?data=<base64url(JSON ProofRequest)>
 *
 * The shape is kproof-server's `ProofRequest` (src/relay/types.ts), built by
 * `buildDeepLink` in src/relay/index.ts. The relay checks the envelope; it
 * never reads `inputs`, so the app checks them here. A link that fails any
 * rule is refused with a code and never answered: its callbackUrl was written
 * by whoever wrote the link.
 */
import {RELAY_CALLBACK_PATH, type EnvRow} from '../config/env';
import {isCircuitId, type CircuitId} from '../config/circuits';
import {AppError} from '../errors';
import {decodeBase64Url, utf8Decode} from './bytes';
import {isSiDo, type SiDo} from './regions';

export const APP_SCHEME = 'kproof';
export const REQUEST_ROUTE = 'proof-request';

/** Longest `data` parameter accepted, in characters, checked before decoding. */
export const MAX_DATA_LENGTH = 16_384;

/** Same caps as kproof-server's envelope (src/relay/envelope.ts LIMITS), in code points. */
export const LIMITS = {dappName: 100, message: 500, scope: 256, dappIcon: 2048} as const;

export const MIN_AGE = 1;
export const MAX_AGE = 150;

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// C0 controls, DEL, C1 controls and the Unicode line/paragraph separators.
// eslint-disable-next-line no-control-regex
const LINE_CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// A message may keep tab and newline.
// eslint-disable-next-line no-control-regex
const TEXT_CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;

export type RequestInputs =
  | {circuitId: 'mdl_kr_ownership'; scope: string}
  | {circuitId: 'mdl_kr_age'; scope: string; ageThreshold: number}
  | {circuitId: 'mdl_kr_region'; scope: string; targetRegion: SiDo};

export interface ProofRequest {
  requestId: string;
  circuitId: CircuitId;
  inputs: RequestInputs;
  callbackUrl: string;
  dappName?: string;
  message?: string;
  returnScheme?: string;
  createdAt: string;
}

/** Which input keys each circuit takes. Anything else in `inputs` is refused. */
const INPUT_KEYS: Readonly<Record<CircuitId, readonly string[]>> = {
  mdl_kr_ownership: ['scope'],
  mdl_kr_age: ['scope', 'ageThreshold'],
  mdl_kr_region: ['scope', 'targetRegion'],
};

function codePoints(s: string): number {
  return Array.from(s).length;
}

function fail(code: ConstructorParameters<typeof AppError>[0], detail: string): never {
  throw new AppError(code, detail);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkLineText(name: string, value: unknown, max: number): string {
  if (typeof value !== 'string') fail('E1005', `${name} must be a string`);
  if (value.trim().length === 0) fail('E1005', `${name} must not be empty or whitespace only`);
  if (codePoints(value) > max) fail('E1005', `${name} must be at most ${max} characters`);
  if (LINE_CONTROL_RE.test(value)) fail('E1005', `${name} must not contain control characters`);
  return value;
}

function optionalText(name: 'dappName' | 'message', value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (name === 'dappName') return checkLineText(name, value, LIMITS.dappName);
  if (typeof value !== 'string') fail('E1005', `${name} must be a string`);
  if (value.trim().length === 0) fail('E1005', `${name} must not be empty or whitespace only`);
  if (codePoints(value) > LIMITS.message) fail('E1005', `${name} must be at most ${LIMITS.message} characters`);
  if (TEXT_CONTROL_RE.test(value)) fail('E1005', `${name} must not contain control characters`);
  return value;
}

/**
 * The callback must be exactly `<allowed relay origin>/api/v1/proof/callback`.
 *
 * Parsed with one strict pattern rather than `URL`: React Native's `URL` is a
 * set of lenient regular expressions that never throws and disagrees with the
 * WHATWG parser jest runs under, so a check built on it would pass tests and
 * behave differently on the phone. The host may only hold lowercase letters,
 * digits, dots and hyphens, which rules out userinfo (`@`), backslashes and
 * percent-encoding; it is then compared for equality, so look-alikes
 * (`stg-api.koreanproof.com.evil.com`) do not match.
 */
const CALLBACK_RE = /^(https?:)\/\/([a-z0-9.-]+)(?::([0-9]{1,5}))?(\/[^?#\s]*)$/;

export function checkCallbackUrl(raw: unknown, env: EnvRow): string {
  if (typeof raw !== 'string' || raw.length === 0) fail('E1004', 'callbackUrl is missing');
  if (raw.length > 2048) fail('E1004', 'callbackUrl is longer than 2048 characters');
  const m = CALLBACK_RE.exec(raw);
  if (!m) {
    fail('E1004', 'callbackUrl must be http(s)://<host>[:port]/<path> with a lowercase host and no credentials, query or fragment');
  }
  const [, protocol, host, port = '', path] = m;
  const relay = env.relays.find((r) => r.protocol === protocol && r.host === host && r.port === port);
  if (!relay) {
    const allowed = env.relays.map((r) => `${r.protocol}//${r.host}${r.port ? `:${r.port}` : ''}`).join(', ');
    fail('E1004', `callback host '${protocol}//${host}${port ? `:${port}` : ''}' is not an allowed relay. Allowed: ${allowed}.`);
  }
  if (path !== RELAY_CALLBACK_PATH) {
    fail('E1004', `callbackUrl must be exactly ${RELAY_CALLBACK_PATH} on the relay`);
  }
  return raw;
}

/** Same rules as kproof-server src/relay/returnScheme.ts (a bare custom scheme). */
const DENIED_SCHEMES = new Set([
  'about', 'blob', 'content', 'data', 'facetime', 'facetime-audio', 'file', 'ftp', 'http', 'https',
  'intent', 'javascript', 'jar', 'mailto', 'sms', 'tel', 'vbscript',
]);

export function checkReturnScheme(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || /\s/.test(value)) {
    fail('E1005', 'returnScheme must be a bare custom scheme such as "mydapp://"');
  }
  const normalized = value.toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*:\/\/$/.test(normalized)) {
    fail('E1005', 'returnScheme must be a bare custom scheme such as "mydapp://"');
  }
  const name = normalized.slice(0, normalized.indexOf(':'));
  if (DENIED_SCHEMES.has(name)) fail('E1005', `returnScheme "${name}" is not allowed`);
  return normalized;
}

function checkInputs(circuitId: CircuitId, raw: unknown, topLevelScope: unknown): RequestInputs {
  if (!isPlainObject(raw)) fail('E1005', 'inputs must be a JSON object');
  const allowed = INPUT_KEYS[circuitId];
  const extra = Object.keys(raw).filter((k) => !allowed.includes(k));
  if (extra.length > 0) fail('E1005', `inputs has keys ${circuitId} does not take: ${extra.join(', ')}`);

  if (!Object.prototype.hasOwnProperty.call(raw, 'scope')) fail('E1005', 'inputs.scope is required');
  const scope = checkLineText('inputs.scope', raw.scope, LIMITS.scope);
  if (topLevelScope !== undefined && topLevelScope !== scope) {
    fail('E1005', 'the request scope and inputs.scope differ');
  }

  switch (circuitId) {
    case 'mdl_kr_ownership':
      return {circuitId, scope};
    case 'mdl_kr_age': {
      const age = raw.ageThreshold;
      if (typeof age !== 'number' || !Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
        fail('E1005', `inputs.ageThreshold must be an integer from ${MIN_AGE} to ${MAX_AGE}`);
      }
      return {circuitId, scope, ageThreshold: age};
    }
    case 'mdl_kr_region': {
      const region = raw.targetRegion;
      if (!isSiDo(region)) fail('E1005', 'inputs.targetRegion must be one of the 17 current si/do names');
      return {circuitId, scope, targetRegion: region};
    }
  }
}

/** Parse a `kproof://proof-request?data=...` URL. Throws AppError with the code to show. */
export function parseProofRequestUrl(url: string, env: EnvRow): ProofRequest {
  const prefix = `${APP_SCHEME}://${REQUEST_ROUTE}?`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) {
    fail('E1001', `not a ${prefix} link`);
  }
  const query = url.slice(prefix.length);
  const params = query.split('&');
  const dataParams = params.filter((p) => p.startsWith('data='));
  if (dataParams.length !== 1) fail('E1001', 'the link must carry exactly one data parameter');
  const data = dataParams[0].slice('data='.length);
  if (data.length === 0) fail('E1001', 'data is empty');
  if (data.length > MAX_DATA_LENGTH) fail('E1006', `data is ${data.length} characters; the limit is ${MAX_DATA_LENGTH}`);

  const bytes = decodeBase64Url(data);
  if (!bytes) fail('E1001', 'data is not base64url');
  const text = utf8Decode(bytes);
  if (text === null) fail('E1001', 'data is not UTF-8');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    fail('E1001', 'data is not JSON');
  }
  return validateProofRequest(json, env);
}

export function validateProofRequest(json: unknown, env: EnvRow): ProofRequest {
  if (!isPlainObject(json)) fail('E1001', 'data must be a JSON object');

  if (typeof json.requestId !== 'string' || !REQUEST_ID_RE.test(json.requestId)) {
    fail('E1001', 'requestId must be a v4 UUID');
  }
  if (!isCircuitId(json.circuitId)) {
    fail('E1002', `Unknown circuit '${String(json.circuitId)}'. Known: mdl_kr_ownership, mdl_kr_age, mdl_kr_region.`);
  }
  const callbackUrl = checkCallbackUrl(json.callbackUrl, env);
  if (json.scope !== undefined) checkLineText('scope', json.scope, LIMITS.scope);
  const inputs = checkInputs(json.circuitId, json.inputs, json.scope);
  const dappName = optionalText('dappName', json.dappName);
  const message = optionalText('message', json.message);
  const returnScheme = checkReturnScheme(json.returnScheme);
  if (typeof json.createdAt !== 'string' || Number.isNaN(Date.parse(json.createdAt))) {
    fail('E1001', 'createdAt must be an ISO 8601 time');
  }

  return {
    requestId: json.requestId,
    circuitId: json.circuitId,
    inputs,
    callbackUrl,
    ...(dappName !== undefined && {dappName}),
    ...(message !== undefined && {message}),
    ...(returnScheme !== undefined && {returnScheme}),
    createdAt: json.createdAt,
  };
}
