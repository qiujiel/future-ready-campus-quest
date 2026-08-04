# Free-Plan Production Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unavailable managed-backup prerequisite with a strict, approval-gated Free-plan recovery evidence path while keeping production, Supabase projects, GitHub configuration, and protected data untouched.

**Architecture:** A dependency-free Node module validates only redaction-safe recovery evidence, and an unprotected read-only GitHub Actions job validates that evidence before the protected backend release job becomes eligible for approval. Repository guards prevent common database and encrypted-backup artifacts from entering Git, while an operator runbook and the formal checklist define the separately approved backup, hosted rehearsal, retention, rollback, and Free-plan availability procedures.

**Tech Stack:** Node.js 24 ESM, Vitest 4, GitHub Actions YAML, existing `js-yaml` deployment validator, Supabase CLI 2.110.0 documentation, Markdown operations runbooks.

## Global Constraints

- Production project identity is exactly `ghohuwwjxgjqnbsauvzq`.
- Dedicated load-test project identity is exactly `vadyhuipwbtgbzpeisbn`; it is never a restore target.
- No implementation task may read production data, run a dump, pause/reactivate a project, create/delete a project, restore data, configure a GitHub variable/secret/environment, dispatch a workflow, approve an environment, push a migration, deploy a function, import protected content, or publish Pages.
- Tests use synthetic values and local files only; no test receives network credentials or makes a remote request.
- Recovery evidence contains only opaque IDs, lowercase SHA-256, timestamps, aggregate counts/status, reviewer identity, and project refs. It never contains SQL, rows, Storage paths, filenames, signed URLs, personal data, credentials, encryption recipients, or key material.
- A backup is eligible for one release window only, must be less than 24 hours old when the protected workflow starts, and is invalid after any production write.
- Retain each of the latest three verified backups for at least 30 days in institution-controlled cloud storage and encrypted offline/local storage.
- Backup coverage includes roles, schema, data, migration history, Storage metadata, and private `group-images` objects.
- Plaintext staging is mode `0700`, outside the checkout, always cleaned up, and encrypted with recipient-based authenticated encryption before transfer.
- Production migrations remain forward-only. Restoration is a separate incident decision, never an automatic rollback.
- Preserve the existing `production-backend`, `production-readiness`, and `github-pages` environment separation and the immutable Pages artifact digest/90-day retention controls.
- Preserve the pre-existing untracked `node_modules` worktree entry; never stage or modify it.

---

## File structure

- `scripts/recovery-evidence.mjs`: pure recovery-evidence schema, freshness validation, and a redaction-safe environment-driven CLI.
- `tests/deployment/recovery-evidence.test.js`: deterministic unit coverage for valid, malformed, stale, future, and noncanonical evidence.
- `.github/workflows/backend-production.yml`: four required non-secret inputs, a read-only evidence-validation job, and a dependency from the protected release job.
- `scripts/deployment-config.mjs`: structural enforcement that the evidence gate exists, is least privilege, receives no secrets, and precedes protected mutation.
- `tests/deployment/deployment-config.test.js`: regression coverage for evidence inputs, dependency, environment separation, and secret exclusion.
- `scripts/recovery-artifact-guard.mjs`: reusable path classifier for common recovery packages and dump outputs.
- `tests/deployment/recovery-artifact-guard.test.js`: path-level allow/deny tests that do not create protected artifacts.
- `scripts/check-repository.mjs`: integrates the recovery-artifact classifier into the existing tracked/history privacy gate.
- `docs/operations/free-plan-recovery.md`: authoritative operator procedure with approval boundaries; documentation only, never an executable deployment script.
- `docs/operations/backend-release.md`: replaces the managed-backup-only blocker and enumerates the evidence inputs.
- `docs/operations/release-checklist.md`: formal evidence, custody, rehearsal, pause/reactivation, and reviewer fields.
- `docs/operations/rollback.md`: encrypted logical-package recovery and Storage reconciliation rules.
- `docs/operations/privacy-and-retention.md`: backup custody, retention, and plaintext handling rules.
- `docs/operations/class-session-runbook.md`: early Free-project health/reactivation check.
- `docs/operations/github-environments.md`: makes clear that recovery evidence is dispatch input, not a variable or secret.
- `docs/operations/deployment-readiness-review.md`: dated independent HOLD/GO assessment and remaining external blockers.
- `tests/deployment/recovery-documentation.test.js`: deterministic policy-presence and identity-separation regression tests.

