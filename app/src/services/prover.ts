/**
 * The on-device prover (mopro bindings, UniFFI), behind a port so the answer
 * flow is testable without the native library.
 *
 * `generateNoirProof` is synchronous and blocks the JS thread for the length
 * of the proof; callers yield a frame first so the progress screen is drawn.
 */
export interface ProverPort {
  /** Returns the proof bytes with the public inputs prepended (mopro's layout). */
  generate(circuitPath: string, srsPath: string, inputs: string[], vk: ArrayBuffer): ArrayBuffer;
  numPublicInputs(circuitPath: string): number;
  split(proofWithInputs: ArrayBuffer, numPublicInputs: number): {proof: ArrayBuffer; publicInputs: ArrayBuffer[]};
  readFile(path: string): Promise<ArrayBuffer>;
  /** Off-chain check on the phone: mopro's own verifier, same circuit, key and transcript as `generate`. */
  verify(circuitPath: string, proofWithInputs: ArrayBuffer, vk: ArrayBuffer): boolean;
}

export function bufferToHex(buf: ArrayBuffer): string {
  return '0x' + Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
