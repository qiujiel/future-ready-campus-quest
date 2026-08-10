# Supabase Production Release Procedure

This procedure changes production only when the protected
`Release Production Backend` workflow is dispatched from `main` and approved.
Reading this document or merging its workflow does not authorize a deployment.

## Preconditions

1. Complete the configuration inventory in `github-environments.md`.
2. Confirm the release commit is on `main`, signed off by the release owner,
   and contains the reviewed simplified-login migration series through
   `20260810000700`.
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
7. set the eight custom Edge Function secrets from a mode-restricted temporary
   file outside the checkout;
8. deploy the exact twelve-function set from the same reviewed commit, including
   the custom-secret-protected `production-readiness` endpoint;
9. run `production-preflight.mjs --backend-only` to verify exact project
   identity, the Gate D readiness foundation, required RPCs, the exact
   unique active cleanup schedule, Auth health, and all application-function
   method boundaries probed server-side with the modern publishable key;
   public join/recovery/student-login routes must reach their handlers and return `405`, while
   authenticated routes may reject at the gateway with `401` or at their
   method guard with `405`;
10. delete temporary secret material in an always-run step.

The Function secret step installs `FRCQ_SUPABASE_PUBLISHABLE_KEY` and
`FRCQ_SUPABASE_SECRET_KEY` from the protected modern GitHub values before
deployment. Hosted Functions use these modern keys; provider-injected legacy
JWT API keys are permitted only as a local Supabase fallback.

Expected deploy set:

- `join-cohort`, `student-login`, `manage-join-window`, `recover-student`;
- `manage-group-identity`, `get-next-item`, `submit-response`, `complete-quest`;
- `teacher-dashboard`, `teacher-controls`, `export-cohort`.
- `production-readiness` (twelve total).

For the simplified-login upgrade, joining remains closed before the backup.
The pending migration list must contain the reviewed ordered series beginning
with `20260810000100_simplified_student_login.sql` and ending with
`20260810000900_simplified_login_security_readiness.sql`. The final readiness
migration verifies the complete chain, class-access column and unique index,
private credential/attempt table ownership, RLS and browser ACLs, plus the exact
service-only join/login RPC ownership, definer, search-path, and ACL contract. Configure the
encrypted student-login signer only after migrations succeed, then deploy
`join-cohort`, `student-login`, `manage-join-window`, `teacher-controls`, and
`teacher-dashboard` with the rest of the exact Function set from that same
commit. Publish the matching frontend only after backend readiness succeeds.

If clean-session acceptance fails, close joining first, retain the failed
artifact/run evidence, roll back the Pages artifact and Edge Functions to the
recorded compatible commit, and reassess database compatibility. Restore the
database only through the separately approved recovery procedure after the
frontend and Functions are back on the compatible release; never reset or
repair migration history ad hoc.

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

## One-time production classroom bootstrap

After protected content import, store `PRODUCTION_TEACHER_EMAIL` and
`PRODUCTION_TEACHER_PASSWORD` only as encrypted `production-backend`
environment secrets. Dispatch `production-classroom-bootstrap.yml` from the
exact approved `main` SHA with project `ghohuwwjxgjqnbsauvzq`, retention days
`90`, and authorization ID `course-owner-2026-08-08`. The workflow records the
course-owner retention approval, creates or confirms only its marked teacher
and closed five-by-six `Production Classroom` cohort, and prints only the
opaque teacher/cohort IDs and approved counts. Its final check uses one fixed,
read-only aggregate Management API query; it does not broaden the intentionally
restricted table grants for groups or session controls.

Set the successful receipt IDs as the non-sensitive
`PRODUCTION_SMOKE_TEACHER_ID` and `PRODUCTION_SMOKE_COHORT_ID` variables in the
`production-readiness` environment. Also set `PRODUCTION_CONTENT_VERSION` to
`2026-07-30-approved-blueprint-v1`. Do not open joining or allow quest starts
during this setup.

After the receipt and production readiness pass, remove the one-time workflow
and its validator in a protected pull request. Rotate the temporary teacher
password before real classroom use. Never write either teacher credential to a
file, artifact, workflow input, log, repository path, or release record.

