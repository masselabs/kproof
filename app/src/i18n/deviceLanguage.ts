import { NativeModules, Platform } from 'react-native';

export type Language = 'en' | 'ko';

/**
 * The phone's language, as the phone reports it. Same rule as the ZKProofport
 * app: Korean when the phone is Korean, English for every other language.
 *
 * `Intl` first. On the new architecture (this app runs it) the legacy
 * `NativeModules` fields are absent, so reading them alone answered 'en' on a
 * Korean phone in ZKProofport (measured on a ko-KR device, 2026-08-27). A
 * locale that `Intl` resolved is an answer and the bridge does not get a
 * second vote; the bridge is consulted only when `Intl` is missing or throws.
 */
export function getDeviceLanguage(): Language {
  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (intlLocale && intlLocale.toLowerCase().startsWith('ko')) return 'ko';
    // A locale that resolved to something else is an ANSWER, not a miss — do not
    // fall through to the bridge and risk contradicting it.
    if (intlLocale) return 'en';
  } catch {
    // No `intl` in this Hermes build; fall through to the bridge.
  }

  try {
    const locale: string | undefined =
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ||
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier;
    if (locale && locale.toLowerCase().startsWith('ko')) return 'ko';
  } catch {
    // ignore
  }
  return 'en';
}
