import * as Keychain from 'react-native-keychain';
import type {KeychainPort} from './vault';

const ACCESS_CONTROL = {
  BiometryCurrentSet: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
  DevicePasscode: Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
} as const;

/** react-native-keychain behind the vault's port. */
export const keychain: KeychainPort = {
  getSupportedBiometryType: () => Keychain.getSupportedBiometryType(),
  isPasscodeAuthAvailable: () => Keychain.isPasscodeAuthAvailable(),
  hasGenericPassword: (o) => Keychain.hasGenericPassword({service: o.service}),
  getGenericPassword: (o) =>
    Keychain.getGenericPassword({
      service: o.service,
      authenticationPrompt: {title: o.authenticationPrompt.title, cancel: o.authenticationPrompt.cancel},
    }),
  setGenericPassword: (username, password, o) =>
    Keychain.setGenericPassword(username, password, {
      service: o.service,
      accessControl: ACCESS_CONTROL[o.accessControl],
      // Never leaves this device (no iCloud Keychain, no backup restore elsewhere).
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      // Android: Keystore AES-GCM key that requires user authentication.
      storage: Keychain.STORAGE_TYPE.AES_GCM,
    }),
  resetGenericPassword: (o) => Keychain.resetGenericPassword({service: o.service}),
};
