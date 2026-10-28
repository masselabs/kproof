import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { ENVIRONMENTS, parseApiUrl, parseEnv } from './src/config';
import { lookupNetwork } from '../sdk/src/circuits';
import { vkUrl } from '../sdk/src/offchain';

// The SDK is used from source in this monorepo, so the page always runs the
// SDK of the same commit. Exact matches, so the subpath is not rewritten as a
// path under the index file.
export const sdkAliases = [
  { find: /^@kproof\/sdk$/, replacement: fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)) },
  { find: /^@kproof\/sdk\/offchain$/, replacement: fileURLToPath(new URL('../sdk/src/offchain.ts', import.meta.url)) },
];

/**
 * Writes connect-src.txt: every origin the page may connect to (its relay over
 * HTTPS and WebSocket, the RPC its answers are verified against, and where the
 * off-chain verifier reads the circuits' verification keys), taken from the
 * same tables the page uses, plus `data:`, which the verifier reads its
 * WebAssembly from. The nginx stage builds the CSP from it.
 */
function connectSources(apiUrl: string, rpcUrl: string): Plugin {
  const origins = [apiUrl, apiUrl.replace(/^http/, 'ws'), new URL(rpcUrl).origin, new URL(vkUrl('mdl_kr_age')).origin, 'data:'];
  return {
    name: 'kproof-connect-sources',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'connect-src.txt', source: origins.join(' ') + '\n' });
    },
  };
}

// Fail the build, not the page, when the target relay is missing or malformed.
export default defineConfig(({ mode, command }) => {
  const plugins: Plugin[] = [];
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
    const apiUrl = parseApiUrl(env.VITE_KPROOF_API_URL);
    const network = lookupNetwork(ENVIRONMENTS[parseEnv(env.VITE_KPROOF_ENV)].verify);
    plugins.push(connectSources(apiUrl, network.rpcUrl));
  }
  return {
    plugins,
    resolve: { alias: sdkAliases },
    // The verifier ships its WebAssembly inside its own modules; pre-bundling would break its worker URLs.
    optimizeDeps: { exclude: ['@aztec/bb.js'] },
    worker: { format: 'es' },
    build: { sourcemap: true, target: 'es2022' },
  };
});
