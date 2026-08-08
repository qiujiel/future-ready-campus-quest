# Gate D Formal Deployment Checklist

**Default decision: HOLD.** Publication is authorized only after every required
item is complete and the named reviewer approves the corresponding protected
environment. This checklist does not itself deploy, approve, or publish.

Release record:

| Field | Value |
| --- | --- |
| Release owner | `________________` |
| Independent reviewer | `________________` |
| Approved main commit (40 characters) | `________________` |
| Production Supabase project ref | `________________` |
| Production Supabase URL | `________________` |
| Dedicated load-test project ref | `________________` |
| Pinned Supabase CLI version | `________________` |
| Backend workflow run | `________________` |
| Pages workflow run | `________________` |
| Planned window and timezone | `________________` |

## 1. Configuration and separation

- [ ] The exact inventory in `github-environments.md` was checked by two people.
- [ ] The production ref equals `ghohuwwjxgjqnbsauvzq` exactly.
- [ ] The production URL equals
  `https://ghohuwwjxgjqnbsauvzq.supabase.co` exactly.
- [ ] The dedicated load ref and load fixtures equal only
  `vadyhuipwbtgbzpeisbn`; neither may be used as production or a restore target.
- [ ] `production-backend`, `production-readiness`, and `github-pages` have
  distinct required-reviewer gates, self-review prevention, and `main` rules.
- [ ] `github-pages` contains no Supabase secret.
- [ ] Public `VITE_*` values contain no service-role or private credential.
- [ ] Environment verification completed at `________________` by
  `________________` and `________________`.

## 2. Data-owner and recovery approval

- [ ] The course owner approved `90` retention days under authorization
  `course-owner-2026-08-08`; approver and time are recorded in
  `private.data_retention_configuration`.
- [ ] Operational/privacy incident owner: `________________`.
- [ ] Teacher-private CSV handling matches school policy.
- [ ] Recovery custodian and key provisioning — Approver: `____________`; UTC: `____________`; Result: `____________`.
- [ ] Cloud and offline custody locations — Approver: `____________`; UTC: `____________`; Result: `____________`.
- [ ] Production read/export window — Approver: `____________`; UTC: `____________`; Result: `____________`.
- [ ] Load-test project pause — Approver: `____________`; UTC: `____________`; Result: `____________`.
- [ ] Temporary recovery project creation — Approver: `____________`; UTC: `____________`; Result: `____________`.
- [ ] Restore operation — Approver: `____________`; UTC: `____________`; Result: `____________`.
- [ ] Optional rehearsal deployment — Approver: `____________`; UTC: `____________`; Result: `approved deployment / reviewer-confirmed not required`.
- [ ] Temporary recovery project deletion — Approver: `____________`; UTC: `____________`; Result: `____________`.
- [ ] Load-test project reactivation — Approver: `____________`; UTC: `____________`; Result: `____________`.

The optional rehearsal-deployment result must explicitly say either that the
deployment was approved and completed or that an independent reviewer confirmed
it was not required. A blank or assumed `N/A` leaves the item unchecked.

- [ ] Backup evidence ID: `________________`.
- [ ] Quiesced recovery point (canonical UTC): `________________`.
- [ ] `backup_created_at_utc` archive creation/completion time (canonical UTC):
  `________________`.
- [ ] Encrypted archive SHA-256 and byte size:
  `________________` / `________________`.
- [ ] Pinned Supabase CLI version `2.110.0` matches the internal manifest and
  approved release tooling.
- [ ] Component-completion flags for roles, schema, data, migration-history
  schema, migration-history data, and Storage export are all complete.
- [ ] Cloud-copy read-back digest and size verification result/time:
  `________________`.
- [ ] Offline-copy read-back digest and size verification result/time:
  `________________`.
- [ ] No-write-since-recovery-point attestation by production owner/time:
  `________________`.
- [ ] Restore rehearsal evidence ID: `________________`.
- [ ] Temporary Singapore recovery project ref: `________________`.
- [ ] Internal manifest full approved 40-character source SHA (the source commit),
  exact source project ref, pinned CLI version `2.110.0`, command versions, and
  component-completion flags match the release record.
- [ ] The two binding reviews below were completed by two distinct named people;
  self-review and use of the same person for both reviews are prohibited.
- [ ] Internal manifest-to-release binding review 1 — Reviewer name: `____________`; UTC: `____________`; Result: `____________`.
- [ ] Internal manifest-to-release binding review 2 — Reviewer name: `____________`; UTC: `____________`; Result: `____________`.
- [ ] Encrypted source counts and independently captured target counts exactly equal
  for Auth users, cohorts, private/public profiles, quest attempts, student
  responses, concept evidence, and audit events; result/time: `____________`.
- [ ] Database/Auth/RLS/retention validation result: `________________`.
- [ ] `group-images` object-count/byte-total/digest validation result:
  `________________`.
- [ ] Rehearsal reviewer and time: `________________`.
- [ ] Temporary recovery project deletion and load-test reactivation identity/
  health results match their separately approved records: `________________`.
- [ ] The data owner accepted the Free-plan pause/availability limitation and
  scheduled an early class health/reactivation check: `________________`.
