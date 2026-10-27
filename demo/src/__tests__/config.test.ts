import { describe, expect, it } from 'vitest';
import { loadConfig, parseApiUrl, parseEnv } from '../config';

describe('parseApiUrl', () => {
  it.each([undefined, null, '', '   ', 42])('refuses a missing value (%s)', (raw) => {
    expect(() => parseApiUrl(raw)).toThrow(/VITE_KPROOF_API_URL is required/);
  });

  it('refuses text that is not a URL', () => {
    expect(() => parseApiUrl('stg-api.koreanproof.com')).toThrow(/not a URL/);
  });

  it.each(['http://stg-api.koreanproof.com', 'ftp://stg-api.koreanproof.com', 'javascript:alert(1)'])('refuses non-https %s', (raw) => {
    expect(() => parseApiUrl(raw)).toThrow(/must be https/);
  });

  it.each(['http://localhost:8080', 'http://127.0.0.1:8080'])('allows plain http for local %s', (raw) => {
    expect(parseApiUrl(raw)).toBe(raw);
  });

  it.each([
    'https://stg-api.koreanproof.com/api',
    'https://stg-api.koreanproof.com?x=1',
    'https://stg-api.koreanproof.com#x',
    'https://user:pw@stg-api.koreanproof.com',
  ])('refuses anything but an origin: %s', (raw) => {
    expect(() => parseApiUrl(raw)).toThrow(/origin only/);
  });

  it('normalizes a trailing slash to the bare origin', () => {
    expect(parseApiUrl('https://stg-api.koreanproof.com/')).toBe('https://stg-api.koreanproof.com');
  });
});

describe('parseEnv', () => {
  it.each(['local', 'staging', 'production'])('accepts %s', (raw) => {
    expect(parseEnv(raw)).toBe(raw);
  });

  it.each([undefined, '', 'Staging', 'prod', 'toString', '__proto__', 'constructor'])('refuses %s by name', (raw) => {
    expect(() => parseEnv(raw)).toThrow(/VITE_KPROOF_ENV must be one of local, staging, production/);
  });
});

describe('loadConfig', () => {
  it('needs both values', () => {
    expect(() => loadConfig({ VITE_KPROOF_ENV: 'staging' })).toThrow(/VITE_KPROOF_API_URL/);
    expect(() => loadConfig({ VITE_KPROOF_API_URL: 'https://stg-api.koreanproof.com' })).toThrow(/VITE_KPROOF_ENV/);
    expect(loadConfig({ VITE_KPROOF_API_URL: 'https://stg-api.koreanproof.com', VITE_KPROOF_ENV: 'staging' }))
      .toEqual({ apiUrl: 'https://stg-api.koreanproof.com', env: 'staging' });
  });
});
