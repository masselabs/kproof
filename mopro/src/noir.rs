use noir_rs::{
    barretenberg::{
        prove::{prove_ultra_honk, prove_ultra_honk_keccak},
        srs::setup_srs,
        utils::get_circuit_size,
        verify::{
            get_ultra_honk_keccak_verification_key, get_ultra_honk_verification_key,
            verify_ultra_honk, verify_ultra_honk_keccak,
        },
    },
    witness::from_vec_str_to_witness_map,
};

use crate::MoproError;

/// Generates a Noir proof with automatic hash function selection
///
/// This is the main proof generation function that automatically chooses
/// the appropriate hash function based on the intended use case:
///
/// - `on_chain = true`: Uses Keccak hash for Solidity verifier compatibility
/// - `on_chain = false`: Uses Poseidon hash for better performance
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn generate_noir_proof(
    circuit_path: String,
    srs_path: Option<String>,
    inputs: Vec<String>,
    on_chain: bool,
    vk: Vec<u8>,
    low_memory_mode: bool,
) -> Result<Vec<u8>, MoproError> {
    let res = if on_chain {
        generate_noir_proof_with_keccak(circuit_path, srs_path, inputs, false, vk, low_memory_mode)
    } else {
        generate_noir_proof_with_poseidon(circuit_path, srs_path, inputs, vk, low_memory_mode)
    };

    res.map_err(|e| MoproError::NoirError(format!("Generate Proof error: {}", e)))
}

/// Verifies a Noir proof with automatic hash function selection
///
/// This function automatically uses the correct verification method based
/// on how the proof was generated:
///
/// - `on_chain = true`: Verifies Keccak-based proof (Solidity compatible)
/// - `on_chain = false`: Verifies Poseidon-based proof (performance optimized)
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn verify_noir_proof(
    circuit_path: String,
    proof: Vec<u8>,
    on_chain: bool,
    vk: Vec<u8>,
    low_memory_mode: bool,
) -> Result<bool, MoproError> {
    // A malformed proof makes Barretenberg return an error (for example a
    // point that is not on the curve). That is "not valid", reported as an
    // error -- never a panic, which would abort the app across the FFI.
    let res = if on_chain {
        try_verify_noir_proof_with_keccak(proof, false, vk)
    } else {
        try_verify_noir_proof_with_poseidon(proof, vk)
    };
    let _ = (circuit_path, low_memory_mode);
    res.map_err(|e| MoproError::NoirError(format!("Verify Proof error: {}", e)))
}

fn try_verify_noir_proof_with_poseidon(proof: Vec<u8>, vk: Vec<u8>) -> Result<bool, String> {
    verify_ultra_honk(proof, vk)
}

fn try_verify_noir_proof_with_keccak(proof: Vec<u8>, disable_zk: bool, vk: Vec<u8>) -> Result<bool, String> {
    verify_ultra_honk_keccak(proof, vk, disable_zk)
}

/// Generates a verification key with automatic hash function selection
///
/// This function automatically chooses the appropriate hash function based
/// on the intended use case:
///
/// - `on_chain = true`: Uses Keccak hash for Solidity verifier compatibility
/// - `on_chain = false`: Uses Poseidon hash fotr better performance
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn get_noir_verification_key(
    circuit_path: String,
    srs_path: Option<String>,
    on_chain: bool,
    low_memory_mode: bool,
) -> Result<Vec<u8>, MoproError> {
    let res = if on_chain {
        get_noir_verification_keccak_key(circuit_path, srs_path, false, low_memory_mode)
    } else {
        get_noir_verification_poseidon_key(circuit_path, srs_path, low_memory_mode)
    };

    res.map_err(|e| MoproError::NoirError(format!("Get Verification Key error: {}", e)))
}

