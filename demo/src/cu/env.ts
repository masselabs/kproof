/**
 * Where the CU checkout sends its request and which network it verifies
 * against: the same relay and environment as the rest of the demo
 * (VITE_KPROOF_API_URL / VITE_KPROOF_ENV, see ../config.ts), passed in by the
 * page rather than chosen here.
 */
import { lookupNetwork, type CircuitId, type Environment } from '@kproof/sdk';

export interface CuEnv {
  /** Relay origin, e.g. https://stg-api.koreanproof.com. */
  apiUrl: string;
  /** SDK environment whose verifier contracts the answers are checked against. */
  environment: Environment;
}

/** The checkout asks one question: age 19 or over. */
export const CU_CIRCUIT: CircuitId = 'mdl_kr_age';
export const CU_AGE_THRESHOLD = 19;

/** Block explorers by chain id, for the verifier contract link. A chain without a row is an error. */
export const EXPLORERS: Readonly<Record<number, string>> = {
  84532: 'https://sepolia.basescan.org',
};

export function verifierLink(environment: Environment): string {
  const network = lookupNetwork(environment);
  if (!Object.prototype.hasOwnProperty.call(EXPLORERS, network.chainId)) {
    throw new Error(`No block explorer for chain ${network.chainId}. Known: ${Object.keys(EXPLORERS).join(', ')}.`);
  }
  return `${EXPLORERS[network.chainId]}/address/${network.verifiers[CU_CIRCUIT]}#code`;
}
