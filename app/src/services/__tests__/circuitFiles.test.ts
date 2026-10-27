import {AppError} from '../../errors';
import {CIRCUITS_SOURCE, CIRCUIT_IDS, artifactsFor, circuitFileUrl} from '../../config/circuits';
import {ensureCircuitFiles, type FsPort} from '../circuitFiles';

function fakeFs(serve: (url: string) => {status: number; sha: string} | Error) {
  const files = new Map<string, string>(); // path -> sha
  const downloads: string[] = [];
  const fs: FsPort = {
    documentDir: '/docs',
    exists: async (p) => files.has(p) || p === '/docs/circuits/masselabs__kproof/' + CIRCUITS_SOURCE.commit,
    mkdir: async () => undefined,
    unlink: async (p) => void files.delete(p),
    sha256: async (p) => files.get(p)!,
    download: async (url, path) => {
      downloads.push(url);
      const r = serve(url);
      if (r instanceof Error) {
        files.set(path, 'partial');
        throw r;
      }
      files.set(path, r.sha);
      return r.status;
    },
  };
  return {fs, files, downloads};
}

const rightSha = (url: string) => {
  for (const id of CIRCUIT_IDS) {
    const a = artifactsFor(CIRCUITS_SOURCE, id);
    for (const f of [a.json, a.srs, a.vk]) if (url === circuitFileUrl(CIRCUITS_SOURCE, f)) return f.sha256;
  }
  throw new Error(`unexpected url ${url}`);
};

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
  throw new Error('expected failure');
}

describe('circuit files', () => {
  test('downloads from the pinned commit and accepts matching digests', async () => {
    const {fs, downloads} = fakeFs((url) => ({status: 200, sha: rightSha(url)}));
    const paths = await ensureCircuitFiles(fs, CIRCUITS_SOURCE, 'mdl_kr_age', () => undefined);
    expect(paths.json).toBe(`/docs/circuits/masselabs__kproof/${CIRCUITS_SOURCE.commit}/mdl_kr_age.json`);
    expect(downloads).toEqual([
      `https://raw.githubusercontent.com/masselabs/kproof/${CIRCUITS_SOURCE.commit}/circuits/mdl/kr-age/target/mdl_kr_age.json`,
      `https://raw.githubusercontent.com/masselabs/kproof/${CIRCUITS_SOURCE.commit}/circuits/mdl/kr-age/target/mdl_kr_age.srs`,
      `https://raw.githubusercontent.com/masselabs/kproof/${CIRCUITS_SOURCE.commit}/circuits/mdl/kr-age/target/vk/vk`,
    ]);
    // Second call: everything cached and re-verified, nothing downloaded.
    downloads.length = 0;
    await ensureCircuitFiles(fs, CIRCUITS_SOURCE, 'mdl_kr_age', () => undefined);
    expect(downloads).toEqual([]);
  });

  test('a digest that differs from the pinned one is deleted and refused', async () => {
    const {fs, files} = fakeFs(() => ({status: 200, sha: 'f'.repeat(64)}));
    expect(await codeOf(ensureCircuitFiles(fs, CIRCUITS_SOURCE, 'mdl_kr_region', () => undefined))).toBe('E2003');
    expect([...files.keys()]).toEqual([]);
  });

  test('a corrupted cached file is downloaded again', async () => {
    const {fs, files, downloads} = fakeFs((url) => ({status: 200, sha: rightSha(url)}));
    await ensureCircuitFiles(fs, CIRCUITS_SOURCE, 'mdl_kr_ownership', () => undefined);
    const json = [...files.keys()].find((p) => p.endsWith('.json'))!;
    files.set(json, 'truncated');
    downloads.length = 0;
    await ensureCircuitFiles(fs, CIRCUITS_SOURCE, 'mdl_kr_ownership', () => undefined);
    expect(downloads).toHaveLength(1);
  });

  test('HTTP errors and dropped downloads leave no file behind', async () => {
    const http = fakeFs(() => ({status: 404, sha: 'x'}));
    expect(await codeOf(ensureCircuitFiles(http.fs, CIRCUITS_SOURCE, 'mdl_kr_age', () => undefined))).toBe('E2003');
    expect(http.files.size).toBe(0);
    const drop = fakeFs(() => new Error('connection reset'));
    expect(await codeOf(ensureCircuitFiles(drop.fs, CIRCUITS_SOURCE, 'mdl_kr_age', () => undefined))).toBe('E2003');
    expect(drop.files.size).toBe(0);
  });

  test('an unpinned source or a malformed one throws', () => {
    expect(() => artifactsFor({...CIRCUITS_SOURCE, commit: 'a'.repeat(40)}, 'mdl_kr_age')).toThrow(/No circuit files are pinned/);
    expect(() => artifactsFor({...CIRCUITS_SOURCE, repo: 'zkproofport/circuits'}, 'mdl_kr_age')).toThrow(/No circuit files are pinned/);
    expect(() => artifactsFor(CIRCUITS_SOURCE, 'toString' as never)).toThrow(/Unknown circuit/);
    const file = artifactsFor(CIRCUITS_SOURCE, 'mdl_kr_age').vk;
    expect(() => circuitFileUrl({...CIRCUITS_SOURCE, commit: 'main'}, file)).toThrow(/40-character/);
    expect(() => circuitFileUrl({...CIRCUITS_SOURCE, commit: '35a8df4'}, file)).toThrow(/40-character/);
    expect(() => circuitFileUrl({...CIRCUITS_SOURCE, repo: '../x'}, file)).toThrow(/owner/);
    expect(() => circuitFileUrl({...CIRCUITS_SOURCE, root: 'circuits'}, file)).toThrow(/root/);
    expect(circuitFileUrl({repo: 'masselabs/kproof', commit: 'b'.repeat(40), root: 'circuits/'}, file)).toBe(
      `https://raw.githubusercontent.com/masselabs/kproof/${'b'.repeat(40)}/circuits/mdl/kr-age/target/vk/vk`,
    );
  });
});
