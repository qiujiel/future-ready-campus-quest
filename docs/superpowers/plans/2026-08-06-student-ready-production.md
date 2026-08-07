# Student-Ready Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure hosted Future-Ready Campus Quest that students join from one URL using only a name and teacher-provided group code, with complete teacher controls, content, persistence, and production verification.

**Architecture:** Retain the existing server-created Supabase student identities and add hashed, window-scoped per-group join codes resolved only inside trusted RPCs. Extend the teacher boundary with owned cohort/readiness data and auditable roster/launch controls, then deploy the verified migrations, functions, protected content, and static frontend through the existing gated workflows.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Supabase Postgres/Auth/Edge Functions, Vitest, Playwright, GitHub Actions/Pages.

## Global Constraints

- Students require no invitation, password, email, or email verification.
- Teacher authentication remains separate and password-protected.
- Every student receives a unique authenticated ID and can read only permitted data.
- Group codes never grant teacher authority and sequential database IDs are not authorization mechanisms.
- RLS, backend validation, idempotency, protected-content boundaries, and secret handling must not be weakened.
- Production project is exactly `ghohuwwjxgjqnbsauvzq`; `vadyhuipwbtgbzpeisbn` is load-test only.
- Never log, print, hard-code, or commit credentials, signing secrets, service-role keys, or protected answer keys.
- No production deployment action occurs until backup, rollback, artifact integrity, and required environment approvals are verified.

---

### Task 1: Shared-URL student session entry

**Files:**
- Modify: `src/shared/api/contracts.ts`
- Modify: `src/shared/api/authGateway.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/features/join/JoinPage.tsx`
- Modify: `src/features/join/IdentityForm.tsx`
- Modify: `src/features/join/GroupPicker.tsx`
- Test: `tests/auth-flows.test.tsx`
- Test: `tests/ui/router-access.test.tsx`

**Interfaces:**
- Produces: `JoinCohortInput { joinCode, displayName, requestKey }`, `AuthGateway.getCurrentRole()`, and `AuthGateway.signOut()`.
- Consumes: existing `JoinCohortOutput` and Supabase session storage.

- [ ] Write failing UI tests proving `/join` asks only for name and group code, maps friendly errors, and navigates to `/quest`.
- [ ] Run `pnpm test tests/auth-flows.test.tsx tests/ui/router-access.test.tsx` and confirm failures identify the missing route/contract.
- [ ] Implement the minimal contract, gateway, route, form, homepage Student action, and returning-session choices.
- [ ] Rerun the focused tests and refactor only after green.
- [ ] Commit the independently passing entry flow.

### Task 2: Window-scoped secure group codes

**Files:**
- Create: `supabase/migrations/20260806000100_group_join_codes.sql`
- Modify: `supabase/functions/_shared/join-core.ts`
- Modify: `supabase/functions/join-cohort/index.ts`
- Modify: `supabase/functions/manage-join-window/index.ts`
- Modify: `supabase/functions/teacher-controls/index.ts`
- Test: `supabase/tests/group_join_codes.test.sql`
- Test: `tests/functions/join-core.test.ts`
- Test: `tests/functions/manage-join-window.test.ts`
- Test: `tests/integration/join-boundary.test.ts`

**Interfaces:**
- Produces: `deriveGroupJoinCode(requestKey, groupNumber, secret)`, hashed `cohort_group_join_codes`, `preflight_student_join_code`, and `complete_student_code_join`.
- Produces teacher receipt `{ studentUrl, expiresAt, groups: [{ groupId, groupNumber, joinCode, enabled }] }`.
- Consumes: `JOIN_TOKEN_SIGNING_SECRET`, existing join rate limits, group capacity, and synthetic student auth.

- [ ] Write failing core tests with hand-checked expectations for normalized codes, invalid/expired/disabled codes, group capacity, and idempotent duplicate requests.
- [ ] Run the focused function tests and verify the expected missing-code failures.
- [ ] Write the migration and minimal trusted-core/function changes, retaining the legacy token path only for existing recovery compatibility.
- [ ] Write failing SQL tests for teacher ownership, code hash secrecy, cross-cohort rejection, per-group disable, expiry, and RLS denial.
- [ ] Reset local Supabase, run database and integration tests, then refactor after green.
- [ ] Commit secure group codes and migration together.

### Task 3: Teacher cohort selection and classroom readiness roster

