import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { ENVIRONMENTS, parseApiUrl, parseEnv } from './src/config';
import { lookupNetwork } from '../sdk/src/circuits';

// The SDK is used from source in this monorepo, so the page always runs the
// SDK of the same commit.
const sdkSource = fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url));

/**
 * Writes connect-src.txt: every origin the page may connect to (its relay over
 * HTTPS and WebSocket, and the RPC its answers are verified against), taken
 * from the same tables the page uses. The nginx stage builds the CSP from it.
 */
function connectSources(apiUrl: string, rpcUrl: string): Plugin {
  const origins = [apiUrl, apiUrl.replace(/^http/, 'ws'), new URL(rpcUrl).origin];
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
  return { plugins, resolve: { alias: { '@kproof/sdk': sdkSource } }, build: { sourcemap: true } };
});
