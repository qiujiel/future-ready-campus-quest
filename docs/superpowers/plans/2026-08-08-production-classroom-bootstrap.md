# Production Classroom Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and run a one-time, approval-gated bootstrap that records the approved 90-day production retention policy and provisions an idempotent teacher/smoke-cohort fixture without exposing credentials.

**Architecture:** A testable TypeScript core validates exact production identity, constructs the only permitted parameterized retention query, and orchestrates idempotent teacher/cohort setup through injected adapters. A thin production adapter uses the modern Supabase secret key and authenticated Management API. A structural validator protects the main-only GitHub workflow, which executes from an immutable SHA in `production-backend`, records only opaque IDs/counts, and is retired after success.

**Tech Stack:** Node.js 24, TypeScript, Vitest, `@supabase/supabase-js`, GitHub Actions, Supabase Management API, GitHub CLI.

## Global Constraints

- Production project is exactly `ghohuwwjxgjqnbsauvzq`.
- Dedicated load-test project is exactly `vadyhuipwbtgbzpeisbn` and must never be mutated.
- Retention is exactly the course-owner-approved `90` days.
- Authorization ID is exactly `course-owner-2026-08-08`; the stored approver label is `course-owner`.
- Content version is exactly `2026-07-30-approved-blueprint-v1` with 24 items and 8 concepts.
- Use only the modern `PRODUCTION_SUPABASE_SECRET_KEY`; reject legacy production service-role names.
- Teacher email and temporary password exist only in encrypted `production-backend` secrets.
- Never print credentials, email, arbitrary Management API bodies, protected content, or SQL row data containing personal information.
- Keep student joining closed and quest starts disabled throughout bootstrap.
- Do not deploy migrations, redeploy Functions, publish Pages, or approve `github-pages` in this plan.

## File structure

- Create `scripts/production-classroom-bootstrap.ts`: runtime types, validation, fixed retention query, idempotent orchestration, Supabase/Management adapters, and CLI.
- Create `tests/deployment/production-classroom-bootstrap.test.ts`: runtime validation, idempotency, redaction, and adapter-boundary tests.
- Create `scripts/production-classroom-bootstrap-config.mjs`: structural workflow validator.
- Create `tests/deployment/production-classroom-bootstrap-workflow.test.js`: mutation-order, identity, secret, action-pin, artifact, and cleanup tests.
- Create `.github/workflows/production-classroom-bootstrap.yml`: one-time protected workflow.
- Modify `scripts/deployment-config.mjs`: load and validate the new workflow.
- Modify `package.json`: add `bootstrap:production-classroom`.
- Modify `.env.example`: document secret names only.
- Modify `docs/operations/backend-release.md` and `docs/operations/release-checklist.md`: document execution, receipts, rotation, and retirement.
- Delete the one-time workflow and validator/test in a final protected cleanup pull request after successful setup.

---

### Task 1: Runtime configuration and retention boundary

**Files:**
- Create: `scripts/production-classroom-bootstrap.ts`
- Create: `tests/deployment/production-classroom-bootstrap.test.ts`

**Interfaces:**
- Produces: `BootstrapConfiguration`, `BootstrapReceipt`, `assertBootstrapConfiguration(configuration): void`, `RETENTION_QUERY`, and `bootstrapProductionClassroom(configuration, dependencies): Promise<BootstrapReceipt>`.
- Consumes: no production network in this task; all dependencies are injected.

- [ ] **Step 1: Write failing configuration and query tests**

Create tests that import the absent module and assert:

```ts
const validConfiguration = {
  supabaseUrl: "https://ghohuwwjxgjqnbsauvzq.supabase.co",
  productionProjectRef: "ghohuwwjxgjqnbsauvzq",
  loadProjectRef: "vadyhuipwbtgbzpeisbn",
  secretKey: "synthetic-modern-secret",
  accessToken: "synthetic-management-token",
  teacherEmail: "teacher@example.test",
  teacherPassword: "Example@2026",
  retentionDays: 90,
  authorizationId: "course-owner-2026-08-08",
};

expect(() => assertBootstrapConfiguration(validConfiguration)).not.toThrow();
expect(() => assertBootstrapConfiguration({
  ...validConfiguration,
  productionProjectRef: "vadyhuipwbtgbzpeisbn",
})).toThrow(/production identity/i);
expect(() => assertBootstrapConfiguration({
  ...validConfiguration,
  retentionDays: 89,
})).toThrow(/retention authorization/i);
expect(() => assertBootstrapConfiguration({
  ...validConfiguration,
  teacherPassword: "short",
})).toThrow(/teacher credential policy/i);
expect(RETENTION_QUERY).toContain("private.data_retention_configuration");
expect(RETENTION_QUERY).toContain("$1");
expect(RETENTION_QUERY).toContain("$2");
expect(RETENTION_QUERY).not.toMatch(/90|course-owner/);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
PATH='/Users/qiujieli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':$PATH ./node_modules/.bin/vitest run tests/deployment/production-classroom-bootstrap.test.ts
```