---

### Task 1: Strict recovery-evidence validator

**Files:**
- Create: `scripts/recovery-evidence.mjs`
- Create: `tests/deployment/recovery-evidence.test.js`

**Interfaces:**
- Consumes: `{ backupEvidenceId, backupCreatedAtUtc, backupArchiveSha256, restoreRehearsalEvidenceId }` and optional `{ now: Date }`.
- Produces: `validateRecoveryEvidence(input, options): Readonly<RecoveryEvidence>`, `readRecoveryEvidence(environment, options): Readonly<RecoveryEvidence>`, and a CLI that reads `BACKUP_EVIDENCE_ID`, `BACKUP_CREATED_AT_UTC`, `BACKUP_ARCHIVE_SHA256`, and `RESTORE_REHEARSAL_EVIDENCE_ID` without reading secrets.
- ID formats: `frcq-backup-YYYYMMDDTHHMMSSZ-xxxxxxxx` and `frcq-restore-YYYYMMDDTHHMMSSZ-xxxxxxxx`, where `x` is lowercase hexadecimal.
- Timestamp format: canonical UTC seconds, `YYYY-MM-DDTHH:MM:SSZ`.
- Freshness: strictly less than 24 hours old; at most five minutes in the future for clock skew.

- [ ] **Step 1: Write the failing validator tests**

Create `tests/deployment/recovery-evidence.test.js` with this coverage:

```js
import { describe, expect, it } from "vitest";
import {
  readRecoveryEvidence,
  validateRecoveryEvidence,
} from "../../scripts/recovery-evidence.mjs";

const valid = {
  backupEvidenceId: "frcq-backup-20260804T010203Z-a1b2c3d4",
  backupCreatedAtUtc: "2026-08-04T01:02:03Z",
  backupArchiveSha256: "a".repeat(64),
  restoreRehearsalEvidenceId: "frcq-restore-20260804T030405Z-b1c2d3e4",
};
const now = new Date("2026-08-04T04:00:00Z");

describe("Free-plan recovery evidence", () => {
  it("accepts canonical redaction-safe evidence within 24 hours", () => {
    expect(validateRecoveryEvidence(valid, { now })).toEqual(valid);
  });

  it("maps only the four approved environment values", () => {
    expect(readRecoveryEvidence({
      BACKUP_EVIDENCE_ID: valid.backupEvidenceId,
      BACKUP_CREATED_AT_UTC: valid.backupCreatedAtUtc,
      BACKUP_ARCHIVE_SHA256: valid.backupArchiveSha256,
      RESTORE_REHEARSAL_EVIDENCE_ID: valid.restoreRehearsalEvidenceId,
      PRODUCTION_SUPABASE_DB_PASSWORD: "ignored-secret",
    }, { now })).toEqual(valid);
  });

  it.each([
    ["backupEvidenceId", "backup-20260804"],
    ["backupArchiveSha256", "A".repeat(64)],
    ["restoreRehearsalEvidenceId", "frcq-restore-class-a1b2c3d4"],
    ["backupCreatedAtUtc", "2026-08-04T01:02:03.000Z"],
    ["backupCreatedAtUtc", "2026-02-30T01:02:03Z"],
  ])("rejects malformed %s", (name, value) => {
    expect(() => validateRecoveryEvidence({ ...valid, [name]: value }, { now }))
      .toThrow(/recovery evidence invalid/i);
  });

  it("rejects a backup older than 24 hours", () => {
    expect(() => validateRecoveryEvidence({
      ...valid,
      backupCreatedAtUtc: "2026-08-03T03:59:59Z",
    }, { now })).toThrow(/less than 24 hours old/i);
  });

  it("rejects a timestamp more than five minutes in the future", () => {
    expect(() => validateRecoveryEvidence({
      ...valid,
      backupCreatedAtUtc: "2026-08-04T04:05:01Z",
    }, { now })).toThrow(/future/i);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
pnpm exec vitest run tests/deployment/recovery-evidence.test.js
```

Expected: FAIL because `scripts/recovery-evidence.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure validator and safe CLI**

Create `scripts/recovery-evidence.mjs` with:

```js
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BACKUP_ID = /^frcq-backup-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/;
const RESTORE_ID = /^frcq-restore-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/;
const UTC_SECONDS = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function fail(message) {
  throw new Error(`Recovery evidence invalid: ${message}`);
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.length === 0) fail(`${name} is required`);
  return value;
}

