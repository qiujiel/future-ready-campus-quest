import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function normalizeBasePath(value: string | undefined): string {
  const base = value?.trim() || "/";
  return `/${base.replace(/^\/+|\/+$/g, "")}${base === "/" ? "" : "/"}`;
}

export function contentSecurityPolicy(
  supabaseUrl: string | undefined,
  development: boolean,
): string {
  const connectSources = new Set(["'self'"]);
  const imageSources = new Set(["'self'", "data:", "blob:"]);
  const styleSources = new Set(["'self'"]);

  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    connectSources.add(url.origin);
    connectSources.add(`${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
    imageSources.add(url.origin);
  }

  if (development) {
    connectSources.add("ws://localhost:*");
    connectSources.add("ws://127.0.0.1:*");
    // Vite injects imported CSS through a style element while serving locally.
    styleSources.add("'unsafe-inline'");
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${[...connectSources].join(" ")}`,
    "font-src 'self'",
    `img-src ${[...imageSources].join(" ")}`,
    "object-src 'none'",
    "script-src 'self'",
    `style-src ${[...styleSources].join(" ")}`,
    "form-action 'self'",
    "worker-src 'self' blob:",
  ].join("; ");
}

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, process.cwd(), "VITE_");
  const csp = contentSecurityPolicy(
    environment.VITE_SUPABASE_URL,
    command === "serve",
  );

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
    plugins: [
      {
        name: "campus-quest-security-headers",
        transformIndexHtml(html) {
          return html.replace(
            "<!-- CAMPUS_QUEST_CSP -->",
            `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
          );
        },
      },
      react(),
    ],
    test: {
      environment: "jsdom",
      exclude: ["tests/e2e/**", "node_modules/**"],
      globals: true,
      include: ["tests/**/*.test.{js,ts,tsx}"],
      setupFiles: "./src/test/setup.ts",
      restoreMocks: true,
    },
  };
});
