# Supabase Production Release Procedure

This procedure changes only `ghohuwwjxgjqnbsauvzq` from a protected workflow
run on `main`. Reading this document does not authorize deployment. The
dedicated load project `vadyhuipwbtgbzpeisbn` is never an allowed target.

## Dispatch

Dispatch `Release Production Backend` with the exact approved 40-character
`main` SHA, the exact production project ref `ghohuwwjxgjqnbsauvzq`, and one
of two modes: `bootstrap` or `disposable-upgrade`.

- `bootstrap` retains the canonical bootstrap authorization identifier and its
  strict empty-production preflight.
- `disposable-upgrade` requires the bootstrap identifier to be empty and the
  aggregate disposable-state preflight to pass.

There are no backup, archive, custody, or restore-rehearsal dispatch inputs.
Never enter a password, token, URL, protected manifest, or secret as a workflow
input.

## Required fail-closed sequence

For `disposable-upgrade`, the disposable-state preflight runs before any
production link, migration, secret update, or Function deployment. It must
target the exact production project and rejects the load project, malformed
aggregates, mismatched identities, query errors, and every protected-state
category listed in `free-plan-recovery.md`. A failed check stops the job before
mutation; the job never deletes state to qualify.

The workflow then preserves its existing controls: exact SHA/ref/URL checks,
repository and secret scans, migration list and migration dry run, one ordered
forward-only migration push, protected environment credentials, secret
isolation, exact Function-set deployment, RLS and authorization tests, and
backend readiness. Do not run a second migration command manually after a
failure. There is no reset, deletion, or migration-history repair.

Keep joining closed and new quest starts paused during the release. If a later
release contains any user or unexpected classroom state, leave the release on
HOLD until an owner-approved data-bearing recovery strategy exists.

## Classroom performance evidence

The one-time join gate remains p95 at or below 7 seconds, while response p95
remains below 1.5 seconds and dashboard p95 below 2.5 seconds. The historical
overall/preflight p95 evidence is `6,882.59` / `1,660.52` ms. It is the
owner-approved one-time initial-entry limitation, not replacement release
evidence. A new complete live-load run from the exact current approved `main`
SHA must still prove all correctness, authorization, rate/capacity, replay,
RLS, isolation, and teacher-authorization gates.

## After a failed or incompatible release

Keep joining closed, retain the failed run evidence, forward-redeploy compatible
Functions when appropriate, and use the immutable Pages artifact rollback in
`rollback.md`. The replaceable-state path is forward redeployment from the
exact reviewed SHA plus protected-content re-import and fixture recreation; it
does not authorize database recovery shortcuts.

## One-time classroom setup

After the protected backend gate succeeds, the owner may dispatch
`production-classroom-bootstrap.yml` from the exact approved SHA using
`PRODUCTION_TEACHER_EMAIL` and `PRODUCTION_TEACHER_PASSWORD` only as encrypted
`production-backend` environment secrets. It uses the approved `90` retention
days and `course-owner-2026-08-08`, keeps joining closed, and emits only opaque
receipt IDs. Set those receipts as `PRODUCTION_SMOKE_TEACHER_ID` and
`PRODUCTION_SMOKE_COHORT_ID` in `production-readiness`. After the run, rotate the temporary
teacher password before classroom use and remove the one-time workflow after
its protected readiness verification.