function canonicalTimestamp(value) {
  if (!UTC_SECONDS.test(value)) fail("backupCreatedAtUtc must use canonical UTC seconds");
  const parsed = new Date(value);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().replace(".000Z", "Z") !== value
  ) fail("backupCreatedAtUtc is not a real UTC timestamp");
  return parsed;
}

export function validateRecoveryEvidence(input, { now = new Date() } = {}) {
  const evidence = {
    backupEvidenceId: requiredString(input?.backupEvidenceId, "backupEvidenceId"),
    backupCreatedAtUtc: requiredString(input?.backupCreatedAtUtc, "backupCreatedAtUtc"),
    backupArchiveSha256: requiredString(input?.backupArchiveSha256, "backupArchiveSha256"),
    restoreRehearsalEvidenceId: requiredString(
      input?.restoreRehearsalEvidenceId,
      "restoreRehearsalEvidenceId",
    ),
  };
  if (!BACKUP_ID.test(evidence.backupEvidenceId)) fail("backupEvidenceId format");
  if (!SHA256.test(evidence.backupArchiveSha256)) fail("backupArchiveSha256 must be lowercase SHA-256");
  if (!RESTORE_ID.test(evidence.restoreRehearsalEvidenceId)) fail("restoreRehearsalEvidenceId format");
  const createdAt = canonicalTimestamp(evidence.backupCreatedAtUtc);
  const age = now.valueOf() - createdAt.valueOf();
  if (age >= MAX_AGE_MS) fail("backup must be less than 24 hours old");
  if (age < -MAX_FUTURE_SKEW_MS) fail("backup timestamp is in the future");
  return Object.freeze(evidence);
}

export function readRecoveryEvidence(environment, options) {
  return validateRecoveryEvidence({
    backupEvidenceId: environment.BACKUP_EVIDENCE_ID,
    backupCreatedAtUtc: environment.BACKUP_CREATED_AT_UTC,
    backupArchiveSha256: environment.BACKUP_ARCHIVE_SHA256,
    restoreRehearsalEvidenceId: environment.RESTORE_REHEARSAL_EVIDENCE_ID,
  }, options);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const evidence = readRecoveryEvidence(process.env);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}
```

- [ ] **Step 4: Run the focused test and verify the green state**

Run:

```bash
pnpm exec vitest run tests/deployment/recovery-evidence.test.js
```

Expected: all nine generated test cases pass with no network activity.

- [ ] **Step 5: Run lint for the new module and test**

Run:

```bash
pnpm exec eslint scripts/recovery-evidence.mjs tests/deployment/recovery-evidence.test.js --max-warnings 0
```

Expected: exit 0 with no warnings.

- [ ] **Step 6: Commit the validator**

```bash
git add scripts/recovery-evidence.mjs tests/deployment/recovery-evidence.test.js
git commit -m "feat: validate free-plan recovery evidence"
```

---

### Task 2: Gate the protected backend workflow on evidence validation

**Files:**
- Modify: `.github/workflows/backend-production.yml:3-27`
- Modify: `scripts/deployment-config.mjs:12-174`
- Modify: `tests/deployment/deployment-config.test.js:7-240`

**Interfaces:**
- Consumes: the four `workflow_dispatch` inputs validated by `scripts/recovery-evidence.mjs`.
- Produces: `validate_recovery_evidence`, an unprotected `contents: read` job with no secrets or environment, and `release.needs: validate_recovery_evidence` before `environment: production-backend`.
- Produces: deployment validation errors for a missing input, missing dependency, protected evidence job, secret-bearing evidence job, missing input mapping, or absent validator invocation.

- [ ] **Step 1: Extend the valid workflow fixture**

In `validConfiguration()`, add required inputs:

```js
backup_evidence_id: { required: true },
backup_created_at_utc: { required: true },
backup_archive_sha256: { required: true },
restore_rehearsal_evidence_id: { required: true },
```

Add this job before `release` and set `release.needs`:

```js
validate_recovery_evidence: {
  permissions: { contents: "read" },
  steps: [
    { uses: pinnedCheckout },
    {
      env: {
        BACKUP_EVIDENCE_ID: "${{ inputs.backup_evidence_id }}",
        BACKUP_CREATED_AT_UTC: "${{ inputs.backup_created_at_utc }}",
        BACKUP_ARCHIVE_SHA256: "${{ inputs.backup_archive_sha256 }}",
        RESTORE_REHEARSAL_EVIDENCE_ID:
          "${{ inputs.restore_rehearsal_evidence_id }}",
      },
      run: "node scripts/recovery-evidence.mjs",
    },
  ],
},
release: {
  needs: "validate_recovery_evidence",
  // retain the existing environment, permissions, and steps
},
```

- [ ] **Step 2: Write failing structural regression tests**

Add these tests to `tests/deployment/deployment-config.test.js`:

```js
it("rejects a backend workflow missing recovery evidence inputs", () => {
  const configuration = validConfiguration();
  delete configuration.backend.on.workflow_dispatch.inputs.backup_archive_sha256;
  expect(() => validateDeploymentConfiguration(configuration)).toThrow(
    /required workflow input backup_archive_sha256/i,
  );
});

