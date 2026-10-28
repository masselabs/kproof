/**
 * The real implementations behind every port, wired once.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {InteractionManager, Linking, Platform} from 'react-native';
import {currentEnv} from '../config/buildEnv';
import i18n from '../i18n';
import {createAnsweredStore, type KeyValueStore} from '../services/answeredStore';
import type {AnswerFlowDeps} from '../services/answerFlow';
import {fsAdapter} from '../services/fsAdapter';
import {keychain} from '../services/keychainAdapter';
import {moproAdapter} from '../services/moproAdapter';
import type {IdImportDeps} from '../services/idImport';
import type {RelayDeps} from '../services/relayAnswer';
import {openVault} from '../services/vault';

export const kv: KeyValueStore = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
};

const log = (message: string) => console.log(message);

export const answered = createAnsweredStore(kv, () => Date.now());

export const relayDeps: RelayDeps = {fetch: (...a) => fetch(...a), answered, log};

export const answerFlowDeps: AnswerFlowDeps = {
  relay: relayDeps,
  openVault: () => openVault(keychain, {title: i18n.t('lock.proofPrompt'), cancel: i18n.t('lock.cancel')}),
  fs: fsAdapter,
  prover: moproAdapter,
  circuits: currentEnv().circuits,
  history: kv,
  now: () => new Date(),
  yieldFrame: () =>
    new Promise((resolve) => {
      InteractionManager.runAfterInteractions(() => setTimeout(resolve, 50));
    }),
  log,
};

function platform(): 'ios' | 'android' {
  switch (Platform.OS) {
    case 'ios':
      return 'ios';
    case 'android':
      return 'android';
    default:
      throw new Error(`KProof runs on iOS and Android, not '${Platform.OS}'`);
  }
}

export function idImportDeps(): IdImportDeps {
  return {
    baseUrl: currentEnv().idImportBaseUrl,
    fetch: (...a) => fetch(...a),
    platform: platform(),
    canOpenURL: (u) => Linking.canOpenURL(u),
    openURL: (u) => Linking.openURL(u),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    log,
  };
}
