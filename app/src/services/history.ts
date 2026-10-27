/**
 * Proof history, on this phone only (AsyncStorage, plain text). Each record
 * says what was asked, of which card, by whom, and how it ended. No ID data.
 */
import type {KeyValueStore} from './answeredStore';
import type {CardTypeKey} from '../config/cardTypes';
import type {RequestInputs} from '../domain/request';

export type HistoryResult = 'sent' | 'declined' | 'failed' | 'expired';

export interface HistoryRecord {
  requestId: string;
  inputs: RequestInputs;
  dappName?: string;
  card?: CardTypeKey;
  result: HistoryResult;
  errorCode?: string;
  /** Milliseconds the prover took, for sent proofs. */
  provingMs?: number;
  at: string;
}

export const HISTORY_KEY = '@kproof:history';
export const HISTORY_MAX = 200;

export async function readHistory(kv: KeyValueStore): Promise<HistoryRecord[]> {
  const raw = await kv.getItem(HISTORY_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryRecord[]) : [];
  } catch {
    return [];
  }
}

export async function addHistory(kv: KeyValueStore, record: HistoryRecord): Promise<void> {
  const all = await readHistory(kv);
  await kv.setItem(HISTORY_KEY, JSON.stringify([record, ...all].slice(0, HISTORY_MAX)));
}

export async function clearHistory(kv: KeyValueStore): Promise<void> {
  await kv.setItem(HISTORY_KEY, '[]');
}