## One-time classroom shared-network forward fix

The first mandatory live-load run proved that the original 12-join-per-minute
network burst blocks a 30-student class sharing one school NAT address. Migration
`20260808000100_classroom_nat_join_capacity.sql` raises only that per-network
burst to 45 while preserving the independent 90-request join-window cap, group
capacity, short expiry, and group-code hashing.

The follow-up live-load run admitted and completed all 30 synthetic learners but
exposed password hashing plus password login as a join-latency bottleneck. New
student identities now receive their initial session through a server-side,
one-time magic-link hash exchange. This sends no email, stores no student
password, and preserves the existing synthetic-user role, opaque browser
session, RLS, recovery, replay, and cleanup boundaries. The Auth identity and
one-time hash are created by the same admin request; after the protected
preflight succeeds, session exchange and transactional join completion run
concurrently. Browser route checks read `current_role()` from the protected
role table rather than trusting token metadata.

The original 1.5-second p95 join objective remains aspirational. The approved
classroom-readiness release gate requires one-time join p95 at or below 5 seconds for
30 exactly simultaneous students. The response p95 below 1.5 seconds remains
unchanged, as does the dashboard p95 below 2.5 seconds. Evidence must also show
all 30 students joined, zero incorrect group assignments, zero duplicate student
identities, zero failed authorized requests, zero accepted unauthorized calls,
no duplicate responses or data loss, five correct groups, and verified score
formulas. The longer join latency occurs only during initial classroom entry;
it is a known limitation, not permission to reduce
authentication, code validation, the 45/90 rate and capacity limits, replay
protection, RLS, student isolation, or teacher authorization.

Protected Pages run `31243468453` at commit
`68ab33aed1636330c06475054954e9da17b6b223` is the accepted classroom-load
receipt. It admitted 30 of 30 simultaneous students with zero failed joins,
incorrect group assignments, duplicate identities, authorization failures,
accepted unauthorized calls, or duplicate responses. Join p95 was `4,835.64`
ms; response p95 was `1,265.06` ms; dashboard p95 was `1,078.02` ms. All 30
students completed in five valid groups with the verified score formula. The
join latency is accepted only as the documented one-time classroom-entry
limitation; it does not relax any later request or security gate.

Migration `20260808000300_combined_join_preparation.sql` combines completed
request replay detection with code, rate, and capacity preflight in one
service-role-only RPC. Completed retries bypass a second rate-limit attempt;
new joins retain the exact 45-network/90-window limits before any Auth identity
is created. Apply and verify it through the same exact-target
`production-classroom-nat-fix.yml` workflow before deploying the matching
`join-cohort` Function.

For this pre-publication Function-only correction, dispatch
`production-join-latency-fix.yml` from its exact reviewed `main` SHA. The job
proves migrations and Function source are unchanged from the reviewed fix,
targets only production `ghohuwwjxgjqnbsauvzq`, deploys only `join-cohort`,
receives no database password or application key, and reruns backend readiness.
If readiness fails, keep Pages unpublished and redeploy the prior immutable
`join-cohort` source. Remove this one-time workflow after hosted verification.

For the pre-publication forward fix only, dispatch
`production-classroom-nat-fix.yml` from the exact reviewed `main` SHA. The job is
hard-coded to production `ghohuwwjxgjqnbsauvzq`, rejects the dedicated load
project, receives only `SUPABASE_ACCESS_TOKEN`, applies only the reviewed
classroom forward migrations, and verifies both limits from the installed
function definition. Rerun the
one-time load-test bootstrap at the same SHA so the dedicated project receives
the same migration. Remove both one-time workflows and their validators after
the release gate passes.

After the second load run exposed class-wide exclusive lock contention, the
same idempotent forward-fix job also applies
`20260808000200_concurrent_join_locking.sql`. It verifies concurrent shared
window locks, per-group exclusive capacity locks, ordered atomic rate locks,
both recorded migration versions, and the unchanged 45/90 limits. Retention
cleanup remains responsible for expired attempt rows; the request path no
longer performs a class-wide cleanup scan for every learner.

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
