import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (name) => readFile(
  `${process.cwd()}/docs/operations/${name}`,
  "utf8",
);

const dumpCommands = [
  "pnpm exec supabase db dump --linked -f roles.sql --role-only",
  "pnpm exec supabase db dump --linked -f schema.sql",
  "pnpm exec supabase db dump --linked -f data.sql --use-copy --data-only -x \"storage.buckets_vectors\" -x \"storage.vector_indexes\"",
  "pnpm exec supabase db dump --linked -f history_schema.sql --schema supabase_migrations",
  "pnpm exec supabase db dump --linked -f history_data.sql --use-copy --data-only --schema supabase_migrations",
];

const recoveryInputs = [
  "backup_evidence_id",
  "backup_created_at_utc",
  "backup_archive_sha256",
  "restore_rehearsal_evidence_id",
];

const removeAll = (source, phrase) => {
  expect(source).toContain(phrase);
  return source.split(phrase).join("");
};

const assertPhrases = (source, phrases) => {
  for (const phrase of phrases) expect(source).toContain(phrase);
};

const assertPatterns = (source, patterns) => {
  for (const pattern of patterns) expect(source).toMatch(pattern);
};

const assertRunbookPolicy = (runbook) => {
  assertPhrases(runbook, [
    ...dumpCommands,
    "This runbook documents commands for an explicitly approved future operation.",
    "It is not authorization",
    "interactive hidden prompt",
    "never place it or a connection",
    "umask 077",
    "mktemp -d",
    "trap cleanup EXIT HUP INT TERM",
    "age --recipients-file",
    "shasum -a 256",
    "cloud-copy and offline-copy",
    "less than 24 hours",
    "no write occurred after its recovery point",
    "aggregate-only evidence",
    "latest three",
    "at least 30 days",
    "official Supabase Storage CLI/API migration guidance",
    "obtain a new",
    "Obtain separate approval to create",
    "After separate restore approval",
    "obtain explicit approval to delete",
    "Obtain separate approval to reactivate",
  ]);
  assertPatterns(runbook, [
    /never.*restore.*vadyhuipwbtgbzpeisbn/is,
    /Do not embed.*object\s+paths.*commands, logs/is,
  ]);
};

const assertBackendReleasePolicy = (backend) => {
  assertPhrases(backend, [
    "provider-managed",
    "verified Free-plan encrypted logical",
    "restore rehearsal",
    ...recoveryInputs,
    "Before approving",
    "separately held release record",
    "independently verifies both custody copies",
    "attests that no write occurred after the recovery",
  ]);
  assertPatterns(backend, [
    /either a current provider-managed[\s\S]*or the verified Free-plan encrypted logical/is,
    /Before approving\s+`production-backend`[\s\S]*compares all four inputs/is,
  ]);
};

const assertGitHubPolicy = (github) => {
  assertPhrases(github, [
    ...recoveryInputs,
    "non-secret dispatch inputs",
    "not repository or environment",
    "backup archive",
    "database connection string",
    "Storage administration key",
    "encryption key",
    "protected manifest",
    "Do not add any of those to Actions",
    "artifacts",
    "caches",
  ]);
  assertPatterns(github, [
    /They are not repository or environment\s+variables and are not repository or environment secrets/is,
    /GitHub stores no backup archive[\s\S]*protected manifest/is,
  ]);
};

const assertRollbackPolicy = (rollback) => {
  assertPhrases(rollback, [
    "Provider-managed backup or PITR path",
    "Free-plan encrypted logical-package path",
    "separately approved incident decision",
    "database Storage",
    "forward-only",
  ]);
  assertPatterns(rollback, [
    /reconcile.*group-images.*Storage evidence/is,
    /reconcile database Storage[\s\S]*group-images/is,
    /Production migrations\s+remain forward-only/is,
    /Record separate\s+incident approval/is,
  ]);
};

