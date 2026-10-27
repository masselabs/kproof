import { defineConfig, loadEnv } from 'vite';
import { parseApiUrl, parseEnv } from './src/config';

// Fail the build, not the page, when the target relay is missing or malformed.
export default defineConfig(({ mode, command }) => {
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
    parseApiUrl(env.VITE_KPROOF_API_URL);
    parseEnv(env.VITE_KPROOF_ENV);
  }
  return { build: { sourcemap: true } };
});
