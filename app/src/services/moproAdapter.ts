import RNFS from 'react-native-fs';
import {generateNoirProof, getNumPublicInputsFromCircuit, parseProofWithPublicInputs, verifyNoirProof} from 'mopro-ffi';
import {decodeBase64Url} from '../domain/bytes';
import type {ProverPort} from './prover';

/** mopro-ffi behind the prover port. Same calls as proofport-app's useMdlKr. */
export const moproAdapter: ProverPort = {
  generate: (circuitPath, srsPath, inputs, vk) =>
    // onChain = true (keccak transcript, what the Solidity verifier checks);
    // lowMemoryMode = true, as proofport-app uses on phones.
    generateNoirProof(circuitPath, srsPath, inputs, true, vk, true),
  numPublicInputs: (circuitPath) => getNumPublicInputsFromCircuit(circuitPath),
  split: (proofWithInputs, n) => {
    const parsed = parseProofWithPublicInputs(proofWithInputs, n);
    return {proof: parsed.proof, publicInputs: parsed.publicInputs};
  },
  // onChain = true and lowMemoryMode = true, matching `generate` (and proofport-app's off-chain check).
  verify: (circuitPath, proofWithInputs, vk) => verifyNoirProof(circuitPath, proofWithInputs, true, vk, true),
  readFile: async (path) => {
    const b64 = await RNFS.readFile(path, 'base64');
    const bytes = decodeBase64Url(b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    if (!bytes) throw new Error(`${path} did not read back as base64`);
    return bytes.buffer as ArrayBuffer;
  },
};
