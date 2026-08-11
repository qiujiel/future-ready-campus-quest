# Supabase Production Release Procedure

This procedure changes only `ghohuwwjxgjqnbsauvzq` from a protected workflow
run on `main`. Reading this document does not authorize deployment. The
dedicated load project `vadyhuipwbtgbzpeisbn` is never an allowed target.

## Dispatch

Dispatch `Release Production Backend` with the exact approved 40-character
`main` SHA, the exact production project ref `ghohuwwjxgjqnbsauvzq`, and one
of three modes: `bootstrap`, `disposable-upgrade`, or `in-place-upgrade`.

- `bootstrap` retains the canonical bootstrap authorization identifier and its
  strict empty-production preflight.
- `disposable-upgrade` requires the bootstrap identifier to be empty and the
  aggregate disposable-state preflight to pass.
- `in-place-upgrade` requires the bootstrap identifier to be empty and preserves
  existing classroom data while retaining every common release gate.

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

For `in-place-upgrade`, existing classroom state is preserved. Use it only for
reviewed forward-only migrations that do not reset, delete, anonymize, or repair
migration history. Exact SHA/ref/URL checks, automated tests, migration list and
dry run, ordered apply, protected credentials, exact Function deployment, and
backend readiness remain mandatory.

The workflow then preserves its existing controls: exact SHA/ref/URL checks,
repository and secret scans, migration list and migration dry run, one ordered
forward-only migration push, protected environment credentials, secret
isolation, exact Function-set deployment, RLS and authorization tests, and
backend readiness. Do not run a second migration command manually after a
failure. There is no reset, deletion, or migration-history repair.

Keep joining closed and new quest starts paused during the release. If existing
classroom state must be preserved, do not use `disposable-upgrade`; use the
owner-approved `in-place-upgrade` path only for a reviewed preserving release.

## Protected-content import

The backend workflow deliberately does not import course content. After the
preflight succeeds, the authorized owner may import from the exact approved
`main` SHA, exact production project ref, and approved content version. Store
the ignored JSON only as the encrypted `PROTECTED_CONTENT_BANK_JSON`
environment secret in `production-backend`, then dispatch
`production-content-import.yml`. It uses
`PRODUCTION_SUPABASE_SECRET_KEY`, never uploads the source as an artifact, and
always removes its temporary file. Every non-local invocation requires
`--confirm-project-ref=<exact-production-ref>` and
`--expected-content-version=<approved-version>`. Record only the version key
and the 24-item/8-concept receipt, never content or credentials.

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
