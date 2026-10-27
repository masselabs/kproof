/**
 * The three Korea Mobile ID circuits, with the canonical ids from their
 * Nargo.toml, and the exact files the app downloads for each.
 *
 * Files are read from ONE repository at ONE commit (CIRCUITS_SOURCE) and each
 * one is checked against the sha256 recorded here, copied from that commit's
 * `circuits/mdl/kr-*\/target/SHA256SUMS` and `target/vk/SHA256SUMS`. The
 * digests live in the app rather than being downloaded beside the files, so a
 * changed file on the server cannot bring its own matching manifest. Another
 * source has no row: asking for it throws instead of reading files nobody
 * checked.
 *
 * masselabs/kproof 2eecca9 carries these files byte-identical to
 * zkproofport/circuits 35a8df4 (same sha256 for every file), the commit the
 * Base Sepolia verifiers were deployed from (proofport-app-sdk
 * pinnedVerifiers.generated.ts, circuitsCommit '35a8df4'); each deployed
 * verifier's bytecode embeds the vk_hash of the key below. Built with nargo
 * 1.0.0-beta.19 / bb 4.2.0-aztecnr-rc.2, the barretenberg the mopro bindings
 * link.
 */

export const CIRCUIT_IDS = ['mdl_kr_ownership', 'mdl_kr_age', 'mdl_kr_region'] as const;
export type CircuitId = (typeof CIRCUIT_IDS)[number];

export function isCircuitId(id: unknown): id is CircuitId {
  return typeof id === 'string' && (CIRCUIT_IDS as readonly string[]).includes(id);
}

export interface CircuitFile {
  /** Path inside the circuits repository. */
  path: string;
  sha256: string;
}

export interface CircuitArtifacts {
  json: CircuitFile;
  srs: CircuitFile;
  vk: CircuitFile;
}

const SHARED_SMALL_SRS = '2063ff0d8655f90f64bda1023b486f80c99ecdfc41dd39d1340e076fdf071585';

/**
 * Where the circuit files come from: ONE repository at ONE commit. `root` is
 * the directory inside that repository the artifact paths below start from.
 * Changing this entry is the whole switch; the digests below must then be
 * re-read from the new commit's SHA256SUMS.
 */
export interface CircuitsSource {
  repo: string;
  commit: string;
  root: string;
}

export const CIRCUITS_SOURCE: CircuitsSource = {
  repo: 'masselabs/kproof',
  commit: '2eecca9958c4527765111386645e1654408eb3a0',
  root: 'circuits/',
};

/** Digests per source, keyed `<repo>@<commit>`. */
export const CIRCUIT_ARTIFACTS: Readonly<Record<string, Readonly<Record<CircuitId, CircuitArtifacts>>>> = {
  'masselabs/kproof@2eecca9958c4527765111386645e1654408eb3a0': {
    mdl_kr_ownership: {
      json: {path: 'mdl/kr-ownership/target/mdl_kr_ownership.json', sha256: '323d0401769b14f99c866263fd74aff3077e9e1059fcc187d510a18462ac6f31'},
      srs: {path: 'mdl/kr-ownership/target/mdl_kr_ownership.srs', sha256: SHARED_SMALL_SRS},
      vk: {path: 'mdl/kr-ownership/target/vk/vk', sha256: '5a8ffb281836e1090f3f3362687d4fc088ef6b0a413a5c46fa869377071bba82'},
    },
    mdl_kr_age: {
      json: {path: 'mdl/kr-age/target/mdl_kr_age.json', sha256: 'd58ce0bc24d1fab8557166c44ed612b19cdf40b017d52071250419294573392d'},
      srs: {path: 'mdl/kr-age/target/mdl_kr_age.srs', sha256: SHARED_SMALL_SRS},
      vk: {path: 'mdl/kr-age/target/vk/vk', sha256: 'b3207f9767612cf404ae48457c1dd2cf5fe600c71459a4381888de44656cb353'},
    },
    mdl_kr_region: {
      json: {path: 'mdl/kr-region/target/mdl_kr_region.json', sha256: 'd4b5c9a344f151d97fcc24b14fce0fd56d54d7fa290597d7ffd14af386a3943d'},
      srs: {path: 'mdl/kr-region/target/mdl_kr_region.srs', sha256: '49107e2302da935a175adbf5692d9944fe8ed4d272c23883027fb8a9d643fb7a'},
      vk: {path: 'mdl/kr-region/target/vk/vk', sha256: 'd4a51be6959c5e10f93ac93b7a9fc6a8fa44c6e71730e43456c5e3a33b5cddde'},
    },
  },
};

export function sourceKey(source: CircuitsSource): string {
  return `${source.repo}@${source.commit}`;
}

export function artifactsFor(source: CircuitsSource, circuit: CircuitId): CircuitArtifacts {
  const key = sourceKey(source);
  if (!Object.prototype.hasOwnProperty.call(CIRCUIT_ARTIFACTS, key)) {
    throw new Error(`No circuit files are pinned for '${key}'. Known: ${Object.keys(CIRCUIT_ARTIFACTS).join(', ')}.`);
  }
  const row = CIRCUIT_ARTIFACTS[key];
  if (!Object.prototype.hasOwnProperty.call(row, circuit)) {
    throw new Error(`Unknown circuit '${circuit}'. Known: ${Object.keys(row).join(', ')}.`);
  }
  return row[circuit];
}

export function circuitFileUrl(source: CircuitsSource, file: CircuitFile): string {
  if (!/^[0-9a-f]{40}$/.test(source.commit)) {
    throw new Error(`circuits commit must be a full 40-character sha, got '${source.commit}'`);
  }
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(source.repo)) {
    throw new Error(`circuits repo must be <owner>/<name>, got '${source.repo}'`);
  }
  if (source.root !== '' && !/^[A-Za-z0-9._/-]+\/$/.test(source.root)) {
    throw new Error(`circuits root must be '' or end with '/', got '${source.root}'`);
  }
  return `https://raw.githubusercontent.com/${source.repo}/${source.commit}/${source.root}${file.path}`;
}
