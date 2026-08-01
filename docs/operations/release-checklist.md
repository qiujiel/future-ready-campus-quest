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
| Backend workflow run | `________________` |
| Pages workflow run | `________________` |
| Planned window and timezone | `________________` |

## 1. Configuration and separation

- [ ] The exact inventory in `github-environments.md` was checked by two people.
- [ ] The production ref and URL match each other.
- [ ] The production ref is neither `LOAD_SUPABASE_PROJECT_REF` nor
  `vadyhuipwbtgbzpeisbn`.
- [ ] Load fixtures identify only `vadyhuipwbtgbzpeisbn`.
- [ ] `production-backend`, `production-readiness`, and `github-pages` have
  distinct required-reviewer gates, self-review prevention, and `main` rules.
- [ ] `github-pages` contains no Supabase secret.
- [ ] Public `VITE_*` values contain no service-role or private credential.
- [ ] Environment verification completed at `________________` by
  `________________` and `________________`.

## 2. Data-owner and recovery approval

- [ ] The course owner approved `________` retention days; approver and time
  are recorded in `private.data_retention_configuration`.
- [ ] Operational/privacy incident owner: `________________`.
- [ ] Teacher-private CSV handling matches school policy.
- [ ] Current backup/PITR evidence ID: `________________`.
- [ ] Recoverable production timestamp: `________________`.
- [ ] Non-production restore rehearsal project ref: `________________`.
- [ ] Restore rehearsal time/result/reviewer: `________________`.
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
- [ ] `supabase migration list` is captured before mutation.
- [ ] Migration dry-run contains only reviewed forward migrations, in timestamp
  order, through `20260730021100`.
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
- [ ] Smoke teacher and unarchived owned cohort exist as opaque fixtures.
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
- [ ] Final deploy job depends on the successful readiness job and does not
  rebuild or receive a Supabase credential.
- [ ] `github-pages` approval was granted by `________________` at
  `________________`.
- [ ] Served release metadata matches the approved commit and the release record.
- [ ] Teacher sign-in/dashboard/export and student join/quest/completion smoke
  checks pass without recording names, answers, or tokens.
- [ ] Joining remains closed until the teacher intentionally opens the class.
- [ ] Observation owner and end time: `________________` / `________________`.

## Decision

Any unchecked item means **HOLD**. Record one outcome:

- [ ] **GO** — all controls passed; owners accepted the release.
- [ ] **HOLD** — blocker/owner: `________________________________________`.
- [ ] **ROLL BACK** — incident record and procedure start time:
  `________________________________________`.

Release owner signature/time: `________________________________________`

Independent reviewer signature/time: `_________________________________`