- [ ] Previous compatible Edge Function commit: `________________`.
- [ ] Previous successful Pages run, commit, and manifest digest are recorded,
  or the first-release maintenance procedure in `rollback.md` is ready.

## 3. Source and automated gates

- [ ] Release SHA is the current approved `main` SHA.
- [ ] `pnpm install --frozen-lockfile` succeeds.
- [ ] `check:repo`, `check:deployment`, lint, typecheck, unit tests, function
  tests, Deno checks, local reset, all pgTAP tests, integration tests, build,
  bundle scan, Playwright, and representative-load tests pass.
- [ ] Dedicated-project live-load evidence reports five teams of six, no
  duplicates, zero authorized failures, zero accepted unauthorized calls,
  join/response p95 below 1.5 seconds, and dashboard p95 below 2.5 seconds.
- [ ] Release action references are reviewed full commit SHAs.

## 4. Backend release approval

- [ ] Joining is closed and new quest starts are paused.
- [ ] Backend workflow inputs exactly match the approved SHA and production ref.
- [ ] All four recovery workflow inputs—`backup_evidence_id`,
  `backup_created_at_utc`, `backup_archive_sha256`, and
  `restore_rehearsal_evidence_id`—match the release record and separately held
  evidence.
- [ ] `supabase migration list` is captured before mutation.
- [ ] Migration dry-run contains only reviewed forward migrations, in timestamp
  order, through `20260806000700`.
- [ ] `production-backend` approval was granted by `________________` at
  `________________`.
- [ ] Migration push, five custom secret updates, and all eleven function deploys
  succeeded in the same workflow run.
- [ ] Backend preflight confirms Auth health, required migration history/RPCs,
  the exact active cleanup schedule, function boundaries, and the exact
  non-load project identity.
- [ ] No secret value or protected content appears in logs or summaries.

## 5. Content and production readiness

- [ ] Protected content was imported only by an authorized owner using exact
  non-local project confirmation.
- [ ] Approved version key: `________________`; item/concept counts: `24 / 8`.
- [ ] Teacher-private question-bank review returns the approved 24 items with
  accepted responses, rationales, sources, and C1–C8 coverage; a student token
  is denied.
- [ ] Smoke teacher and unarchived owned cohort exist as opaque fixtures.
- [ ] `production-classroom-bootstrap.yml` ran from the exact approved SHA,
  received `PRODUCTION_TEACHER_EMAIL` and `PRODUCTION_TEACHER_PASSWORD` only as
  encrypted environment secrets, and returned no personal or credential data.
- [ ] The opaque receipt IDs exactly match `PRODUCTION_SMOKE_TEACHER_ID` and
  `PRODUCTION_SMOKE_COHORT_ID` in `production-readiness`.
- [ ] The temporary teacher password is scheduled to rotate before real
  classroom use, and the operator will remove the one-time workflow and its
  validator after readiness succeeds.
- [ ] No live join window or recovery token remains from testing.
- [ ] Daily cleanup job `campus-quest-expired-artifact-cleanup` has exactly one
  row, owned by `postgres` in the production database, active at `17 3 * * *`,
  and the non-production cleanup rehearsal passed.
- [ ] Pages package job produced one 90-day `github-pages` artifact without
  Pages write or OIDC permission.
- [ ] Package evidence: artifact ID `________________`, commit
  `________________`, manifest SHA-256 `________________`.
- [ ] `production-readiness` approver reviewed the downloaded artifact's exact
  ID/digest plus the redaction-safe production preflight, then approved at
  `________________`.
- [ ] GitHub readiness uses only `PRODUCTION_READINESS_SECRET`; no production
  service-role key is present in any GitHub scope.

## 6. Publication approval and observation

- [ ] Intended Pages URL/base path: `________________`.
- [ ] `ALLOWED_FRONTEND_ORIGINS` exactly matches the intended HTTPS origin and
  contains no Pages path.
- [ ] `FRONTEND_APP_URL` equals the intended HTTPS origin plus
  `VITE_BASE_PATH`, so generated join and recovery links retain the Pages path.
- [ ] Final deploy job depends on the successful readiness job and does not
  rebuild or receive a Supabase credential.
- [ ] `github-pages` approval was granted by `________________` at
  `________________`.
- [ ] Served release metadata matches the approved commit and the release record.
- [ ] Teacher sign-in/dashboard/export and student join/quest/completion smoke
  checks pass without recording names, answers, or tokens.
- [ ] One shared student URL accepts display name plus short group code, and no
  student can start until the teacher launches the cohort quest.
- [ ] Teacher roster move, remove, reset, and recovery controls pass with
  confirmation, ownership enforcement, session revocation, and audit evidence.
- [ ] Joining remains closed until the teacher intentionally opens the class.
- [ ] Observation owner and end time: `________________` / `________________`.

## Decision

Any unchecked item means **HOLD**. No operator, owner, approver, or reviewer may waive
an unchecked control, substitute a combined approval, or sign GO while one is
incomplete. Record one outcome:

- [ ] **GO** — all controls passed; owners accepted the release.
- [ ] **HOLD** — blocker/owner: `________________________________________`.
- [ ] **ROLL BACK** — incident record and procedure start time:
  `________________________________________`.

Release owner signature/time: `________________________________________`

Independent reviewer signature/time: `_________________________________`