/// Generates a Noir proof using Poseidon as oracle hash
///
/// This function uses the Poseidon hash function for better performance.
/// However, proofs generated with Poseidon cannot be verified
/// on-chain with Solidity verifiers.
///
/// Use this for off-chain verification or when maximum performance is needed.
fn generate_noir_proof_with_poseidon(
    circuit_path: String,
    srs_path: Option<String>,
    inputs: Vec<String>,
    vk: Vec<u8>,
    low_memory_mode: bool,
) -> Result<Vec<u8>, String> {
    let circuit_bytecode = get_bytecode(circuit_path);

    // Setup the SRS
    setup_srs_for_circuit(circuit_bytecode.as_str(), srs_path.as_deref())?;

    // Set up the witness
    let witness = from_vec_str_to_witness_map(inputs.iter().map(|s| s.as_str()).collect()).unwrap();

    prove_ultra_honk(circuit_bytecode.as_str(), witness, vk, low_memory_mode)
}

/// Verifies a Noir proof generated with Poseidon as oracle hash
///
/// This function verifies proofs that were generated using the Poseidon hash.
/// It cannot verify proofs intended for on-chain verification with Solidity verifiers.
pub fn verify_noir_proof_with_poseidon(
    circuit_path: String,
    proof: Vec<u8>,
    vk: Vec<u8>,
    _low_memory_mode: bool,
) -> bool {
    let _circuit_bytecode = get_bytecode(circuit_path);
    verify_ultra_honk(proof, vk).unwrap()
}

/// Generates a verification key for Poseidon-based Noir proofs
///
/// This verification key can only be used to verify proofs generated
/// with the Poseidon hash function (off-chain proofs).
fn get_noir_verification_poseidon_key(
    circuit_path: String,
    srs_path: Option<String>,
    low_memory_mode: bool,
) -> Result<Vec<u8>, String> {
    let circuit_bytecode = get_bytecode(circuit_path);

    setup_srs_for_circuit(circuit_bytecode.as_str(), srs_path.as_deref())?;

    let vk = get_ultra_honk_verification_key(circuit_bytecode.as_str(), low_memory_mode).unwrap();
    Ok(vk)
}

/// Generates a Noir proof using Keccak as oracle hash
///
/// This function uses the Keccak hash function which is required for
/// generating proofs that can be verified on-chain with Solidity verifiers.
/// While slightly less performant than Poseidon, it enables on-chain verification.
///
/// Use this when you need to verify proofs on Ethereum or other EVM chains.
fn generate_noir_proof_with_keccak(
    circuit_path: String,
    srs_path: Option<String>,
    inputs: Vec<String>,
    disable_zk: bool,
    vk: Vec<u8>,
    low_memory_mode: bool,
) -> Result<Vec<u8>, String> {
    let circuit_bytecode = get_bytecode(circuit_path);

    // Setup the SRS
    setup_srs_for_circuit(circuit_bytecode.as_str(), srs_path.as_deref())?;

    // Set up the witness
    let witness = from_vec_str_to_witness_map(inputs.iter().map(|s| s.as_str()).collect()).unwrap();

    prove_ultra_honk_keccak(
        circuit_bytecode.as_str(),
        witness,
        vk,
        disable_zk,
        low_memory_mode,
    )
}

/// Verifies a Noir proof generated with Keccak as oracle hash
///
/// This function verifies proofs that were generated using the Keccak hash,
/// which are compatible with Solidity verifiers for on-chain verification.
fn verify_noir_proof_with_keccak(
    circuit_path: String,
    proof: Vec<u8>,
    disable_zk: bool,
    vk: Vec<u8>,
    _low_memory_mode: bool,
) -> bool {
    let _circuit_bytecode = get_bytecode(circuit_path);
    verify_ultra_honk_keccak(proof, vk, disable_zk).unwrap()
}

/// Generates a verification key for Keccak-based Noir proofs
///
/// This verification key can be used to verify proofs generated with
/// the Keccak hash function, and is compatible with Solidity verifiers
/// for on-chain verification.
fn get_noir_verification_keccak_key(
    circuit_path: String,
    srs_path: Option<String>,
    disable_zk: bool,
    low_memory_mode: bool,
) -> Result<Vec<u8>, String> {
    let circuit_bytecode = get_bytecode(circuit_path);

    // Setup the SRS
    setup_srs_for_circuit(circuit_bytecode.as_str(), srs_path.as_deref())?;

    // Set up the witness
    let vk = get_ultra_honk_keccak_verification_key(
        circuit_bytecode.as_str(),
        disable_zk,
        low_memory_mode,
    )
    .unwrap();
    Ok(vk)
}

