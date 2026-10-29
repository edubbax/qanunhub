import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { fileParallelism: false, testTimeout: 30_000, env: { NODE_ENV: 'test', APP_ORIGIN: 'https://qanunhub.az' } },
});
