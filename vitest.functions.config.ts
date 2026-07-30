import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["supabase/tests/**/*.test.ts"],
    restoreMocks: true,
  },
});
