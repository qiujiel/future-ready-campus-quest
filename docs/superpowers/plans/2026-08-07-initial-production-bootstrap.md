# Initial Production Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-time, fail-closed production bootstrap mode that can deploy the first schema and Edge Functions only while the exact production Supabase project has zero application state.

**Architecture:** A pure release-authorization validator enforces mutually exclusive `bootstrap` and `upgrade` dispatch evidence. A separate bootstrap preflight core validates redaction-safe aggregate results, while its live runner obtains those aggregates through Supabase's read-only Management API plus server-only Auth and Storage administration calls. The protected workflow runs bootstrap preflight before its first production write; upgrade continues to require the existing encrypted backup and restore-rehearsal evidence.

**Tech Stack:** Node.js 24 ESM, Vitest 4, GitHub Actions YAML, Supabase CLI 2.110.0, Supabase Management/Auth/Storage APIs, existing deployment validators and operations documentation.

## Global Constraints

- Production project ref is exactly `ghohuwwjxgjqnbsauvzq`.
- Dedicated load-test project ref is exactly `vadyhuipwbtgbzpeisbn` and is never a production, bootstrap, backup, or restore target.
- `bootstrap` is valid only when migrations, Auth users, application relations/functions, Storage buckets/objects, and Edge Functions are all absent.
- `upgrade` continues to require all four canonical recovery inputs and their existing freshness checks.
- No credential, API response body, database content, Auth record, Storage path, or protected content may be printed or committed.
- `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` is an encrypted `production-backend` environment secret only; it is never a repository variable or frontend value.
- Bootstrap preflight must run after protected identity validation and before migration dry-run, migration apply, secret writes, or Function deployment.
- Any failed or ambiguous preflight stops the release without retry, reset, deletion, or migration-history repair.
- Node remains `>=24 <25`; pnpm remains `>=11 <12`; no new dependency is added.

---

### Task 1: Validate mutually exclusive release authorization

**Files:**
- Create: `scripts/production-release-authorization.mjs`
- Create: `tests/deployment/production-release-authorization.test.js`

**Interfaces:**
- Consumes: `releaseMode`, `bootstrapAuthorizationId`, and the existing four recovery fields.
- Produces: `validateReleaseAuthorization(input, options)` and `readReleaseAuthorization(environment, options)` returning `{ releaseMode, bootstrapAuthorizationId, recoveryEvidence }`.

- [ ] **Step 1: Write failing release-authorization tests**

Create `tests/deployment/production-release-authorization.test.js` with canonical fixtures and assertions equivalent to:

```js
const bootstrap = {
  releaseMode: "bootstrap",
  bootstrapAuthorizationId: "frcq-bootstrap-20260807T120000Z-a1b2c3d4",
  backupEvidenceId: "",
  backupCreatedAtUtc: "",
  backupArchiveSha256: "",
  restoreRehearsalEvidenceId: "",
};

it("accepts bootstrap only with canonical bootstrap evidence and blank recovery evidence", () => {
  expect(validateReleaseAuthorization(bootstrap, { now }))
    .toEqual({
      releaseMode: "bootstrap",
      bootstrapAuthorizationId: bootstrap.bootstrapAuthorizationId,
      recoveryEvidence: null,
    });
});

it("rejects recovery evidence in bootstrap mode", () => {
  expect(() => validateReleaseAuthorization({
    ...bootstrap,
    backupArchiveSha256: "a".repeat(64),
  }, { now })).toThrow(/bootstrap.*recovery/i);
});

it("accepts upgrade only with the four existing recovery fields", () => {
  expect(validateReleaseAuthorization(upgrade, { now }).recoveryEvidence)
    .toEqual(validRecoveryEvidence);
});

it.each(["", "Bootstrap", "initial", "upgrade "])(
  "rejects noncanonical release mode %j",
  (releaseMode) => expect(() => validateReleaseAuthorization({
    ...bootstrap,
    releaseMode,
  }, { now })).toThrow(/release mode/i),
);
```

