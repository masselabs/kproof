/**
 * Which card the person prefers for each circuit (Proofs tab). A preference
 * for a card that is no longer imported is ignored, not substituted.
 */
import {isCardTypeKey, CARD_ORDER, type CardTypeKey} from '../config/cardTypes';
import {isCircuitId, type CircuitId} from '../config/circuits';
import type {KeyValueStore} from '../services/answeredStore';

export const PREFS_KEY = '@kproof:cardForCircuit';

export type CardPrefs = Partial<Record<CircuitId, CardTypeKey>>;

export async function readPrefs(kv: KeyValueStore): Promise<CardPrefs> {
  const raw = await kv.getItem(PREFS_KEY);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: CardPrefs = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (isCircuitId(k) && isCardTypeKey(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function writePrefs(kv: KeyValueStore, prefs: CardPrefs): Promise<void> {
  await kv.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/**
 * The card a request starts with: the preferred one if it is imported,
 * otherwise the first imported card in wallet order, otherwise none.
 */
export function initialCard(prefs: CardPrefs, circuit: CircuitId, imported: readonly CardTypeKey[]): CardTypeKey | null {
  const preferred = prefs[circuit];
  if (preferred !== undefined && imported.includes(preferred)) return preferred;
  const first = CARD_ORDER.find((k) => imported.includes(k));
  return first === undefined ? null : first;
}

/** Next imported card after `current`, in wallet order (the "바꾸기" button). */
export function nextCard(current: CardTypeKey, imported: readonly CardTypeKey[]): CardTypeKey {
  const ordered = CARD_ORDER.filter((k) => imported.includes(k));
  if (ordered.length === 0) throw new Error('no imported cards to choose from');
  const i = ordered.indexOf(current);
  return ordered[(i + 1) % ordered.length];
}
