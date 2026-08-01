# Gate D Deployment Remediation Design

**Date:** 2026-08-01  
**Base commit:** `47835657d3705d3d756a9e84f120679eb77aa988`  
**Implementation branch:** `codex/gate-d-deployment-remediation`

## Goal

Close the deployment-readiness blockers found in the independent Gate D review
without deploying, publishing, approving a GitHub environment, changing a
remote Supabase project, or exposing secret values.

The dedicated load-test Supabase project is
`vadyhuipwbtgbzpeisbn`. It must never be accepted as the production project.

## Release architecture

Production release is split into three independently auditable controls:

1. A manually dispatched, environment-protected backend workflow validates and
   deploys database migrations, custom Edge Function secrets, and all Edge
   Functions from one approved `main` commit.
2. The Pages workflow packages and tests one `main` commit, then runs a
   read-only production preflight in a protected `production-readiness`
   environment.
3. A separate `github-pages` environment approval releases only the immutable
   artifact produced by the successful package job.

The first approval grants access to read-only production-readiness credentials.
Its output can be reviewed before the second approval authorizes publication.
The Pages deployment job has no production Supabase secret.

## GitHub environments and configuration

### `production-backend`

This environment protects the credentials that can change the production
Supabase project. It requires a named reviewer, prevents self-review, restricts
deployment to `main`, and disables administrator bypass where the repository
plan supports that control.

Environment variables:

- `PRODUCTION_SUPABASE_PROJECT_REF`
- `PRODUCTION_FRONTEND_ORIGIN`

Environment secrets:

- `SUPABASE_ACCESS_TOKEN`
- `PRODUCTION_SUPABASE_DB_PASSWORD`
- `ALLOWED_FRONTEND_ORIGINS`
- `FRONTEND_APP_URL`
- `JOIN_TOKEN_SIGNING_SECRET`
- `RECOVERY_TOKEN_SIGNING_SECRET`

### `production-readiness`

This environment permits a read-only preflight after the backend release. It
requires a reviewer but cannot publish Pages or change the database.

Environment variables:

- `PRODUCTION_SUPABASE_PROJECT_REF`
- `PRODUCTION_FRONTEND_ORIGIN`
- `PRODUCTION_CONTENT_VERSION`
- `PRODUCTION_SMOKE_TEACHER_ID`
- `PRODUCTION_SMOKE_COHORT_ID`

Environment secret:

- `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`

### `github-pages`

This environment is the final publication approval. It contains no Supabase
credentials. It requires a named reviewer, prevents self-review, restricts
deployment to `main`, and disables administrator bypass where supported.

### Repository configuration

