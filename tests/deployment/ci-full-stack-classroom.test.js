import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";
import { expect, it } from "vitest";

const repositoryRoot = process.cwd();
const workflow = yaml.load(
  readFileSync(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8"),
);
const packageJson = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
);
const verifySteps = workflow.jobs.verify.steps;

function namedStep(name) {
  return verifySteps.find((step) => step.name === name);
}

function runGate(environment) {
  return spawnSync(
    process.execPath,
    [resolve(repositoryRoot, "scripts/run-local-classroom-e2e.mjs")],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
    },
  );
}

it("fails closed before Playwright when the hosted-classroom prerequisites are absent", () => {
  const result = runGate({});

  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/LOCAL_CLASSROOM_E2E/);
  expect(result.stderr).toMatch(/required/i);
});

it("fails closed when Vite is not mapped to the disposable test project", () => {
  const result = runGate({
    LOCAL_CLASSROOM_E2E: "1",
    LOCAL_TEACHER_EMAIL: "ci-teacher@example.invalid",
    LOCAL_TEACHER_PASSWORD: "ci-only-teacher-password",
    TEST_SUPABASE_URL: "http://127.0.0.1:54321",
    TEST_SUPABASE_ANON_KEY: "ci-only-local-anon-key",
    VITE_SUPABASE_URL: "http://localhost:54321",
    VITE_SUPABASE_PUBLISHABLE_KEY: "ci-only-local-anon-key",
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/VITE_SUPABASE_URL must exactly match TEST_SUPABASE_URL/);
});

it("wires a dedicated hosted-classroom gate to disposable Supabase in CI", () => {
  expect(packageJson.scripts["test:e2e:classroom"]).toBe(
    "node scripts/run-local-classroom-e2e.mjs",
  );

  const credentialStep = namedStep("Export local integration credentials");
  expect(credentialStep.run).toContain('echo "VITE_SUPABASE_URL=$API_URL"');
  expect(credentialStep.run).toContain(
    'echo "VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY"',
  );

  const edgeStep = namedStep("Run black-box Edge and Auth tests");
  expect(edgeStep.env.ALLOWED_FRONTEND_ORIGINS).toContain("http://127.0.0.1:4174");
  expect(edgeStep.env.FRONTEND_APP_URL).toBe("http://127.0.0.1:4174");
  expect(edgeStep.env.TEST_FRONTEND_APP_URL).toBe("http://127.0.0.1:4174");
  expect(edgeStep.env.JOIN_TOKEN_SIGNING_SECRET).toMatch(/^ci-only-/);
  expect(edgeStep.env.RECOVERY_TOKEN_SIGNING_SECRET).toMatch(/^ci-only-/);
  expect(edgeStep.env.STUDENT_LOGIN_SIGNING_SECRET).toMatch(/^ci-only-/);
  expect(JSON.stringify(edgeStep.env)).not.toContain("secrets.");
  expect(edgeStep.run).toContain("supabase functions serve");
  expect(edgeStep.run).toContain("--env-file /tmp/campus-quest-functions.env");
  expect(edgeStep.run).toContain("pnpm test:integration");

  const bootstrapStep = namedStep("Bootstrap disposable full-stack classroom");
  expect(bootstrapStep.env).toEqual({
    LOCAL_TEACHER_EMAIL: "ci-full-stack-teacher@example.invalid",
    LOCAL_TEACHER_PASSWORD: "ci-only-full-stack-teacher-password",
    LOCAL_SYNTHETIC_CONTENT: "1",
  });
  expect(bootstrapStep.run).toContain(
    'SUPABASE_URL="$TEST_SUPABASE_URL"',
  );
  expect(bootstrapStep.run).toContain(
    'SUPABASE_SERVICE_ROLE_KEY="$TEST_SUPABASE_SERVICE_ROLE_KEY"',
  );
  expect(bootstrapStep.run).toContain("tests/fixtures/public-synthetic-bank.json");
  expect(bootstrapStep.run).not.toContain("echo");

  const gateStep = namedStep("Run hosted classroom full-stack gate");
  expect(gateStep.env).toEqual({
    LOCAL_CLASSROOM_E2E: "1",
    LOCAL_TEACHER_EMAIL: bootstrapStep.env.LOCAL_TEACHER_EMAIL,
    LOCAL_TEACHER_PASSWORD: bootstrapStep.env.LOCAL_TEACHER_PASSWORD,
  });
  expect(JSON.stringify([bootstrapStep, gateStep])).not.toMatch(
    /\$\{\{\s*env\.(?:TEST|VITE)_SUPABASE_/,
  );
  expect(gateStep.run).toBe("pnpm test:e2e:classroom");
  expect(namedStep("Run browser smoke tests").run).toBe("pnpm playwright test");

  const bootstrapIndex = verifySteps.indexOf(bootstrapStep);
  const gateIndex = verifySteps.indexOf(gateStep);
  expect(bootstrapIndex).toBeGreaterThan(
    verifySteps.indexOf(namedStep("Run black-box Edge and Auth tests")),
  );
  expect(gateIndex).toBeGreaterThan(bootstrapIndex);
});
