/**
 * Approving a request: re-authenticate, prove on the phone, answer the relay.
 * Declining: answer `cancelled`. Every path that tells the relay "generating"
 * ends with exactly one terminal answer.
 */
import {AppError, toAppError, type ErrorCode} from '../errors';
import type {CardTypeKey} from '../config/cardTypes';
import type {CircuitsSource} from '../config/circuits';
import type {ProofRequest} from '../domain/request';
import {buildCircuitInputs, type CardSecrets} from '../domain/mdlInputs';
import {canProve} from '../domain/predicates';
import {ensureCircuitFiles, type FsPort} from './circuitFiles';
import {bufferToHex, type ProverPort} from './prover';
import {answerRequest, outcomeErrorCode, sendGenerating, type AnswerOutcome, type RelayDeps} from './relayAnswer';
import {addHistory, type HistoryResult} from './history';
import type {KeyValueStore} from './answeredStore';
import type {Vault} from './vault';

export type ProvingStep = 'files' | 'inputs' | 'prove' | 'verify' | 'send';

export interface AnswerFlowDeps {
  relay: RelayDeps;
  /** Reads the vault through the OS prompt (proof re-authentication). */
  openVault(): Promise<Vault>;
  fs: FsPort;
  prover: ProverPort;
  circuits: CircuitsSource;
  history: KeyValueStore;
  now(): Date;
  /** Lets the screen draw before the synchronous prover blocks the JS thread. */
  yieldFrame(): Promise<void>;
  log(message: string): void;
}

export type FlowResult =
  | {ok: true; provingMs: number; verifyMs: number}
  /** Failed before anything was sent; the request is still open and can be declined. */
  | {ok: false; answered: false; code: ErrorCode; detail: string}
  /** The relay was told (or telling it failed); `code` is what the person sees. */
  | {ok: false; answered: true; code: ErrorCode; detail: string; outcome: AnswerOutcome};

function historyResult(outcome: AnswerOutcome, success: boolean): HistoryResult {
  if (outcome.kind === 'expired') return 'expired';
  if (outcome.kind === 'delivered') return success ? 'sent' : 'failed';
  return 'failed';
}

function secretsOf(fields: Record<string, string>): CardSecrets {
  return {
    ci: fields.ci,
    name: fields.name,
    birth: fields.birth,
    ...(fields.telno !== undefined && {telno: fields.telno}),
    ...(fields.sex !== undefined && {sex: fields.sex}),
    ...(fields.address !== undefined && {address: fields.address}),
  };
}