/// Load exactly the reference string the circuit needs.
///
/// noir-rs v1.0.0-beta.19's `setup_srs_from_bytecode` asks for EIGHT times
/// the circuit's dyadic size ("empirically ~8x"), while its own
/// `srs_downloader` -- which our circuits build uses to publish each
/// circuit's .srs -- writes the dyadic size plus one point. So a published
/// file panics on load, and with no file the prover downloads 8x the points
/// over the network (2^22 points, about 268 MB, for coinbase_attestation).
/// This asks for what `srs_downloader` writes.
fn setup_srs_for_circuit(circuit_bytecode: &str, srs_path: Option<&str>) -> Result<u32, String> {
    let size = get_circuit_size(circuit_bytecode, false);
    if size == 0 {
        return Err("could not size the circuit for its reference string".to_string());
    }
    setup_srs(size, srs_path)
}

fn get_bytecode(circuit_path: String) -> String {
    // Read the JSON manifest of the circuit
    let circuit_txt = std::fs::read_to_string(circuit_path).unwrap();
    let circuit: serde_json::Value = serde_json::from_str(&circuit_txt).unwrap();

    circuit["bytecode"].as_str().unwrap().to_string()
}

#[cfg(test)]
mod tests {
    const MULTIPLIER2_CIRCUIT_FILE: &str = "./test-vectors/noir/noir_multiplier2.json";
    const SRS_FILE: &str = "./test-vectors/noir/noir_multiplier2.srs";
    const VK_FILE: &str = "./test-vectors/noir/noir_multiplier2.vk";

    use super::*;

