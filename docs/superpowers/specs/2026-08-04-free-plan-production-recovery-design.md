# Free-Plan Production Recovery Design

**Date:** 2026-08-04

**Status:** Approved for implementation planning; no deployment or remote change authorized

**Production project:** `ghohuwwjxgjqnbsauvzq`

**Dedicated load-test project:** `vadyhuipwbtgbzpeisbn`

## Decision

Future-Ready Campus Quest will remain on the Supabase Free plan. Production
release therefore requires a manually generated, encrypted logical backup and
a successful restore rehearsal before the protected backend environment may be
approved.

The latest three successful pre-release backups are retained for at least 30
days in both institution-controlled cloud storage and encrypted offline/local
storage. A backup is not eligible for removal until it is at least 30 days old
and three newer verified backups exist.

The restore rehearsal will use a temporary hosted Supabase project in the
Singapore region. The load-test project may be paused to free a Free-plan
project slot, but production data must never be restored into that project.

## Context

Supabase Free projects do not receive automatic backups or point-in-time
recovery. Supabase recommends regular logical exports with `supabase db dump`
and off-site retention for Free projects. Database backups include Storage
metadata but do not include the underlying Storage objects, so the private
`group-images` bucket needs a separate object export.

Free projects may also pause after one week of inactivity. This recovery design
does not provide an always-on availability guarantee; release operations and
the class-session runbook must include a project-health check early enough to
reactivate and verify the project before a scheduled class.

The Free allowance is limited to two active projects across organizations where
the account is an owner or administrator. Paused projects do not count against
that allowance. The existing production and load-test projects therefore leave
no active slot for a hosted recovery rehearsal unless the load-test project is
paused or the account is upgraded.

References:

- <https://supabase.com/docs/guides/platform/backups>
- <https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>
- <https://supabase.com/docs/guides/platform/billing-on-supabase>
- <https://supabase.com/docs/guides/storage/management/download-objects>

## Goals

- Make a Free-plan release recoverable without weakening the protected
  production approval gate.
- Cover the Postgres database, Auth data, migration history, Storage metadata,
  and private group-image objects.
- Prove that a backup can be restored before production mutation.
- Keep protected data, credentials, decryption material, and object paths out of
  Git, GitHub artifacts, workflow logs, issues, and release evidence.
- Produce an auditable evidence record that a production owner can verify
  before approving the backend workflow.
- Preserve the existing separation between production, load testing,
  production readiness, and Pages publication.

## Non-goals

- This design does not authorize a production dump, migration, function deploy,
  content import, Pages publication, environment approval, or secret change.
- It does not make GitHub a backup repository or give GitHub access to backup
  plaintext, database passwords, Storage administration keys, or decryption
  keys.
- It does not turn restoration into an automatic rollback. Production database
  migrations remain forward-only, and any production recovery remains a
  separately approved incident action.
- It does not use `vadyhuipwbtgbzpeisbn` as a restore target.

## Recovery package

One recovery package represents one consistent pre-release recovery point. It
is created from the exact approved release commit with the repository-pinned
Supabase CLI after joining is closed, new quest starts are paused, and other
production writers are stopped. Storage inventory is measured before and after
the export; any change invalidates the package. The package contains:

1. a Supabase-supported roles export;
2. a schema export;
3. a data export using the supported project-migration exclusions;
4. schema and data exports for Supabase migration history;
5. a complete export of objects in the private `group-images` bucket;
6. an internal Storage manifest containing opaque object paths, byte sizes,
   media types where available, and per-object SHA-256 digests;
7. an internal release manifest containing the source project ref, approved
   commit, UTC creation time, CLI version, export command version, component
   filenames, byte sizes, and component digests.

Edge Function source and frontend assets are not copied into the recovery
package because the approved Git commit is their immutable source. Provider
API keys, JWT material, database passwords, custom Edge Function secrets, Auth
provider secrets, and SMTP credentials are never included.

The export procedure must stop if the linked or connection-string project
identity is not exactly `ghohuwwjxgjqnbsauvzq`, if it equals the load-test ref,
if any required component is absent, or if production changes during the
export. It must not print a connection string, credential, protected row,
object path, filename, or image content.

