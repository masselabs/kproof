import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// E2E talks to a REAL kproof-server over HTTP and Socket.IO, and fetches the
// REAL built demo page. Both URLs are required; see e2e/demo.e2e.test.ts.
export default defineConfig({
  resolve: { alias: { '@kproof/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['e2e/**/*.e2e.test.ts'], testTimeout: 60_000 },
});
