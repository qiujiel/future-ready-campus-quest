# Seven-Second Classroom Join Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode the owner-approved 7,000 ms inclusive initial-join ceiling, preserve every other load/security requirement, and continue the protected release only after a complete dedicated-project classroom run passes.

**Architecture:** Keep one policy constant as the executable source of truth and pin its exact inclusive boundary with unit tests. Update only current operations documentation and its structural tests; preserve historical specifications/plans as immutable decision history. Production remains untouched until the merged policy passes CI and the complete live load test.

**Tech Stack:** Node.js 24, Vitest, JavaScript load harness, Markdown operations documentation, GitHub Actions, Supabase CLI.

## Global Constraints

- `CLASSROOM_JOIN_P95_LIMIT_MS` is exactly `7_000` and inclusive.
- Response p95 remains strictly below `1_500` ms; dashboard p95 remains strictly below `2_500` ms.
- All 30 students must join with zero failures, wrong groups, duplicate identities, authorization failures, accepted unauthorized calls, duplicate responses, or data loss.
- Five returning logins must restore the same identities and create no Auth users.
- Do not weaken authentication, code validation, rate/capacity limits, replay protection, RLS, student isolation, or teacher authorization.
- Do not perform another latency optimization.
- Do not touch production until the exact merged SHA passes CI and the complete dedicated-project live load gate.

---

### Task 1: Pin the approved 7,000 ms boundary with TDD

**Files:**
- Modify: `tests/load/class-session-policy.test.js`
- Modify: `tests/load/class-session-policy.js`

**Interfaces:**
- Consumes: `classroomLoadGateFailures(metrics)` and the approved inclusive 7,000 ms ceiling.
- Produces: `CLASSROOM_JOIN_P95_LIMIT_MS = 7_000` with unchanged response/dashboard and integrity predicates.

- [ ] **Step 1: Write the failing boundary tests**

Change the passing fixture and the three join-latency cases to the approved boundary:

```js
function passingMetrics(overrides = {}) {
  return {
    // Keep every existing correctness/security field unchanged.
    p95JoinMs: 6_999,
    ...overrides,
  };
}

it("accepts a fully correct 30-student run below the 7-second join limit", () => {
  expect(classroomLoadGateFailures(passingMetrics())).toEqual([]);
});

it("accepts a join p95 at the inclusive 7-second boundary", () => {
  expect(classroomLoadGateFailures(passingMetrics({ p95JoinMs: 7_000 })))
    .not.toContain("p95JoinMs");
});

it("rejects a join p95 above the 7-second boundary", () => {
  expect(classroomLoadGateFailures(passingMetrics({ p95JoinMs: 7_000.01 })))
    .toContain("p95JoinMs");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run tests/load/class-session-policy.test.js
```

Expected: the 6,999 ms passing fixture and inclusive 7,000 ms assertion fail because production policy still uses `5_000`; the 7,000.01 ms rejection remains green.

- [ ] **Step 3: Implement the minimal policy change**

Change only:

```js
export const CLASSROOM_JOIN_P95_LIMIT_MS = 7_000;
```

Do not change any other constant or gate predicate.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/load/class-session-policy.test.js
```

Expected: all policy tests pass.

### Task 2: Record the approved measurement and policy

**Files:**
- Modify: `tests/deployment/recovery-documentation.test.js`
- Modify: `docs/operations/backend-release.md`
- Modify: `docs/operations/release-checklist.md`

**Interfaces:**
- Consumes: the owner-approved 6,882.59 ms result and the exact 7,000 ms gate from Task 1.
- Produces: current release documentation that cannot regress to the former 5-second statement without failing tests.

- [ ] **Step 1: Write failing documentation assertions**

Update structural expectations to require the current documents to contain:

```js
"one-time join p95 at or below 7 seconds"
"6,882.59"
"1,660.52"
"response p95 below 1.5 seconds"
```

Also require the backend procedure to retain the before-optimization figures `7,640.78` and `3,121.82` so the decision remains auditable.

- [ ] **Step 2: Run the documentation tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/deployment/recovery-documentation.test.js
```

Expected: failures identify the former five-second text and missing approved measurements.

- [ ] **Step 3: Update current operations documentation**

In `backend-release.md`, replace the enforced five-second sentence with the exact inclusive seven-second limit and add the before/after measurements. State that 6,882.59 ms is accepted only for initial one-time entry and changes no other gate.

In `release-checklist.md`, require one-time join p95 at or below seven seconds and record the 6,882.59 ms known limitation plus 1,660.52 ms preflight evidence. Keep the response/dashboard limits and all zero-error requirements unchanged.

- [ ] **Step 4: Run documentation and policy tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  tests/load/class-session-policy.test.js \
  tests/deployment/recovery-documentation.test.js
```

Expected: all selected tests pass.

### Task 3: Verify, review, publish the policy branch, and rerun the protected gate

**Files:**
- Verify only: repository and generated `dist/`

**Interfaces:**
- Consumes: Tasks 1-2 and merged main SHA.
- Produces: green CI plus complete dedicated-load evidence eligible for production recovery/deployment.

- [ ] **Step 1: Run full local verification**

Run:

```bash
pnpm check:repo
pnpm check:deployment
pnpm lint
pnpm typecheck
pnpm test
pnpm test:functions
deno check --frozen \
  --config supabase/functions/deno.json \
  --lock supabase/functions/deno.lock \
  supabase/functions/*/index.ts
pnpm exec supabase test db
pnpm build
pnpm check:bundle
git diff --check
```

Expected: every command passes; the bundle scan exposes no private credential.

- [ ] **Step 2: Obtain independent review**

Review the exact diff for scope creep, threshold consistency, accidental weakening of non-latency predicates, and historical-document rewriting. Any valid finding returns to a new RED/GREEN cycle.

- [ ] **Step 3: Push and open a ready pull request**

Push `codex/accept-seven-second-join`, open a ready PR to `main`, and wait for both verification and secret-scan jobs to pass. Merge only the green reviewed PR.

- [ ] **Step 4: Bootstrap and test the exact merged SHA on the dedicated project**

Dispatch `load-test-bootstrap.yml` with the exact merged SHA and project `vadyhuipwbtgbzpeisbn`. Then run `pnpm test:load:live` with ephemeral in-memory load credentials.

Expected: the complete run—not only the join phase—passes the 7,000 ms inclusive join gate, response/dashboard limits, completion/score checks, unauthorized probes, and five returning-login checks. No production mutation occurs.

- [ ] **Step 5: Continue the protected production release**

Use the existing recovery and release procedures. Do not bypass backup/restore evidence, protected environments, exact SHA/project guards, migration dry-run, readiness, artifact-integrity verification, or clean teacher/student acceptance.
