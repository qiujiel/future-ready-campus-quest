import { spawnSync } from "node:child_process";

const PRODUCTION_FUNCTIONS = Object.freeze([
  "complete-quest",
  "export-cohort",
  "get-next-item",
  "join-cohort",
  "manage-group-identity",
  "manage-join-window",
  "production-readiness",
  "recover-student",
  "student-login",
  "submit-response",
  "teacher-controls",
  "teacher-dashboard",
]);

const projectRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF;
if (!projectRef) {
  throw new Error("Missing PRODUCTION_SUPABASE_PROJECT_REF.");
}

for (const functionName of PRODUCTION_FUNCTIONS) {
  const result = spawnSync(
    "pnpm",
    ["exec", "supabase", "functions", "deploy", functionName, "--project-ref", projectRef],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
