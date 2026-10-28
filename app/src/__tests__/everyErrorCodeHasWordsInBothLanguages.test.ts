/**
 * Every error code has a title and a body in both languages.
 *
 * Mirrors the ZKProofport app's test. The error sheet looks the code up in the
 * current language; a code with no words there would show i18next's English
 * fallback, or the bare key, at exactly the moment something went wrong.
 */
import en from '../i18n/locales/en.json';
import ko from '../i18n/locales/ko.json';
import {ERROR_CODES} from '../errors';

const LANGUAGES = {en: en.errors, ko: ko.errors} as Record<string, Record<string, {title?: string; body?: string}>>;

describe('the words a person reads when something fails', () => {
  it('read the registry (an empty list would pass everything below)', () => {
    expect(ERROR_CODES.length).toBeGreaterThan(20);
    expect(ERROR_CODES).toContain('E1001');
    expect(ERROR_CODES).toContain('E1008');
    expect(ERROR_CODES).toContain('E6008');
  });

  it.each(Object.keys(LANGUAGES))('%s has a title and a body for every code', (language) => {
    const errors = LANGUAGES[language];
    const incomplete = ERROR_CODES.filter((code) => !errors[code]?.title?.trim() || !errors[code]?.body?.trim());
    expect(incomplete).toEqual([]);
  });

  it('has no leftover words for a code the registry dropped', () => {
    const stale = Object.entries(LANGUAGES).flatMap(([language, errors]) =>
      Object.keys(errors)
        .filter((code) => !(ERROR_CODES as readonly string[]).includes(code))
        .map((code) => `${language}: ${code}`),
    );
    expect(stale).toEqual([]);
  });

  it('says something different in Korean than in English', () => {
    const untranslated = ERROR_CODES.filter((code) => en.errors[code].title === ko.errors[code].title || en.errors[code].body === ko.errors[code].body);
    expect(untranslated).toEqual([]);
  });
});
