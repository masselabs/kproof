import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@kproof/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
