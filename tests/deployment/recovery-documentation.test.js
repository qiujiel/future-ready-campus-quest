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
  "zero private/public student profiles, attempts, responses, concept evidence, reflections, student credentials/sessions, and join/recovery attempts",
  "zero objects in the private `group-images` bucket",
  "no query error, malformed aggregate, identity mismatch, or load-project target",
];

const assertDisposablePolicy = ({ runbook, backend, checklist, readiness, github, rollback }) => {
  for (const document of [runbook, backend, checklist, readiness, github, rollback]) {
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
  expect(github).toMatch(/no second human reviewer is required while the\s+disposable-state preflight passes/i);

  expect(rollback).toMatch(/forward redeployment from the\s+exact reviewed Git SHA/i);
  expect(rollback).toMatch(/re-import.*protected content.*recreation.*marked teacher.*classroom fixture/is);
  expect(rollback).toMatch(/immutable artifacts/i);
  expect(rollback).toMatch(/no database reset, deletion, migration-history repair, or\s+fabricated backup evidence/i);
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
    });
  });
});