const assertPrivacyPolicy = (privacy) => {
  assertPhrases(privacy, [
    "two-copy custody rule",
    "latest three",
    "at least 30 days",
    "holds the `age` private identity",
    "controlled staging or hosted-rehearsal",
    "always-run cleanup trap",
    "GitHub evidence",
    "opaque identifiers, aggregate counts",
  ]);
  assertPatterns(privacy, [
    /private identity\s+separately from every archive/is,
    /Plaintext may exist\s+only.*controlled staging or hosted-rehearsal/is,
    /GitHub evidence\s+must never contain a backup/is,
  ]);
};

const assertClassSessionPolicy = (classroom) => {
  assertPhrases(classroom, [
    "early enough before class",
    "reactivate a Supabase Free project",
    "Do not generate",
    "synthetic keepalive traffic",
    "migration readiness",
    "protected-content readiness",
    "Auth health",
    "application-function method-boundary readiness",
    "before a pause is insufficient",
  ]);
  assertPatterns(classroom, [
    /reactivate a Supabase Free project paused after\s+inactivity/is,
    /Do not generate\s+synthetic keepalive traffic/is,
    /re-run migration readiness[\s\S]*protected-content readiness[\s\S]*Auth health[\s\S]*application-function method-boundary readiness/is,
  ]);
};

const assertChecklistPolicy = (checklist) => {
  assertPhrases(checklist, [
    "Default decision: HOLD",
    "checked by two people",
    "distinct required-reviewer gates",
    "Backup evidence ID",
    "Backup creation time/recovery-point time",
    "Encrypted archive SHA-256 and byte size",
    "Cloud-copy read-back digest and size verification",
    "Offline-copy read-back digest and size verification",
    "No-write-since-recovery-point attestation",
    "Restore rehearsal evidence ID",
    "Temporary Singapore recovery project ref",
    "Database/Auth/RLS/retention validation result",
    "`group-images` object-count/byte-total/digest validation result",
    "Rehearsal reviewer and time",
    "Temporary recovery project deletion approval/result",
    "Load-test project reactivated and identity/health result",
    ...recoveryInputs,
    "Package evidence: artifact ID",
    "manifest SHA-256",
    "Teacher sign-in/dashboard/export",
    "**GO**",
    "**HOLD**",
    "**ROLL BACK**",
    "Release owner signature/time",
    "Independent reviewer signature/time",
  ]);
};

const assertReadinessReviewPolicy = (review) => {
  assertPhrases(review, [
    "Decision: HOLD",
    "Repository completion does not authorize deployment",
    "encryption/recovery custodian",
    "two custody locations",
    "real production recovery",
    "hosted",
    "restore rehearsal",
    "temporary-project teardown",
    "GitHub repository/environment",
    "variables and secrets",
    "required reviewers",
    "branch",
    "production retention approval",
    "smoke teacher/cohort fixtures",
    "Free-plan pause/availability",
    "complete every item and signature",
  ]);
};