Expected: FAIL because `scripts/production-classroom-bootstrap.ts` does not exist.

- [ ] **Step 3: Implement minimal validation and fixed query**

Define exact types:

```ts
export interface BootstrapConfiguration {
  supabaseUrl: string;
  productionProjectRef: string;
  loadProjectRef: string;
  secretKey: string;
  accessToken: string;
  teacherEmail: string;
  teacherPassword: string;
  retentionDays: number;
  authorizationId: string;
}

export interface BootstrapReceipt {
  teacherId: string;
  cohortId: string;
  retentionDays: 90;
  groupCount: 5;
  groupCapacity: 6;
}

export const RETENTION_QUERY = `
update private.data_retention_configuration
set cohort_retention_days = $1,
    approved_by = $2,
    approved_at = coalesce(approved_at, now()),
    updated_at = now()
where singleton = true
  and (
    cohort_retention_days is null
    or (cohort_retention_days = $1 and approved_by = $2)
  )
returning cohort_retention_days as "retentionDays";
`;
```

Validation must require the exact refs, HTTPS project-root URL, nonempty modern secret/access token, syntactically valid email, a password of at least eight characters containing a letter, digit, and non-alphanumeric character, exactly 90 days, and the exact authorization ID. Every thrown message is a static operation-class message and never interpolates an input.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Task 1 Vitest command. Expected: PASS with pristine output.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/production-classroom-bootstrap.ts tests/deployment/production-classroom-bootstrap.test.ts
git commit -m "feat: validate production classroom bootstrap"
```

---

### Task 2: Idempotent provisioning orchestration

**Files:**
- Modify: `scripts/production-classroom-bootstrap.ts`
- Modify: `tests/deployment/production-classroom-bootstrap.test.ts`

**Interfaces:**
- Consumes: `BootstrapConfiguration`, `BootstrapReceipt`, and `RETENTION_QUERY` from Task 1.
- Produces:

```ts
export interface BootstrapUser {
  id: string;
  bootstrapAuthorizationId?: string;
}

export interface BootstrapCohort {
  id: string;
  teacherId: string;
  title: string;
  groupCount: number;
  groupCapacity: number;
  archivedAt: string | null;
}

export interface BootstrapDependencies {
  updateRetention(days: 90, approver: "course-owner"): Promise<90>;
  findTeacherByEmail(email: string): Promise<BootstrapUser | null>;
  createTeacher(input: {
    email: string;
    password: string;
    authorizationId: string;
  }): Promise<BootstrapUser>;
  ensureTeacherRole(teacherId: string): Promise<void>;
  findSmokeCohort(teacherId: string): Promise<BootstrapCohort | null>;
  createSmokeCohort(teacherId: string): Promise<BootstrapCohort>;
  verifyClosedClassroom(teacherId: string, cohortId: string): Promise<void>;
}
```

- [ ] **Step 1: Write failing orchestration tests**

Use in-memory dependency functions and assert real orchestration behavior:

```ts
it("creates the marked teacher and closed smoke cohort once", async () => {
  const calls: string[] = [];
  const receipt = await bootstrapProductionClassroom(validConfiguration, {
    updateRetention: async () => { calls.push("retention"); return 90; },
    findTeacherByEmail: async () => null,
    createTeacher: async () => {
      calls.push("create-teacher");
      return { id: TEACHER_ID, bootstrapAuthorizationId: validConfiguration.authorizationId };
    },
    ensureTeacherRole: async () => { calls.push("teacher-role"); },
    findSmokeCohort: async () => null,
    createSmokeCohort: async () => {
      calls.push("create-cohort");
      return closedSmokeCohort;
    },
    verifyClosedClassroom: async () => { calls.push("verify-closed"); },
  });
  expect(calls).toEqual([
    "retention", "create-teacher", "teacher-role", "create-cohort", "verify-closed",
  ]);
  expect(receipt).toEqual({
    teacherId: TEACHER_ID,
    cohortId: COHORT_ID,
    retentionDays: 90,
    groupCount: 5,
    groupCapacity: 6,
  });
});
```

Add separate tests proving a same-marker teacher/cohort retry creates nothing, an unrelated existing email fails before password/metadata changes, archived or wrong-size cohorts fail, retention failure stops account creation, and thrown errors do not contain the fixture email/password/token.

- [ ] **Step 2: Run tests and verify RED**

Run the focused Task 1 command. Expected: FAIL because orchestration and dependency interfaces are absent.

- [ ] **Step 3: Implement minimal orchestration**

Implement this order only: validate configuration, update retention, find/create marked teacher, ensure role, find/create exact cohort, validate cohort shape and ownership, verify joining/starts closed, return opaque receipt. Throw static codes such as `BOOTSTRAP_ACCOUNT_CONFLICT`, `BOOTSTRAP_COHORT_INVALID`, and `BOOTSTRAP_VERIFICATION_FAILED`; never append dependency error messages.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the focused Task 1 command. Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/production-classroom-bootstrap.ts tests/deployment/production-classroom-bootstrap.test.ts
git commit -m "feat: orchestrate classroom bootstrap"
```

