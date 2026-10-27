/**
 * Circuit files on the phone: downloaded once from the pinned circuits
 * commit, and accepted only when their sha256 equals the pinned digest
 * (config/circuits.ts). A file on disk is re-hashed before every use, so a
 * truncated or replaced file is never handed to the prover.
 */
import {AppError} from '../errors';
import {artifactsFor, circuitFileUrl, type CircuitFile, type CircuitId, type CircuitsSource} from '../config/circuits';

export interface FsPort {
  documentDir: string;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  unlink(path: string): Promise<void>;
  /** Lowercase hex sha256 of the file. */
  sha256(path: string): Promise<string>;
  /** Download to `path`; resolves with the HTTP status. */
  download(url: string, path: string): Promise<number>;
}

export interface CircuitPaths {
  json: string;
  srs: string;
  vk: string;
}

/** One directory per source, so files from two sources never mix. */
export function circuitDir(fs: FsPort, source: CircuitsSource): string {
  return `${fs.documentDir}/circuits/${source.repo.replace('/', '__')}/${source.commit}`;
}

async function ensureFile(fs: FsPort, source: CircuitsSource, file: CircuitFile, dest: string, log: (m: string) => void): Promise<void> {
  if (await fs.exists(dest)) {
    const digest = await fs.sha256(dest);
    if (digest === file.sha256) return;
    log(`[circuits] ${file.path}: cached digest ${digest} is not the pinned ${file.sha256}; downloading again`);
    await fs.unlink(dest);
  }
  const url = circuitFileUrl(source, file);
  log(`[circuits] downloading ${url}`);
  let status: number;
  try {
    status = await fs.download(url, dest);
  } catch (err) {
    if (await fs.exists(dest)) await fs.unlink(dest);
    throw new AppError('E2003', `download of ${file.path} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (status !== 200) {
    if (await fs.exists(dest)) await fs.unlink(dest);
    throw new AppError('E2003', `download of ${file.path} answered HTTP ${status}`);
  }
  const digest = await fs.sha256(dest);
  if (digest !== file.sha256) {
    await fs.unlink(dest);
    throw new AppError('E2003', `${file.path}: downloaded digest ${digest} is not the pinned ${file.sha256}`);
  }
}

export async function ensureCircuitFiles(
  fs: FsPort,
  source: CircuitsSource,
  circuit: CircuitId,
  log: (m: string) => void,
): Promise<CircuitPaths> {
  const artifacts = artifactsFor(source, circuit);
  const dir = circuitDir(fs, source);
  if (!(await fs.exists(dir))) await fs.mkdir(dir);
  const paths: CircuitPaths = {
    json: `${dir}/${circuit}.json`,
    srs: `${dir}/${circuit}.srs`,
    vk: `${dir}/${circuit}.vk`,
  };
  await ensureFile(fs, source, artifacts.json, paths.json, log);
  await ensureFile(fs, source, artifacts.srs, paths.srs, log);
  await ensureFile(fs, source, artifacts.vk, paths.vk, log);
  return paths;
}
