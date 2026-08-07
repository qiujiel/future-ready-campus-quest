# Supabase Production Release Procedure

This procedure changes production only when the protected
`Release Production Backend` workflow is dispatched from `main` and approved.
Reading this document or merging its workflow does not authorize a deployment.

## Preconditions

1. Complete the configuration inventory in `github-environments.md`.
2. Confirm the release commit is on `main`, signed off by the release owner,
   and contains migrations through `20260806000700`.
3. For every normal upgrade, this project selected Supabase Free plan, so the
   only accepted recovery path is the verified Free-plan encrypted logical
   package in `free-plan-recovery.md`, with both custody copies read back and
   matched to its recorded digest. A provider-managed backup or PITR is not an
   alternative to the four evidence inputs enforced by this workflow.
4. For every normal upgrade, complete and independently review a restore rehearsal in a separate hosted
   non-production project. For the Free-plan path, the target must be a
   temporary Singapore recovery project and the database, Auth, RLS, retention,
   and private `group-images` validation must pass. Never rehearse against
   production or `vadyhuipwbtgbzpeisbn`.
5. Confirm joins are closed and quest starts are paused for the release window.
6. Confirm the previous compatible Edge Function commit and the rollback owner.

The sole exception to items 3 and 4 is the first production bootstrap, before
any application data exists. It is permitted only when the protected emptiness
preflight proves zero application state across migration history, application
relations/functions, Auth, Storage, and Edge Functions. After the first
successful migration, bootstrap is self-disabling: the same preflight detects
the initialized project and fails closed. Every later `upgrade` requires the
four recovery values and the normal recovery process. This exception never
authorizes a reset, deletion, or migration-history repair.

Operational shorthand: upgrade requires the four recovery values; bootstrap
requires verified emptiness. There is no reset, deletion, or migration-history repair.

Any later plan change requires a separately designed and validated evidence method,
workflow discriminator, tests, and approval procedure before a
provider-managed recovery point can be accepted by a release workflow.

## Protected workflow invocation

From GitHub Actions, select `Release Production Backend`, choose the `main`
branch, and enter:

- `expected_sha`: the approved full 40-character `main` commit SHA;
- `production_project_ref`: the exact protected production project ref;
- `release_mode`: choose `upgrade` for every release after initialization or
  `bootstrap` only for the first empty-project release;
- `bootstrap_authorization_id`: for bootstrap, the opaque
  `frcq-bootstrap-YYYYMMDDTHHMMSSZ-xxxxxxxx` identifier; leave it empty for an
  upgrade;
- `backup_evidence_id`: the opaque `frcq-backup-YYYYMMDDTHHMMSSZ-xxxxxxxx`
  identifier;
- `backup_created_at_utc`: the canonical UTC archive creation/completion time;
- `backup_archive_sha256`: the lowercase SHA-256 of the encrypted archive;
- `restore_rehearsal_evidence_id`: the opaque
  `frcq-restore-YYYYMMDDTHHMMSSZ-xxxxxxxx` identifier.

An `upgrade` requires the four recovery values; the
`bootstrap_authorization_id` must be empty. A `bootstrap` requires the canonical
bootstrap identifier and requires all four recovery fields to be empty. These
values are non-secret evidence, not proof that an archive
or rehearsal exists. Do not enter a password, token, URL, protected manifest,
or secret as a workflow input. The job halts before protected work if an
identity differs from the workflow event or environment configuration, or if
the selected mode's values are malformed or stale. Before approving
`production-backend` for an upgrade, the production owner compares all four inputs against the
separately held release record, independently verifies both custody copies and
the rehearsal result, and attests that no write occurred after the recovery
point. The quiesced recovery point is recorded separately in the release
record; it is never substituted for `backup_created_at_utc`.

## Authoritative sequence

The workflow performs one ordered sequence from the approved commit:

1. run repository, workflow, lint, type, unit, Edge Function, Deno, database,
   pgTAP, black-box integration, build, and bundle-privacy gates locally;