---

### Task 3: Production Supabase and Management API adapters

**Files:**
- Modify: `scripts/production-classroom-bootstrap.ts`
- Modify: `tests/deployment/production-classroom-bootstrap.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `BootstrapDependencies` from Task 2 and `createClient` from `@supabase/supabase-js`.
- Produces: `createProductionBootstrapDependencies(configuration, fetchImplementation?)` and a CLI that reads only named environment variables and prints only `BootstrapReceipt` JSON.

- [ ] **Step 1: Write failing adapter-boundary tests**

Inject a recording `fetch` and assert the Management API request is exactly:

```ts
expect(request.url).toBe(
  "https://api.supabase.com/v1/projects/ghohuwwjxgjqnbsauvzq/database/query",
);
expect(request.init.method).toBe("POST");
expect(request.init.headers).toMatchObject({
  Authorization: "Bearer synthetic-management-token",
  "Content-Type": "application/json",
});
expect(JSON.parse(String(request.init.body))).toEqual({
  query: RETENTION_QUERY,
  parameters: [90, "course-owner"],
  read_only: false,
});
```

Add tests that non-201 responses throw `BOOTSTRAP_RETENTION_FAILED` without including the response body, Auth creation uses `email_confirm: true` plus `app_metadata.role` and the bootstrap marker, existing unrelated users are not updated, role/cohort writes use exact columns, closed-classroom verification rejects live join windows, and CLI configuration names contain neither `SERVICE_ROLE` nor credential values.

- [ ] **Step 2: Run tests and verify RED**

Run the focused Task 1 command. Expected: FAIL because production adapters are absent.

- [ ] **Step 3: Implement minimal adapters and CLI**

Use `createClient(configuration.supabaseUrl, configuration.secretKey, { auth: { persistSession: false, autoRefreshToken: false } })`. Paginate `auth.admin.listUsers` until an exact normalized email match or exhaustion. Create only a missing user with confirmed email and app metadata `{ role: "teacher", bootstrapAuthorizationId }`. Use service-level table access to insert/confirm `user_roles`, `cohorts`, and five generated `groups`; verify no active `cohort_join_windows` row and no open/allowed session control.

The CLI reads:

```ts
{
  supabaseUrl: process.env.PRODUCTION_SUPABASE_URL ?? "",
  productionProjectRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF ?? "",
  loadProjectRef: process.env.LOAD_SUPABASE_PROJECT_REF ?? "",
  secretKey: process.env.PRODUCTION_SUPABASE_SECRET_KEY ?? "",
  accessToken: process.env.SUPABASE_ACCESS_TOKEN ?? "",
  teacherEmail: process.env.PRODUCTION_TEACHER_EMAIL ?? "",
  teacherPassword: process.env.PRODUCTION_TEACHER_PASSWORD ?? "",
  retentionDays: Number(process.env.PRODUCTION_RETENTION_DAYS),
  authorizationId: process.env.BOOTSTRAP_AUTHORIZATION_ID ?? "",
}
```

Add `"bootstrap:production-classroom": "node scripts/production-classroom-bootstrap.ts"` to `package.json`.

- [ ] **Step 4: Run focused tests, typecheck, and lint**

```bash
PATH='/Users/qiujieli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':$PATH ./node_modules/.bin/vitest run tests/deployment/production-classroom-bootstrap.test.ts
PATH='/Users/qiujieli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':$PATH ./node_modules/.bin/tsc -b --pretty false
PATH='/Users/qiujieli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':$PATH ./node_modules/.bin/eslint scripts/production-classroom-bootstrap.ts tests/deployment/production-classroom-bootstrap.test.ts --max-warnings 0
```

Expected: all PASS with no credential values in output.

- [ ] **Step 5: Commit Task 3**

```bash
git add package.json scripts/production-classroom-bootstrap.ts tests/deployment/production-classroom-bootstrap.test.ts
git commit -m "feat: connect protected classroom bootstrap"
```

---

### Task 4: Approval-gated one-time workflow

**Files:**
- Create: `.github/workflows/production-classroom-bootstrap.yml`
- Create: `scripts/production-classroom-bootstrap-config.mjs`
- Create: `tests/deployment/production-classroom-bootstrap-workflow.test.js`
- Modify: `scripts/deployment-config.mjs`

**Interfaces:**
- Consumes: package command from Task 3 and existing `production-backend` variables/secrets.
- Produces: `validateProductionClassroomBootstrapConfiguration(workflow): void` and a workflow receipt containing only opaque IDs and counts.

- [ ] **Step 1: Write failing workflow-validator tests**

Load the absent YAML and validator. The canonical workflow test must pass only when it has required inputs `expected_sha`, `production_project_ref`, `retention_days`, and `bootstrap_authorization_id`; exact identity checks; `github.ref == 'refs/heads/main'`; environment `production-backend`; only `contents: read`; fully pinned Actions; immutable checkout without persisted credentials; verification before bootstrap; modern credential mappings; no artifact Actions; a receipt path under `/tmp`; and `always()` cleanup.

Mutation tests must independently replace the production ref with the load ref, set retention to 89, add `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`, add `actions/upload-artifact`, move bootstrap before verification, remove cleanup, or add `set -x`, and expect a specific validator failure.

- [ ] **Step 2: Run tests and verify RED**

```bash
PATH='/Users/qiujieli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':$PATH ./node_modules/.bin/vitest run tests/deployment/production-classroom-bootstrap-workflow.test.js
```

Expected: FAIL because the workflow and validator do not exist.

- [ ] **Step 3: Implement the validator and workflow**

The workflow order is:

1. validate exact SHA/ref/90-day/authorization identity before checkout;
2. checkout `${{ github.sha }}` with `persist-credentials: false`;
3. install locked Node/pnpm dependencies;
4. run `check:repo`, `check:deployment`, lint, typecheck, application tests, and Function tests;
5. run `pnpm bootstrap:production-classroom` with secrets mapped only on that step and redirect its receipt to `/tmp/campus-quest-classroom-bootstrap.json`;
6. parse the receipt, validate UUID/count shapes, and print only its compact JSON;
7. remove the receipt with `if: always()`.

The workflow concurrency group is `campus-quest-production-backend`; it never runs Supabase CLI mutation commands, migration commands, Function deployment, Pages deployment, or artifact upload.

Load and validate this workflow from `scripts/deployment-config.mjs`.

- [ ] **Step 4: Run workflow/deployment tests and verify GREEN**

```bash
PATH='/Users/qiujieli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':$PATH ./node_modules/.bin/vitest run tests/deployment/production-classroom-bootstrap-workflow.test.js tests/deployment/deployment-config.test.js
PATH='/Users/qiujieli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin':$PATH node scripts/deployment-config.mjs
```

Expected: PASS and `Deployment workflow boundaries passed.`

- [ ] **Step 5: Commit Task 4**

```bash
git add .github/workflows/production-classroom-bootstrap.yml scripts/production-classroom-bootstrap-config.mjs scripts/deployment-config.mjs tests/deployment/production-classroom-bootstrap-workflow.test.js
git commit -m "ops: gate production classroom bootstrap"
```

---

### Task 5: Documentation, full verification, and protected merge

**Files:**
- Modify: `.env.example`
- Modify: `docs/operations/backend-release.md`
- Modify: `docs/operations/release-checklist.md`

**Interfaces:**
- Consumes: completed runtime/workflow behavior.
- Produces: operator instructions containing secret names only and the required post-success retirement step.

- [ ] **Step 1: Add documentation regression assertions**

Extend the workflow test to read the two operations documents and assert the exact terms `PRODUCTION_TEACHER_EMAIL`, `PRODUCTION_TEACHER_PASSWORD`, `90`, `course-owner-2026-08-08`, `production-classroom-bootstrap.yml`, `PRODUCTION_SMOKE_TEACHER_ID`, `PRODUCTION_SMOKE_COHORT_ID`, `rotate`, and `remove the one-time workflow`.

- [ ] **Step 2: Run the workflow test and verify RED**

Expected: FAIL because the documentation does not yet contain the bootstrap procedure.

- [ ] **Step 3: Document exact operation and inventory**

Add only empty secret-name entries to `.env.example`. Document the immutable dispatch inputs, expected opaque receipt, setting the two readiness variables, immediate credential rotation before live student use, and retirement of the workflow/validator after success. Do not include the teacher email or password.

- [ ] **Step 4: Run complete local verification**

Run 367+ application/deployment tests, 61 Function tests, typecheck, lint, repository/privacy checks, deployment checks, frozen Deno checks for all 11 Functions, production Vite build with synthetic public variables, and bundle privacy scan. Expected: all PASS; exact counts may increase from the new tests.

- [ ] **Step 5: Final credential scan**

Run `git diff --check`, the repository privacy checker, and a diff scan for secret-key/JWT/private-key/password assignments. Confirm the protected content and actual teacher credentials are absent from tracked files and reachable history.

- [ ] **Step 6: Commit documentation, push, open PR, and wait for all checks**

```bash
git add .env.example docs/operations/backend-release.md docs/operations/release-checklist.md tests/deployment/production-classroom-bootstrap-workflow.test.js
git commit -m "docs: record classroom bootstrap procedure"
git push -u origin codex/production-classroom-bootstrap
```

Open a non-draft PR, wait for both secret scans and both full verification runs, and squash-merge only when all are green.

---

### Task 6: Secure execution and readiness handoff

**Files:**
- No tracked credential file.
- Later cleanup: delete `.github/workflows/production-classroom-bootstrap.yml`, `scripts/production-classroom-bootstrap-config.mjs`, and its workflow-validator test after success.

**Interfaces:**
- Consumes: approved main SHA, encrypted teacher credentials, existing production modern secret/Management token.
- Produces: opaque teacher/cohort UUIDs and configured production readiness variables.

- [ ] **Step 1: Store credentials without printing them**

Set `PRODUCTION_TEACHER_EMAIL` and `PRODUCTION_TEACHER_PASSWORD` as encrypted `production-backend` environment secrets. Verify inventory by name only.

- [ ] **Step 2: Dispatch exact immutable bootstrap**

Dispatch from `main` with exact merged SHA, ref `ghohuwwjxgjqnbsauvzq`, retention `90`, and authorization ID `course-owner-2026-08-08`. Monitor every step and stop on any failure.

- [ ] **Step 3: Record redaction-safe receipt and readiness variables**

Extract only teacher UUID, cohort UUID, retention days, group count, and capacity from the successful log. Set `PRODUCTION_CONTENT_VERSION`, `PRODUCTION_SMOKE_TEACHER_ID`, and `PRODUCTION_SMOKE_COHORT_ID` in the protected `production-readiness` environment. List variables by name/value only because these three values are explicitly non-sensitive.

- [ ] **Step 4: Run production readiness without Pages publication**

Run the backend/preflight boundary that consumes only `PRODUCTION_READINESS_SECRET` and the three non-sensitive variables. Confirm content, teacher/cohort ownership, 90-day retention, unique cleanup schedule, exact project identity, and all 11 Function boundaries. Do not approve or run the final Pages deploy in this task.

- [ ] **Step 5: Retire the one-time workflow**

Create a protected cleanup PR removing the bootstrap workflow/validator/test and the already-successful one-time Function-repair workflow/validator/test. Update deployment configuration and operations docs so no reusable one-time production mutation path remains. Run the complete verification suite and merge only after all checks pass.

- [ ] **Step 6: Continue to Pages publication and hosted E2E**

Resume the existing deployment plan: package and inspect the 90-day Pages artifact, run readiness, approve Pages only at the authorized gate, publish the immutable frontend, test clean teacher/student sessions, verify permission boundaries and persistence, fix blockers via protected PRs, rotate the temporary teacher password, and deliver the final HTTPS URL and usage instructions.
