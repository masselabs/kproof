import type ko from './locales/ko.json';

// Keys passed to t() are checked against ko.json at compile time.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {translation: typeof ko};
  }
}
