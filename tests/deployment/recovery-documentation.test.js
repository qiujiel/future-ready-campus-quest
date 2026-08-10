import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (name) => readFile(
  `${process.cwd()}/docs/operations/${name}`,
  "utf8",
);

const productionProjectRef = "ghohuwwjxgjqnbsauvzq";
const loadProjectRef = "vadyhuipwbtgbzpeisbn";

const disposableAggregateContract = [
  "exactly one Auth account marked by `course-owner-2026-08-08` and no other Auth account",
  "exactly one unarchived `Production Classroom` cohort owned by that marked teacher, exactly five groups, no other cohort, and closed joining/quest start",
  "zero join-window rows, session-control rows, open joining rows, open quest-start rows, cohort group join-code rows, and audit-event rows",
  "zero private/public student profiles, quest attempts, phase progress, responses, concept evidence, attempt items, reflections, results, and team score snapshots",
  "zero student join requests, student credentials, non-teacher sessions, student-login attempts, join attempts, and recovery attempts",
  "zero group-identity receipts, group-media assets, teacher-control audits, teacher-roster-control receipts, quest launches, and quest-launch receipts",
  "zero objects in the private `group-images` bucket",
  "no query error, malformed aggregate, identity mismatch, or load-project target",
];

const assertDisposablePolicy = ({ runbook, backend, checklist, readiness, github, rollback, privacy }) => {
  for (const document of [runbook, backend, checklist, readiness, github, rollback, privacy]) {
    expect(document).toContain(productionProjectRef);
    expect(document).toContain(loadProjectRef);
  }

  for (const phrase of disposableAggregateContract) expect(runbook).toContain(phrase);
  expect(runbook).toMatch(/logs only aggregate counts and a boolean\s+classification/i);
  expect(runbook).toMatch(/never deletes? data to make the preflight pass/i);
  expect(runbook).toMatch(/nonzero or unverifiable protected state.*fails before mutation/i);
  expect(runbook).toMatch(/student.*response.*upload.*unmarked account.*unexpected classroom state.*stops working/is);

  expect(backend).toContain("`disposable-upgrade`");
  expect(backend).toContain("`bootstrap`");
  expect(backend).toMatch(/`disposable-upgrade` requires the bootstrap identifier to be empty/i);
  expect(backend).toMatch(/disposable-state preflight.*before.*production link.*migration.*secret update.*Function deployment/is);
  expect(backend).toMatch(/exact approved 40-character\s+`main` SHA/i);
  expect(backend).toMatch(/exact production project ref.*ghohuwwjxgjqnbsauvzq/is);
  expect(backend).toMatch(/migration dry run/i);
  expect(backend).toMatch(/forward-only/i);
  expect(backend).toMatch(/no reset, deletion, or migration-history repair/i);
  expect(backend).toContain("6,882.59");
  expect(backend).toContain("1,660.52");
  expect(backend).toMatch(/at or below 7 seconds/i);

  expect(checklist).toContain("`disposable-upgrade`");
  expect(checklist).toMatch(/aggregate disposable-state preflight.*before mutation/is);
  expect(checklist).toMatch(/exact approved 40-character\s+`main` SHA/i);
  expect(checklist).toMatch(/one-time join p95 at or below 7 seconds/i);
  expect(checklist).toMatch(/6,882\.59 ms overall.*1,660\.52 ms preflight/is);
  expect(checklist).not.toMatch(/reviewer/i);
  expect(checklist).not.toMatch(/backup/i);
  expect(checklist).not.toMatch(/restore rehearsal/i);
  expect(checklist).not.toMatch(/cloud.?copy|offline.?copy/i);
  expect(checklist).not.toMatch(/\bage\b/i);

  expect(readiness).toMatch(/Decision: HOLD/i);
  expect(readiness).toMatch(/disposable-state preflight/i);
  expect(readiness).toMatch(/fail-closed when any user data\s+exists/i);
  expect(readiness).toMatch(/repository completion does not authorize deployment/i);
  expect(readiness).not.toMatch(/backup evidence|restore rehearsal|independent reviewer/i);

  expect(github).toMatch(/`disposable-upgrade` and `bootstrap` are the only backend dispatch modes/i);
  expect(github).toMatch(/no backup.*database connection string.*Storage administration key.*encryption key.*protected manifest/is);
  expect(github).toMatch(/production-backend.*main/is);
  expect(github).toMatch(/no second human\s+reviewer is required while the\s+disposable-state preflight passes/i);
  for (const safeguard of [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_BASE_PATH",
    "PRODUCTION_FRONTEND_ORIGIN",
    "ALLOWED_FRONTEND_ORIGINS",
    "FRONTEND_APP_URL",
    "JOIN_TOKEN_SIGNING_SECRET",
    "RECOVERY_TOKEN_SIGNING_SECRET",
    "STUDENT_LOGIN_SIGNING_SECRET",
    "PRODUCTION_READINESS_SECRET",
    "PRODUCTION_SUPABASE_SECRET_KEY",
  ]) expect(github).toContain(safeguard);
  expect(github).toMatch(/ALLOWED_FRONTEND_ORIGINS.*exactly equal.*PRODUCTION_FRONTEND_ORIGIN/is);
  expect(github).toMatch(/FRONTEND_APP_URL.*VITE_BASE_PATH/is);
  expect(github).toMatch(/STUDENT_LOGIN_SIGNING_SECRET.*production-backend.*never.*frontend/is);

  for (const importControl of [
    "PROTECTED_CONTENT_BANK_JSON",
    "production-content-import.yml",
    "--confirm-project-ref=<exact-production-ref>",
    "--expected-content-version=<approved-version>",
    "24-item/8-concept receipt",
    "never uploads the source as an artifact",
  ]) expect(backend).toContain(importControl);
  expect(backend).toMatch(/exact approved.*SHA.*exact production.*ref.*content version/is);
  expect(backend).toMatch(/always removes.*temporary file/is);

  expect(rollback).toMatch(/forward redeployment from the\s+exact reviewed Git SHA/i);
  expect(rollback).toMatch(/re-import.*protected content.*recreation.*marked teacher.*classroom fixture/is);
  expect(rollback).toMatch(/immutable artifacts/i);
  expect(rollback).toMatch(/no database reset, deletion, migration-history repair, or\s+fabricated backup evidence/i);
  expect(rollback).toMatch(/protected-content import.*exact reviewed SHA.*exact production ref.*approved content version/is);
  expect(rollback).toMatch(/environment\s+secret.*no artifact.*cleanup.*24-item\/8-concept\s+receipt/is);

  expect(privacy).toMatch(/disposable.*ghohuwwjxgjqnbsauvzq/is);
  expect(privacy).toMatch(/forward redeployment.*exact reviewed Git SHA.*protected content.*marked teacher.*closed classroom\s+fixture/is);
  expect(privacy).toMatch(/any student.*response.*upload.*unmarked account.*unexpected classroom state.*data-bearing recovery strategy/is);
  expect(privacy).not.toMatch(/two-copy custody rule|latest three successful pre-release backups|age.*private identity|restore rehearsal/i);
};

describe("disposable production recovery policy", () => {
  it("documents the fail-closed aggregate state gate and disposable rebuild path", async () => {
    assertDisposablePolicy({
      runbook: await read("free-plan-recovery.md"),
      backend: await read("backend-release.md"),
      checklist: await read("release-checklist.md"),
      readiness: await read("deployment-readiness-review.md"),
      github: await read("github-environments.md"),
      rollback: await read("rollback.md"),
      privacy: await read("privacy-and-retention.md"),
    });
  });
});
