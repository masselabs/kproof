/**
 * Translations, set up the way the ZKProofport app does it: i18next with one
 * JSON file per language, the phone's language first (Korean phone -> Korean,
 * anything else -> English), and a choice made in Settings stored under
 * LANGUAGE_KEY and applied over the phone's language at every start.
 */
import {useEffect, useReducer} from 'react';
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import ko from './locales/ko.json';
import {getDeviceLanguage} from './deviceLanguage';
import {josa, isParticle} from './josa';
import {languageOption, type AppLanguage} from './languages';

export const LANGUAGE_KEY = 'kproof.language';

export const resources = {
  en: {translation: en},
  ko: {translation: ko},
} as const;

// Initialized synchronously with the phone's language, so the first frame is
// already translated; a stored choice is applied as soon as it is read.
i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: {escapeValue: false},
  // Without a Suspense boundary, suspense mode can miss languageChanged;
  // ZKProofport turned it off for the in-app language switch for this reason.
  react: {useSuspense: false},
});

/**
 * `{{card, josa(p: 로)}}` in ko.json: the Korean particle that fits a word only
 * known at run time (a card name, a region, a biometry label, a service name).
 * English text never uses it.
 */
i18n.services.formatter?.add('josa', (value, _lng, options) => {
  const particle = options?.p;
  if (!isParticle(particle)) throw new Error(`josa: unknown particle '${String(particle)}'`);
  return josa(String(value), particle);
});

/** The stored choice, or null when the person never chose. An unknown stored code throws. */
export async function readStoredLanguage(): Promise<AppLanguage | null> {
  const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
  if (stored === null) return null;
  return languageOption(stored).value;
}

// A stored choice wins over the phone. A value this build does not know (one
// written by a later build, or damaged) is reported and not applied, so the
// app stays in the phone's language — the same outcome as ZKProofport, which
// applies only 'en' or 'ko' from storage.
readStoredLanguage().then(
  (stored) => {
    if (stored !== null) i18n.changeLanguage(stored);
  },
  (err) => console.log(`[i18n] stored language ignored: ${String(err)}`),
);

/** The language in use now. */
export function currentLanguage(): AppLanguage {
  return languageOption(i18n.language).value;
}

/** Re-renders the caller whenever the language changes. */
export function useCurrentLanguage(): AppLanguage {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const handler = () => forceUpdate();
    i18n.on('languageChanged', handler);
    return () => {
      i18n.off('languageChanged', handler);
    };
  }, []);
  return currentLanguage();
}

export default i18n;