async function record(
  deps: AnswerFlowDeps,
  request: ProofRequest,
  card: CardTypeKey,
  result: HistoryResult,
  extra: {errorCode?: string; provingMs?: number},
): Promise<void> {
  try {
    await addHistory(deps.history, {
      requestId: request.requestId,
      inputs: request.inputs,
      ...(request.dappName !== undefined && {dappName: request.dappName}),
      card,
      result,
      ...extra,
      at: deps.now().toISOString(),
    });
  } catch (err) {
    deps.log(`[history] write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function approveAndProve(
  deps: AnswerFlowDeps,
  request: ProofRequest,
  cardType: CardTypeKey,
  onStep: (step: ProvingStep) => void,
): Promise<FlowResult> {
  // 1. Re-authenticate: the card is read through the OS prompt, every time.
  let vault: Vault;
  try {
    vault = await deps.openVault();
  } catch (err) {
    const e = toAppError(err, 'E4001');
    return {ok: false, answered: false, code: e.code, detail: e.detail};
  }
  const stored = vault.cards.find((c) => c.type === cardType);
  if (!stored) {
    return {ok: false, answered: false, code: 'E2001', detail: `no ${cardType} card on this phone`};
  }
  const secrets = secretsOf(stored.fields);
  const year = deps.now().getFullYear();
  const feasible = canProve(secrets, request.inputs, year);
  if (!feasible.ok) {
    return {ok: false, answered: false, code: 'E2002', detail: feasible.reason};
  }

  // 2. From here on the relay hears about it, and gets one terminal answer.
  await sendGenerating(deps.relay, request);

  const fail = async (err: AppError): Promise<FlowResult> => {
    const outcome = await answerRequest(deps.relay, request, {status: 'error', errorCode: err.code, error: err.detail});
    await record(deps, request, cardType, outcome.kind === 'expired' ? 'expired' : 'failed', {errorCode: err.code});
    return {ok: false, answered: true, code: err.code, detail: err.detail, outcome};
  };

  let proofHex: string;
  let publicInputs: string[];
  let provingMs: number;
  let verifyMs: number;
  try {
    onStep('files');
    const paths = await ensureCircuitFiles(deps.fs, deps.circuits, request.circuitId, deps.log);

    onStep('inputs');
    let flat: string[];
    try {
      flat = buildCircuitInputs(secrets, request.inputs, year);
    } catch (err) {
      throw new AppError('E2004', `inputs: ${err instanceof Error ? err.message : String(err)}`);
    }
    const vk = await deps.prover.readFile(paths.vk);

    onStep('prove');
    await deps.yieldFrame();
    const started = Date.now();
    let full: ArrayBuffer;
    try {
      full = deps.prover.generate(paths.json, paths.srs, flat, vk);
    } catch (err) {
      throw new AppError('E2004', `prover: ${err instanceof Error ? err.message : String(err)}`);
    }
    provingMs = Date.now() - started;

    // Off-chain check on the phone before anything is sent: a proof the
    // phone's own verifier rejects is never handed to the relay.
    onStep('verify');
    await deps.yieldFrame();
    const verifyStarted = Date.now();
    let valid: boolean;
    try {
      valid = deps.prover.verify(paths.json, full, vk);
    } catch (err) {
      throw new AppError('E2004', `off-chain verify: ${err instanceof Error ? err.message : String(err)}`);
    }
    verifyMs = Date.now() - verifyStarted;
    if (!valid) throw new AppError('E2004', 'off-chain verify: the proof did not verify on this phone');
    const n = deps.prover.numPublicInputs(paths.json);
    const split = deps.prover.split(full, n);
    proofHex = bufferToHex(split.proof);
    publicInputs = split.publicInputs.map(bufferToHex);
    deps.log(`[prove] ${request.circuitId}: ${split.proof.byteLength} bytes, ${n} public inputs, ${provingMs} ms; verified on the phone in ${verifyMs} ms`);
  } catch (err) {
    return fail(toAppError(err, 'E2004'));
  }

  onStep('send');
  const outcome = await answerRequest(deps.relay, request, {status: 'completed', proof: proofHex, publicInputs});
  await record(deps, request, cardType, historyResult(outcome, true), {provingMs});
  const code = outcomeErrorCode(outcome);
  if (code !== null) {
    return {ok: false, answered: true, code, detail: `the relay did not take the proof (${outcome.kind})`, outcome};
  }
  return {ok: true, provingMs, verifyMs};
}

/** The person declined, or the request cannot be answered from this phone. */
export async function decline(
  deps: Pick<AnswerFlowDeps, 'relay' | 'history' | 'now' | 'log'>,
  request: ProofRequest,
  reason: string,
  card: CardTypeKey | undefined,
): Promise<AnswerOutcome> {
  const outcome = await answerRequest(deps.relay, request, {status: 'cancelled', reason});
  if (outcome.kind !== 'duplicate') {
    try {
      await addHistory(deps.history, {
        requestId: request.requestId,
        inputs: request.inputs,
        ...(request.dappName !== undefined && {dappName: request.dappName}),
        ...(card !== undefined && {card}),
        result: outcome.kind === 'expired' ? 'expired' : 'declined',
        at: deps.now().toISOString(),
      });
    } catch (err) {
      deps.log(`[history] write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return outcome;
}
