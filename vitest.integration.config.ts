import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["supabase/tests/**/*.integration.test.ts"],
    testTimeout: 20_000,
    restoreMocks: true,
  },
});