**Files:**
- Modify: `src/shared/api/contracts.ts`
- Modify: `src/shared/api/authGateway.ts`
- Modify: `src/teacher/api/teacherClient.ts`
- Modify: `src/features/teacher/TeacherSetupPage.tsx`
- Create: `src/features/teacher/ClassroomReadiness.tsx`
- Modify: `src/features/teacher/TeacherShell.tsx`
- Modify: `supabase/functions/teacher-dashboard/index.ts`
- Create: `supabase/migrations/20260806000200_classroom_readiness.sql`
- Test: `tests/ui/teacher-readiness.test.tsx`
- Test: `tests/api/teacher-client.test.ts`
- Test: `supabase/tests/classroom_readiness.test.sql`

**Interfaces:**
- Produces: `TeacherCohortListItem`, `ClassroomReadiness`, `TeacherRosterStudent`, `TeacherGateway.getReadiness(cohortId)`, and owned-cohort listing.
- Consumes: join status/codes from Task 2 and existing analytics summary.

- [ ] Write failing tests for opening an existing cohort, post-create dashboard navigation, group rosters, joined/active/started/submitted/incomplete counts, last activity, and joining state.
- [ ] Run focused UI/API tests and verify expected failures.
- [ ] Add the owned read-only RPC/function contracts and minimal UI.
- [ ] Write and run SQL ownership/privacy tests; unauthorized requests must remain indistinguishable from missing cohorts.
- [ ] Rerun focused tests and commit the readiness view.

### Task 4: Auditable roster management and student recovery

**Files:**
- Create: `supabase/migrations/20260806000300_roster_controls.sql`
- Modify: `supabase/functions/teacher-controls/index.ts`
- Modify: `supabase/functions/_shared/teacher-controls-core.ts`
- Modify: `src/shared/api/contracts.ts`
- Modify: `src/features/teacher/ClassroomReadiness.tsx`
- Modify: `src/features/teacher/SessionControls.tsx`
- Test: `tests/functions/teacher-controls-core.test.ts`
- Test: `tests/ui/teacher-readiness.test.tsx`
- Test: `supabase/tests/roster_controls.test.sql`

**Interfaces:**
- Produces commands `move-student`, `remove-student`, `reset-student`, `set-group-join`, and existing `issue-recovery`.
- Consumes: active membership, group capacity, immutable attempts/responses, and teacher ownership checks.

- [ ] Write failing boundary tests for every command and invalid state.
- [ ] Run them red, implement schemas/core normalization, and rerun green.
- [ ] Write SQL tests proving capacity checks, no self-move, soft removal blocks RLS, reset preserves history, group disable blocks joining, and cross-cohort actions fail.
- [ ] Implement atomic RPCs and connect accessible teacher controls with confirmations and receipts.
- [ ] Run SQL, function, and UI tests; refactor only while green.
- [ ] Commit roster controls.

### Task 5: Atomic launch, reset, and complete learning sequence

**Files:**
- Create: `supabase/migrations/20260806000400_activity_launch.sql`
- Modify: `supabase/functions/teacher-controls/index.ts`
- Modify: `src/shared/api/contracts.ts`
- Modify: `src/features/teacher/SessionControls.tsx`
- Modify: `src/features/quest/QuestEntryPage.tsx`
- Test: `supabase/tests/activity_launch.test.sql`
- Test: `tests/ui/quest-entry.test.tsx`
- Test: `tests/ui/session-controls.test.tsx`
- Test: `tests/integration/learning-flow.test.ts`

**Interfaces:**
- Produces command `launch-quest` and RPC `launch_cohort_quest(cohort, request_key)` creating diagnostic attempts from the active content version.
- Consumes: active memberships, complete 24-item/eight-concept content, phase timings, and idempotent teacher audit.

- [ ] Write failing tests proving launch creates one attempt per active student, repeated launch creates none, late joins start when permitted, removed students do not start, and missing content fails closed.
- [ ] Run focused tests red, implement the transaction/function command, and rerun green.
- [ ] Add UI launch/status behavior and student polling/error messages with failing UI tests first.
- [ ] Run the real local integration learning sequence through reflection and persisted results.
- [ ] Commit the launch flow.

### Task 6: Teacher-only question bank and classroom-safe errors

