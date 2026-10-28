/** The languages the app is translated into, as the Settings picker lists them. */
export const LANGUAGE_OPTIONS = [
  {value: 'en', label: 'English'},
  {value: 'ko', label: '한국어'},
] as const;
export type AppLanguage = (typeof LANGUAGE_OPTIONS)[number]['value'];

/** The option for a language code ('ko', 'ko-KR'); an unknown code is an error, never a default. */
export function languageOption(language: string) {
  const code = language.split('-')[0];
  const option = LANGUAGE_OPTIONS.find((item) => item.value === code);
  if (!option) {
    throw new Error(`Unknown language '${language}'. Known: ${LANGUAGE_OPTIONS.map((o) => o.value).join(', ')}.`);
  }
  return option;
}
