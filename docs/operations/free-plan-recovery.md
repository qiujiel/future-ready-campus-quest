# Disposable Production-State Recovery Policy

## Authority and project identities

This policy applies only while production is the replaceable setup fixture in
`ghohuwwjxgjqnbsauvzq`. The canonical production API URL is
`https://ghohuwwjxgjqnbsauvzq.supabase.co`. The dedicated load-test project is
`vadyhuipwbtgbzpeisbn`; it is never a production target or recovery target.

The protected backend job, dispatched from `main` with the exact reviewed
40-character SHA and production project ref, performs one read-only Management
API transaction before any production link, migration, secret update, or
Function deployment. It logs only aggregate counts and a boolean
classification; no email, display name, identifier, answer, token, key, or row
content is logged.

## Exact disposable-state gate

The job may proceed only when aggregate evidence proves all of the following:

- exactly one Auth account marked by `course-owner-2026-08-08` and no other Auth account;
- exactly one unarchived `Production Classroom` cohort owned by that marked teacher, exactly five groups, no other cohort, and closed joining/quest start;
- zero join-window rows, session-control rows, open joining rows, open quest-start rows, cohort group join-code rows, and audit-event rows;
- zero private/public student profiles, quest attempts, phase progress, responses, concept evidence, attempt items, reflections, results, and team score snapshots;
- zero student join requests, student credentials, non-teacher sessions, student-login attempts, join attempts, and recovery attempts;
- zero group-identity receipts, group-media assets, teacher-control audits, teacher-roster-control receipts, quest launches, and quest-launch receipts;
- zero objects in the private `group-images` bucket; and
- no query error, malformed aggregate, identity mismatch, or load-project target.

Any nonzero or unverifiable protected state fails before mutation. The workflow
never deletes data to make the preflight pass. Once any student, response,
upload, unmarked account, or unexpected classroom state exists,
`disposable-upgrade` stops working and the owner must approve a data-bearing
recovery strategy before a later deployment.

## Recovery for replaceable state

Recovery is forward redeployment from the exact reviewed Git SHA, followed by
re-import of the protected content and recreation of the marked teacher and
closed classroom fixture. It does not authorize a database reset, deletion,
migration-history repair, manual replay of a failed migration, or fabricated
backup evidence.

This policy does not weaken the protected workflow's exact SHA/project/URL
checks, migration list and dry run, ordered forward migrations, exact Function
set, secret isolation, RLS and authorization tests, backend readiness, or
fail-closed error handling. Immutable Pages artifacts retain their separate
rollback path in `rollback.md`.