2. link the Supabase CLI to the confirmed production ref;
3. for `bootstrap` only, run the protected emptiness preflight and record its
   redaction-safe zero-count evidence before any migration or other production
   write; `upgrade` skips only this step;
4. record `supabase migration list`;
5. run `supabase db push --dry-run` and review the pending timestamps;
6. apply pending migrations once with `supabase db push`;
7. set the seven custom Edge Function secrets from a mode-restricted temporary
   file outside the checkout;
8. deploy all eleven functions together from `supabase/config.toml`, including
   the custom-secret-protected `production-readiness` endpoint;
9. run `production-preflight.mjs --backend-only` to verify exact project
   identity, migrations through `20260806000700`, required RPCs, the exact
   unique active cleanup schedule, Auth health, and all application-function
   method boundaries probed server-side with the modern publishable key;
   public join/recovery routes must reach their handlers and return `405`, while
   authenticated routes may reject at the gateway with `401` or at their
   method guard with `405`;
10. delete temporary secret material in an always-run step.

The Function secret step installs `FRCQ_SUPABASE_PUBLISHABLE_KEY` and
`FRCQ_SUPABASE_SECRET_KEY` from the protected modern GitHub values before
deployment. Hosted Functions use these modern keys; provider-injected legacy
JWT API keys are permitted only as a local Supabase fallback.

Expected deploy set:

- `join-cohort`, `manage-join-window`, `recover-student`;
- `manage-group-identity`, `get-next-item`, `submit-response`, `complete-quest`;
- `teacher-dashboard`, `teacher-controls`, `export-cohort`.
- `production-readiness`.

Do not run a second migration command manually after a partially failed
workflow until the release owner has compared the remote migration list with
the approved commit. Database migrations are forward-only: no reset, deletion,
or migration-history repair is authorized.

## One-time failed-bootstrap Function repair

Workflow run `31188390434` applied the approved migrations and Function secrets
but failed its final readiness check after all Functions deployed. The bounded
`bootstrap-function-repair.yml` workflow exists only to forward-fix that run.
It is tied to the failed run ID and production identity, proves
`supabase/migrations` is unchanged from commit
`f6bb71f61b9f28341542876135bc6cd6b4e19302`, permits no database or content
mutation, and may only reinstall encrypted Function secrets and redeploy the
complete Function set before backend readiness.

After the repair succeeds, remove this workflow and its validator in the next
protected pull request. Do not repurpose it for a later release, content import,
database compensation, or normal Function upgrade.

## Protected-content import

The backend workflow deliberately does not import course content. After the
backend preflight succeeds, the authorized course owner may run the protected
content importer from the same approved commit. Store the ignored JSON only as
the encrypted `PROTECTED_CONTENT_BANK_JSON` secret in the protected
`production-backend` GitHub environment, then dispatch
`production-content-import.yml` from the exact approved `main` SHA. The
workflow requires the exact project ref and content version, uses the modern
`PRODUCTION_SUPABASE_SECRET_KEY`, never uploads the source as an artifact, and
always removes its temporary file. Every non-local invocation also requires
`--confirm-project-ref=<exact-production-ref>` and
`--expected-content-version=<approved-version>`. Record only the version key and
the 24-item/8-concept receipt, never content or credentials.

## Post-backend evidence

Record the backend workflow run, approved SHA, production project ref,
`release_mode`, applied
migration timestamps, function deploy result, backend-preflight output,
`backup_evidence_id`, `backup_created_at_utc`, `backup_archive_sha256`,
`restore_rehearsal_evidence_id`, approver, and completion time. Keep archive
byte size, the separate quiesced recovery point, custody read-back flags,
aggregate validation, temporary target, reviewer, teardown, and load-test
reactivation results in the release record. For the first bootstrap, record only
the redaction-safe `bootstrap_authorization_id` and bootstrap preflight counts
in place of recovery evidence; this evidence proves emptiness, not recoverability.
Then run the Pages workflow; do not approve publication until its separate
production-readiness output passes.

If any check fails, leave joining closed, do not import content or publish
Pages, and follow `rollback.md`.
