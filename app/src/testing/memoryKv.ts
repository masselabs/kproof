import type {KeyValueStore} from '../services/answeredStore';

/** An in-memory AsyncStorage stand-in for tests. */
export function memoryKv(): KeyValueStore & {data: Map<string, string>} {
  const data = new Map<string, string>();
  return {data, getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v)};
}
