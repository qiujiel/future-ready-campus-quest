# Deployment Readiness Review — 2026-08-07

**Reviewed branch:** `codex/gate-d-teacher-readiness`
**Original Gate D commit:** `4783565`
**Remediated review baseline:** `568f282ba5338e42ffa008a26e956cfbb419ce79`
**Recovery design commit:** `ce7a056`
**Reviewed implementation-plan baseline:** `d7e26d260098620c89e297863aa2c4c09bf8c24a`
**Student-ready review baseline:** `c0177dcdb9faa4ec6da94d719d5d8606446a9d6c`
**Production project:** `ghohuwwjxgjqnbsauvzq`
**Dedicated load-test project:** `vadyhuipwbtgbzpeisbn`
**Decision: HOLD**

## Owner review exception — 2026-08-07

The repository owner waived the second-person PR and environment review for
this initial release and authorized proceeding without an independent reviewer.
This deployment is not independently reviewed. The exception changes only the
human-review requirement: automated checks remain mandatory, project-identity gates remain mandatory,
protected environment scoping remains mandatory, and
no failing or skipped technical gate may be waived.

The first backend release additionally requires bootstrap preflight evidence
from the protected workflow. That evidence must show the exact production
project, the distinct load-test project, the canonical bootstrap authorization
ID, and zero counts for migration history, application relations/functions,
Auth users, Storage buckets/objects, and Edge Functions. HOLD remains in effect
until that fail-closed step succeeds before the first production write.

The material below incorporates the independent 2026-08-06 repository and
read-only remote-configuration review as a historical baseline and reconciles
it with the 2026-08-07 state. Its second-person requirements are superseded only
by the owner exception above; its automated, credential-scope, recovery,
rollback, and project-separation controls remain in force unless this current
review explicitly distinguishes bootstrap.

At the historical baseline, this was an independent repository and read-only remote-configuration review.
At `2026-08-06T04:03:01Z`, GitHub repository metadata and Supabase project
identity/function-secret inventories were inspected without changing them. No
backup, restore rehearsal, deployment, production database connection, or
production command was performed.

Repository completion does not authorize deployment.

## Repository controls verified

At the recorded implementation-plan baseline, local history contains the
approved recovery design and plan, the strict four-field recovery-evidence
validator, the backend dependency gate, and the recovery-artifact Git guard.
The backend workflow requires `backup_evidence_id`, `backup_created_at_utc`,
`backup_archive_sha256`, and `restore_rehearsal_evidence_id`; its read-only
validation job must complete before the `production-backend` environment job
can become eligible for approval.

Repository validators and tests cover evidence shape/freshness, workflow
dependency and permission boundaries, and forbidden recovery artifacts. The
operations package documents approval-gated backup, custody, hosted rehearsal,
teardown, rollback, privacy, and class-reactivation controls. These are local
controls only; they cannot prove an archive, reviewer, remote environment, or
deployed system exists.

## GitHub Pages approval and artifact integrity

The repository Pages workflow packages a single `github-pages` artifact before
the separate `production-readiness` environment gate. The final deployment job
uses the reviewed artifact rather than rebuilding it, reaches the distinct
`github-pages` environment, and uses commit-pinned GitHub actions. The formal
checklist retains artifact ID, approved commit, manifest SHA-256, reviewer,
served-release metadata, smoke checks, and rollback evidence.

GitHub Pages is configured to publish from Actions at
`https://qiujiel.github.io/future-ready-campus-quest/`, but no production Pages
artifact has yet completed deployment or hosted verification. The four
environments (`load-test`, `production-backend`, `production-readiness`, and
`github-pages`) are limited to `main`; the second-person reviewer control is
intentionally absent under the owner exception. The load gate creates only
synthetic per-run classroom identities and deletes them after measurement.

## GitHub variables and secrets inventory

`github-environments.md` defines the intended repository and environment
variable/secret inventory and keeps the load project separate from production.
The four recovery values are per-run non-secret inputs, not variables or
secrets. The documented design excludes backups, connection strings, database
passwords, Storage administration keys, encryption keys, plaintext exports,
object paths, and protected manifests from every GitHub scope.

The repository is public. The four approved non-sensitive Actions variables are
configured, and environment-scoped production variables and secrets exist by
name without values appearing in this review. Branch protection requires the
verification and secret-scan checks and disallows force pushes/deletion; the
latest-push and second-person approvals are disabled under the explicit owner
exception. A repository administrator must still compare every GitHub
repository/environment variable and secret name, protected environment, branch
rule, and reviewer-exception record with the formal checklist without copying
values into evidence.

