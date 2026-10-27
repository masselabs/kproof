import type {NavigatorScreenParams} from '@react-navigation/native';
import type {CardTypeKey} from '../config/cardTypes';

export type TabParamList = {
  Home: undefined;
  Proofs: undefined;
  History: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  AddId: undefined;
  Request: undefined;
  Proving: {card: CardTypeKey};
  Done: {card: CardTypeKey; provingMs: number; verifyMs: number; at: string};
};
