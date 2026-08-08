# Classroom Join Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the protected classroom load gate report auditable join integrity evidence and enforce the approved 5,000 ms one-time join threshold without weakening any correctness or security control.

**Architecture:** Extract pure join-evidence and gate-evaluation helpers beside the existing load runner so Vitest can exercise the policy without live credentials. The live runner records expected group assignments and unique identities, emits non-sensitive join evidence immediately after all joins, then continues the unchanged full activity and authorization gate.

**Tech Stack:** Node.js ESM, Vitest, Supabase Edge Functions, GitHub Actions, Markdown operations documentation.

## Global Constraints

- Run exactly 30 simultaneous joins in five groups of six.
- Require join p95 below 5,000 ms; keep response p95 below 1,500 ms and dashboard p95 below 2,500 ms.
- Fail on any failed join, incorrect group assignment, duplicate identity, data loss, duplicate response, invalid completion/score, accepted unauthorized call, or failed authorized call.
- Do not add retries or change authentication, group-code validation, rate limiting, capacity controls, replay protection, RLS, student isolation, or teacher authorization.
- Evidence must contain no names, codes, tokens, credentials, or student identifiers.

---

### Task 1: Join evidence policy

**Files:**
- Create: `tests/load/class-session-policy.js`
- Create: `tests/load/class-session-policy.test.js`
- Modify: `tests/load/class-session.js`

**Interfaces:**
- Produces: `CLASSROOM_JOIN_P95_LIMIT_MS`, `buildJoinPhaseEvidence(input)`, and `classroomLoadGateFailures(metrics)`.
- Consumes: numeric latency arrays, joined student records containing only `studentId`, `actualGroupNumber`, and `expectedGroupNumber`, plus the final aggregate metrics.

- [ ] **Step 1: Write failing policy tests**

Test that the limit is exactly `5_000`, a 4,999 ms fully correct run passes,
5,000 ms fails, incorrect group assignments and duplicate identities fail, and
the evidence object exposes aggregate counters without student records.

- [ ] **Step 2: Run the targeted test and confirm RED**

Run `pnpm exec vitest run tests/load/class-session-policy.test.js` and confirm
it fails because `tests/load/class-session-policy.js` does not exist.

- [ ] **Step 3: Implement the pure policy helpers**

Create the exported constant and helpers. Include every existing gate in
`classroomLoadGateFailures`: authorized/unauthorized requests, join/response/
dashboard p95, duplicate responses, completion count, group count and scores,
and verified formula count, plus incorrect assignments and duplicate identities.

- [ ] **Step 4: Integrate evidence into the live runner**

Record the expected group number for each request, retain the returned group
number, build and print `Join phase evidence: <json>` after `Promise.all`, and
use the shared failure helper for the final decision. Do not serialize session
tokens or student records.

- [ ] **Step 5: Rerun the targeted load tests and plan check**

Run `pnpm exec vitest run tests/load/class-session-policy.test.js tests/load/server-timing.test.js` and `pnpm test:load`; expect all tests and the 30-student plan to pass.

### Task 2: Operational threshold documentation

**Files:**
- Modify: `docs/operations/backend-release.md`
- Modify: `docs/operations/release-checklist.md`
- Modify: `docs/superpowers/plans/2026-07-30-teacher-dashboard-and-production-readiness.md`
- Test: `tests/deployment/recovery-documentation.test.js`

**Interfaces:**
- Consumes: the approved 5,000 ms one-time join gate from Task 1.
- Produces: an auditable release checklist and an explicit supersession note for the original target.

- [ ] **Step 1: Add failing documentation assertions**

Require the release documents to distinguish the 5,000 ms initial join gate
from the unchanged 1,500 ms response gate and to state the correctness/security
conditions.

- [ ] **Step 2: Run the targeted test and confirm RED**

Run `pnpm exec vitest run tests/deployment/recovery-documentation.test.js` and
confirm the new assertions fail against the old 1.5-second join wording.

- [ ] **Step 3: Update the operational documents**

Replace only the join release threshold, describe the one-time latency as a
known limitation, retain all security constraints, and mark the historical
1.5-second plan item as superseded by the approved classroom-readiness rule.

- [ ] **Step 4: Rerun the targeted documentation test**

Run `pnpm exec vitest run tests/deployment/recovery-documentation.test.js` and
expect it to pass.

### Task 3: Full verification and protected release evidence

**Files:**
- Verify only; change implementation files only if a regression is found.

**Interfaces:**
- Consumes: the tested policy, runner, and documentation.
- Produces: local verification results and a protected GitHub load-run receipt.

- [ ] **Step 1: Run the complete local gate**

Run repository and deployment checks, all Vitest suites, Function tests,
typecheck, lint, production build, bundle scan, Playwright, and the load plan.

- [ ] **Step 2: Commit, push, and open the protected pull request**

Commit only the scoped policy, tests, and documentation; push the branch and
open a pull request. Require CI and secret-scan checks before merge.

- [ ] **Step 3: Merge the exact reviewed commit**

Merge only after all required checks pass and verify the exact commit on
`main`.

- [ ] **Step 4: Run the protected representative live load**

Dispatch the Pages workflow from the exact merged SHA. Require the live-load
job to report all 30 joined, zero incorrect assignments, zero duplicate
identities, zero authorization failures, and join p95 below 5,000 ms before
publication can proceed.

- [ ] **Step 5: Record the measured limitation and continue release**

Record the successful measured p95 and artifact evidence. If p95 is at or
above 5,000 ms, identify at most one additional low-risk, high-confidence
optimization. Otherwise continue the approved production backend and Pages
release sequence without further latency work.
