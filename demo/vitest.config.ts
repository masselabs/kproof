import { defineConfig } from 'vitest/config';
import { sdkAliases } from './vite.config';

export default defineConfig({
  resolve: { alias: sdkAliases },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
