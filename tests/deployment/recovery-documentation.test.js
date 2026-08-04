import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (name) => readFile(
  `${process.cwd()}/docs/operations/${name}`,
  "utf8",
);

const dumpCommands = [
  "pnpm exec supabase db dump --linked -f \"$staging_dir/roles.sql\" --role-only",
  "pnpm exec supabase db dump --linked -f \"$staging_dir/schema.sql\"",
  "pnpm exec supabase db dump --linked -f \"$staging_dir/data.sql\" --use-copy --data-only -x \"storage.buckets_vectors\" -x \"storage.vector_indexes\"",
  "pnpm exec supabase db dump --linked -f \"$staging_dir/history_schema.sql\" --schema supabase_migrations",
  "pnpm exec supabase db dump --linked -f \"$staging_dir/history_data.sql\" --use-copy --data-only --schema supabase_migrations",
];

const productionProjectRef = "ghohuwwjxgjqnbsauvzq";
const loadProjectRef = "vadyhuipwbtgbzpeisbn";
const productionUrl = `https://${productionProjectRef}.supabase.co`;

const sourceCountTables = [
  "`auth.users`",
  "`public.cohorts`",
  "`public.student_private_profiles`",
  "`public.student_public_profiles`",
  "`public.quest_attempts`",
  "`public.student_responses`",
  "`public.concept_evidence`",
  "`public.audit_events`",
];

const remoteApprovalLabels = [
  "Recovery custodian and key provisioning",
  "Cloud and offline custody locations",
  "Production read/export window",
  "Load-test project pause",
  "Temporary recovery project creation",
  "Restore operation",
  "Optional rehearsal deployment",
  "Temporary recovery project deletion",
  "Load-test project reactivation",
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

const rejectPatterns = (source, patterns) => {
  for (const pattern of patterns) expect(source).not.toMatch(pattern);
};

const section = (source, heading) => {
  const marker = `## ${heading}`;
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\n## ", start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
};

const escapePattern = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertRunbookPolicy = (runbook) => {
  const authority = section(runbook, "Authority and project identities");
  const staging = section(runbook, "Phase A — approve and quiesce production");
  const database = section(
    runbook,
    "Phase B — export roles, schema, data, and migration history",
  );
  const storage = section(runbook, "Phase C — export and inventory `group-images`");
  const packagePhase = section(runbook, "Phase D — package, encrypt, copy, and verify");
  const rehearsalProject = section(
    runbook,
    "Phase F — create the temporary Singapore recovery project with approval",
  );
  const validation = section(runbook, "Phase G — restore and validate with approval");
  const githubEvidence = section(runbook, "GitHub evidence entry");

  assertPhrases(runbook, [
    ...dumpCommands,
    productionProjectRef,
    loadProjectRef,
    productionUrl,
    "This runbook documents commands for an explicitly approved future operation.",
    "It is not authorization",
    "interactive hidden prompt",
    "never place it or a connection",
    "approved_checkout=\"$(git rev-parse --show-toplevel)\"",
    "umask 077",
    "mktemp -d",
    "trap cleanup EXIT HUP INT TERM",
    "age --recipients-file",
    "cloud-copy and offline-copy",
    "less than 24 hours",
    "no write occurred after its recovery point",
    "aggregate-only evidence",
    "latest three",
    "at least 30 days",
    "Storage export procedure `storage-export-v1`",
    "fixed page size of `100`",
    "continue until a page returns fewer than `100` entries",
    "reject duplicate object paths",
    "second complete source digest inventory",
    "disable automatic exposure of new tables",
    "archive creation/completion time",
    "quiesced recovery point",
    "approved full 40-character source SHA",
    "obtain a new",
    "Obtain separate approval to create",
    "After separate restore approval",
    "obtain explicit approval to delete",
    "Obtain separate approval to reactivate",
  ]);
  assertPatterns(runbook, [
    /never.*restore.*vadyhuipwbtgbzpeisbn/is,
    /Do not embed.*object\s+paths.*commands, logs/is,
    /target counts[\s\S]*exactly equal[\s\S]*source counts/is,
    /independent reviewer[\s\S]*source-to-target count comparison/is,
  ]);

  assertPhrases(authority, [productionProjectRef, loadProjectRef, productionUrl]);
  assertPhrases(staging, [
    "approved_checkout=\"$(git rev-parse --show-toplevel)\"",
    "cd \"$approved_checkout\"",
  ]);
  assertPhrases(database, [...dumpCommands, ...sourceCountTables]);
  expect(runbook.indexOf("approved_checkout=\"$(git rev-parse --show-toplevel)\"")).toBeLessThan(
    runbook.indexOf("pnpm exec supabase link --project-ref ghohuwwjxgjqnbsauvzq"),
  );
  expect(database.indexOf("capture one quiesced source-count baseline")).toBeLessThan(
    database.indexOf(dumpCommands[0]),
  );
  assertPhrases(storage, [
    productionProjectRef,
    loadProjectRef,
    productionUrl,
    "Storage export procedure `storage-export-v1`",
    "fixed page size of `100`",
    "continue until a page returns fewer than `100` entries",
    "reject duplicate object paths",
    "second complete source digest inventory",
  ]);
  assertPatterns(packagePhase, [
    /shasum -a 256 < "\$ENCRYPTED_ARCHIVE"/,
    /shasum -a 256 < "\$CLOUD_ARCHIVE"/,
    /shasum -a 256 < "\$OFFLINE_ARCHIVE"/,
  ]);
  expect(rehearsalProject).toContain("disable automatic exposure of new tables");
  assertPatterns(validation, [
    /target counts[\s\S]*exactly equal[\s\S]*source counts/is,
  ]);
  assertPhrases(githubEvidence, [
    "archive creation/completion time",
    "quiesced recovery point",
    "component completion flags",
    "encrypted archive SHA-256 and byte size",
  ]);

  rejectPatterns(runbook, [
    /cd "\$staging_dir"/,
    /shasum -a 256\s+"\$[^"]+"/,
    /component completion flags,\s+byte sizes,\s+and digests outside/is,
    /target counts? may differ/i,
    /sampled target counts?/i,
  ]);
};