The package is eligible for one release window only. It must be less than 24
hours old when the protected backend workflow starts, and no production write
may have occurred after its recorded recovery point. Any later write requires
a new package and a new successful rehearsal.

## Encryption and custody

Plaintext is staged only in a newly created mode-`0700` directory outside the
repository. The package is encrypted before it leaves that directory using
recipient-based authenticated encryption. `age` is the preferred format; its
private identity is held by the institution-designated recovery custodian and
is never stored with the archive or in GitHub.

After encryption:

1. calculate the SHA-256 digest of the encrypted archive;
2. copy the encrypted archive to institution-controlled cloud storage;
3. copy it to encrypted offline/local storage;
4. read back both copies and verify their digest and size;
5. remove all plaintext staging files in an always-run cleanup step;
6. verify that no plaintext or credential remains in the checkout, shell
   history, temporary directory, or Git status.

An export is unsuccessful until both retained copies pass read-back
verification. Backup filenames use only an opaque evidence ID and contain no
class, teacher, learner, cohort, or project name.

## Public evidence record

The release record may contain only:

- opaque backup evidence ID;
- encrypted archive SHA-256 digest and byte size;
- approved Git commit;
- source project ref;
- UTC recovery-point and completion timestamps;
- pinned Supabase CLI version;
- database component completion flags;
- aggregate Storage object count and byte total;
- cloud-copy and offline-copy verification flags;
- opaque restore-rehearsal evidence ID and temporary target ref;
- aggregate validation results, tester, reviewer, and completion time.

It must not contain database rows, SQL contents, Storage paths, filenames,
signed URLs, personal data, credentials, encryption recipients, or key
material. The detailed internal manifest remains inside the encrypted package.

## Hosted restore rehearsal

The hosted rehearsal provides Supabase-platform fidelity without a paid plan.
It is a controlled change to non-production resources and requires explicit
approval before each remote phase.

1. Confirm the encrypted package exists in both approved locations and both
   copies match the recorded digest.
2. Obtain approval to pause the load-test project. Record its pre-pause state
   without changing or exporting its data.
3. Pause `vadyhuipwbtgbzpeisbn`; do not delete it and do not use it as a restore
   target.
4. Obtain approval to create a temporary recovery project in Singapore. Disable
   automatic exposure of new tables and do not connect automatic GitHub
   deployment.
5. Decrypt into a new mode-`0700` temporary directory on the controlled
   operator machine and verify the internal and external digests before use.
6. Restore roles, schema, data, and migration history to the temporary target
   using the Supabase-supported ordering and transaction/error-stop controls.
7. Recreate required platform configuration from the approved commit and
   transfer the `group-images` objects without exposing their paths in logs.
   Any function deployment is to the temporary target only and requires its own
   explicit approval. All credentials and custom secrets used there are
   rehearsal-only values, never reused from production.
8. Run the recovery validations below and record only opaque counts and status.
9. Remove decrypted material in an always-run cleanup step.
10. Obtain approval to delete the temporary recovery project after evidence is
    reviewed, then reactivate the load-test project and confirm its identity and
    health before any later load test.

The rehearsal project must not accept real classroom traffic, send external
email, use production frontend origins, reuse production API/JWT secrets, or
remain active longer than the approved rehearsal window.

## Recovery validation

The rehearsal passes only when all of the following succeed:

- every expected migration through `20260730021100` is recorded in order;
- required schemas, extensions, tables, RPCs, triggers, cron configuration,
  indexes, constraints, and RLS policies are present;
- aggregate Auth, cohort, profile, attempt, response, evidence, and audit counts
  match the encrypted internal manifest without printing record contents;
- teacher ownership and cross-teacher/cross-cohort isolation tests pass;
- anonymous, student, teacher, and unauthorized method boundaries return the
  expected neutral results;
- the private `group-images` bucket exists and its object count, byte total, and
  per-object digests match the internal Storage manifest;
- authorized signed access works and unauthorized/cross-cohort access fails;
- expired join, recovery, and rate-limit material is not reactivated;
- the retention configuration, cleanup schedule, and immutable evidence remain
  internally consistent;
