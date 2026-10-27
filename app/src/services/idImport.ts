/**
 * Mobile ID relay client, App2App path (opens the government app directly).
 * Ported from proofport-app's direct path:
 *
 *   1. POST /oacx/api/v1.0/trans                -> token, txId
 *   2. POST /oacx/api/v1.0/authen/app/request   -> iosLink / androidLink, token, cxId
 *   3. open the government mobile ID app with that link
 *   4. POST /oacx/api/v1.0/authen/app/result    (poll) -> result token once verified
 *   5. POST /oacx/api/v1.0/trans/token          -> the parsed ID data
 *
 * Differences from the original:
 *   - the base URL is required (ENV row), never defaulted;
 *   - every failure names its stage and becomes an AppError (E6001..E6004);
 *   - the poll can be cancelled (AbortSignal) and has an injected clock, so
 *     cancel and timeout are testable;
 *   - Android uses `androidLink` (모바일 신분증) only. proofport-app preferred
 *     `ssPayLink` (Samsung Wallet), which is a different app than the one the
 *     person picked a card in.
 *
 * Unknown (not in any document we hold): the exact `oacxCode` the relay returns when
 * the person declines inside the government app. Until it is known, polling
 * continues through non-success answers until the person cancels or the
 * timeout ends it.
 */
import {AppError} from '../errors';
import type {RequestProvider} from '../config/cardTypes';

export interface IdImportDeps {
  baseUrl: string;
  fetch: typeof fetch;
  platform: 'ios' | 'android';
  canOpenURL(url: string): Promise<boolean>;
  openURL(url: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(message: string): void;
}

export interface IdImportOptions {
  provider: RequestProvider;
  signal: AbortSignal;
  timeoutMs: number;
  pollIntervalMs: number;
}

export type IdImportStage = 'trans' | 'app/request' | 'launch' | 'app/result' | 'trans/token';

interface Envelope {
  oacxCode?: unknown;
  clientMessage?: unknown;
}

function stageError(stage: IdImportStage, detail: string): AppError {
  return new AppError('E6001', `mobile ID ${stage} failed: ${detail}`);
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new AppError('E6003', 'import cancelled by the person');
}

async function post(deps: IdImportDeps, stage: IdImportStage, path: string, body: object, signal: AbortSignal): Promise<Record<string, unknown>> {
  checkCancelled(signal);
  let res: Response;
  try {
    res = await deps.fetch(`${deps.baseUrl}${path}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    checkCancelled(signal);
    throw stageError(stage, `network error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw stageError(stage, `HTTP ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw stageError(stage, 'the answer is not JSON');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw stageError(stage, 'the answer is not a JSON object');
  }
  return json as Record<string, unknown>;
}

function requireSuccess(stage: IdImportStage, env: Envelope, provider?: string): void {
  if (env.oacxCode === 'OACX_SUCCESS') return;
  const message = typeof env.clientMessage === 'string' ? env.clientMessage : 'no message';
  if (stage === 'app/request') {
    // the relay refused this card type (e.g. OACX_NO_PARAM_PROVIDER, OACX_SERVER_ERROR).
    // Not a network failure: the person is told which card and the relay's reason.
    throw new AppError('E6008', `mobile ID request refused (${String(provider)}): code=${String(env.oacxCode)} (${message})`);
  }
  throw stageError(stage, `code=${String(env.oacxCode)} (${message})`);
}

function requireString(stage: IdImportStage, obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) throw stageError(stage, `the answer has no ${key}`);
  return v;
}

/** Runs stages 1-5 and returns the parsed `data` object from `trans/token`. */
export async function runIdImport(deps: IdImportDeps, opts: IdImportOptions): Promise<Record<string, unknown>> {
  const {provider, signal} = opts;

  deps.log(`mobile ID 1/5 trans (provider ${provider})`);
  const trans = await post(deps, 'trans', '/oacx/api/v1.0/trans', {}, signal);
  requireSuccess('trans', trans);
  const txId = requireString('trans', trans, 'txId');
  const transToken = requireString('trans', trans, 'token');

  deps.log('mobile ID 2/5 authen/app/request');
  const appReq = await post(
    deps,
    'app/request',
    '/oacx/api/v1.0/authen/app/request',
    {provider, token: transToken, txId, contentInfo: {signType: 'ENT_MID'}, ci: true, telno: true},
    signal,
  );
  requireSuccess('app/request', appReq, provider);
  const appToken = requireString('app/request', appReq, 'token');
  const cxId = requireString('app/request', appReq, 'cxId');
  const data = appReq.data;
  const links = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const linkField = deps.platform === 'ios' ? 'iosLink' : 'androidLink';
  const link = links[linkField];
  if (typeof link !== 'string' || link.length === 0) {
    throw new AppError('E6004', `no ${linkField} for ${deps.platform}`);
  }

  // Only the scheme is logged: the rest of the link carries a transaction token.
  const scheme = link.split(':')[0];
  deps.log(`mobile ID 3/5 opening the mobile ID app (${linkField}, scheme "${scheme}:")`);
  checkCancelled(signal);
  if (!(await deps.canOpenURL(link))) {
    throw new AppError('E6004', `nothing on this phone opens "${scheme}:" links (is 모바일 신분증 installed and the scheme declared?)`);
  }
  try {
    await deps.openURL(link);
  } catch (err) {
    throw new AppError('E6004', `opening "${scheme}:" failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  deps.log('mobile ID 4/5 polling authen/app/result');
  const started = deps.now();
  let resultToken: string | null = null;
  let polls = 0;
  while (deps.now() - started < opts.timeoutMs) {
    checkCancelled(signal);
    polls++;
    try {
      const res = await post(
        deps,
        'app/result',
        '/oacx/api/v1.0/authen/app/result',
        {provider, token: appToken, txId, cxId},
        signal,
      );
      const verified = typeof res.data === 'object' && res.data !== null && (res.data as Record<string, unknown>).verified === true;
      if (res.oacxCode === 'OACX_SUCCESS' && verified) {
        resultToken = requireString('app/result', res, 'token');
        break;
      }
      deps.log(`mobile ID poll ${polls}: oacxCode=${String(res.oacxCode)}`);
    } catch (err) {
      if (err instanceof AppError && err.code === 'E6003') throw err;
      // the relay answers errors while the person is still in the government app.
      deps.log(`mobile ID poll ${polls}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await deps.sleep(opts.pollIntervalMs);
  }
  checkCancelled(signal);
  if (resultToken === null) {
    throw new AppError('E6002', `no verified result after ${opts.timeoutMs} ms (${polls} polls)`);
  }

  deps.log('mobile ID 5/5 trans/token');
  const parsed = await post(deps, 'trans/token', '/oacx/api/v1.0/trans/token', {token: resultToken}, signal);
  requireSuccess('trans/token', parsed);
  const parsedData = parsed.data;
  if (typeof parsedData !== 'object' || parsedData === null || Array.isArray(parsedData)) {
    throw stageError('trans/token', 'the answer has no data object');
  }
  return parsedData as Record<string, unknown>;
}