Also test malformed/future bootstrap IDs, bootstrap IDs in upgrade mode, missing upgrade recovery values, and environment mapping that ignores unrelated secrets.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run tests/deployment/production-release-authorization.test.js
```

Expected: FAIL because `scripts/production-release-authorization.mjs` does not exist.

- [ ] **Step 3: Implement the minimal authorization validator**

Create `scripts/production-release-authorization.mjs`. Reuse `validateRecoveryEvidence` from `scripts/recovery-evidence.mjs`; do not duplicate recovery rules. Use this contract:

```js
const BOOTSTRAP_ID = /^frcq-bootstrap-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/;
const MODES = new Set(["bootstrap", "upgrade"]);

export function validateReleaseAuthorization(input, options) {
  // Require a canonical mode.
  // In bootstrap: require one canonical bootstrap ID, require all recovery
  // strings to equal "", and return recoveryEvidence: null.
  // In upgrade: require bootstrapAuthorizationId === "" and delegate all four
  // recovery fields to validateRecoveryEvidence(input, options).
  // Freeze the returned object.
}

export function readReleaseAuthorization(environment, options) {
  return validateReleaseAuthorization({
    releaseMode: environment.RELEASE_MODE,
    bootstrapAuthorizationId: environment.BOOTSTRAP_AUTHORIZATION_ID,
    backupEvidenceId: environment.BACKUP_EVIDENCE_ID,
    backupCreatedAtUtc: environment.BACKUP_CREATED_AT_UTC,
    backupArchiveSha256: environment.BACKUP_ARCHIVE_SHA256,
    restoreRehearsalEvidenceId: environment.RESTORE_REHEARSAL_EVIDENCE_ID,
  }, options);
}
```

The executable path prints only the validated authorization object. It never reads or prints a secret.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the focused Vitest command from Step 2. Expected: all release-authorization tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/production-release-authorization.mjs tests/deployment/production-release-authorization.test.js
git commit -m "feat: validate production release modes"
```

---

### Task 2: Prove the production project is empty before bootstrap

**Files:**
- Create: `scripts/production-bootstrap-preflight-core.mjs`
- Create: `scripts/production-bootstrap-preflight.mjs`
- Create: `tests/deployment/production-bootstrap-preflight.test.js`

**Interfaces:**
- Consumes: exact production/load refs, production URL, bootstrap authorization ID, `SUPABASE_ACCESS_TOKEN`, and `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `readBootstrapConfiguration(environment)`, `evaluateBootstrapSnapshot(snapshot, configuration)`, `fetchBootstrapSnapshot(configuration, fetchImpl)`, and a CLI that prints only zero-count aggregate evidence.

- [ ] **Step 1: Write failing configuration and aggregate tests**

Create tests with a valid snapshot:

```js
const empty = {
  database: {
    migrationTableCount: 0,
    authUserCount: 0,
    storageBucketCount: 0,
    storageObjectCount: 0,
    appRelationCount: 0,
    appFunctionCount: 0,
  },
  authAdminUserCount: 0,
  storageAdminBucketCount: 0,
  edgeFunctionCount: 0,
};

it("accepts only the exact empty production project", () => {
  expect(evaluateBootstrapSnapshot(empty, configuration)).toEqual({
    projectRef: "ghohuwwjxgjqnbsauvzq",
    releaseMode: "bootstrap",
    bootstrapAuthorizationId: configuration.bootstrapAuthorizationId,
    migrationTableCount: 0,
    authUserCount: 0,
    storageBucketCount: 0,
    storageObjectCount: 0,
    appRelationCount: 0,
    appFunctionCount: 0,
    edgeFunctionCount: 0,
  });
});

it.each([
  ["migrationTableCount", 1],
  ["authUserCount", 1],
  ["storageBucketCount", 1],
  ["storageObjectCount", 1],
  ["appRelationCount", 1],
  ["appFunctionCount", 1],
])("rejects nonempty database surface %s", (name, value) => {
  expect(() => evaluateBootstrapSnapshot({
    ...empty,
    database: { ...empty.database, [name]: value },
  }, configuration)).toThrow(/not empty/i);
});
```

Also reject: production ref equal to load ref, wrong production URL, non-bootstrap mode, absent secrets, negative/fractional/string counts, mismatched Auth/Storage cross-check counts, one deployed Edge Function, non-array API responses, non-2xx requests, paginated Auth results that are not conclusively zero, and output containing response bodies.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec vitest run tests/deployment/production-bootstrap-preflight.test.js
```

