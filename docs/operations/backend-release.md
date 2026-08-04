# Supabase Production Release Procedure

This procedure changes production only when the protected
`Release Production Backend` workflow is dispatched from `main` and approved.
Reading this document or merging its workflow does not authorize a deployment.

## Preconditions

1. Complete the configuration inventory in `github-environments.md`.
2. Confirm the release commit is on `main`, signed off by the release owner,
   and contains migrations through `20260730021100`.
3. This project selected Supabase Free plan, so the only accepted recovery path
   for this workflow is the verified Free-plan encrypted logical package in
   `free-plan-recovery.md`, with both custody copies read back and matched to its
   recorded digest. A provider-managed backup or PITR is not an alternative to
   the four evidence inputs enforced by this workflow.
4. Complete and independently review a restore rehearsal in a separate hosted
   non-production project. For the Free-plan path, the target must be a
   temporary Singapore recovery project and the database, Auth, RLS, retention,
   and private `group-images` validation must pass. Never rehearse against
   production or `vadyhuipwbtgbzpeisbn`.
5. Confirm joins are closed and quest starts are paused for the release window.
6. Confirm the previous compatible Edge Function commit and the rollback owner.

Any later plan change requires a separately designed and validated evidence method,
workflow discriminator, tests, and approval procedure before a
provider-managed recovery point can be accepted by a release workflow.

## Protected workflow invocation

From GitHub Actions, select `Release Production Backend`, choose the `main`
branch, and enter:

- `expected_sha`: the approved full 40-character `main` commit SHA;
- `production_project_ref`: the exact protected production project ref;
- `backup_evidence_id`: the opaque `frcq-backup-YYYYMMDDTHHMMSSZ-xxxxxxxx`
  identifier;
- `backup_created_at_utc`: the canonical UTC archive creation/completion time;
- `backup_archive_sha256`: the lowercase SHA-256 of the encrypted archive;
- `restore_rehearsal_evidence_id`: the opaque
  `frcq-restore-YYYYMMDDTHHMMSSZ-xxxxxxxx` identifier.

These four recovery values are non-secret evidence, not proof that an archive
or rehearsal exists. Do not enter a password, token, URL, protected manifest,
or secret as a workflow input. The job halts before protected work if an
identity differs from the workflow event or environment configuration, or if
the recovery values are malformed or stale. Before approving
`production-backend`, the production owner compares all four inputs against the
separately held release record, independently verifies both custody copies and
the rehearsal result, and attests that no write occurred after the recovery
point. The quiesced recovery point is recorded separately in the release
record; it is never substituted for `backup_created_at_utc`.

## Authoritative sequence

The workflow performs one ordered sequence from the approved commit:

1. run repository, workflow, lint, type, unit, Edge Function, Deno, database,
   pgTAP, black-box integration, build, and bundle-privacy gates locally;
2. link the Supabase CLI to the confirmed production ref;
3. record `supabase migration list`;
4. run `supabase db push --dry-run` and review the pending timestamps;
5. apply pending migrations once with `supabase db push`;
6. set the five custom Edge Function secrets from a mode-restricted temporary
   file outside the checkout;
7. deploy all eleven functions together from `supabase/config.toml`, including
   the custom-secret-protected `production-readiness` endpoint;
8. run `production-preflight.mjs --backend-only` to verify exact project
   identity, migrations through `20260730021100`, required RPCs, the exact
   unique active cleanup schedule, Auth health, and all application-function
   method boundaries probed server-side with provider-managed credentials;
9. delete temporary secret material in an always-run step.

Expected deploy set:

- `join-cohort`, `manage-join-window`, `recover-student`;
- `manage-group-identity`, `get-next-item`, `submit-response`, `complete-quest`;
- `teacher-dashboard`, `teacher-controls`, `export-cohort`.
- `production-readiness`.

Do not run a second migration command manually after a partially failed
workflow until the release owner has compared the remote migration list with
the approved commit. Database migrations are forward-only.

## Protected-content import

The backend workflow deliberately does not import course content. After the
backend preflight succeeds, the authorized course owner may run the protected
content importer from the same approved commit. Every non-local invocation must
include `--confirm-project-ref=<exact-production-ref>` and must first display a
URL whose project ref matches that confirmation. Record version key and counts,
not content or credentials. The expected release dataset is 24 items covering
8 concepts.

## Post-backend evidence

Record the backend workflow run, approved SHA, production project ref, applied
migration timestamps, function deploy result, backend-preflight output,
`backup_evidence_id`, `backup_created_at_utc`, `backup_archive_sha256`,
`restore_rehearsal_evidence_id`, approver, and completion time. Keep archive
byte size, the separate quiesced recovery point, custody read-back flags,
aggregate validation, temporary target, reviewer, teardown, and load-test
reactivation results in the release record.
Then run the Pages workflow; do not approve publication until its separate
production-readiness output passes.

If any check fails, leave joining closed, do not import content or publish
Pages, and follow `rollback.md`.
