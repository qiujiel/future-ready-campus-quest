# Deployment Readiness Review — 2026-08-06

**Reviewed branch:** `codex/gate-d-teacher-readiness`
**Original Gate D commit:** `4783565`
**Remediated review baseline:** `568f282ba5338e42ffa008a26e956cfbb419ce79`
**Recovery design commit:** `ce7a056`
**Reviewed implementation-plan baseline:** `d7e26d260098620c89e297863aa2c4c09bf8c24a`
**Student-ready review baseline:** `c0177dcdb9faa4ec6da94d719d5d8606446a9d6c`
**Production project:** `ghohuwwjxgjqnbsauvzq`
**Dedicated load-test project:** `vadyhuipwbtgbzpeisbn`
**Decision: HOLD**

This is an independent repository and read-only remote-configuration review.
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

The remote Pages endpoint currently returns `404`: no Pages site is configured.
No production environment exists, so no reviewer/self-review/branch rule is
configured and no real Pages artifact has been produced or verified.

## GitHub variables and secrets inventory

`github-environments.md` defines the intended repository and environment
variable/secret inventory and keeps the load project separate from production.
The four recovery values are per-run non-secret inputs, not variables or
secrets. The documented design excludes backups, connection strings, database
passwords, Storage administration keys, encryption keys, plaintext exports,
object paths, and protected manifests from every GitHub scope.

The remote repository inventory contains zero Actions variables, zero Actions
secrets, and zero environments. The private repository has one collaborator,
`qiujiel`, and the account currently cannot enable branch protection for this
private repository. The draft pull request at the student-ready baseline is
mergeable and its two verification runs and two secret scans passed. A
repository administrator and a distinct reviewer must still configure and
independently compare every variable, secret, environment, reviewer,
self-review control, administrator-bypass setting, and `main` rule with the
formal checklist without copying values into evidence.

## Supabase migration and function sequence

The original reviewed baseline contains the retention cleanup scheduling and
schedule uniqueness/readiness controls through `20260730021100`. The current
student-ready extension adds ordered, forward-only classroom migrations through
`20260806000700` for group codes, classroom readiness, roster controls, atomic
launch, adaptive completion, teacher question-bank review, and release-preflight
coverage.
`supabase/config.toml` declares the eleven expected Edge Functions, including
`production-readiness`. The protected backend procedure records the remote
migration list, performs a dry-run before one forward migration push, deploys
the reviewed function set, and runs backend preflight. Content import and Pages
publication remain separate operations.

The Supabase project inventory confirms production project
`ghohuwwjxgjqnbsauvzq` is `ACTIVE_HEALTHY` in `ap-southeast-1` and the dedicated
load project `vadyhuipwbtgbzpeisbn` is separately `ACTIVE_HEALTHY` in
`ap-northeast-2`. Production currently reports zero deployed Edge Functions and
zero custom Function secrets. No production database connection was made, so
migration history, Auth configuration, content, cron, retention, and database
objects remain unverified.

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

Release remains on HOLD until authorized owners complete and independently
verify all of the following outside this repository:

- choose a GitHub hosting/visibility plan that supports Pages, protected
  branches, environment secrets, and required deployment reviewers; the
  current private GitHub Free repository does not;
- add at least one trusted GitHub collaborator who is distinct from `qiujiel`
  and can perform the required independent deployment reviews;
- designate the encryption/recovery custodian and provision the `age` key with
  separate key custody;
- approve and verify the two custody locations: institution-controlled cloud
  storage and encrypted offline/local storage;
- create, copy, read back, and independently review a real production recovery
  package less than 24 hours old with no later production write;
- pause/reactivate the load-test project under approval and complete the hosted
  Singapore restore rehearsal, aggregate validation, evidence review, and
  temporary-project teardown;
- configure and independently verify all GitHub repository/environment
  variables and secrets, protected environments, distinct required reviewers,
  self-review prevention, administrator bypass controls, and `main` branch
  rules;
- obtain course-owner production retention approval and record the approved
  value, approver, and time in the production database;
- provision and validate the opaque production smoke teacher/cohort fixtures
  without retaining live joins or recovery tokens;
- obtain data-owner acceptance of the Supabase Free-plan pause/availability
  limitation and schedule an early class health/reactivation check;
- complete every item and signature in `release-checklist.md`, including source,
  load, content, backend, readiness, Pages artifact, publication, smoke,
  observation, rollback, and privacy gates.

## Conditions for GO

GO is possible only when every formal checklist item is checked, every distinct
reviewer approves the corresponding protected environment, the real recovery
record matches all four backend workflow inputs, both encrypted copies and the
hosted restore rehearsal are independently verified, retention and smoke
fixtures pass, the immutable Pages artifact and served metadata match, and the
release owner plus independent reviewer sign the GO outcome.

Until that evidence exists, the decision remains **HOLD**. A repository commit,
green local test, workflow dispatch, or document signature cannot replace an
external control and does not authorize deployment.