Expected: FAIL because the bootstrap preflight modules do not exist.

- [ ] **Step 3: Implement configuration and aggregate evaluation**

In `production-bootstrap-preflight-core.mjs`, enforce exact identities and required secret presence without returning either secret. `evaluateBootstrapSnapshot` must require nonnegative integer counts, require every count to be zero, and require database/Auth and database/Storage counts to agree.

Use one fixed read-only SQL query sent to the Supabase Management API:

```sql
select
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'supabase_migrations' and c.relname = 'schema_migrations') as migration_table_count,
  (select count(*)::int from auth.users) as auth_user_count,
  (select count(*)::int from storage.buckets) as storage_bucket_count,
  (select count(*)::int from storage.objects) as storage_object_count,
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm', 'f')) as app_relation_count,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')) as app_function_count
```

`fetchBootstrapSnapshot` makes four authenticated reads:

1. `POST https://api.supabase.com/v1/projects/{ref}/database/query` with `{ query, read_only: true }` and the PAT;
2. `GET https://api.supabase.com/v1/projects/{ref}/functions` with the PAT;
3. `GET {productionUrl}/auth/v1/admin/users?page=1&per_page=1` with the server-only service-role key;
4. `GET {productionUrl}/storage/v1/bucket` with the server-only service-role key.

Reject any non-success response before parsing. Convert only expected arrays/counts into the snapshot; do not retain or include raw response objects in errors.

- [ ] **Step 4: Implement the live runner**

`production-bootstrap-preflight.mjs` reads configuration, fetches the snapshot, evaluates it, and prints only:

```json
{
  "projectRef": "ghohuwwjxgjqnbsauvzq",
  "releaseMode": "bootstrap",
  "bootstrapAuthorizationId": "frcq-bootstrap-YYYYMMDDTHHMMSSZ-xxxxxxxx",
  "migrationTableCount": 0,
  "authUserCount": 0,
  "storageBucketCount": 0,
  "storageObjectCount": 0,
  "appRelationCount": 0,
  "appFunctionCount": 0,
  "edgeFunctionCount": 0
}
```

Errors identify only the failed surface and status code, never the body or credential.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the focused command from Step 2. Expected: all bootstrap preflight tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add scripts/production-bootstrap-preflight-core.mjs scripts/production-bootstrap-preflight.mjs tests/deployment/production-bootstrap-preflight.test.js
git commit -m "feat: verify empty production bootstrap state"
```

---

### Task 3: Gate the protected backend workflow by release mode

**Files:**
- Modify: `.github/workflows/backend-production.yml`
- Modify: `scripts/deployment-config.mjs`
- Modify: `tests/deployment/deployment-config.test.js`

**Interfaces:**
- Consumes: `release_mode`, `bootstrap_authorization_id`, existing recovery inputs, protected environment secrets, and the Task 1/2 scripts.
- Produces: a canonical validation job and a protected release sequence whose first production write occurs only after the applicable authorization gate.

- [ ] **Step 1: Add failing workflow-regression tests**

Extend the fixture and mutation tests so the valid workflow requires:

```yaml
release_mode:
  required: true
  type: choice
  default: upgrade
  options: [upgrade, bootstrap]
bootstrap_authorization_id:
  required: false
  type: string
```

The four recovery inputs must be `required: false`, because Task 1 supplies the fail-closed semantic validation. Replace the recovery-only validation command with exactly:

```yaml
env:
  RELEASE_MODE: ${{ inputs.release_mode }}
  BOOTSTRAP_AUTHORIZATION_ID: ${{ inputs.bootstrap_authorization_id }}
  BACKUP_EVIDENCE_ID: ${{ inputs.backup_evidence_id }}
  BACKUP_CREATED_AT_UTC: ${{ inputs.backup_created_at_utc }}
  BACKUP_ARCHIVE_SHA256: ${{ inputs.backup_archive_sha256 }}
  RESTORE_REHEARSAL_EVIDENCE_ID: ${{ inputs.restore_rehearsal_evidence_id }}