    #[test]
    #[serial_test::serial]
    fn test_proof_multiplier2() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = get_noir_verification_poseidon_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            false,
        )
        .unwrap();
        let proof = generate_noir_proof_with_poseidon(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            vk.clone(),
            false,
        )
        .unwrap();
        assert!(verify_noir_proof_with_poseidon(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof,
            vk,
            false,
        ));
    }

    #[test]
    #[serial_test::serial]
    fn test_proof_multiplier2_low_memory() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = get_noir_verification_poseidon_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            true,
        )
        .unwrap();
        let proof = generate_noir_proof_with_poseidon(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            vk.clone(),
            true,
        )
        .unwrap();
        assert!(verify_noir_proof_with_poseidon(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof,
            vk,
            true,
        ));
    }

    #[test]
    #[serial_test::serial]
    fn test_proof_multiplier2_without_srs_path() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk =
            get_noir_verification_poseidon_key(MULTIPLIER2_CIRCUIT_FILE.to_string(), None, false)
                .unwrap();
        let proof = generate_noir_proof_with_poseidon(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            None,
            witness,
            vk.clone(),
            false,
        )
        .unwrap();
        assert!(verify_noir_proof_with_poseidon(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof,
            vk,
            false,
        ));
    }

    #[test]
    #[serial_test::serial]
    fn test_keccak_proof_multiplier2() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = get_noir_verification_keccak_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            false,
            false,
        )
        .unwrap();
        let proof = generate_noir_proof_with_keccak(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            false,
            vk.clone(),
            false,
        )
        .unwrap();
        assert!(verify_noir_proof_with_keccak(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof,
            false,
            vk,
            false,
        ));
    }

    #[test]
    #[serial_test::serial]
    fn test_keccak_proof_multiplier2_disable_zk() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = get_noir_verification_keccak_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            true,
            false,
        )
        .unwrap();
        let proof = generate_noir_proof_with_keccak(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            true,
            vk.clone(),
            false,
        )
        .unwrap();
        assert!(verify_noir_proof_with_keccak(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof,
            true,
            vk,
            false,
        ));
    }

    #[test]
    #[serial_test::serial]
    fn test_keccak_proof_multiplier2_low_memory() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = get_noir_verification_keccak_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            false,
            true,
        )
        .unwrap();
        let proof = generate_noir_proof_with_keccak(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            false,
            vk.clone(),
            true,
        )
        .unwrap();
        assert!(verify_noir_proof_with_keccak(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof,
            false,
            vk,
            true,
        ));
    }

    #[test]
    #[serial_test::serial]
    fn test_keccak_proof_multiplier2_with_vk() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = std::fs::read(VK_FILE).unwrap();
        let proof = generate_noir_proof_with_keccak(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            false,
            vk.clone(),
            false,
        )
        .unwrap();
        let is_valid = verify_noir_proof_with_keccak(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof.clone(),
            false,
            vk.clone(),
            false,
        );
        assert!(is_valid);
    }

    #[test]
    #[serial_test::serial]
    fn test_get_noir_verification_poseidon_key() {
        let vk = get_noir_verification_poseidon_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            false,
        );
        assert!(vk.is_ok());
        assert!(!vk.unwrap().is_empty());
    }

    #[test]
    #[serial_test::serial]
    fn test_noir_proof_with_poseidon_and_vk() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = std::fs::read(VK_FILE).unwrap();
        let proof = generate_noir_proof_with_poseidon(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            vk.clone(),
            false,
        )
        .unwrap();
        let is_valid = verify_noir_proof_with_poseidon(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof.clone(),
            vk.clone(),
            false,
        );
        assert!(is_valid);
    }

    #[test]
    #[serial_test::serial]
    fn test_high_level_noir_proof_poseidon() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = get_noir_verification_poseidon_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            false,
        )
        .unwrap();
        let proof = generate_noir_proof(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            false,
            vk.clone(),
            false,
        )
        .unwrap();
        let is_valid = verify_noir_proof(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof,
            false,
            vk,
            false,
        )
        .unwrap();
        assert!(is_valid);
    }

    #[test]
    #[serial_test::serial]
    fn test_high_level_noir_proof_keccak() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = get_noir_verification_keccak_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            false,
            false,
        )
        .unwrap();
        let proof = generate_noir_proof(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            true,
            vk.clone(),
            false,
        )
        .unwrap();
        let is_valid =
            verify_noir_proof(MULTIPLIER2_CIRCUIT_FILE.to_string(), proof, true, vk, false)
                .unwrap();
        assert!(is_valid);
    }

    #[test]
    #[serial_test::serial]
    fn test_high_level_noir_proof_poseidon_with_vk() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = std::fs::read(VK_FILE).unwrap();
        let proof = generate_noir_proof(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            false,
            vk.clone(),
            false,
        )
        .unwrap();
        let is_valid = verify_noir_proof(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof,
            false,
            vk,
            false,
        )
        .unwrap();
        assert!(is_valid);
    }

    #[test]
    #[serial_test::serial]
    fn test_high_level_noir_proof_keccak_with_vk() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk = std::fs::read(VK_FILE).unwrap();
        let proof = generate_noir_proof(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness,
            true,
            vk.clone(),
            false,
        )
        .unwrap();
        let is_valid =
            verify_noir_proof(MULTIPLIER2_CIRCUIT_FILE.to_string(), proof, true, vk, false)
                .unwrap();
        assert!(is_valid);
    }

    #[test]
    #[serial_test::serial]
    fn test_get_noir_verification_key_poseidon() {
        let vk = get_noir_verification_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            false, // off-chain, uses Poseidon
            false,
        );
        assert!(vk.is_ok());
        assert!(!vk.unwrap().is_empty());
    }

    #[test]
    #[serial_test::serial]
    fn test_get_noir_verification_key_keccak() {
        let vk = get_noir_verification_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            true, // on-chain, uses Keccak
            false,
        );
        assert!(vk.is_ok());
        assert!(!vk.unwrap().is_empty());
    }

    #[test]
    #[serial_test::serial]
    fn test_noir_app_macro() {
        let witness = vec!["3".to_string(), "5".to_string()];
        let vk_offchain = get_noir_verification_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            false,
            false,
        )
        .unwrap();
        let vk_onchain = get_noir_verification_key(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            true,
            false,
        )
        .unwrap();
        let proof_offchain = generate_noir_proof(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness.clone(),
            false,
            vk_offchain.clone(),
            false,
        );
        let proof_onchain = generate_noir_proof(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            Some(SRS_FILE.to_string()),
            witness.clone(),
            true,
            vk_onchain.clone(),
            false,
        );

        assert!(proof_offchain.is_ok());
        assert!(proof_onchain.is_ok());
        let proof_offchain = proof_offchain.unwrap();
        let proof_onchain = proof_onchain.unwrap();

        let verify_result_offchain = verify_noir_proof(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof_offchain.clone(),
            false,
            vk_offchain,
            false,
        );
        let verify_result_onchain = verify_noir_proof(
            MULTIPLIER2_CIRCUIT_FILE.to_string(),
            proof_onchain.clone(),
            true,
            vk_onchain,
            false,
        );

        assert!(verify_result_offchain.is_ok());
        assert!(verify_result_offchain.unwrap());
        assert!(verify_result_onchain.is_ok());
        assert!(verify_result_onchain.unwrap());
    }

    /// Test to compare mopro-generated proof with nargo CLI proof for coinbase-kyc circuit
    /// Uses the same Prover.toml data to ensure identical inputs
    #[test]
    #[serial_test::serial]
    #[ignore] // Run manually with: cargo test test_coinbase_kyc_proof_comparison -- --ignored --nocapture
    fn test_coinbase_kyc_proof_comparison() {
        const COINBASE_CIRCUIT_FILE: &str = "./test-vectors/noir/zk_coinbase_attestor.json";
        const COINBASE_SRS_FILE: &str = "./test-vectors/noir/zk_coinbase_attestor.srs";

        // Inputs from Prover.toml (in exact ABI order)
        let mut inputs: Vec<String> = Vec::new();

        // signal_hash [32]
        let signal_hash: [u8; 32] = [
            0x95, 0x71, 0x18, 0x85, 0x79, 0xf1, 0xda, 0xa3,
            0x4f, 0xda, 0x2d, 0x83, 0xd7, 0xdd, 0xd2, 0xcc,
            0x84, 0x01, 0xb4, 0xfe, 0xd0, 0x52, 0x23, 0xce,
            0xad, 0xf9, 0xae, 0x10, 0x65, 0x2f, 0x45, 0xa0
        ];
        inputs.extend(signal_hash.iter().map(|b| b.to_string()));

        // signer_list_merkle_root [32]
        let merkle_root: [u8; 32] = [
            0xb6, 0x0d, 0xa9, 0x81, 0x5c, 0x76, 0x26, 0x1b,
            0x61, 0xa1, 0xe9, 0x1f, 0x19, 0x9d, 0xe5, 0x84,
            0x5f, 0xc1, 0x71, 0xa6, 0x50, 0x0e, 0x57, 0xc4,
            0x24, 0x0d, 0x2a, 0xc6, 0x1d, 0x85, 0xe2, 0xbf
        ];
        inputs.extend(merkle_root.iter().map(|b| b.to_string()));

        // user_address [20]
        let user_address: [u8; 20] = [
            0xd6, 0xc7, 0x14, 0x24, 0x70, 0x37, 0xe5, 0x20,
            0x1b, 0x7e, 0x3d, 0xec, 0x97, 0xa3, 0xab, 0x59,
            0xa9, 0xd2, 0xf7, 0x39
        ];
        inputs.extend(user_address.iter().map(|b| b.to_string()));

        // user_signature [64]
        let user_signature: [u8; 64] = [
            0x64, 0x9f, 0x62, 0xc9, 0xe7, 0x3b, 0xc0, 0x99,
            0x9d, 0xb2, 0xcc, 0x39, 0x55, 0xcb, 0x08, 0x59,
            0x8d, 0x60, 0x54, 0x6c, 0x21, 0xc0, 0x50, 0x6a,
            0x24, 0xac, 0x4f, 0x96, 0xf0, 0x4d, 0x67, 0x2d,
            0x5c, 0x5c, 0xf7, 0x7e, 0x53, 0xef, 0x1e, 0x8e,
            0x07, 0xf1, 0xd8, 0x2f, 0xfa, 0x75, 0x4e, 0xb3,
            0xb2, 0xe7, 0xef, 0x9d, 0x1d, 0x14, 0xef, 0x69,
            0x17, 0xb5, 0x81, 0x18, 0x38, 0x6e, 0x80, 0x54
        ];
        inputs.extend(user_signature.iter().map(|b| b.to_string()));

        // user_pubkey_x [32]
        let user_pubkey_x: [u8; 32] = [
            0x2c, 0x4a, 0x80, 0x9f, 0x4b, 0xd5, 0x43, 0x5d,
            0x12, 0x44, 0x38, 0xb3, 0x73, 0x12, 0xfe, 0x3e,
            0x4e, 0xa7, 0xff, 0x64, 0x1b, 0x79, 0x29, 0xc2,
            0xaa, 0xa8, 0xdf, 0x30, 0x54, 0xd9, 0xbd, 0xb3
        ];
        inputs.extend(user_pubkey_x.iter().map(|b| b.to_string()));

        // user_pubkey_y [32]
        let user_pubkey_y: [u8; 32] = [
            0x26, 0x31, 0x2d, 0xee, 0xa3, 0x17, 0x5b, 0x65,
            0x40, 0x75, 0x7a, 0xdc, 0x16, 0x56, 0x3c, 0x98,
            0x5f, 0x23, 0xe5, 0x46, 0x2d, 0x51, 0x4d, 0x0a,
            0xeb, 0xe0, 0x57, 0xc6, 0x29, 0xf2, 0x86, 0xb8
        ];
        inputs.extend(user_pubkey_y.iter().map(|b| b.to_string()));

        // raw_transaction [300] - first 149 bytes are actual tx, rest are zeros
        let raw_tx_data: [u8; 149] = [
            0x02, 0xf8, 0x92, 0x82, 0x21, 0x05, 0x83, 0x04,
            0xa5, 0xda, 0x82, 0x75, 0x30, 0x84, 0x1f, 0x41,
            0xa6, 0xc6, 0x83, 0x09, 0x27, 0xc0, 0x94, 0x35,
            0x74, 0x58, 0x73, 0x9f, 0x90, 0x46, 0x1b, 0x99,
            0x78, 0x93, 0x50, 0x86, 0x8c, 0xd7, 0xcf, 0x33,
            0x0d, 0xd7, 0xee, 0x80, 0xa4, 0x56, 0xfe, 0xed,
            0x5e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0xd6, 0xc7, 0x14,
            0x24, 0x70, 0x37, 0xe5, 0x20, 0x1b, 0x7e, 0x3d,
            0xec, 0x97, 0xa3, 0xab, 0x59, 0xa9, 0xd2, 0xf7,
            0x39, 0xc0, 0x01, 0xa0, 0x37, 0x93, 0x21, 0xc8,
            0x17, 0xd3, 0x5f, 0x4a, 0x18, 0x0e, 0xea, 0x0a,
            0xbd, 0xba, 0x30, 0x3b, 0xa4, 0x06, 0x50, 0x27,
            0x9b, 0x5b, 0xc7, 0xe6, 0x80, 0x21, 0x45, 0xf9,
            0x94, 0xf2, 0xcd, 0xf1, 0xa0, 0x35, 0x25, 0xce,
            0x1b, 0xf6, 0xf0, 0x15, 0x06, 0xb3, 0x1c, 0x1d,
            0xd8, 0x92, 0x19, 0x08, 0xf2, 0xf0, 0xb7, 0x43,
            0x17, 0xc2, 0xa5, 0x06, 0x9e, 0x17, 0x90, 0x2f,
            0xf3, 0x2f, 0xaa, 0x1b, 0xc0
        ];
        inputs.extend(raw_tx_data.iter().map(|b| b.to_string()));
        // Pad with zeros to 300 bytes
        for _ in 0..(300 - 149) {
            inputs.push("0".to_string());
        }

        // tx_length (u32)
        inputs.push("149".to_string());

        // coinbase_attester_pubkey_x [32]
        let attester_pubkey_x: [u8; 32] = [
            0x8b, 0x7d, 0xf4, 0x09, 0x8c, 0x0a, 0x08, 0x36,
            0xc2, 0xd8, 0xf5, 0xa5, 0xd1, 0xfc, 0x35, 0xb2,
            0x54, 0x46, 0x95, 0xdd, 0xbc, 0x03, 0xce, 0x16,
            0x42, 0xf2, 0x98, 0xc4, 0xb6, 0x7e, 0xdb, 0x2a
        ];
        inputs.extend(attester_pubkey_x.iter().map(|b| b.to_string()));

        // coinbase_attester_pubkey_y [32]
        let attester_pubkey_y: [u8; 32] = [
            0xe7, 0xeb, 0xa4, 0xbb, 0x99, 0x49, 0x03, 0x60,
            0x46, 0x6c, 0x94, 0xe3, 0x91, 0x48, 0xd8, 0x92,
            0x9d, 0xb3, 0x31, 0xa5, 0x2c, 0xa9, 0x7b, 0xfc,
            0x92, 0xc5, 0xfa, 0x22, 0xa8, 0xa1, 0x36, 0x2a
        ];
        inputs.extend(attester_pubkey_y.iter().map(|b| b.to_string()));

        // coinbase_signer_merkle_proof [[u8; 32]; 8]
        let merkle_proof: [[u8; 32]; 8] = [
            [0x1f, 0xb8, 0x5b, 0x65, 0xf4, 0xc4, 0x92, 0x97, 0x96, 0xfc, 0x44, 0x35, 0x72, 0x69, 0x7e, 0xc3, 0xc8, 0x71, 0x95, 0xf7, 0x05, 0x2f, 0xd8, 0x0c, 0xcb, 0xee, 0xab, 0x7b, 0x1d, 0x28, 0x5e, 0xa5],
            [0xb2, 0x7c, 0xbe, 0x1e, 0x62, 0xa1, 0x6d, 0xa3, 0x76, 0xe5, 0x6c, 0x0b, 0xca, 0x72, 0xa9, 0x13, 0xec, 0x23, 0x6b, 0x11, 0x9e, 0xcc, 0x62, 0x0b, 0xd0, 0x7b, 0x87, 0x2d, 0x44, 0xd7, 0xec, 0xd2],
            [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32]
        ];
        for proof_elem in &merkle_proof {
            inputs.extend(proof_elem.iter().map(|b| b.to_string()));
        }

        // coinbase_signer_leaf_index (u32)
        inputs.push("0".to_string());

        // merkle_proof_depth (u32)
        inputs.push("2".to_string());

        println!("Total inputs: {}", inputs.len());
        println!("First 10 inputs: {:?}", &inputs[..10]);

        // Generate VK
        println!("\n=== Generating VK ===");
        let vk = get_noir_verification_keccak_key(
            COINBASE_CIRCUIT_FILE.to_string(),
            Some(COINBASE_SRS_FILE.to_string()),
            false, // disable_zk = false (ZK mode ON)
            false, // low_memory_mode
        ).expect("Failed to generate VK");
        println!("VK size: {} bytes", vk.len());

        // Generate proof
        println!("\n=== Generating Proof ===");
        let proof = generate_noir_proof_with_keccak(
            COINBASE_CIRCUIT_FILE.to_string(),
            Some(COINBASE_SRS_FILE.to_string()),
            inputs,
            false, // disable_zk = false (ZK mode ON)
            vk.clone(),
            false, // low_memory_mode
        ).expect("Failed to generate proof");

        println!("Mopro proof size: {} bytes", proof.len());
        println!("Expected: 18304 bytes (2048 public_inputs + 16256 proof)");

        // Extract public inputs (first 2048 bytes = 64 fields)
        let public_inputs_bytes = &proof[..2048];
        let proof_bytes = &proof[2048..];

        println!("\n=== Proof Structure ===");
        println!("Public inputs size: {} bytes", public_inputs_bytes.len());
        println!("Proof size: {} bytes (expected: 16256)", proof_bytes.len());

        // Compare with nargo proof
        let nargo_proof = std::fs::read("../circuits/coinbase-kyc/target/proof/proof")
            .expect("Failed to read nargo proof");
        let nargo_public_inputs = std::fs::read("../circuits/coinbase-kyc/target/proof/public_inputs")
            .expect("Failed to read nargo public inputs");

        println!("\n=== Nargo Files ===");
        println!("Nargo proof size: {} bytes", nargo_proof.len());
        println!("Nargo public_inputs size: {} bytes", nargo_public_inputs.len());

        // Compare first 64 bytes of proof
        println!("\n=== First 64 bytes of PROOF comparison ===");
        println!("Mopro : {:02x?}", &proof_bytes[..64.min(proof_bytes.len())]);
        println!("Nargo : {:02x?}", &nargo_proof[..64.min(nargo_proof.len())]);

        let proofs_match = proof_bytes.len() == nargo_proof.len() &&
            proof_bytes.iter().zip(nargo_proof.iter()).all(|(a, b)| a == b);
        println!("\nProofs match: {}", proofs_match);

        // Compare public inputs
        println!("\n=== First 64 bytes of PUBLIC INPUTS comparison ===");
        println!("Mopro : {:02x?}", &public_inputs_bytes[..64.min(public_inputs_bytes.len())]);
        println!("Nargo : {:02x?}", &nargo_public_inputs[..64.min(nargo_public_inputs.len())]);

        let public_inputs_match = public_inputs_bytes.len() == nargo_public_inputs.len() &&
            public_inputs_bytes.iter().zip(nargo_public_inputs.iter()).all(|(a, b)| a == b);
        println!("\nPublic inputs match: {}", public_inputs_match);

        // If they don't match, find first difference
        if !proofs_match {
            for (i, (a, b)) in proof_bytes.iter().zip(nargo_proof.iter()).enumerate() {
                if a != b {
                    println!("\nFirst proof difference at byte {}: mopro={:02x}, nargo={:02x}", i, a, b);
                    println!("Context (mopro bytes {}..{}): {:02x?}", i.saturating_sub(4), i+5, &proof_bytes[i.saturating_sub(4)..(i+5).min(proof_bytes.len())]);
                    println!("Context (nargo bytes {}..{}): {:02x?}", i.saturating_sub(4), i+5, &nargo_proof[i.saturating_sub(4)..(i+5).min(nargo_proof.len())]);
                    break;
                }
            }
        }

        // Verify with mopro
        println!("\n=== Off-chain Verification ===");
        let is_valid = verify_noir_proof_with_keccak(
            COINBASE_CIRCUIT_FILE.to_string(),
            proof.clone(),
            false,
            vk,
            false,
        );
        println!("Mopro off-chain verification: {}", is_valid);

        // Save proof for on-chain testing
        let proof_hex: String = proof_bytes.iter().map(|b| format!("{:02x}", b)).collect();
        std::fs::write("/tmp/mopro_proof.hex", &proof_hex).expect("Failed to write proof");
        println!("\n=== Saved mopro proof to /tmp/mopro_proof.hex ===");
        println!("Proof hex (first 128 chars): {}...", &proof_hex[..128.min(proof_hex.len())]);

        // Format public inputs for Solidity
        println!("\n=== Public Inputs for On-Chain (bytes32[]) ===");
        for i in 0..64 {
            let start = i * 32;
            let end = start + 32;
            let field: String = public_inputs_bytes[start..end].iter().map(|b| format!("{:02x}", b)).collect();
            println!("0x{}", field);
        }

        assert!(is_valid, "Off-chain verification should pass");
    }
}
