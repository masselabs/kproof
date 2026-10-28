import type {NavigatorScreenParams} from '@react-navigation/native';
import type {CardTypeKey} from '../config/cardTypes';

export type TabParamList = {
  Home: undefined;
  Proofs: undefined;
  /** Never shown: its tab-bar button opens the root `Scan` screen. */
  ScanTab: undefined;
  History: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  AddId: undefined;
  SettingsLanguage: undefined;
  Scan: undefined;
  Request: undefined;
  Proving: {card: CardTypeKey};
  Done: {card: CardTypeKey; provingMs: number; verifyMs: number; at: string};
};
