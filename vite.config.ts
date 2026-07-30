import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function normalizeBasePath(value: string | undefined): string {
  const base = value?.trim() || "/";
  return `/${base.replace(/^\/+|\/+$/g, "")}${base === "/" ? "" : "/"}`;
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "VITE_");

  return {
    base: normalizeBasePath(environment.VITE_BASE_PATH),
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            maxSize: 400_000,
            minSize: 20_000,
            groups: [
              {
                name: "supabase",
                test: /node_modules\/\.pnpm\/@supabase/,
              },
              {
                name: "react",
                test: /node_modules\/\.pnpm\/(react|react-dom|react-router)/,
              },
            ],
          },
        },
      },
    },
    plugins: [react()],
    test: {
      environment: "jsdom",
      exclude: ["tests/e2e/**", "node_modules/**"],
      globals: true,
      include: ["tests/**/*.test.{ts,tsx}"],
      setupFiles: "./src/test/setup.ts",
      restoreMocks: true,
    },
  };
});
