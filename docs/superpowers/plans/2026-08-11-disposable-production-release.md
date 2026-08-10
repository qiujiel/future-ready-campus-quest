# Disposable Production Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mandatory external backup/rehearsal release gate with a fail-closed, aggregate-only `disposable-upgrade` preflight and deploy only if production contains the exact replaceable bootstrap fixture.

**Architecture:** A standalone script validates exact production identity, executes one read-only Management API SQL query, validates a complete aggregate snapshot, and emits only a redaction-safe receipt. The protected backend workflow runs it before linking or any mutation; release authorization and documentation expose no backup/reviewer inputs.

**Tech Stack:** Node.js 24 ESM, Vitest, GitHub Actions YAML, Supabase Management API, existing deployment configuration validator.

## Global Constraints

- Target only `ghohuwwjxgjqnbsauvzq`; reject `vadyhuipwbtgbzpeisbn` and every other ref/URL.
- Never print or persist credentials, user identifiers, email addresses, display names, answers, or row content.
- No second reviewer, external backup, restore rehearsal, cloud/offline custody, `age`, or recovery evidence is required.
- Do not change runtime authentication, authorization, RLS, rate/capacity controls, replay protection, retention, or production configuration.
- Preserve automated tests, secret scanning, exact SHA validation, migration order/dry-run, protected credentials, RLS/authorization verification, and fail-closed deployment.
- The disposable preflight must run before production link, migration list/push, secret update, or Function deployment.
- Any nonzero protected-data aggregate, unexpected fixture count, malformed response, network error, or identity mismatch blocks without deleting data.

---

### Task 1: Aggregate disposable-state classifier

**Files:**
- Create: `scripts/production-disposable-state-core.mjs`
- Create: `scripts/production-disposable-state.mjs`
- Create: `tests/deployment/production-disposable-state.test.js`

**Interfaces:**
- Produces `readDisposableStateConfiguration(environment)`, `evaluateDisposableStateSnapshot(snapshot, configuration)`, and `fetchDisposableStateSnapshot(configuration, fetchImpl)`.
- CLI reads only `RELEASE_MODE`, `PRODUCTION_SUPABASE_PROJECT_REF`, `LOAD_SUPABASE_PROJECT_REF`, `PRODUCTION_SUPABASE_URL`, and `SUPABASE_ACCESS_TOKEN`.

- [ ] **Step 1: Write failing classifier tests**

Add literal fixtures for the exact accepted state: one marked Auth teacher, one exact unarchived five-group `Production Classroom`, zero other Auth/cohorts, closed joining and quest starts, and zero protected student/activity/upload rows. Assert acceptance returns only project ref, mode, `replaceableState: true`, and aggregate counts. Add one case per protected category plus malformed response, unexpected account/cohort, wrong ref/URL, load target, and fetch failure; assert every case rejects with a redacted generic error.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run tests/deployment/production-disposable-state.test.js
```

Expected: fail because `production-disposable-state-core.mjs` does not exist.

- [ ] **Step 3: Implement the minimal classifier and read-only adapter**

Use one constant parameterized SQL statement sent to
`https://api.supabase.com/v1/projects/ghohuwwjxgjqnbsauvzq/database/query`
with `{ read_only: true }`. It returns every required aggregate, including Auth,
fixture/cohort/group/session state, all public/private student and activity
tables, and `storage.objects` for `group-images`. Validate the response shape and
nonnegative integer types before evaluating. Convert every adapter failure to a
generic message without response bodies or credentials.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 test file and confirm all cases pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/production-disposable-state-core.mjs scripts/production-disposable-state.mjs tests/deployment/production-disposable-state.test.js
git commit -m "feat: gate disposable production upgrades"
```

### Task 2: Protected workflow and authorization policy

**Files:**
- Modify: `.github/workflows/backend-production.yml`
- Modify: `scripts/production-release-authorization.mjs`
- Modify: `scripts/deployment-config.mjs`
- Modify: `tests/deployment/production-release-authorization.test.js`
- Modify: `tests/deployment/deployment-config.test.js`
- Delete: `scripts/recovery-evidence.mjs`
- Delete: `tests/deployment/recovery-evidence.test.js`

**Interfaces:**
- Consumes the Task 1 CLI.
- Produces workflow modes `bootstrap` and `disposable-upgrade`; no recovery-evidence dispatch inputs or environment mappings remain.

- [ ] **Step 1: Write failing authorization and workflow tests**

Change the literal expected workflow input definitions to only `release_mode`
and `bootstrap_authorization_id`, with default `disposable-upgrade` and options
`[disposable-upgrade, bootstrap]`. Assert `disposable-upgrade` accepts blank
bootstrap authorization, rejects recovery fields if supplied to the validator,
and the workflow contains an unconditional fail-closed disposable-state step
before the production link and every mutation. Assert the step receives only
the Management API access token among secrets and cannot use
`continue-on-error`.

- [ ] **Step 2: Verify RED**

Run the two Task 2 test files. Expected: failures for the old `upgrade` mode,
old recovery inputs, and missing disposable-state workflow step.

- [ ] **Step 3: Implement the minimal authorization/workflow change**

Remove recovery-evidence imports, mappings, inputs, and validation. Preserve
bootstrap validation. Add the protected preflight step with
`if: inputs.release_mode == 'disposable-upgrade'` immediately before linking
production, with only `SUPABASE_ACCESS_TOKEN` plus existing non-secret identity
variables. Update the canonical backend workflow digest only after the final
workflow content is fixed.

- [ ] **Step 4: Verify GREEN**

Run the Task 2 tests plus Task 1. Confirm every mutation/skip/secret-leak test
passes.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/backend-production.yml scripts/production-release-authorization.mjs scripts/deployment-config.mjs tests/deployment/production-release-authorization.test.js tests/deployment/deployment-config.test.js scripts/recovery-evidence.mjs tests/deployment/recovery-evidence.test.js
git commit -m "ci: authorize disposable production release"
```