- repository tests, pgTAP tests, black-box integration tests, privacy checks,
  and readiness checks pass against the isolated target where applicable;
- no production or load-test project ref appears as the target in the rehearsal
  evidence.

Any mismatch fails the rehearsal. It must not be waived by the operator who
created the backup.

## Protected workflow integration

The backend workflow will accept four non-secret dispatch inputs in addition to
the existing approved SHA and production project ref:

- `backup_evidence_id`;
- `backup_created_at_utc`;
- `backup_archive_sha256`;
- `restore_rehearsal_evidence_id`.

A read-only validation job will reject missing or malformed values and ensure
the backup is less than 24 hours old before the protected backend job is
eligible to run. The protected job summary will show these values for the
production owner to compare with the separately held evidence record and
encrypted archive inventory. The owner must also attest that no production
write occurred after the recovery point; a workflow timestamp cannot prove
that operational fact.

The workflow cannot prove that an external archive exists merely from an input
digest. Environment approval therefore remains a human attestation that the
owner independently checked both retained copies, their digest, the successful
restore evidence, the exact production ref, and the exact release commit.

The deployment-configuration validator and tests will require these inputs,
the evidence-validation dependency, and the `production-backend` environment.
Pages packaging retains its existing immutable artifact digest. The
`production-readiness` and `github-pages` approvals remain separate and receive
no backup credential or protected contents.

## Failure handling

- Identity mismatch: stop before reading production data.
- Partial database or Storage export: delete plaintext, retain no evidence ID,
  and block release.
- Encryption, copy, or digest mismatch: delete plaintext, quarantine the
  incomplete encrypted output, and block release.
- Restore error or validation mismatch: keep production unchanged, keep joining
  closed, capture opaque failure evidence, and block release.
- Cleanup failure: treat the run as a privacy incident, restrict access to the
  operator machine, and follow the incident procedure.
- Temporary-project teardown failure: revoke its credentials, keep it isolated,
  notify the privacy/operations owner, and do not resume normal release work
  until ownership and deletion are resolved.
- Load-project reactivation failure: do not substitute production for load
  testing; resolve or re-create approved synthetic fixtures separately.

No failed rehearsal authorizes a production restore, history repair, database
reset, destructive migration, or manual second migration attempt.

## Approval boundaries

Repository-only implementation may add documentation, validators, fixtures,
tests, and workflow input wiring. It must use synthetic fixtures and dry-run
logic only.

The following remain separately approval-gated operations:

- creating an encryption identity or selecting its custodian;
- reading/exporting production database or Storage data;
- copying an encrypted archive to either custody location;
- pausing or reactivating the load-test project;
- creating, configuring, deploying to, or deleting a recovery project;
- restoring protected data;
- configuring GitHub variables, secrets, or protected environments;
- dispatching or approving backend, readiness, Pages, or rollback workflows;
- applying production migrations, deploying functions, importing content, or
  publishing the site.

## Implementation acceptance criteria

- Operations documents recognize a verified encrypted logical backup plus a
  successful hosted restore rehearsal as the Free-plan recovery prerequisite.
- Documentation explicitly includes Storage objects and the two-copy retention
  rule.
- Backup evidence has a strict non-secret schema with deterministic validation.
- The backend workflow cannot reach its protected mutation job without valid
  evidence-shaped inputs.
- Deployment configuration tests fail if evidence validation or protected
  environment dependencies are removed.
- All scripts reject production/load identity confusion and redact sensitive
  values by construction.
- Tests use synthetic fixtures and cause no remote mutation.
- The formal release checklist identifies every remaining human approval and
  evidence field.

## Remaining blockers after repository implementation

Repository changes alone will not make production deployable. Release remains
blocked until an authorized owner has:

- designated the encryption/recovery custodian and provisioned the key outside
  the repository;
- confirmed the two approved storage locations;
- completed and independently reviewed a real production recovery package;
- completed the hosted restore rehearsal and teardown;
- configured and independently verified the required GitHub repository and
  environment variables, secrets, reviewers, and branch rules;
- accepted the Free-plan pause/availability limitation and added a scheduled
  class health/reactivation check;
- completed all other data-owner, readiness, smoke-fixture, retention, and
  release-checklist approvals.
