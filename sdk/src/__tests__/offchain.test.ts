/**
 * Off-chain verification against REAL proofs (fixtures/, the proofs the
 * on-chain e2e suite verifies on the deployed contracts) with the real
 * verifier module. Keys are served from this repository's circuits/ through
 * an injected fetch, so the test needs no network.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@noble/hashes/sha2.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CIRCUITS, type CircuitId } from '../circuits';
import { MAX_PROOF_BYTES, SRS_G2, VK_SOURCE, resetOffChainVerifier, verifyOffChain, vkUrl, type VerifierModule } from '../offchain';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const FIXTURES: Record<CircuitId, string> = { mdl_kr_ownership: 'mdl_ownership', mdl_kr_age: 'mdl_age', mdl_kr_region: 'mdl_region' };
const IDS = Object.keys(CIRCUITS) as CircuitId[];

function load(id: CircuitId) {
  const dir = join(here, '..', '..', 'fixtures', FIXTURES[id]);
  const proof = '0x' + readFileSync(join(dir, 'proof')).toString('hex');
  const raw = readFileSync(join(dir, 'public_inputs'));
  const words: string[] = [];
  for (let i = 0; i < raw.length; i += 32) words.push('0x' + raw.subarray(i, i + 32).toString('hex'));
  return { proof, words };
}
const keyFile = (id: CircuitId) => readFileSync(join(repo, 'circuits', CIRCUITS[id].dir, 'target', 'vk', 'vk'));

/** Serves each circuit's key from circuits/ at the pinned URL, and 404 for anything else. */
function keyServer(override?: (id: CircuitId) => Uint8Array) {
  return vi.fn(async (url: string | URL | Request) => {
    const id = IDS.find((c) => vkUrl(c) === String(url));
    if (!id) return new Response('not found', { status: 404 });
    return new Response(new Uint8Array(override ? override(id) : keyFile(id)));
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const word = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

afterEach(() => resetOffChainVerifier());

describe('verifyOffChain with real proofs', () => {
  it.each(IDS)('%s: the real proof verifies against the pinned key', async (id) => {
    const { proof, words } = load(id);
    const fetchImpl = keyServer();
    const out = await verifyOffChain(id, proof, words, { fetchImpl });
    expect(out.valid).toBe(true);
    expect(out.ms).toBeGreaterThanOrEqual(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(`https://raw.githubusercontent.com/masselabs/kproof/${VK_SOURCE.commit}/circuits/${CIRCUITS[id].dir}/target/vk/vk`);
  }, 60_000);

  it.each(IDS)('%s: one flipped public input is rejected', async (id) => {
    const { proof, words } = load(id);
    const flipped = [...words];
    flipped[0] = word(BigInt(words[0]!) === 7n ? 8 : 7);
    expect((await verifyOffChain(id, proof, flipped, { fetchImpl: keyServer() })).valid).toBe(false);
  }, 60_000);

  const flipByte = (proof: string, at: number) => {
    const i = 2 + 2 * at;
    return proof.slice(0, i) + (parseInt(proof.slice(i, i + 2), 16) ^ 0xff).toString(16).padStart(2, '0') + proof.slice(i + 2);
  };

  it('a proof with one byte changed does not verify', async () => {
    const { proof, words } = load('mdl_kr_age');
    expect((await verifyOffChain('mdl_kr_age', flipByte(proof, 4000), words, { fetchImpl: keyServer() })).valid).toBe(false);
  }, 60_000);

  it('a proof the verifier cannot parse is refused with the reason, and the next good proof still verifies', async () => {
    const { proof, words } = load('mdl_kr_age');
    await expect(verifyOffChain('mdl_kr_age', flipByte(proof, 8767), words, { fetchImpl: keyServer() })).rejects.toThrow(/the verifier could not check this proof: .*on_curve/);
    expect((await verifyOffChain('mdl_kr_age', proof, words, { fetchImpl: keyServer() })).valid).toBe(true);
  }, 60_000);

  it("a proof checked with another circuit's key does not verify", async () => {
    const { proof, words } = load('mdl_kr_age');
    const ownershipWords = [...words, ...Array.from({ length: 31 }, () => word(0))];
    const out = await verifyOffChain('mdl_kr_ownership', proof, ownershipWords, { fetchImpl: keyServer() }).then((r) => r.valid, () => false);
    expect(out).toBe(false);
  }, 60_000);

  it('downloads each key once and loads the verifier once for repeated checks', async () => {
    const { proof, words } = load('mdl_kr_age');
    const fetchImpl = keyServer();
    const bb = await import('@aztec/bb.js');
    const loadVerifier = vi.fn(async () => bb as unknown as VerifierModule);
    await verifyOffChain('mdl_kr_age', proof, words, { fetchImpl, loadVerifier });
    await verifyOffChain('mdl_kr_age', proof, words, { fetchImpl, loadVerifier });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(loadVerifier).toHaveBeenCalledTimes(1);
  }, 60_000);
});

describe('verifyOffChain refuses what it cannot check', () => {
  const { proof, words } = load('mdl_kr_age');
  const noLoad = vi.fn(async (): Promise<VerifierModule> => {
    throw new Error('must not load');
  });

  it.each([undefined, null, '', 'nope', 'coinbase_attestation', '__proto__', 'toString', 'constructor'])('unknown circuit %s throws naming the known ones', async (id) => {
    const fetchImpl = keyServer();
    await expect(verifyOffChain(id, proof, words, { fetchImpl, loadVerifier: noLoad })).rejects.toThrow(/Unknown circuit .* Known: mdl_kr_ownership, mdl_kr_age, mdl_kr_region\./);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each<[string, unknown, unknown, RegExp]>([
    ['no proof', undefined, words, /not 0x-prefixed hex/],
    ['an empty proof', '0x', words, /not 0x-prefixed hex/],
    ['a non-hex proof', '0x' + 'zz'.repeat(32), words, /not 0x-prefixed hex/],
    ['a proof without 0x', proof.slice(2), words, /not 0x-prefixed hex/],
    ['an odd-length proof', proof + 'a', words, /not 0x-prefixed hex/],
    ['a markup proof', '<script>alert(1)</script>', words, /not 0x-prefixed hex/],
    ['an oversized proof', '0x' + '00'.repeat(MAX_PROOF_BYTES + 32), words, /more than 65536/],
    ['a proof that is not whole fields', '0x' + '00'.repeat(33), words, /not a whole number of 32-byte fields/],
    ['no public inputs', proof, undefined, /not a list/],
    ['zero public inputs', proof, [], /0 public inputs, mdl_kr_age has 66/],
    ['one public input too few', proof, words.slice(1), /65 public inputs/],
    ['one public input too many', proof, [...words, word(0)], /67 public inputs/],
    ['a short public input', proof, ['0x01', ...words.slice(1)], /public input 0 is not a 32-byte hex word/],
    ['a number as public input', proof, [1, ...words.slice(1)], /public input 0 is not/],
    ['a non-hex public input', proof, [...words.slice(0, 65), '0x' + 'g'.repeat(64)], /public input 65 is not/],
  ])('%s', async (_name, p, w, message) => {
    const fetchImpl = keyServer();
    await expect(verifyOffChain('mdl_kr_age', p, w, { fetchImpl, loadVerifier: noLoad })).rejects.toThrow(message);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(noLoad).not.toHaveBeenCalled();
  });

  it('refuses a key whose digest is not the pinned one, and retries the download next time', async () => {
    const swapped = keyServer((id) => keyFile(id === 'mdl_kr_age' ? 'mdl_kr_region' : id));
    await expect(verifyOffChain('mdl_kr_age', proof, words, { fetchImpl: swapped })).rejects.toThrow(
      new RegExp(`has sha256 ${CIRCUITS.mdl_kr_region.vkSha256}, expected ${CIRCUITS.mdl_kr_age.vkSha256}`),
    );
    expect((await verifyOffChain('mdl_kr_age', proof, words, { fetchImpl: keyServer() })).valid).toBe(true);
  }, 60_000);

  it('refuses a key download that fails', async () => {
    const down = vi.fn(async () => new Response('gone', { status: 503 })) as unknown as typeof fetch;
    await expect(verifyOffChain('mdl_kr_age', proof, words, { fetchImpl: down })).rejects.toThrow(/could not download the verification key \(HTTP 503\)/);
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(verifyOffChain('mdl_kr_age', proof, words, { fetchImpl: offline })).rejects.toThrow(/Failed to fetch/);
  });

  it('reports a verifier that cannot load, and loads it on the next call', async () => {
    const broken = vi.fn(async (): Promise<VerifierModule> => {
      throw new Error('chunk failed');
    });
    await expect(verifyOffChain('mdl_kr_age', proof, words, { fetchImpl: keyServer(), loadVerifier: broken })).rejects.toThrow('could not load the proof verifier: chunk failed');
    expect((await verifyOffChain('mdl_kr_age', proof, words, { fetchImpl: keyServer() })).valid).toBe(true);
  }, 60_000);

  it('accepts only an explicit true from the verifier', async () => {
    const fake = (answer: unknown): VerifierModule => ({
      BarretenbergSync: { new: async () => ({ srsInitSrs: () => undefined }) },
      BackendType: { Wasm: 'wasm' },
      UltraHonkVerifierBackend: class {
        async verifyProof() {
          return answer as boolean;
        }
      },
    });
    for (const answer of [1, 'true', {}, undefined]) {
      resetOffChainVerifier();
      expect((await verifyOffChain('mdl_kr_age', proof, words, { fetchImpl: keyServer(), loadVerifier: async () => fake(answer) })).valid).toBe(false);
    }
  });
});

describe('the pinned material is what the circuits in this repository use', () => {
  it.each(IDS)("%s: the pinned digest is the sha256 of the circuit's key", (id) => {
    expect(Buffer.from(sha256(keyFile(id))).toString('hex')).toBe(CIRCUITS[id].vkSha256);
  });

  it.each(['kr-age/target/MdlKrAge.sol', 'kr-ownership/target/MdlKrOwnership.sol', 'kr-region/target/MdlKrRegion.sol'])('the G2 point is the one %s pairs with', (sol) => {
    const source = readFileSync(join(repo, 'circuits', 'mdl', sol), 'utf8').toLowerCase();
    for (let i = 0; i < 4; i++) expect(source).toContain(`0x${SRS_G2.slice(i * 64, (i + 1) * 64)}`);
  });
});
