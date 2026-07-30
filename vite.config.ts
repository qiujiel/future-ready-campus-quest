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
