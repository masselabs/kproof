import { defineConfig } from 'vitest/config';

// Talks to the real Base Sepolia RPC and the deployed verifiers.
export default defineConfig({ test: { environment: 'node', include: ['e2e/**/*.e2e.test.ts'], testTimeout: 60_000 } });
