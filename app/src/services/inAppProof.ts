/**
 * Proving from inside the app, the way the demo site does it from a browser:
 *
 *   1. the SDK creates a real request on this build's relay;
 *   2. its deep link goes through the same handler a link from a service does,
 *      so the request screen, the OS prompt, the on-device prover and the relay
 *      answer are all the ordinary path;
 *   3. afterwards the SDK reads the answer back from the relay and verifies
 *      it, including the eth_call to the circuit's verifier on chain.
 *
 * Nothing here is a shortcut around the relay or the verifier.
 */
import {NETWORKS, RelayClient, buildInputs, lookupNetwork, verifyAnswer, type Environment, type VerifyOutcome} from '@kproof/sdk';
import type {CircuitId} from '../config/circuits';
import type {SiDo} from '../domain/regions';

/** The scope every in-app proof uses; the nullifier is the same for each of a person's in-app proofs. */
export const IN_APP_SCOPE = 'kproof-app:in-app-proof';
export const IN_APP_DAPP_NAME = 'KProof 앱';

export type InAppAsk =
  | {circuitId: 'mdl_kr_ownership'}
  | {circuitId: 'mdl_kr_age'; ageThreshold: number}
  | {circuitId: 'mdl_kr_region'; targetRegion: SiDo};

export interface InAppRequest {
  requestId: string;
  deepLink: string;
  circuitId: CircuitId;
  inputs: Record<string, unknown>;
}

export interface InAppDeps {
  /** The build's environment name; the SDK throws for one it has no network row for. */
  environment: string;
  fetchImpl: typeof fetch;
}

function relayFor(deps: InAppDeps): RelayClient {
  const network = lookupNetwork(sdkEnvironment(deps.environment));
  return new RelayClient({apiUrl: network.relayUrl, fetchImpl: deps.fetchImpl});
}

export async function createInAppRequest(deps: InAppDeps, ask: InAppAsk): Promise<InAppRequest> {
  const inputs = buildInputs(ask.circuitId, {
    scope: IN_APP_SCOPE,
    ...(ask.circuitId === 'mdl_kr_age' && {ageThreshold: ask.ageThreshold}),
    ...(ask.circuitId === 'mdl_kr_region' && {targetRegion: ask.targetRegion}),
  });
  const created = await relayFor(deps).createRequest(ask.circuitId, inputs, IN_APP_DAPP_NAME);
  return {requestId: created.requestId, deepLink: created.deepLink, circuitId: ask.circuitId, inputs};
}

/** Reads the answer the phone sent from the relay and verifies it with the SDK. */
export async function verifyInAppAnswer(deps: InAppDeps, request: InAppRequest, now: Date): Promise<VerifyOutcome> {
  const status = await relayFor(deps).getStatus(request.requestId);
  return verifyAnswer(
    {circuitId: request.circuitId, inputs: request.inputs},
    {
      status: status.status,
      ...(status.circuit !== undefined && {circuit: status.circuit}),
      ...(status.proof !== undefined && {proof: status.proof}),
      ...(status.publicInputs !== undefined && {publicInputs: status.publicInputs}),
    },
    {environment: sdkEnvironment(deps.environment), now, fetchImpl: deps.fetchImpl},
  );
}

function sdkEnvironment(name: string): Environment {
  if (!Object.prototype.hasOwnProperty.call(NETWORKS, name)) {
    throw new Error(`The SDK has no network for environment '${name}'. Known: ${Object.keys(NETWORKS).join(', ')}.`);
  }
  return name as Environment;
}
