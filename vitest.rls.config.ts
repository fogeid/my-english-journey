import { defineConfig } from 'vitest/config'

// Testes integrados de RLS: rodam em Node contra o Supabase LOCAL (npx supabase start).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
