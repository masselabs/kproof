/**
 * RAON OmniOne CX (OACX) client, App2App path, WITHOUT the CX UI widget.
 * Ported from proofport-app src/utils/oacxClient.ts ("CX UI off" path):
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
 * Unknown (not in any document we hold): the exact `oacxCode` RAON returns when
 * the person declines inside the government app. Until it is known, polling
 * continues through non-success answers until the person cancels or the
 * timeout ends it.
 */
import {AppError} from '../errors';
import type {Provider} from '../config/cardTypes';

export interface RaonDeps {
  baseUrl: string;
  fetch: typeof fetch;
  platform: 'ios' | 'android';
  canOpenURL(url: string): Promise<boolean>;
  openURL(url: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(message: string): void;
}

export interface RaonFlowOptions {
  provider: Provider;
  signal: AbortSignal;
  timeoutMs: number;
  pollIntervalMs: number;
}

export type RaonStage = 'trans' | 'app/request' | 'launch' | 'app/result' | 'trans/token';

interface Envelope {
  oacxCode?: unknown;
  clientMessage?: unknown;
}

function stageError(stage: RaonStage, detail: string): AppError {
  return new AppError('E6001', `RAON ${stage} failed: ${detail}`);
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new AppError('E6003', 'import cancelled by the person');
}

async function post(deps: RaonDeps, stage: RaonStage, path: string, body: object, signal: AbortSignal): Promise<Record<string, unknown>> {
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

function requireSuccess(stage: RaonStage, env: Envelope): void {
  if (env.oacxCode === 'OACX_NO_PARAM_PROVIDER') {
    // RAON has no provider configured for this card type (measured 2026-10-27
    // for comrc_v1.5 and coresidence_v1.5). Not a network failure: say so.
    throw new AppError('E6008', `RAON ${stage}: provider not configured (oacxCode=OACX_NO_PARAM_PROVIDER)`);
  }
  if (env.oacxCode !== 'OACX_SUCCESS') {
    const message = typeof env.clientMessage === 'string' ? env.clientMessage : 'no message';
    throw stageError(stage, `oacxCode=${String(env.oacxCode)} (${message})`);
  }
}

function requireString(stage: RaonStage, obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) throw stageError(stage, `the answer has no ${key}`);
  return v;
}

/** Runs stages 1-5 and returns the parsed `data` object from `trans/token`. */
export async function runRaonImport(deps: RaonDeps, opts: RaonFlowOptions): Promise<Record<string, unknown>> {
  const {provider, signal} = opts;

  deps.log(`RAON 1/5 trans (provider ${provider})`);
  const trans = await post(deps, 'trans', '/oacx/api/v1.0/trans', {}, signal);
  requireSuccess('trans', trans);
  const txId = requireString('trans', trans, 'txId');
  const transToken = requireString('trans', trans, 'token');

  deps.log('RAON 2/5 authen/app/request');
  const appReq = await post(
    deps,
    'app/request',
    '/oacx/api/v1.0/authen/app/request',
    {provider, token: transToken, txId, contentInfo: {signType: 'ENT_MID'}, ci: true, telno: true},
    signal,
  );
  requireSuccess('app/request', appReq);
  const appToken = requireString('app/request', appReq, 'token');
  const cxId = requireString('app/request', appReq, 'cxId');
  const data = appReq.data;
  const links = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const linkField = deps.platform === 'ios' ? 'iosLink' : 'androidLink';
  const link = links[linkField];
  if (typeof link !== 'string' || link.length === 0) {
    throw new AppError('E6004', `RAON returned no ${linkField} for ${deps.platform}`);
  }

  // Only the scheme is logged: the rest of the link carries a transaction token.
  const scheme = link.split(':')[0];
  deps.log(`RAON 3/5 opening the mobile ID app (${linkField}, scheme "${scheme}:")`);
  checkCancelled(signal);
  if (!(await deps.canOpenURL(link))) {
    throw new AppError('E6004', `nothing on this phone opens "${scheme}:" links (is 모바일 신분증 installed and the scheme declared?)`);
  }
  try {
    await deps.openURL(link);
  } catch (err) {
    throw new AppError('E6004', `opening "${scheme}:" failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  deps.log('RAON 4/5 polling authen/app/result');
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
      deps.log(`RAON poll ${polls}: oacxCode=${String(res.oacxCode)}`);
    } catch (err) {
      if (err instanceof AppError && err.code === 'E6003') throw err;
      // RAON answers errors while the person is still in the government app.
      deps.log(`RAON poll ${polls}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await deps.sleep(opts.pollIntervalMs);
  }
  checkCancelled(signal);
  if (resultToken === null) {
    throw new AppError('E6002', `no verified result after ${opts.timeoutMs} ms (${polls} polls)`);
  }

  deps.log('RAON 5/5 trans/token');
  const parsed = await post(deps, 'trans/token', '/oacx/api/v1.0/trans/token', {token: resultToken}, signal);
  requireSuccess('trans/token', parsed);
  const parsedData = parsed.data;
  if (typeof parsedData !== 'object' || parsedData === null || Array.isArray(parsedData)) {
    throw stageError('trans/token', 'the answer has no data object');
  }
  return parsedData as Record<string, unknown>;
}
