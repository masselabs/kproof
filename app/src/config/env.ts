/**
 * One row per environment. Everything that differs by environment and decides
 * WHERE the app talks to lives here, and nowhere else.
 *
 * An unknown environment name throws. There is no default row.
 */
import {CIRCUITS_SOURCE, type CircuitsSource} from './circuits';

export interface RelayEndpoint {
  /** `https:` everywhere except a developer's local relay. */
  protocol: 'https:' | 'http:';
  /** Exact host name. Compared for equality, never by suffix. */
  host: string;
  /** Explicit port, or '' for the protocol's default. */
  port: string;
}

export interface EnvRow {
  /**
   * The relays whose callback this build answers. A request naming any other
   * callback is refused by host name; the callback path is fixed
   * (RELAY_CALLBACK_PATH).
   */
  relays: readonly RelayEndpoint[];
  /** The repository and commit the circuit files are read from (config/circuits.ts). */
  circuits: CircuitsSource;
  /** Mobile ID relay server the import talks to. */
  idImportBaseUrl: string;
}

export const RELAY_CALLBACK_PATH = '/api/v1/proof/callback';

export const ENV = {
  development: {
    // A kproof-server started locally (kproof-server/scripts/dev.sh), reached
    // from the iOS simulator through the host's loopback. Plain http only here.
    relays: [
      {protocol: 'http:', host: 'localhost', port: '8080'},
      {protocol: 'https:', host: 'stg-api.koreanproof.com', port: ''},
    ],
    circuits: CIRCUITS_SOURCE,
    idImportBaseUrl: 'https://cx.raonsecure.co.kr:18543',
  },
  staging: {
    relays: [{protocol: 'https:', host: 'stg-api.koreanproof.com', port: ''}],
    circuits: CIRCUITS_SOURCE,
    idImportBaseUrl: 'https://cx.raonsecure.co.kr:18543',
  },
} as const satisfies Record<string, EnvRow>;

export type EnvName = keyof typeof ENV;

export function isEnvName(name: unknown): name is EnvName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(ENV, name);
}

export function getEnv(name: unknown): EnvRow {
  if (!isEnvName(name)) {
    throw new Error(`Unknown environment '${String(name)}'. Known: ${Object.keys(ENV).join(', ')}.`);
  }
  return ENV[name];
}
