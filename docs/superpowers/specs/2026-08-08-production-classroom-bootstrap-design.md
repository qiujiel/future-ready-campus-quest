# Production Classroom Bootstrap Design

## Goal

Complete the one-time production configuration required before GitHub Pages can
be published: record the course owner's approved 90-day retention period,
provision one teacher account, create one unarchived smoke cohort, and produce
only the opaque teacher/cohort identifiers needed by production readiness.

This operation follows the successful backend deployment and protected import
of content version `2026-07-30-approved-blueprint-v1`. It must never change
migrations, redeploy Functions, publish Pages, expose credentials, or touch the
dedicated load-test project `vadyhuipwbtgbzpeisbn`.

## Considered approaches

### 1. Protected one-time GitHub workflow (recommended)

Run a main-only workflow in the existing `production-backend` environment.
Require an exact approved commit, exact production project ref, fixed retention
period, and a redaction-safe authorization identifier. Supply the teacher email
and temporary password only through encrypted environment secrets.

This provides an immutable source, an approval record, automatic tests, exact
target guards, secret redaction, reproducible receipts, and a safe retry path.

### 2. Manual Supabase dashboard setup

Set retention through the SQL editor and create the teacher through Auth. This
has fewer repository changes, but it is easier to target the wrong project,
harder to prove exactly what ran, and provides weak replay and rollback
evidence.

### 3. Direct local production script

Run the bootstrap from the operator's machine. This is fast, but it increases
the chance that credentials enter shell history or logs and lacks the protected
environment's exact-SHA approval boundary.

The protected one-time workflow is selected.

## Architecture

The implementation has three small boundaries:

1. `production-classroom-bootstrap-config.mjs` validates workflow structure:
   main-only execution, read-only repository permission, pinned Actions, exact
   production/load identities, fixed 90-day retention, encrypted credential
   mappings, ordered validation before mutation, no artifact upload, and
   always-run cleanup.
2. `production-classroom-bootstrap.ts` validates runtime configuration and
   performs idempotent setup. It uses the modern Supabase secret key for Auth
   and application-table provisioning. It uses the protected Supabase
   Management API token only for the fixed, parameterized retention update to
   the private schema. The Management API supports authenticated SQL queries at
   `POST /v1/projects/{ref}/database/query`; no arbitrary SQL comes from workflow
   inputs.
3. `production-classroom-bootstrap.yml` checks the immutable source, reruns the
   repository/deployment/test gates, executes the bootstrap, emits only an
   opaque receipt, and deletes temporary material. The workflow is removed in a
   protected pull request after successful readiness setup.

## Data flow and idempotency

The workflow receives only these redaction-safe inputs:

- full approved `main` commit SHA;
- production project ref `ghohuwwjxgjqnbsauvzq`;
- retention days `90`;
- authorization ID `course-owner-2026-08-08`.

Encrypted `production-backend` secrets supply the teacher email, temporary
password, modern Supabase secret key, and Supabase Management API token. The
script never prints these values.

The script first validates all identities and credentials locally. It then:

1. records `90`, `course-owner`, and the database timestamp in
   `private.data_retention_configuration` using a fixed parameterized query;
2. creates an email-confirmed Auth user with `app_metadata.role = teacher` and a
   bootstrap marker;
3. inserts or confirms the matching `public.user_roles` teacher row;
4. creates or confirms one unarchived `Production Classroom` cohort configured
   for five groups of six;
5. verifies the retention record, teacher role, cohort ownership, generated
   groups, and that no live join window exists;
6. outputs only `{ teacherId, cohortId, retentionDays, groupCount,
   groupCapacity }`.

If an existing teacher account lacks the same bootstrap marker, the workflow
fails without changing its password or metadata. A retry may resume only the
same marked account and cohort, making partial failure recoverable without
duplicating identities or groups.

## Error handling and rollback

Every validation runs before mutation and errors expose only an operation class,
never an email, password, token, response body, or SQL result containing private
data. The fixed retention update is reversible by a separately approved query;
the newly created smoke teacher/cohort can be removed before any student joins.
The bootstrap keeps joining closed and quest starts disabled, so a partial run
cannot admit students.

If verification fails, Pages remains blocked and the operator inspects only
redaction-safe status. No migration rollback or load-test project action is
allowed.

## Verification

Test-driven coverage must first fail for the absent implementation and then
prove:

- exact project/SHA/retention/authorization validation;
- rejection of the load-test project, legacy service-role credentials,
  unpinned Actions, artifacts, credential printing, and mutation before checks;
- password-policy and email validation without including their values in
  failures;
- idempotent same-marker retry and fail-closed unrelated-account behavior;
- fixed parameterized retention query and receipt redaction;
- full application/deployment tests, Function tests, typecheck, lint,
  repository/privacy guards, Deno checks, production build, and bundle scan.

After the workflow succeeds, the opaque IDs become the protected
`PRODUCTION_SMOKE_TEACHER_ID` and `PRODUCTION_SMOKE_COHORT_ID` environment
variables. The temporary password must be rotated before real classroom use.