Public repository variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_BASE_PATH`
- `LOAD_SUPABASE_PROJECT_REF`, set to `vadyhuipwbtgbzpeisbn`
- `LOAD_COHORT_ID`
- `LOAD_CONTENT_VERSION_ID`
- optional `LOAD_TEST_ENABLED` for ordinary CI

Dedicated load-test secrets remain repository secrets because the Pages
package job must run the live load gate before producing a release artifact:

- `LOAD_SUPABASE_URL`
- `LOAD_SUPABASE_ANON_KEY`
- `LOAD_SUPABASE_SERVICE_ROLE_KEY`
- `LOAD_TEACHER_ACCESS_TOKEN`
- `LOAD_JOIN_TOKEN`

## Backend release workflow

`.github/workflows/backend-production.yml` is manually dispatched and accepts:

- the expected full commit SHA;
- the expected production project reference.

The workflow refuses any non-`main` ref, abbreviated SHA, mismatch with
`github.sha`, mismatch with the protected environment project reference, or
project reference equal to `LOAD_SUPABASE_PROJECT_REF` or
`vadyhuipwbtgbzpeisbn`.

The protected job performs this sequence:

1. Check out the exact workflow commit.
2. Install locked dependencies and the repository-pinned Supabase CLI.
3. Run repository, lint, type, unit, function, Deno, migration-reset, pgTAP,
   integration, build, and bundle-privacy validation.
4. Link the CLI to the confirmed production project.
5. Record `supabase migration list`.
6. Run `supabase db push --dry-run` and record the pending migration set.
7. Apply pending migrations once, in timestamp order.
8. Set the four custom Edge Function secrets through a temporary environment
   file outside the repository and remove that file in an always-run step.
9. Deploy all Edge Functions together so `supabase/config.toml` remains the
   source of JWT-verification settings.
10. Run `scripts/production-preflight.mjs --backend-only` to verify project
    identity, migration history, required RPCs, and Edge Function boundaries,
    then record the compatible backend commit and migration marker.

The workflow never imports protected course content. Import remains a separate,
teacher-authorized operational step after backend deployment.

## Database readiness and retention

A forward-only migration replaces `get_production_readiness_report` so it
verifies migration history through `20260730020700`, including:

- `20260730020500_gate_d_security_hardening`;
- `20260730020600_service_role_provisioning`;
- `20260730020700_atomic_session_close`.

It also verifies every Gate D RPC required by the deployed functions, including
`assert_teacher_control_scope` and `close_teacher_session`. A hard-coded marker
without migration-history evidence is not accepted.

A second forward-only migration schedules `run_expired_artifact_cleanup()` once
per day with `pg_cron`. The cleanup function permits only the hosted scheduler's
database owner or the service role. The migration uses a stable named job so a
subsequent migration can replace or remove the schedule deliberately.

The release checklist requires a non-production scheduler rehearsal and proof
that expired join windows, recovery tokens, and rate-limit events are cleaned
without affecting immutable learning evidence.

## Production preflight

`scripts/production-preflight.mjs` is decomposed into testable validation and
network orchestration. It must:

- parse the project reference from `PRODUCTION_SUPABASE_URL`;
- require an exact match with `PRODUCTION_SUPABASE_PROJECT_REF`;
- reject `LOAD_SUPABASE_PROJECT_REF` and `vadyhuipwbtgbzpeisbn`;
- validate the Pages base path and production frontend origin;
- verify Auth health;
- require migration history through `20260730020700`;
- require all Gate D RPCs;
- require zero live join windows and recovery tokens;
- require the approved 24-item, 8-concept content version;
- require the smoke teacher/cohort and approved retention setting;
- probe all ten Edge Function endpoints with a safe `GET` request and require
  the deployed method-boundary response rather than a missing-function or
  server-error response;
- output only non-sensitive readiness evidence.

Unit tests cover configuration parsing, load/production separation, migration
and RPC failures, Edge Function failure aggregation, and redaction-safe output.

## Protected-content import guard

Every non-local import requires `--confirm-project-ref=<exact-ref>`, regardless
of whether `PRODUCTION_SUPABASE_PROJECT_REF` is set. Local imports remain
available without confirmation. The tool reports only counts and the version
key; it never logs the service-role key or protected content.

## Pages artifact integrity

The package job has only `contents: read`. Pages write and OIDC permissions are
granted only to the final deploy job.

The package job:

- creates a sorted SHA-256 manifest for every public artifact file;
- validates the manifest before upload;
- uploads one `github-pages` artifact with 90-day retention;
- exposes the immutable GitHub artifact ID as a job output;
- writes the commit SHA, artifact ID, and manifest digest to the workflow
  summary without printing configuration values.

The preflight job downloads the artifact by ID, verifies its archive shape and
embedded manifest, and records successful verification. The final deploy job
depends on that exact preflight job and uses the same-run `github-pages`
artifact without rebuilding.

Release actions are pinned to reviewed full commit SHAs. Dependency-update
automation may update those pins through normal review.

## Rollback and recovery

`.github/workflows/pages-rollback.yml` is manually dispatched with the prior
successful Pages workflow run ID, prior commit SHA, and recorded manifest
digest. A protected job downloads the retained `github-pages` artifact from
that run, verifies the embedded manifest and supplied digest, re-uploads the
unchanged Pages archive into the rollback run, and deploys it through the
`github-pages` environment. It never rebuilds the prior commit.

The operations documentation defines:

- how to identify the previous successful Pages workflow run and artifact ID;
- how to verify its recorded manifest digest;
- how to invoke the protected rollback workflow within the 90-day retention
  window;
- the maintenance-page procedure for a first release without a prior artifact;
- exact Edge Function rollback by redeploying the previous compatible commit;
- exact containment by closing joins and pausing quest starts;
- forward-only compensating database migrations;
- required pre-migration backup evidence and a non-production restore rehearsal;
- responsible roles, timestamps, release identifiers, and exit criteria.

Rollback never uses `supabase db reset`, destructive history repair, or a
rebuild of an old frontend commit with current dependencies.

## Tests and acceptance criteria

Repository tests inspect workflow YAML and operations documents as data. They
fail when:

- production and load project references are not compared;
- backend deployment lacks dry-run, ordered migration push, function secrets,
  or function deployment;
- Pages preflight and publication share one approval gate;
- the package job has Pages write or OIDC permission;
- artifact retention is below 90 days or artifact identity is not recorded;
- rollback can rebuild an old commit or deploy an unverified prior artifact;
- the readiness RPC omits migrations `20500` through `20700` or the atomic
  session-close RPC;
- cleanup is unscheduled;
- rollback lacks artifact, function, database, backup, and first-release paths;
- remote protected-content import lacks exact project confirmation.

Completion requires lint, typecheck, all unit and function tests, Deno checks,
local Supabase reset and pgTAP, black-box integration tests, production build,
bundle scan, Playwright, and the load-plan test. A live load run remains release
evidence and is not performed during implementation unless separately
authorized.

## Non-goals

- No GitHub environment is created, approved, or modified by this work.
- No workflow is dispatched.
- No Supabase project is linked, migrated, configured, or queried remotely.
- No production content is imported.
- No secret value is read, generated, displayed, or committed.
- No Pages artifact is published.