run: node scripts/production-release-authorization.mjs
```

Add mutation tests proving validation fails if a secret enters the unprotected authorization job, an input mapping is absent, bootstrap options change, the release job loses its dependency, or bootstrap preflight moves after `db push`, `secrets set`, or `functions deploy`.

- [ ] **Step 2: Run deployment tests and verify RED**

```bash
pnpm exec vitest run tests/deployment/deployment-config.test.js
```

Expected: FAIL because the current workflow has no release mode or protected bootstrap preflight.

- [ ] **Step 3: Update the workflow**

Rename `validate_recovery_evidence` to `validate_release_authorization`, keep it unprotected with `contents: read`, pinned checkout/setup actions, no secret context, and the exact Task 1 command/mappings.

Pass `RELEASE_MODE` and `BOOTSTRAP_AUTHORIZATION_ID` to the protected release job. Immediately after `Link the confirmed production project` and before `Record migration state and dry-run pending migrations`, add:

```yaml
- name: Verify empty production bootstrap state
  if: ${{ inputs.release_mode == 'bootstrap' }}
  env:
    BOOTSTRAP_AUTHORIZATION_ID: ${{ inputs.bootstrap_authorization_id }}
    PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY }}
    SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
  run: node scripts/production-bootstrap-preflight.mjs
```

Do not expose the service-role key to any other job. Upgrade skips only this one step; its recovery evidence remains validated by Task 1 before the protected environment is entered.

- [ ] **Step 4: Update the deployment validator minimally**

Replace recovery-only constants and `requireRecoveryEvidenceGate` with release-authorization equivalents that deep-compare the canonical input definitions, job, ordered steps, exact six environment mappings, no secret context, and dependency name. Add `requireBootstrapPreflightOrder(job)` that asserts exactly one bootstrap preflight step, exact `if`, exactly the three approved environment mappings, and index ordering:

```text
Link production < bootstrap preflight < migration list/dry-run < db push < secrets set < functions deploy
```

Preserve every existing identity, least-privilege, action-pin, load-project, artifact, and recovery test.

- [ ] **Step 5: Run deployment and release-evidence tests and verify GREEN**

```bash
pnpm exec vitest run \
  tests/deployment/deployment-config.test.js \
  tests/deployment/production-release-authorization.test.js \
  tests/deployment/production-bootstrap-preflight.test.js \
  tests/deployment/recovery-evidence.test.js
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add .github/workflows/backend-production.yml scripts/deployment-config.mjs tests/deployment/deployment-config.test.js
git commit -m "ci: gate initial production bootstrap"
```

---

### Task 4: Document bootstrap, credentials, rollback, and the owner review exception

**Files:**
- Modify: `docs/operations/backend-release.md`
- Modify: `docs/operations/free-plan-recovery.md`
- Modify: `docs/operations/github-environments.md`
- Modify: `docs/operations/rollback.md`
- Modify: `docs/operations/deployment-readiness-review.md`
- Modify: `tests/deployment/recovery-documentation.test.js`

**Interfaces:**
- Consumes: the approved design and exact workflow input/secret names.
- Produces: operator instructions that distinguish first bootstrap from all upgrades and record the repository-owner exception without weakening technical gates.

- [ ] **Step 1: Add failing documentation assertions**

Extend `recovery-documentation.test.js` to require these exact terms across the appropriate documents:

```text
release_mode
bootstrap_authorization_id
frcq-bootstrap-YYYYMMDDTHHMMSSZ-xxxxxxxx
PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
zero application state
bootstrap is self-disabling
upgrade requires the four recovery values
no reset, deletion, or migration-history repair
```

Assert the GitHub inventory scopes the service-role key only to
`production-backend`, forbids it from repository variables/secrets,
`production-readiness`, `github-pages`, frontend values, logs, and release
records, and requires rotation after unintended disclosure.

Assert rollback says a failed bootstrap stays on HOLD and permits only a
separately approved forward fix or empty-project recreation; it must not claim
bootstrap evidence can restore data.

Record that the owner waived the second-person PR/environment review on
2026-08-07 while all automated checks and project-identity gates remain
mandatory. Tests must reject wording that calls the deployment independently
reviewed.

- [ ] **Step 2: Run documentation tests and verify RED**

```bash
pnpm exec vitest run tests/deployment/recovery-documentation.test.js
```

Expected: FAIL because the operations documents do not yet describe bootstrap.

- [ ] **Step 3: Update the operations documents**

In `backend-release.md`, document both dispatch modes, exact field combinations,
the protected emptiness preflight, the one-time boundary, and the unchanged
upgrade recovery sequence.

In `free-plan-recovery.md`, state that the procedure applies after successful
bootstrap/content/fixture setup and before the next backend release; it is not
fabricated for an empty project.

In `github-environments.md`, add the server-only service-role secret to
`production-backend`, remove the contradictory sentence claiming none is
stored, and keep it prohibited everywhere else.

In `rollback.md`, add an initial-bootstrap failure section with HOLD behavior,
no automatic mutation, and separate approval for any recreation.

In `deployment-readiness-review.md`, record the owner exception accurately and
list bootstrap preflight evidence as a prerequisite for this first release.

- [ ] **Step 4: Run documentation and deployment tests and verify GREEN**

```bash
pnpm exec vitest run \
  tests/deployment/recovery-documentation.test.js \
  tests/deployment/deployment-config.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add docs/operations tests/deployment/recovery-documentation.test.js