const assertBackendReleasePolicy = (backend) => {
  assertPhrases(backend, [
    "selected Supabase Free plan",
    "only accepted recovery path",
    "verified Free-plan encrypted logical",
    "restore rehearsal",
    ...recoveryInputs,
    "archive creation/completion time",
    "quiesced recovery point is recorded separately",
    "Before approving",
    "separately held release record",
    "independently verifies both custody copies",
    "attests that no write occurred after the recovery",
    "Any later plan change",
    "separately designed and validated evidence method",
  ]);
  assertPatterns(backend, [
    /only accepted recovery path[\s\S]*verified Free-plan encrypted logical/is,
    /Before approving\s+`production-backend`[\s\S]*compares all four inputs/is,
  ]);
  rejectPatterns(backend, [
    /either[^\n]*provider-managed[^\n]*or/i,
    /either a current provider-managed[\s\S]*or the verified Free-plan encrypted logical/is,
    /backup creation\/recovery-point time/i,
    /provider-managed backup\/PITR recovery point, or/i,
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
    productionProjectRef,
    loadProjectRef,
    productionUrl,
    "checked by two people",
    "distinct required-reviewer gates",
    "Backup evidence ID",
    "Quiesced recovery point",
    "`backup_created_at_utc` archive creation/completion time",
    "Encrypted archive SHA-256 and byte size",
    "Cloud-copy read-back digest and size verification",
    "Offline-copy read-back digest and size verification",
    "No-write-since-recovery-point attestation",
    "Restore rehearsal evidence ID",
    "Temporary Singapore recovery project ref",
    "Database/Auth/RLS/retention validation result",
    "`group-images` object-count/byte-total/digest validation result",
    "Rehearsal reviewer and time",
    "Pinned Supabase CLI version `2.110.0`",
    "Component-completion flags",
    "Internal manifest-to-release binding review 1",
    "Internal manifest-to-release binding review 2",
    "full approved 40-character source SHA",
    "two distinct named people",
    "source commit",
    "source project ref",
    ...remoteApprovalLabels,
    ...recoveryInputs,
    "Package evidence: artifact ID",
    "manifest SHA-256",
    "Teacher sign-in/dashboard/export",
    "**GO**",
    "**HOLD**",
    "**ROLL BACK**",
    "Release owner signature/time",
    "Independent reviewer signature/time",
    "Any unchecked item means **HOLD**",
    "No operator, owner, approver, or reviewer may waive",
  ]);

  for (const label of remoteApprovalLabels) {
    expect(checklist).toMatch(new RegExp(
      `${escapePattern(label)}[^\n]*Approver:[^\n]*UTC:[^\n]*Result:`,
      "i",
    ));
  }

  assertPatterns(checklist, [
    /Internal manifest-to-release binding review 1[^\n]*Reviewer name:[^\n]*UTC:[^\n]*Result:/i,
    /Internal manifest-to-release binding review 2[^\n]*Reviewer name:[^\n]*UTC:[^\n]*Result:/i,
    /full approved 40-character source SHA[\s\S]*source project ref[\s\S]*2\.110\.0[\s\S]*component-completion flags/is,
    /source counts[\s\S]*target counts[\s\S]*exactly equal/is,
  ]);
  rejectPatterns(checklist, [
    /Backup creation time\/recovery-point time/i,
    /may waive[^\n]*unchecked/i,
    /unchecked[^\n]*may proceed/i,
    /HOLD[^\n]*optional/i,
    /same person[^\n]*both binding reviews/i,
  ]);
};