it("rejects release without the recovery evidence dependency", () => {
  const configuration = validConfiguration();
  delete configuration.backend.jobs.release.needs;
  expect(() => validateDeploymentConfiguration(configuration)).toThrow(
    /recovery evidence.*dependency/i,
  );
});

it("rejects a protected or secret-bearing evidence validation job", () => {
  const protectedConfiguration = validConfiguration();
  protectedConfiguration.backend.jobs.validate_recovery_evidence.environment =
    "production-backend";
  expect(() => validateDeploymentConfiguration(protectedConfiguration)).toThrow(
    /evidence validation.*unprotected/i,
  );

  const secretConfiguration = validConfiguration();
  secretConfiguration.backend.jobs.validate_recovery_evidence.steps[1].env.EXTRA =
    "${{ secrets.PRODUCTION_SUPABASE_DB_PASSWORD }}";
  expect(() => validateDeploymentConfiguration(secretConfiguration)).toThrow(
    /evidence validation.*secret/i,
  );
});

it("rejects recovery validation without every dispatch input mapping", () => {
  const configuration = validConfiguration();
  delete configuration.backend.jobs.validate_recovery_evidence.steps[1].env
    .RESTORE_REHEARSAL_EVIDENCE_ID;
  expect(() => validateDeploymentConfiguration(configuration)).toThrow(
    /restore_rehearsal_evidence_id/i,
  );
});
```

- [ ] **Step 3: Run the deployment test and verify the red state**

Run:

```bash
pnpm exec vitest run tests/deployment/deployment-config.test.js
```

Expected: the new tests fail because the structural validator does not enforce the evidence gate.

- [ ] **Step 4: Implement `requireRecoveryEvidenceGate`**

Add to `scripts/deployment-config.mjs`:

```js
const RECOVERY_INPUTS = [
  "backup_evidence_id",
  "backup_created_at_utc",
  "backup_archive_sha256",
  "restore_rehearsal_evidence_id",
];
const RECOVERY_ENVIRONMENT = {
  BACKUP_EVIDENCE_ID: "backup_evidence_id",
  BACKUP_CREATED_AT_UTC: "backup_created_at_utc",
  BACKUP_ARCHIVE_SHA256: "backup_archive_sha256",
  RESTORE_REHEARSAL_EVIDENCE_ID: "restore_rehearsal_evidence_id",
};

