# Disposable Production Release Design

## Decision

The production owner has accepted proceeding without an external encrypted
backup, a restore rehearsal, recovery-key material, cloud/offline custody, or a
second human reviewer while production contains only replaceable setup state.
The normal release path for this state is named `disposable-upgrade` so it
cannot be confused with either an empty bootstrap or a future data-bearing
upgrade.

## Fail-closed state classification

Before any production link, migration, secret update, or Function deployment,
the protected backend job runs one read-only Management API transaction against
exactly `ghohuwwjxgjqnbsauvzq`. It may proceed only when aggregate evidence
shows:

- exactly one Auth account marked by `course-owner-2026-08-08` and no other
  Auth account;
- exactly one unarchived `Production Classroom` cohort owned by that marked
  teacher, exactly five groups, no other cohort, and closed joining/quest start;
- zero private/public student profiles, attempts, responses, concept evidence,
  reflections, student credentials/sessions, and join/recovery attempts;
- zero objects in the private `group-images` bucket; and
- no query error, malformed aggregate, identity mismatch, or load-project
  target.

Only aggregate counts and a boolean classification are logged. No email,
display name, identifier, answer, token, key, or row content is emitted. Any
nonzero or unverifiable protected state fails before mutation and requires a
new owner decision; the workflow never deletes data to make the preflight pass.

## Release authorization and workflow

The backend workflow exposes only `bootstrap` and `disposable-upgrade` modes.
`bootstrap` retains its existing strict emptiness preflight and authorization
identifier. `disposable-upgrade` requires the bootstrap identifier to be empty
and requires the aggregate disposable-state preflight. The four external
backup/restore inputs and their validation are removed from the release path.

All existing automated tests, secret scanning, exact SHA/ref/URL checks,
migration list and dry run, protected environment credentials, RLS and
authorization tests, pinned actions, ordered migrations, exact Function set,
backend readiness, and fail-closed error behavior remain unchanged.

## Recovery and rollback

For the current replaceable state, recovery is forward redeployment from the
exact reviewed Git SHA plus re-import of the protected content and recreation
of the marked teacher/classroom fixture. Pages retains immutable artifacts and
its existing rollback workflow. No database reset, deletion, migration-history
repair, or fabricated backup evidence is authorized.

Once any student, response, upload, unmarked account, or unexpected classroom
state exists, `disposable-upgrade` stops working. A later data-bearing release
must adopt an owner-approved recovery strategy before deployment.

## Verification

Tests must prove the classifier accepts only the exact disposable fixture,
rejects every protected-data category and malformed response, redacts failures,
and targets production only. Structural deployment tests must prove the
preflight runs before migration/link/deployment and cannot be skipped or allowed
to continue on error. Focused deployment tests, the complete suite, lint,
typecheck, repository/deployment checks, production build, and bundle scan must
pass before merge.