**Files:**
- Create: `src/features/teacher/QuestionBank.tsx`
- Modify: `src/features/teacher/TeacherShell.tsx`
- Modify: `src/teacher/api/teacherClient.ts`
- Modify: `supabase/functions/teacher-dashboard/index.ts`
- Modify: `src/features/quest/QuestEntryPage.tsx`
- Modify: `src/features/quest/MissionCard.tsx`
- Test: `tests/ui/question-bank.test.tsx`
- Test: `tests/ui/quest-entry.test.tsx`
- Test: `tests/e2e/classroom-errors.spec.ts`

**Interfaces:**
- Produces: teacher-only sanitized question-bank entries and user-facing connectivity/save/load/submission errors.
- Consumes: active content metadata; never exposes correctness keys through student requests.

- [ ] Write failing teacher/student boundary and UI behavior tests.
- [ ] Implement minimal teacher-only loading and classroom-safe error copy.
- [ ] Test offline queue recovery, repeated submissions, refresh, and expired sessions.
- [ ] Commit content visibility and error handling.

### Task 7: Local full-stack seed and three-student verification

**Files:**
- Create: `scripts/bootstrap-local-classroom.ts`
- Create: `tests/e2e/hosted-classroom.spec.ts`
- Modify: `docs/operations/class-session-runbook.md`
- Modify: `docs/operations/release-checklist.md`

**Interfaces:**
- Produces only local synthetic teacher/cohort fixtures and reusable hosted E2E assertions.
- Consumes: protected bank from `protected-content/generated/question-bank.json` without copying it into Git.

- [ ] Add a dry-run/test harness proving the bootstrap refuses non-local project URLs.
- [ ] Reset local Supabase, import the complete bank, serve all functions, and create the teacher fixture without printing credentials.
- [ ] Run the real teacher plus three-student multi-group browser journey, including duplicate names, invalid/closed codes, refresh, completion, move/remove/reset, and privacy probes.
- [ ] Inspect browser console, Edge Function logs, and failed requests; fix all blockers test-first.
- [ ] Run all unit, function, SQL, integration, E2E, typecheck, lint, build, bundle, repository, and deployment checks.
- [ ] Commit the verified local full-stack state and operational docs.

### Task 8: Production backend release

**Files:**
- Modify: `docs/operations/backend-release.md`
- Modify: `docs/operations/rollback.md`
- Modify: `docs/operations/deployment-readiness-review.md`
- Modify: `docs/operations/release-checklist.md`

**Interfaces:**
- Produces: linked production schema/functions/content/teacher auth and recorded non-secret release evidence.
- Consumes: exact project `ghohuwwjxgjqnbsauvzq`, approved backup evidence, Supabase access token, service-role key, signing secrets, and teacher credential supplied securely at action time.

- [ ] Verify migration hashes, function inventory, content artifact count/version, rollback commands, backup status, allowed origins, and exact target project without revealing secrets.
- [ ] Obtain only the next required credential/approval if an external boundary blocks progress.
- [ ] Link the CLI to `ghohuwwjxgjqnbsauvzq`, apply migrations in order, deploy every function, set secrets, import the protected bank, and configure teacher auth/redirects.
- [ ] Run read-only production readiness plus targeted live smoke/security probes and record sanitized evidence.
- [ ] Stop and roll back on any failed invariant; otherwise mark backend release evidence green.

### Task 9: Production frontend release and hosted verification

**Files:**
- Modify: `.github/workflows/deploy-pages.yml` only if verified checks require it
- Modify: `docs/operations/github-environments.md`
- Modify: `docs/operations/class-session-runbook.md`
- Modify: `docs/operations/release-checklist.md`

**Interfaces:**
- Produces the stable GitHub Pages HTTPS URL and final operational instructions.
- Consumes: production Supabase URL/public anon key, protected GitHub environment approval, verified branch/PR, and green backend.

- [ ] Verify GitHub variables/secrets inventory, Pages base path, artifact digest, approval gate, branch protection, and absence of tracked secrets.
- [ ] Push the final verified commits, make the PR ready, review checks, merge to production branch, and approve the protected Pages environment when permitted.
- [ ] Open the final URL in clean Chrome sessions and current Safari; run teacher and at least three student sessions across multiple groups.
- [ ] Verify direct routes, refresh/return, unique IDs, persisted responses, teacher results, RLS denials, invalid/closed codes, logout/new session, console, network, and backend logs.
- [ ] Fix and redeploy every classroom blocker, rerunning the complete verification gate.
- [ ] Publish the final URL, commit/date, teacher/student guides, backup/rollback/disable/recovery procedures, browser evidence, limitations, and two-week readiness recommendation.

