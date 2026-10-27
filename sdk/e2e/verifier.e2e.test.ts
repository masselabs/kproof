/**
 * The SDK against the REAL Base Sepolia verifiers, with REAL proofs.
 *
 * fixtures/mdl_* are the proofs zkproofport/circuits builds for each
 * mobile ID circuit (circuits commit 973b9e9, mdl/ unchanged since 35a8df4,
 * the commit the verifiers were deployed from). They are binary files exactly
 * as bb writes them: `proof` raw bytes, `public_inputs` 32-byte words.
 * The age fixture's Prover.toml sets age_threshold = 41 and current_year =
 * 2026, which pins the layout offsets against a real proof.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CIRCUITS, NETWORKS, type CircuitId } from '../src/circuits';
import { readBytes, verifyAnswer, verifyOnChain } from '../src/verify';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES: Record<CircuitId, string> = {
  mdl_kr_ownership: 'mdl_ownership',
  mdl_kr_age: 'mdl_age',
  mdl_kr_region: 'mdl_region',
};

function load(id: CircuitId) {
  const dir = join(here, '..', 'fixtures', FIXTURES[id]);
  const proof = '0x' + readFileSync(join(dir, 'proof')).toString('hex');
  const raw = readFileSync(join(dir, 'public_inputs'));
  const words: string[] = [];
  for (let i = 0; i < raw.length; i += 32) words.push('0x' + raw.subarray(i, i + 32).toString('hex'));
  return { proof, words };
}

const { rpcUrl, verifiers } = NETWORKS.staging;

describe('real proofs on the deployed verifiers', () => {
  it.each(Object.keys(CIRCUITS) as CircuitId[])('%s: the real proof verifies and has the layout the SDK reads', async (id) => {
    const { proof, words } = load(id);
    expect(words).toHaveLength(CIRCUITS[id].publicInputs);
    const result = await verifyOnChain(rpcUrl, verifiers[id], proof, words);
    expect(result).toEqual({ ok: true, detail: 'verifier returned true' });
  });

  it.each(Object.keys(CIRCUITS) as CircuitId[])('%s: one changed public input is refused', async (id) => {
    const { proof, words } = load(id);
    const last = BigInt(words.at(-1)!);
    words[words.length - 1] = '0x' + (last ^ 1n).toString(16).padStart(64, '0');
    expect((await verifyOnChain(rpcUrl, verifiers[id], proof, words)).ok).toBe(false);
  });

  it('a proof sent to another circuit\'s verifier is refused', async () => {
    const { proof, words } = load('mdl_kr_age');
    expect((await verifyOnChain(rpcUrl, verifiers.mdl_kr_region, proof, words)).ok).toBe(false);
  });

  it('the age fixture carries age 41 and year 2026 where the SDK reads them', () => {
    const { words } = load('mdl_kr_age');
    const { ageThreshold, currentYear } = CIRCUITS.mdl_kr_age.extra;
    expect(BigInt(words[ageThreshold!.offset]!)).toBe(41n);
    expect(BigInt(words[currentYear!.offset]!)).toBe(2026n);
    expect(Array.from(readBytes(words, 0, 4))).toEqual([95, 31, 242, 61]); // Prover.toml scope[0..4]
  });

  it('verifyAnswer runs the whole path on a real proof; only the scope it cannot know fails', async () => {
    const { proof, words } = load('mdl_kr_age');
    const out = await verifyAnswer(
      { circuitId: 'mdl_kr_age', inputs: { scope: 'not-the-fixture-scope', ageThreshold: 41 } },
      { status: 'completed', circuit: 'mdl_kr_age', proof, publicInputs: words },
      { environment: 'staging', now: new Date('2026-10-27T12:00:00Z') },
    );
    expect(out.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(['scope']);
    expect(out.checks.find((c) => c.name === 'on_chain')).toMatchObject({ ok: true });
    expect(out.nullifier).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
