# Production Rollback and Recovery

Keep joining closed, pause new quest starts, preserve the failed run evidence,
and never record raw tokens, names, answers, exports, database passwords, or
secret keys. Production is `ghohuwwjxgjqnbsauvzq`; the load project
`vadyhuipwbtgbzpeisbn` is never a production or recovery target.

## Existing Pages rollback

Pages retains immutable artifacts and its existing rollback workflow. From
`main`, dispatch `Roll Back GitHub Pages` with the recorded source run ID,
expected commit SHA, and expected manifest digest. The workflow verifies the
unchanged archived artifact inventory, hashes, metadata commit, and manifest
digest before publication. Do not rebuild an old commit with current tooling.

If no compatible immutable artifact exists, leave Pages unpublished or retain
the current provider-served page; do not improvise a production build during an
incident.

## Disposable-state recovery

For the current replaceable fixture, recovery is forward redeployment from the
exact reviewed Git SHA, then re-import of protected content and recreation of
the marked teacher and closed classroom fixture. Keep all exact project/SHA,
migration dry-run, forward-only migration, Function, readiness, RLS, and
authorization controls in place. Verify the exact production target before
each mutation.

This path permits no database reset, deletion, migration-history repair, or
fabricated backup evidence. If any student, response, upload, unmarked account,
or unexpected classroom state exists, stop: `disposable-upgrade` is no longer
authorized. Preserve that state and obtain an owner-approved data-bearing
recovery strategy before any later deployment.

## Protected-content import recovery

Before a disposable rebuild imports content, use the protected importer from
the exact reviewed SHA, exact production ref, and approved content version.
The source is held only as an encrypted environment secret
`PROTECTED_CONTENT_BANK_JSON`; no artifact is created, temporary files receive
cleanup, and the record contains only the version and the 24-item/8-concept
receipt. Require `--confirm-project-ref=<exact-production-ref>` and
`--expected-content-version=<approved-version>` for every non-local import.

## Compatible Function forward redeploy

When a backend defect is compatible with the production migration list, deploy
the exact last compatible Function commit through the protected workflow and
rerun backend readiness and permission-boundary smoke checks. Database
migrations remain forward-only. Do not run an unreviewed manual migration
command after a partial failure.