### Task 3: Policy and operator documentation

**Files:**
- Modify: `docs/operations/free-plan-recovery.md`
- Modify: `docs/operations/backend-release.md`
- Modify: `docs/operations/release-checklist.md`
- Modify: `docs/operations/deployment-readiness-review.md`
- Modify: `docs/operations/github-environments.md`
- Modify: `docs/operations/rollback.md`
- Modify: `tests/deployment/recovery-documentation.test.js`

**Interfaces:**
- Documents the exact Task 1 classifier and Task 2 workflow contract.
- Does not create a replacement reviewer, backup, or restore evidence field.

- [ ] **Step 1: Write failing policy tests**

Replace mandatory backup/rehearsal assertions with behavior-contract assertions:
the docs describe the exact aggregate gate, no-delete behavior, fail-closed
transition once user data exists, exact SHA/project controls, replaceable-state
rebuild strategy, and existing Pages rollback. Assert the formal checklist has
no mandatory reviewer, `age`, cloud/offline copy, backup evidence, or restore
rehearsal field.

- [ ] **Step 2: Verify RED**

Run `tests/deployment/recovery-documentation.test.js`; expect failures against
the mandatory external-recovery language.

- [ ] **Step 3: Implement the minimal documentation change**

Rewrite the Free-plan recovery runbook as the disposable-state recovery policy,
remove mandatory external evidence/reviewer checklist entries, update backend
dispatch instructions to `disposable-upgrade`, and retain the immutable Pages
artifact/forward-redeploy rollback path. Do not weaken runtime or deployment
security controls.

- [ ] **Step 4: Verify GREEN**

Run the documentation test plus all deployment tests and `pnpm check:deployment`.

- [ ] **Step 5: Commit**

```bash
git add docs/operations tests/deployment/recovery-documentation.test.js
git commit -m "docs: adopt disposable-state recovery policy"
```

### Task 4: Integrated verification, review, merge, and release

**Files:**
- Verify all changed files; no planned new runtime changes.

**Interfaces:**
- Produces a reviewed merged SHA and uses that exact SHA for protected deployment.

- [ ] **Step 1: Run focused verification**

Run all deployment tests, `pnpm check:repo`, and `pnpm check:deployment`.

- [ ] **Step 2: Run full verification**

Run unit, Function, pgTAP, Deno, integration, lint, typecheck, build, bundle,
and secret/privacy scans already required by the repository.

- [ ] **Step 3: Review and merge**

Obtain code review through the approved agent-review process (not a human
deployment reviewer), fix material findings, push, open a PR, wait for required
CI, and merge.

- [ ] **Step 4: Run the protected backend workflow**

Dispatch `Release Production Backend` from the exact merged SHA with
`release_mode=disposable-upgrade`, blank bootstrap authorization, and exact
production ref. The aggregate preflight must prove replaceable state before any
mutation; a failure stops and is reported without deleting data.

- [ ] **Step 5: Deploy and accept the hosted release**

After backend readiness succeeds, dispatch Pages from the same SHA, verify the
artifact digest and hosted metadata, then run clean teacher and multiple-student
sessions covering join, activity, persistence, dashboard, and permission
boundaries. Close joining after tests and provide the final HTTPS URL.
