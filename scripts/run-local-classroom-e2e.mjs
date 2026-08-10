import { spawnSync } from "node:child_process";

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`Full-stack classroom prerequisite ${name} is required.`);
  }
  return value;
}

function assertLoopbackSupabaseUrl(value) {
  const url = new URL(value);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "TEST_SUPABASE_URL must target a disposable loopback Supabase instance.",
    );
  }
}

function validateEnvironment(environment) {
  if (environment.LOCAL_CLASSROOM_E2E !== "1") {
    throw new Error(
      "Full-stack classroom prerequisite LOCAL_CLASSROOM_E2E=1 is required.",
    );
  }

  required(environment, "LOCAL_TEACHER_EMAIL");
  const password = required(environment, "LOCAL_TEACHER_PASSWORD");
  if (password.length < 12) {
    throw new Error("LOCAL_TEACHER_PASSWORD must contain at least 12 characters.");
  }

  const testUrl = required(environment, "TEST_SUPABASE_URL");
  const testAnonKey = required(environment, "TEST_SUPABASE_ANON_KEY");
  const viteUrl = required(environment, "VITE_SUPABASE_URL");
  const vitePublishableKey = required(
    environment,
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  assertLoopbackSupabaseUrl(testUrl);

  if (viteUrl !== testUrl) {
    throw new Error(
      "VITE_SUPABASE_URL must exactly match TEST_SUPABASE_URL for the full-stack classroom gate.",
    );
  }
  if (vitePublishableKey !== testAnonKey) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY must exactly match TEST_SUPABASE_ANON_KEY for the full-stack classroom gate.",
    );
  }
}

try {
  validateEnvironment(process.env);
  const result = spawnSync(
    "playwright",
    [
      "test",
      "tests/e2e/hosted-classroom.spec.ts",
      "--project=desktop-chromium",
    ],
    { env: process.env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown failure";
  console.error(`Full-stack classroom gate refused to run: ${message}`);
  process.exitCode = 1;
}