describe("Free-plan recovery operations", () => {
  it("documents complete encrypted backup custody and hosted rehearsal", async () => {
    const runbook = await read("free-plan-recovery.md");
    for (const phrase of [
      "ghohuwwjxgjqnbsauvzq",
      "vadyhuipwbtgbzpeisbn",
      "group-images",
      "roles.sql",
      "history_data.sql",
      "age",
      "SHA-256",
      "latest three",
      "30 days",
      "less than 24 hours",
      "Singapore",
    ]) expect(runbook).toContain(phrase);
    expect(runbook).toMatch(/never.*restore.*vadyhuipwbtgbzpeisbn/is);
  });

  it("requires every evidence field in the formal checklist", async () => {
    const checklist = await read("release-checklist.md");
    for (const field of [
      "backup evidence ID",
      "backup creation time",
      "encrypted archive SHA-256",
      "restore rehearsal evidence ID",
      "cloud-copy",
      "offline-copy",
      "load-test project reactivated",
    ]) expect(checklist.toLowerCase()).toContain(field.toLowerCase());
  });

  it("keeps the readiness decision on HOLD until external controls finish", async () => {
    const review = await read("deployment-readiness-review.md");
    expect(review).toMatch(/decision:\s*hold/i);
    expect(review).toContain("ghohuwwjxgjqnbsauvzq");
    expect(review).toContain("vadyhuipwbtgbzpeisbn");
    expect(review).toMatch(/GitHub.*environment/is);
    expect(review).toMatch(/restore rehearsal/is);
  });

  it("protects exact dump templates and separate remote approval gates", async () => {
    assertRunbookPolicy(await read("free-plan-recovery.md"));
  });

  it("protects backend recovery paths, inputs, and owner comparison", async () => {
    assertBackendReleasePolicy(await read("backend-release.md"));
  });

  it("protects GitHub input classification and credential exclusions", async () => {
    assertGitHubPolicy(await read("github-environments.md"));
  });

  it("protects rollback, privacy, and Free-plan class readiness", async () => {
    assertRollbackPolicy(await read("rollback.md"));
    assertPrivacyPolicy(await read("privacy-and-retention.md"));
    assertClassSessionPolicy(await read("class-session-runbook.md"));
  });

  it("protects the complete checklist and explicit HOLD blockers", async () => {
    assertChecklistPolicy(await read("release-checklist.md"));
    assertReadinessReviewPolicy(await read("deployment-readiness-review.md"));
  });

  it("rejects removal or contradiction of each binding operational control", async () => {
    const documents = {
      runbook: await read("free-plan-recovery.md"),
      backend: await read("backend-release.md"),
      github: await read("github-environments.md"),
      rollback: await read("rollback.md"),
      privacy: await read("privacy-and-retention.md"),
      classroom: await read("class-session-runbook.md"),
    };
    const mutations = [
      ...dumpCommands.map((phrase) => [
        assertRunbookPolicy,
        documents.runbook,
        phrase,
      ]),
      ...[
        "obtain a new",
        "Obtain separate approval to create",
        "After separate restore approval",
        "obtain explicit approval to delete",
        "Obtain separate approval to reactivate",
      ].map((phrase) => [assertRunbookPolicy, documents.runbook, phrase]),
      ...recoveryInputs.map((phrase) => [
        assertBackendReleasePolicy,
        documents.backend,
        phrase,
      ]),
      ...[
        "provider-managed",
        "verified Free-plan encrypted logical",
        "Before approving",
        "separately held release record",
      ].map((phrase) => [assertBackendReleasePolicy, documents.backend, phrase]),
      ...recoveryInputs.map((phrase) => [
        assertGitHubPolicy,
        documents.github,
        phrase,
      ]),
      ...[
        "non-secret dispatch inputs",
        "not repository or environment",
        "backup archive",
        "database connection string",
        "Storage administration key",
        "encryption key",
        "protected manifest",
        "artifacts",
        "caches",
      ].map((phrase) => [assertGitHubPolicy, documents.github, phrase]),
      ...[
        "Provider-managed backup or PITR path",
        "Free-plan encrypted logical-package path",
        "separately approved incident decision",
        "database Storage",
        "forward-only",
      ].map((phrase) => [assertRollbackPolicy, documents.rollback, phrase]),
      ...[
        "two-copy custody rule",
        "latest three",
        "at least 30 days",
        "holds the `age` private identity",
        "controlled staging or hosted-rehearsal",
        "GitHub evidence",
      ].map((phrase) => [assertPrivacyPolicy, documents.privacy, phrase]),
      ...[
        "early enough before class",
        "reactivate a Supabase Free project",
        "synthetic keepalive traffic",
        "migration readiness",
        "protected-content readiness",
        "Auth health",
        "application-function method-boundary readiness",
      ].map((phrase) => [assertClassSessionPolicy, documents.classroom, phrase]),
    ];

    for (const [validate, source, phrase] of mutations) {
      expect(() => validate(removeAll(source, phrase))).toThrow();
    }

    const keepaliveContradiction = documents.classroom.replace(
      "Do not generate",
      "Generate",
    );
    expect(() => assertClassSessionPolicy(keepaliveContradiction)).toThrow();
  });
});
