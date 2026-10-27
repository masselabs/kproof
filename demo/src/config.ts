/**
 * Where the demo sends proof requests: the kproof-server relay of ONE
 * environment, fixed when the page is built (VITE_KPROOF_API_URL).
 *
 * There is no default. A demo built without it would talk to whichever server
 * a default named, and a staging page answering from production (or the other
 * way round) looks like it works.
 */
export interface DemoConfig {
  /** Origin of the relay, e.g. https://stg-api.koreanproof.com. No path, no trailing slash. */
  apiUrl: string;
  /** Which deployment this page is (VITE_KPROOF_ENV); shown as a badge. */
  env: DemoEnv;
}

/** The label each deployment shows. An unknown name is refused. */
export const ENVIRONMENTS = {
  local: { badge: '로컬' },
  staging: { badge: '스테이징' },
  production: { badge: '' },
} as const;
export type DemoEnv = keyof typeof ENVIRONMENTS;

export function parseEnv(raw: unknown): DemoEnv {
  if (typeof raw !== 'string' || !Object.prototype.hasOwnProperty.call(ENVIRONMENTS, raw)) {
    throw new Error(`VITE_KPROOF_ENV must be one of ${Object.keys(ENVIRONMENTS).join(', ')}, got '${String(raw)}'`);
  }
  return raw as DemoEnv;
}

export function parseApiUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('VITE_KPROOF_API_URL is required: the kproof-server origin this demo talks to, e.g. https://stg-api.koreanproof.com');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`VITE_KPROOF_API_URL is not a URL: '${raw}'`);
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error(`VITE_KPROOF_API_URL must be https (http only for localhost), got '${raw}'`);
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || url.username || url.password) {
    throw new Error(`VITE_KPROOF_API_URL must be an origin only (no path, query, fragment or credentials), got '${raw}'`);
  }
  return url.origin;
}

export function loadConfig(env: Record<string, unknown> = import.meta.env): DemoConfig {
  return { apiUrl: parseApiUrl(env.VITE_KPROOF_API_URL), env: parseEnv(env.VITE_KPROOF_ENV) };
}