function containsSecretsContext(value) {
  return /\$\{\{\s*secrets\s*(?:\.|\[)/i.test(JSON.stringify(value ?? {}));
}

function requireRecoveryEvidenceGate(workflow, validationJob, releaseJob) {
  requireInputs(workflow, RECOVERY_INPUTS);
  if (!needsJob(releaseJob, "validate_recovery_evidence")) {
    fail("backend release requires the recovery evidence dependency");
  }
  if (!validationJob || environmentName(validationJob)) {
    fail("recovery evidence validation must be an unprotected job");
  }
  requireContentsReadOnly(validationJob, "recovery evidence validation");
  if (
    containsSecretsContext(workflow?.env) ||
    containsSecretsContext(validationJob)
  ) {
    fail("recovery evidence validation must not receive a secret");
  }
  const validatorSteps = (validationJob.steps ?? []).filter((step) =>
    String(step?.run ?? "").trim() === "node scripts/recovery-evidence.mjs"
  );
  if (validatorSteps.length !== 1) {
    fail("recovery evidence validation must run the repository validator");
  }
  const environment = validatorSteps[0].env ?? {};
  for (const [name, input] of Object.entries(RECOVERY_ENVIRONMENT)) {
    if (environment[name] !== `\${{ inputs.${input} }}`) {
      fail(`recovery evidence validation must map ${input}`);
    }
  }
  if (Object.keys(environment).length !== 4) {
    fail("recovery evidence validation requires exactly four approved environment mappings");
  }
}
```

In `validateDeploymentConfiguration`, bind and call it before any release checks:

```js
const evidenceJob = backend?.jobs?.validate_recovery_evidence;
requireInputs(backend, ["expected_sha", "production_project_ref"]);
requireRecoveryEvidenceGate(backend, evidenceJob, backendJob);
```

- [ ] **Step 5: Update the real backend workflow**

Add the four required string inputs with redaction-safe descriptions. Add `validate_recovery_evidence` with `if: github.ref == 'refs/heads/main'`, Ubuntu, five-minute timeout, `contents: read`, pinned checkout, pinned Node setup, and:

```yaml
- name: Validate redaction-safe recovery evidence
  env:
    BACKUP_EVIDENCE_ID: ${{ inputs.backup_evidence_id }}
    BACKUP_CREATED_AT_UTC: ${{ inputs.backup_created_at_utc }}
    BACKUP_ARCHIVE_SHA256: ${{ inputs.backup_archive_sha256 }}
    RESTORE_REHEARSAL_EVIDENCE_ID: ${{ inputs.restore_rehearsal_evidence_id }}
  run: node scripts/recovery-evidence.mjs
```

Add `needs: validate_recovery_evidence` to `release`. Do not move or remove `environment: production-backend`; no validation job receives an environment or secret.
Before any `db push`, secret update, or function deploy, the protected identity
step must directly assert production ref `ghohuwwjxgjqnbsauvzq`, load ref
`vadyhuipwbtgbzpeisbn`, and production URL
`https://ghohuwwjxgjqnbsauvzq.supabase.co`, in addition to comparing the
confirmed input with the configured production ref.

- [ ] **Step 6: Run focused workflow tests and the live parser**

Run:

```bash
pnpm exec vitest run tests/deployment/deployment-config.test.js
pnpm check:deployment
```

Expected: all deployment tests pass and the real workflows print `Deployment workflow boundaries passed.`

- [ ] **Step 7: Commit the evidence gate**

```bash
git add .github/workflows/backend-production.yml scripts/deployment-config.mjs tests/deployment/deployment-config.test.js
git commit -m "ci: gate backend release on recovery evidence"
```

---

### Task 3: Reject recovery packages and dump artifacts from Git

**Files:**
- Create: `scripts/recovery-artifact-guard.mjs`
- Create: `tests/deployment/recovery-artifact-guard.test.js`
- Modify: `scripts/check-repository.mjs:1-38`

**Interfaces:**
- Consumes: repository-relative path strings.
- Produces: `forbiddenRecoveryArtifactPaths(paths: Iterable<string>): string[]`, sorted and deduplicated.
- Rejects: `.age`, `.backup`, `.dump`, `roles.sql`, `schema.sql`, `data.sql`, `history_schema.sql`, `history_data.sql`, `storage-manifest.json`, `recovery-manifest.json`, and anything under a `recovery-package` or `recovery-backup` directory.
- Allows: timestamped Supabase migrations, design/runbook Markdown, and ordinary application JSON/assets.

- [ ] **Step 1: Write the failing path-classifier tests**

Create `tests/deployment/recovery-artifact-guard.test.js`:

```js
import { describe, expect, it } from "vitest";
import { forbiddenRecoveryArtifactPaths } from
  "../../scripts/recovery-artifact-guard.mjs";

describe("recovery artifact repository guard", () => {
  it("rejects encrypted packages, dumps, manifests, and recovery directories", () => {
    expect(forbiddenRecoveryArtifactPaths([
      "private/frcq-backup.age",
      "roles.sql",
      "schema.sql",
      "data.sql",
      "history_schema.sql",
      "history_data.sql",
      "storage-manifest.json",
      "tmp/recovery-package/objects/opaque.webp",
      "archive/project.backup",
      "archive/project.dump",
    ])).toHaveLength(10);
  });

  it("allows migrations, recovery documentation, and public fixtures", () => {
    expect(forbiddenRecoveryArtifactPaths([
      "supabase/migrations/20260730021100_production_readiness.sql",
      "docs/operations/free-plan-recovery.md",
      "tests/fixtures/public-synthetic-bank.json",
    ])).toEqual([]);
  });

  it("returns sorted unique violations", () => {
    expect(forbiddenRecoveryArtifactPaths([
      "z.dump",
      "a.age",
      "z.dump",
    ])).toEqual(["a.age", "z.dump"]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
pnpm exec vitest run tests/deployment/recovery-artifact-guard.test.js
```

Expected: FAIL because the guard module does not exist.

- [ ] **Step 3: Implement the classifier**

Create `scripts/recovery-artifact-guard.mjs`:

```js
const RECOVERY_ARTIFACT = [
  /\.age$/i,
  /\.(?:backup|dump)$/i,
  /(^|\/)(?:roles|schema|data|history_schema|history_data)\.sql$/i,
  /(^|\/)(?:storage|recovery)-manifest\.json$/i,
  /(^|\/)recovery-(?:package|backup)(\/|$)/i,
];

export function forbiddenRecoveryArtifactPaths(paths) {
  return [...new Set(paths)].filter((path) =>
    RECOVERY_ARTIFACT.some((pattern) => pattern.test(path))
  ).sort();
}
```

- [ ] **Step 4: Integrate it into the repository history check**

In `scripts/check-repository.mjs`, import the classifier and combine its results with the existing protected-content violations:

```js
import { forbiddenRecoveryArtifactPaths } from "./recovery-artifact-guard.mjs";

const privacyViolations = [...candidates].filter(
  (path) => path !== ".env.example" &&
    forbiddenTrackedPaths.some((pattern) => pattern.test(path)),
);
const violations = [...new Set([
  ...privacyViolations,
  ...forbiddenRecoveryArtifactPaths(candidates),
])].sort();
```

Keep the current nonzero exit and `forbidden tracked path:` output behavior.

- [ ] **Step 5: Run focused and repository checks**

Run:

```bash
pnpm exec vitest run tests/deployment/recovery-artifact-guard.test.js
pnpm check:repo
```

Expected: three guard tests pass and the current repository prints `Repository privacy path and reachable-history check passed.` The untracked `node_modules` entry remains untouched.

- [ ] **Step 6: Commit the repository guard**

```bash
git add scripts/recovery-artifact-guard.mjs scripts/check-repository.mjs tests/deployment/recovery-artifact-guard.test.js
git commit -m "fix: reject recovery artifacts from repository"
```

---

### Task 4: Operationalize the approved Free-plan recovery policy

**Files:**
- Create: `docs/operations/free-plan-recovery.md`
- Create: `docs/operations/deployment-readiness-review.md`
- Create: `tests/deployment/recovery-documentation.test.js`
- Modify: `docs/operations/backend-release.md:7-31,74-82`
- Modify: `docs/operations/release-checklist.md:7-57,59-74,95-119`
- Modify: `docs/operations/rollback.md:81-114`
- Modify: `docs/operations/privacy-and-retention.md:76-87`
- Modify: `docs/operations/class-session-runbook.md:3-15`
- Modify: `docs/operations/github-environments.md:36-69,104-116`

**Interfaces:**
- Consumes: the design specification and the evidence/input names from Tasks 1 and 2.
- Produces: one authoritative operator runbook, aligned release/rollback/privacy/class-session documents, a formal checklist, and a dated independent readiness decision.
- The runbook shows commands for an authorized future operator but does not execute them, embed values, or weaken approval boundaries.

- [ ] **Step 1: Write failing documentation policy tests**

Create `tests/deployment/recovery-documentation.test.js`:

```js
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (name) => readFile(new URL(
  `../../docs/operations/${name}`,
  import.meta.url,
), "utf8");

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
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
pnpm exec vitest run tests/deployment/recovery-documentation.test.js
```

Expected: FAIL because the runbook and readiness review do not exist and the checklist lacks the new evidence fields.

- [ ] **Step 3: Create the authoritative operator runbook**

Create `docs/operations/free-plan-recovery.md` with these exact sections:

```markdown
# Supabase Free-Plan Backup and Restore Rehearsal

## Authority and project identities
## Required tools and private custody
## Evidence identifiers
## Phase A — approve and quiesce production
## Phase B — export roles, schema, data, and migration history
## Phase C — export and inventory `group-images`
## Phase D — package, encrypt, copy, and verify
## Phase E — pause the load-test project with approval
## Phase F — create the temporary Singapore recovery project with approval
## Phase G — restore and validate with approval
## Phase H — teardown and reactivate load testing with approval
## GitHub evidence entry
## Failure and plaintext-cleanup procedure
## Retention and deletion
```

Document the supported future commands as templates that use the exact locally linked production identity and an interactive hidden database-password prompt; never place a password or connection string in a command argument, shell history, output, or committed file. Include the five official logical exports:

```bash
pnpm exec supabase db dump --linked -f "$staging_dir/roles.sql" --role-only
pnpm exec supabase db dump --linked -f "$staging_dir/schema.sql"
pnpm exec supabase db dump --linked -f "$staging_dir/data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
pnpm exec supabase db dump --linked -f "$staging_dir/history_schema.sql" --schema supabase_migrations
pnpm exec supabase db dump --linked -f "$staging_dir/history_data.sql" --use-copy --data-only --schema supabase_migrations
```

State that these are documentation for an explicitly approved future execution, not authorization. Keep the approved checkout as the working directory, use absolute staging output paths, and clean only from that safe checkout. Require `umask 077`, `mktemp -d`, a cleanup trap, `age` recipient encryption, filename-free stdin hashing for the encrypted archive and both retained copies, a strict less-than-24-hour freshness limit, no writes after recovery point, aggregate-only evidence, and the latest-three/30-day rule. Capture quiesced source counts for Auth, cohorts, private/public profiles, attempts, responses, evidence, and audit rows inside the encrypted manifest and require exact rehearsal target equality. Define versioned Storage pagination to exhaustion, duplicate/error rejection, exact source identity, two complete digest inventories, and automatic new-table exposure disabled before restore.

- [ ] **Step 4: Align backend release and GitHub configuration documentation**

Update `backend-release.md` so the selected Free-plan encrypted logical package plus hosted rehearsal is the only recovery method accepted by this workflow. State that a later plan change requires a separately designed and validated evidence method. Add the four exact dispatch inputs and require the owner to compare them against the separately held evidence before approving `production-backend`.

Update `github-environments.md` to say the four recovery values are non-secret workflow inputs, not repository/environment variables or secrets. Preserve the existing variable/secret inventory unchanged and state that no backup, database connection string, Storage admin key, encryption key, or protected manifest belongs in GitHub.

- [ ] **Step 5: Expand the formal release checklist**

Replace the generic backup/PITR lines with fields for:

```text
backup evidence ID
quiesced recovery-point time
backup_created_at_utc archive creation/completion time
encrypted archive SHA-256 and byte size
cloud-copy digest verification
offline-copy digest verification
no-write-since-recovery-point attestation
restore rehearsal evidence ID
temporary Singapore recovery project ref
database/Auth/RLS/retention validation result
group-images object-count/byte-total/digest validation result
rehearsal reviewer and time
temporary recovery project deletion approval/result
load-test project reactivation and health result
```

In backend approval, require all four workflow inputs to match the release record. Keep the default decision `HOLD`, the two-person environment check, distinct reviewer gates, content/readiness gates, Pages artifact ID/commit/digest, smoke checks, and GO/HOLD/ROLL BACK signatures.

- [ ] **Step 6: Align rollback, privacy, and class-session operations**

Update `rollback.md` to distinguish provider recovery from the Free-plan encrypted logical-package procedure, require database plus Storage reconciliation, and preserve forward-only compensation and separate incident approval.

Update `privacy-and-retention.md` with the two-copy rule, latest-three/30-day minimum, separate key custody, no plaintext outside controlled staging/rehearsal, and opaque GitHub evidence.

Update `class-session-runbook.md` to begin the health check early enough to reactivate a Free project paused after inactivity, then re-run migration/content/Auth/function readiness before students arrive. Do not suggest synthetic keepalive traffic.

- [ ] **Step 7: Create the dated independent readiness review**

Create `docs/operations/deployment-readiness-review.md` with:

```markdown
# Deployment Readiness Review — 2026-08-04

**Reviewed branch:** `codex/gate-d-teacher-readiness`
**Original Gate D commit:** `4783565`
**Remediated review baseline:** `568f282ba5338e42ffa008a26e956cfbb419ce79`
**Recovery design commit:** `ce7a056`
**Production project:** `ghohuwwjxgjqnbsauvzq`
**Dedicated load-test project:** `vadyhuipwbtgbzpeisbn`
**Decision: HOLD**

## Repository controls verified
## GitHub Pages approval and artifact integrity
## GitHub variables and secrets inventory
## Supabase migration and function sequence
## Recovery and rollback
## Remaining external blockers
## Conditions for GO
```

Immediately before writing the review, run `git rev-parse HEAD` and record that
full value as the reviewed implementation-plan baseline. Record repository
evidence without claiming remote configuration exists. Remaining blockers must
include encryption-custodian/key provisioning, two custody locations, real
production package, hosted restore rehearsal/teardown, GitHub
variables/secrets/environments/reviewers/branch rules, production retention
approval, smoke fixtures, Free-plan availability acceptance, and every formal
checklist item. State that repository completion does not authorize deployment.

- [ ] **Step 8: Run documentation tests and Markdown whitespace checks**

Run:

```bash
pnpm exec vitest run tests/deployment/recovery-documentation.test.js
git diff --check
```

Expected: three documentation tests pass and `git diff --check` exits 0.

- [ ] **Step 9: Commit the operations package**

```bash
git add docs/operations tests/deployment/recovery-documentation.test.js
git commit -m "docs: operationalize free-plan recovery"
```

---

### Task 5: Full repository verification and independent handoff

**Files:**
- Verify only; modify a task-owned file only when a failing check identifies a defect, then repeat that task's red/green cycle before committing the fix.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–4.
- Produces: fresh verification evidence, exact commit list, clean tracked state, and a HOLD blocker handoff with no remote mutation.

- [ ] **Step 1: Verify focused deployment/recovery tests**

Run:

```bash
pnpm exec vitest run \
  tests/deployment/recovery-evidence.test.js \
  tests/deployment/deployment-config.test.js \
  tests/deployment/recovery-artifact-guard.test.js \
  tests/deployment/recovery-documentation.test.js \
  tests/deployment/pages-artifact.test.js \
  tests/deployment/production-preflight.test.js
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 2: Verify repository, workflow, lint, types, unit, and function gates**

Run each separately and stop on the first failure:

```bash
pnpm check:repo
pnpm check:deployment
pnpm lint
pnpm typecheck
pnpm test
pnpm test:functions
```

Expected: every command exits 0. Do not run live load tests because they contact a remote project; do not start a production workflow.

- [ ] **Step 3: Verify the production build and public-bundle privacy scan**

Use explicit synthetic public build values only; never use or request a production or service-role key for this local verification:

```bash
VITE_SUPABASE_URL=https://synthetic-project.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=synthetic-public-publishable-key \
VITE_BASE_PATH=/future-ready-campus-quest/ \
pnpm build
pnpm check:bundle
```

Expected: build and bundle scan exit 0 without retrieving a production value. The protected Pages workflow remains responsible for building with the reviewed production public variables.

- [ ] **Step 4: Verify tracked scope and commit history**

Run:

```bash
git diff --check
git status --short --branch
git log --oneline --decorate -8
git diff 568f282ba5338e42ffa008a26e956cfbb419ce79..HEAD --stat
```

Expected: no tracked modifications remain after task commits; only the pre-existing untracked `node_modules` entry may appear. The diff contains repository code, workflow, tests, and documentation only—no dump, backup, archive, credential, manifest containing protected paths, migration, function payload, or production data.

- [ ] **Step 5: Reconcile the readiness review with fresh evidence**

Read `docs/operations/deployment-readiness-review.md` and confirm every repository-control statement is supported by the command output from Steps 1–4. Keep `Decision: HOLD`; do not mark any external Supabase or GitHub item complete based only on repository tests.

- [ ] **Step 6: Handoff without push or deployment**

Report:

```text
Repository recovery controls: verified or list exact failing command
Remote production changes: none
GitHub configuration changes: none
Supabase project changes: none
Deployment decision: HOLD
Next approval required: first external blocker in formal checklist order
```

Do not push, open/merge a PR, configure GitHub, pause/create/delete Supabase projects, generate a real backup, restore data, deploy, or publish as part of this plan.
