/**
 * Request ids this phone has answered, kept across launches so a re-opened
 * link is not answered (or shown) a second time. Ids only; nothing personal.
 * Entries older than KEEP_MS are dropped: the relay forgets requests long
 * before that.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface AnsweredStore {
  has(requestId: string): Promise<boolean>;
  add(requestId: string): Promise<void>;
}

export const ANSWERED_KEY = '@kproof:answeredRequests';
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ENTRIES = 500;

type Entry = [requestId: string, answeredAt: number];

export function createAnsweredStore(kv: KeyValueStore, now: () => number): AnsweredStore {
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<Entry[]> {
    const raw = await kv.getItem(ANSWERED_KEY);
    if (raw === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    const cutoff = now() - KEEP_MS;
    return parsed.filter(
      (e): e is Entry => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number' && e[1] >= cutoff,
    );
  }

  return {
    async has(requestId) {
      await queue;
      return (await read()).some(([id]) => id === requestId);
    },
    add(requestId) {
      const next = queue.then(async () => {
        const entries = (await read()).filter(([id]) => id !== requestId);
        entries.push([requestId, now()]);
        await kv.setItem(ANSWERED_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
      });
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
