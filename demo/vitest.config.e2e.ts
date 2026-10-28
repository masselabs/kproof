import { defineConfig } from 'vitest/config';
import { sdkAliases } from './vite.config';

// E2E talks to a REAL kproof-server over HTTP and Socket.IO, and fetches the
// REAL built demo page. Both URLs are required; see e2e/demo.e2e.test.ts.
export default defineConfig({
  resolve: { alias: sdkAliases },
  test: { environment: 'node', include: ['e2e/**/*.e2e.test.ts'], testTimeout: 60_000 },
});