## Supabase migration and function sequence

The original reviewed baseline contains the retention cleanup scheduling and
schedule uniqueness/readiness controls through `20260730021100`. The current
student-ready extension adds ordered, forward-only classroom migrations through
`20260810001100` for group codes, classroom readiness, roster controls, atomic
launch, adaptive completion, teacher question-bank review, simplified student
join and returning login, leader transfer, and catalog/ACL release-preflight coverage.
`supabase/config.toml` declares the twelve expected Edge Functions, including
`student-login` and `production-readiness`. The protected backend procedure records the remote
migration list, performs a dry-run before one forward migration push, deploys
the reviewed function set, and runs backend preflight. Content import and Pages
publication remain separate operations.

The Supabase project inventory confirms production project
`ghohuwwjxgjqnbsauvzq` is `ACTIVE_HEALTHY` in `ap-southeast-1` and the dedicated
load project `vadyhuipwbtgbzpeisbn` is separately `ACTIVE_HEALTHY` in
`ap-northeast-2`. Production currently reports zero deployed Edge Functions. A
read-only management aggregate and independent Auth/Storage control-plane
queries found no migration tracking table, application relation/function, Auth
user, Storage bucket/object, or Edge Function. Auth site/redirect URLs and
anonymous sign-in are configured. The protected workflow must repeat these
empty-state checks; only its successful preflight is release evidence.

## Recovery and rollback

The approved Free-plan path requires an encrypted logical package covering
roles, schema, data, migration history, and the private `group-images` objects;
verified cloud and offline custody copies; and an independently reviewed hosted
restore rehearsal in a temporary Singapore project. The exact production
project is `ghohuwwjxgjqnbsauvzq`; the load-test project
`vadyhuipwbtgbzpeisbn` may be paused with approval but must never receive
restored production data.

The backend evidence gate validates only opaque shape and freshness. The
production owner must independently compare all four inputs with separately
held custody and restore evidence and attest that no write occurred after the
recovery point. Rollback distinguishes provider-managed recovery from the
Free-plan encrypted logical-package path, requires database plus Storage
reconciliation, preserves forward-only compensation, and requires fresh
incident approval for any production recovery.

No encryption identity, custody copy, real production package, restore
rehearsal, project pause/reactivation, temporary project, teardown, or rollback
was created or verified by this review.

## Remaining external blockers

The initial release remains on HOLD until all of the following finish:

- merge the bootstrap workflow changes to `main` after all automated checks;
- store `PRODUCTION_SUPABASE_SECRET_KEY` only in `production-backend` and
  compare every GitHub repository/environment variable and secret name with the
  inventory;
- dispatch bootstrap with the exact main SHA, exact production ref, canonical
  authorization ID, and empty recovery fields; require zero-count preflight
  evidence before migrations;
- complete backend migrations, Function secrets/deployment, and backend
  readiness from that single protected run;
- import approved content, configure production retention approval, and create
  the opaque smoke teacher/cohort fixtures without an open join window;
- package the immutable Pages artifact, pass production readiness, publish it,
  and complete clean teacher/student permission-boundary and classroom-flow
  smoke tests;
- complete every applicable item and signature in `release-checklist.md`. The
  owner-exception record replaces only the independent reviewer signature for
  this release.

Before GO, complete every item and signature that applies to the initial
bootstrap; mark the superseded reviewer field with the dated owner exception.

After successful bootstrap, content, and fixtures—but before the next backend
upgrade—the owner must designate the encryption/recovery custodian, provision
separate key custody, verify two custody locations, create a real production
recovery package (the real production recovery record), complete the hosted restore rehearsal and temporary-project teardown,
and address Supabase Free-plan pause/availability. Normal upgrades
then restore required reviewers unless a new explicit exception is recorded.

## Conditions for GO

For this first release, GO is possible only when every applicable formal
checklist item is checked, the owner-exception record is present, bootstrap
preflight proves emptiness, retention and smoke fixtures pass, the immutable
Pages artifact and served metadata match, and the release owner signs the GO
outcome. Required reviewers, a real recovery record, both encrypted copies, and
the independently verified hosted restore rehearsal become mandatory before
the next backend upgrade as stated above.

Until that evidence exists, the decision remains **HOLD**. A repository commit,
green local test, workflow dispatch, or document signature cannot replace an
external control and does not authorize deployment.