const assertReadinessReviewPolicy = (review) => {
  assertPhrases(review, [
    "Decision: HOLD",
    productionProjectRef,
    loadProjectRef,
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
      "backup_created_at_utc",
      "quiesced recovery point",
      "encrypted archive SHA-256",
      "restore rehearsal evidence ID",
      "cloud-copy",
      "offline-copy",
      "load-test project reactivation",
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
      checklist: await read("release-checklist.md"),
      readiness: await read("deployment-readiness-review.md"),
    };
    const mutations = [
      ...dumpCommands.map((phrase) => [
        assertRunbookPolicy,
        documents.runbook,
        phrase,
      ]),
      ...[
        productionProjectRef,
        loadProjectRef,
        productionUrl,
        "approved_checkout=\"$(git rev-parse --show-toplevel)\"",
        "Storage export procedure `storage-export-v1`",
        "fixed page size of `100`",
        "continue until a page returns fewer than `100` entries",
        "reject duplicate object paths",
        "second complete source digest inventory",
        "disable automatic exposure of new tables",
        "archive creation/completion time",
        "quiesced recovery point",
        "approved full 40-character source SHA",
        "obtain a new",
        "Obtain separate approval to create",
        "After separate restore approval",
        "obtain explicit approval to delete",
        "Obtain separate approval to reactivate",
        ...sourceCountTables,
      ].map((phrase) => [assertRunbookPolicy, documents.runbook, phrase]),
      ...recoveryInputs.map((phrase) => [
        assertBackendReleasePolicy,
        documents.backend,
        phrase,
      ]),
      ...[
        "selected Supabase Free plan",
        "only accepted recovery path",
        "verified Free-plan encrypted logical",
        "Before approving",
        "separately held release record",
        "Any later plan change",
        "separately designed and validated evidence method",
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
      ...[
        productionProjectRef,
        loadProjectRef,
        productionUrl,
        "Quiesced recovery point",
        "`backup_created_at_utc` archive creation/completion time",
        "Pinned Supabase CLI version `2.110.0`",
        "Component-completion flags",
        "Internal manifest-to-release binding review 1",
        "Internal manifest-to-release binding review 2",
        "full approved 40-character source SHA",
        "two distinct named people",
        "Any unchecked item means **HOLD**",
        "No operator, owner, approver, or reviewer may waive",
        ...remoteApprovalLabels,
      ].map((phrase) => [assertChecklistPolicy, documents.checklist, phrase]),
      ...[
        "Decision: HOLD",
        "Repository completion does not authorize deployment",
        "complete every item and signature",
      ].map((phrase) => [assertReadinessReviewPolicy, documents.readiness, phrase]),
    ];

    for (const [validate, source, phrase] of mutations) {
      expect(() => validate(removeAll(source, phrase))).toThrow();
    }

    const keepaliveContradiction = documents.classroom.replace(
      "Do not generate",
      "Generate",
    );
    expect(() => assertClassSessionPolicy(keepaliveContradiction)).toThrow();

    const unsafeCwd = documents.runbook.replace(
      "cd \"$approved_checkout\"",
      "cd \"$staging_dir\"",
    );
    expect(() => assertRunbookPolicy(unsafeCwd)).toThrow();

    const linkBeforeCheckout = `pnpm exec supabase link --project-ref ${productionProjectRef}\n${documents.runbook}`;
    expect(() => assertRunbookPolicy(linkBeforeCheckout)).toThrow();

    const unsafeHash = documents.runbook.replace(
      "shasum -a 256 < \"$ENCRYPTED_ARCHIVE\"",
      "shasum -a 256 \"$ENCRYPTED_ARCHIVE\"",
    );
    expect(() => assertRunbookPolicy(unsafeHash)).toThrow();

    const countMismatchWaiver = `${documents.runbook}\nTarget counts may differ from source counts after a partial restore.`;
    expect(() => assertRunbookPolicy(countMismatchWaiver)).toThrow();

    const providerAlternative = `${documents.backend}\nEither a current provider-managed backup or the Free-plan package is accepted.`;
    expect(() => assertBackendReleasePolicy(providerAlternative)).toThrow();

    const holdWaiver = `${documents.checklist}\nAn operator may waive an unchecked item and proceed despite HOLD.`;
    expect(() => assertChecklistPolicy(holdWaiver)).toThrow();

    const sameBindingReviewer = `${documents.checklist}\nThe same person may complete both binding reviews.`;
    expect(() => assertChecklistPolicy(sameBindingReviewer)).toThrow();

    for (const [exact, mutation] of [
      [productionProjectRef, "ghohuwwjxgjqnbsauvzx"],
      [loadProjectRef, "vadyhuipwbtgbzpeisbm"],
      [productionUrl, `https://${loadProjectRef}.supabase.co`],
    ]) {
      expect(() => assertRunbookPolicy(
        documents.runbook.split(exact).join(mutation),
      )).toThrow();
    }
  });
});