git commit -m "docs: operationalize initial production bootstrap"
```

---

### Task 5: Complete verification and publish the reviewed fix branch

**Files:**
- Verify all files changed in Tasks 1-4.

**Interfaces:**
- Consumes: the complete bootstrap implementation.
- Produces: a fully verified branch and pull request ready for the owner-approved no-review integration path.

- [ ] **Step 1: Run focused deployment tests**

```bash
pnpm exec vitest run tests/deployment
```

Expected: all deployment tests pass.

- [ ] **Step 2: Run repository and workflow boundaries**

```bash
pnpm check:repo
pnpm check:deployment
```

Expected: both commands pass without privacy or configuration findings.

- [ ] **Step 3: Run complete application and Function tests**

```bash
pnpm test
pnpm test:functions
```

Expected: every test passes with zero skipped or weakened tests.

- [ ] **Step 4: Run static and production-build verification**

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm check:bundle
```

Expected: lint/type checks pass, production build succeeds, and the bundle scan finds no credential or protected content.

- [ ] **Step 5: Run Deno Function checks**

```bash
deno check --frozen \
  --config supabase/functions/deno.json \
  --lock supabase/functions/deno.lock \
  supabase/functions/*/index.ts
```

Expected: every Edge Function entry point type-checks from the frozen lock.

- [ ] **Step 6: Inspect the final diff and secret scan**

```bash
git diff origin/main...HEAD --check
pnpm check:repo
git status --short
```

Expected: no whitespace error, secret/protected artifact, or unrelated change; worktree clean after commits.

- [ ] **Step 7: Push and open the pull request**

```bash
git push -u origin codex/initial-production-bootstrap
gh pr create \
  --base main \
  --head codex/initial-production-bootstrap \
  --title "Add fail-closed initial production bootstrap" \
  --body-file /tmp/frcq-bootstrap-pr-body.md
```

The PR body summarizes the one-time gate, the unchanged upgrade recovery
requirement, the owner review exception, and exact verification results. The
temporary body file contains no credential and is removed after PR creation.

- [ ] **Step 8: Require green GitHub checks before merge**

```bash
gh pr checks --watch
```

Expected: required `verify` and `secrets` checks pass. Merge with squash only
after confirming the head SHA and clean merge state. Do not bypass a failed
check.
