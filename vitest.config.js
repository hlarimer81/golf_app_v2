import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Scoped to src/ deliberately. Vitest's default pattern would also match e2e/*.spec.js and try
    // to run the Playwright suites, which need a browser and a built app.
    include: ['src/**/*.test.js'],

    // src/lib/handicap.js imports supabaseClient, which calls createClient() at module load and
    // throws when the URL is undefined. These values are never used — no test makes a request —
    // they just let the module import.
    env: {
      VITE_SUPABASE_URL: 'http://supabase.test',
      VITE_SUPABASE_ANON_KEY: 'unit-test-key',
    },
  },
});
