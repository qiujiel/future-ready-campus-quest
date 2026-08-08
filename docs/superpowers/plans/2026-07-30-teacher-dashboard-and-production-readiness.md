# Teacher Dashboard and Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the teacher an actionable, privacy-preserving view of class learning and operational controls, then prove the full system is safe and reliable for a 30-student class before an explicitly approved production release.

**Architecture:** Private SQL views and security-definer RPCs aggregate concept and item evidence within a teacher-owned cohort. Teacher-only Edge Functions expose typed summaries, drill-downs, controls, and CSV exports. The React dashboard lazy-loads outside the student bundle. Production readiness is enforced by automated security, accessibility, load, recovery, and deployment checks.

**Tech Stack:** The stacks from Plans 1–3 plus Recharts or lightweight SVG charts, CSV serialization, pgTAP, Playwright, axe-core, `k6` or an equivalent scripted HTTP load runner, GitHub Actions, and Supabase operational tooling.

**Global Constraints:**

- Complete Plans 1–3 first and preserve their role, privacy, content, and scoring boundaries.
- Teacher dashboard data must be scoped to a teacher-owned cohort on every query; never rely on a client-supplied teacher ID.
- Real names, individual answers, and individual scores are teacher-only.
- Dashboard aggregate cells below a configurable small-group threshold default to a privacy-safe state when shown beyond the teacher view.
- Show first, final, and retry evidence separately. Do not present retry as a changed final score.
- Most-missed questions and misconception tags must link back to C1–C8.
- CSV exports are teacher-requested, escaped against spreadsheet formula injection, and never generated into the public repository.
- Operational logs contain opaque IDs and error classes, not names, nicknames, question text, selected answers, tokens, or reflection text.
- Production deployment requires the repository owner’s approval and configured Supabase/GitHub secrets.

## File Structure

```text
src/
├── shared/api/contracts.ts
├── features/teacher/
│   ├── TeacherShell.tsx
│   ├── CohortOverview.tsx
│   ├── ConceptHeatmap.tsx
│   ├── MostMissedItems.tsx
│   ├── MisconceptionPanel.tsx
│   ├── GroupDrilldown.tsx
│   ├── StudentDrilldown.tsx
│   ├── SessionControls.tsx
│   └── ExportPanel.tsx
└── teacher/
    ├── api/teacherClient.ts
    ├── domain/dashboard.ts
    └── export/csv.ts
tests/
├── teacher/dashboard.test.tsx
├── teacher/csv.test.ts
├── teacher/controls.test.tsx
├── accessibility/teacher-a11y.test.tsx
├── e2e/teacher-dashboard.spec.ts
├── e2e/privacy-boundaries.spec.ts
└── load/class-session.js
supabase/
├── migrations/
│   ├── 202607300201_teacher_analytics.sql
│   ├── 202607300202_teacher_controls.sql
│   └── 202607300203_data_retention.sql
├── functions/
│   ├── teacher-dashboard/index.ts
│   ├── teacher-controls/index.ts
│   └── export-cohort/index.ts
└── tests/
    ├── teacher_analytics.test.sql
    └── teacher_scope.test.ts
docs/
├── operations/class-session-runbook.md
├── operations/privacy-and-retention.md
├── operations/release-checklist.md
└── operations/rollback.md
```

## Dashboard Contracts

Extend `src/shared/api/contracts.ts`:

```ts
export interface ConceptAggregate {
  conceptId: ConceptId;
  first: Record<SupportState, number>;
  final: Record<SupportState, number>;
  retryCorrect: number;
  retryAttempted: number;
}

export interface MissedItemAggregate {
  itemId: string;
  conceptId: ConceptId;
  shortLabel: string;
  incorrectCount: number;
  responseCount: number;
  misconceptionTags: Array<{ tag: string; count: number }>;
}

export interface TeacherDashboardSummary {
  cohortId: string;
  enrolled: number;
  active: number;
  completed: number;
  conceptAggregates: ConceptAggregate[];
  mostMissed: MissedItemAggregate[];
  teamScores: Array<{
    groupId: string;
    groupNumber: number;
    displayName: string;
    score: number | null;
    completedMembers: number;
    enrolledMembers: number;
  }>;
  generatedAt: string;
}
```

## Task 1: Build Teacher-Scoped Analytics

**Files:**

- Create: `supabase/migrations/202607300201_teacher_analytics.sql`
- Create: `supabase/functions/teacher-dashboard/index.ts`
- Create: `src/teacher/domain/dashboard.ts`
- Create: `src/teacher/api/teacherClient.ts`
- Test: `supabase/tests/teacher_analytics.test.sql`
- Test: `supabase/tests/teacher_scope.test.ts`

- [ ] **Step 1: Write failing analytics and scope tests**

Test C1–C8 rows even when no responses exist, first/final/retry separation, most-missed ordering, misconception counts, incomplete-team handling, cohort ownership, a second teacher's denial, student denial, and anonymous denial.

- [ ] **Step 2: Create private aggregate views and RPCs**

Aggregate from immutable response and result tables. The RPC derives teacher identity from `auth.uid()`, checks ownership, and accepts only `cohort_id`. Keep raw correct answers out of result sets.

- [ ] **Step 3: Implement the dashboard function**

Validate the route/query, call the teacher-scoped RPC, map results to `TeacherDashboardSummary`, and set `Cache-Control: private, no-store`. Return opaque error codes that do not reveal whether another teacher's cohort exists.

- [ ] **Step 4: Implement display-domain helpers**

Create stable functions for percentage calculation, shared-rank calculation, empty-state labels, and heatmap intensity. Use an explicit `no evidence` state rather than treating zero responses as zero mastery.

- [ ] **Step 5: Verify and commit**

Run: `supabase test db && pnpm test:functions teacher_scope && pnpm vitest run tests/teacher`

Expected: PASS.

```bash
git add supabase/migrations/202607300201_teacher_analytics.sql supabase/functions/teacher-dashboard src/teacher supabase/tests/teacher_analytics.test.sql supabase/tests/teacher_scope.test.ts
git commit -m "feat: add teacher-scoped learning analytics"
```

## Task 2: Build the Actionable Teacher Dashboard

**Files:**

- Create: `src/features/teacher/TeacherShell.tsx`
- Create: `src/features/teacher/CohortOverview.tsx`
- Create: `src/features/teacher/ConceptHeatmap.tsx`
- Create: `src/features/teacher/MostMissedItems.tsx`
- Create: `src/features/teacher/MisconceptionPanel.tsx`
- Create: `src/features/teacher/GroupDrilldown.tsx`
- Create: `src/features/teacher/StudentDrilldown.tsx`
- Modify: `src/app/router.tsx`
- Test: `tests/teacher/dashboard.test.tsx`

- [ ] **Step 1: Write failing dashboard tests**

Test loading, empty, active, completed, and partial states. Verify that a concept cell opens group evidence, a group opens private student evidence, a missed item shows its concept and misconception distribution, and final/retry labels remain distinct.

- [ ] **Step 2: Implement teacher navigation and lazy loading**

Routes:

- `/teacher/cohorts/:cohortId`
- `/teacher/cohorts/:cohortId/concepts/:conceptId`
- `/teacher/cohorts/:cohortId/groups/:groupId`
- `/teacher/cohorts/:cohortId/students/:studentId`

Protect every route with a teacher session check. Lazy-load the entire teacher feature so it is absent from the initial student chunk.

- [ ] **Step 3: Implement the concept heatmap**

Rows are C1–C8; columns show diagnostic/first evidence, final evidence, and retry evidence. Every color cell includes text, count, and accessible details. Selecting a cell filters groups and students who need instructional follow-up.

- [ ] **Step 4: Implement most-missed and misconception panels**

Show item short labels rather than answer text in the overview. A teacher-only detail view may show the protected item and rationale after an explicit action. Link each pattern to an instructional next step grounded in the approved blueprint.

- [ ] **Step 5: Implement private drill-downs**

Group view shows team components and member completion. Student view shows real name, nickname, C1–C8 evidence, question outcomes, misconceptions, retry, and private reflection. Do not expose another cohort through route manipulation.

- [ ] **Step 6: Verify and commit**

Run: `pnpm vitest run tests/teacher/dashboard.test.tsx && pnpm typecheck`

Expected: PASS.

```bash
git add src/features/teacher src/app/router.tsx tests/teacher/dashboard.test.tsx
git commit -m "feat: visualize class concepts and misconceptions"
```

## Task 3: Implement Live Session Controls and Audit

**Files:**

- Create: `supabase/migrations/202607300202_teacher_controls.sql`
- Create: `supabase/functions/teacher-controls/index.ts`
- Create: `src/features/teacher/SessionControls.tsx`
- Test: `tests/teacher/controls.test.tsx`

- [ ] **Step 1: Write failing authorization and confirmation tests**

Cover open/close join window, transfer group editor, lock/unlock group identity, issue recovery QR, pause new quest starts, extend a phase for the whole class, and close the session. Destructive or class-wide changes require a named confirmation dialog.

- [ ] **Step 2: Define control commands**

```ts
type TeacherControlCommand =
  | { action: "open-join"; cohortId: string }
  | { action: "close-join"; cohortId: string }
  | { action: "issue-recovery"; cohortId: string; studentId: string }
  | { action: "transfer-editor"; cohortId: string; groupId: string; studentId: string }
  | { action: "set-group-lock"; cohortId: string; groupId: string; locked: boolean }
  | { action: "set-quest-starts"; cohortId: string; allowed: boolean }
  | { action: "extend-phase"; cohortId: string; phase: LearningPhase; seconds: number }
  | { action: "close-session"; cohortId: string };
```

- [ ] **Step 3: Enforce server-side control limits**

Only the owner teacher may execute a command. Cap one phase extension at five minutes and record actor, cohort, action, target opaque IDs, result, and timestamp. Do not store raw recovery or join tokens in audit data.

- [ ] **Step 4: Implement live control feedback**

Show expiry time for join/recovery QR codes, confirmed state for locks, and the number of active students affected by class-wide changes. Never display a raw token in log or toast text.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test:functions teacher_controls && pnpm vitest run tests/teacher/controls.test.tsx`

Expected: PASS.

```bash
git add supabase/migrations/202607300202_teacher_controls.sql supabase/functions/teacher-controls src/features/teacher/SessionControls.tsx tests/teacher/controls.test.tsx
git commit -m "feat: add audited teacher session controls"
```

## Task 4: Add Safe CSV Export

**Files:**

- Create: `src/teacher/export/csv.ts`
- Create: `src/features/teacher/ExportPanel.tsx`
- Create: `supabase/functions/export-cohort/index.ts`
- Test: `tests/teacher/csv.test.ts`

- [ ] **Step 1: Write failing serialization and privacy tests**

Test commas, quotes, newlines, Unicode names, empty fields, and values beginning with `=`, `+`, `-`, or `@`. Test summary-only and teacher-private export types and deny student/cross-teacher calls.

- [ ] **Step 2: Implement formula-safe CSV**

Quote fields according to RFC 4180 and prefix formula-like user text with a single quote. Include UTF-8 BOM only if required by the target spreadsheet workflow. Use stable English column keys and include an export timestamp and scoring-formula version.

- [ ] **Step 3: Implement server-generated export**

The Edge Function authorizes the teacher, queries through teacher-scoped RPCs, streams CSV with `Content-Disposition: attachment`, and uses `Cache-Control: private, no-store`. Do not persist generated files to Storage.

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run tests/teacher/csv.test.ts && pnpm test:functions export_cohort`

Expected: PASS and formula-like test values open as text.

```bash
git add src/teacher/export src/features/teacher/ExportPanel.tsx supabase/functions/export-cohort tests/teacher/csv.test.ts
git commit -m "feat: export privacy-safe cohort reports"
```

## Task 5: Define Privacy, Retention, Recovery, and Class Operations

**Files:**

- Create: `supabase/migrations/202607300203_data_retention.sql`
- Create: `docs/operations/privacy-and-retention.md`
- Create: `docs/operations/class-session-runbook.md`
- Create: `docs/operations/rollback.md`
- Test: `supabase/tests/data_retention.test.sql`

- [ ] **Step 1: Write failing retention tests**

Test cohort archival, join/recovery token cleanup, signed-URL expiry, teacher-only export, and deletion/anonymization behavior on a synthetic archived cohort.

- [ ] **Step 2: Implement explicit retention controls**

Add `archived_at`, a teacher-requested purge RPC, and scheduled cleanup for expired tokens and obsolete replaced images. Choose and document the retention period with the course owner before production; encode the approved value as configuration rather than an undocumented constant.

- [ ] **Step 3: Write the privacy and retention document**

Document collected fields, purpose, visibility, Storage objects, export behavior, retention setting, deletion process, audit fields, and incident contact ownership. State that the app is a classroom learning tool and not a public social profile service.

- [ ] **Step 4: Write the class session runbook**

Include pre-class Supabase wake/readiness check, teacher sign-in, cohort creation, QR projection, group assignments, recovery, phase monitoring, dashboard interpretation, export, and session closure.

- [ ] **Step 5: Write rollback and recovery**

Document database migration rollback strategy, GitHub Pages prior-artifact recovery, disabling join windows, revoking exposed tokens, and preserving immutable response evidence.

- [ ] **Step 6: Verify and commit**

Run: `supabase test db`

Expected: PASS.

```bash
git add supabase/migrations/202607300203_data_retention.sql supabase/tests/data_retention.test.sql docs/operations
git commit -m "docs: define classroom operations and data lifecycle"
```

## Task 6: Prove Security, Accessibility, and 30-Student Reliability

**Files:**

- Create: `tests/accessibility/teacher-a11y.test.tsx`
- Create: `tests/e2e/teacher-dashboard.spec.ts`
- Create: `tests/e2e/privacy-boundaries.spec.ts`
- Create: `tests/load/class-session.js`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add teacher accessibility checks**

Run axe and keyboard journeys for sign-in, overview, heatmap, drill-down, controls, and export. Verify chart data has a table/text equivalent and focus moves to drill-down headings.

- [ ] **Step 2: Add end-to-end privacy attacks**

Attempt cross-student, cross-group, cross-cohort, cross-teacher, anonymous, expired-token, replay, altered-item, stale-sequence, and direct Storage URL access. Assert neutral failure responses and no private fields.

- [ ] **Step 3: Build a representative 30-student load script**

Create five groups of six synthetic students. Over a compressed run, join concurrently, fetch and submit the representative C1–C8 route, poll the team leaderboard at a restrained interval, load the teacher dashboard, and complete results. Use unique idempotency keys and remove synthetic data after the test project run.

- [ ] **Step 4: Set measurable reliability gates**

For the dedicated test project:

- no failed authorized requests;
- no accepted unauthorized requests;
- p95 response submission below 1.5 seconds;
- p95 initial join below 5 seconds for 30 simultaneous students, superseding
  the original 1.5-second join objective under the approved 2026-08-08
  classroom-readiness decision;
- p95 dashboard summary below 2.5 seconds;
- no duplicate response rows;
- correct five-team completion and score calculation.

If a gate fails, keep the failure evidence and profile the query/function before changing the threshold.

- [ ] **Step 5: Run the full local gate**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
supabase test db
pnpm build
pnpm check:bundle
pnpm playwright test
pnpm test:load
```

Expected: all functional/security/accessibility checks pass and load metrics meet the stated gates.

- [ ] **Step 6: Commit the readiness tests**

```bash
git add tests/accessibility/teacher-a11y.test.tsx tests/e2e tests/load .github/workflows/ci.yml package.json
git commit -m "test: prove private reliable classroom operation"
```

## Task 7: Prepare an Approval-Gated Production Release

**Files:**

- Create: `docs/operations/release-checklist.md`
- Modify: `.github/workflows/pages.yml`
- Modify: `.env.example`

- [ ] **Step 1: Document environment separation**

Use separate local/test and production Supabase projects. List required public repository variables and private GitHub/Supabase secrets by name and purpose. Never put values in the document.

- [ ] **Step 2: Add production preflight**

The workflow must verify:

- the Supabase project responds and required migrations are applied;
- no open join/recovery token exists from testing;
- protected content version and count are correct;
- teacher account and cohort smoke fixture are configured;
- Pages base path is correct;
- bundle privacy, test, and build gates pass.

- [ ] **Step 3: Add an explicit approval gate**

Use the protected `github-pages` environment. The deployment job must consume only the artifact that passed CI and must not rebuild from an unverified working tree.

- [ ] **Step 4: Rehearse without publishing**

Run the production build against non-production configuration, upload the CI artifact, and verify the release checklist. Do not approve the production environment during rehearsal.

- [ ] **Step 5: Commit release preparation**

```bash
git add docs/operations/release-checklist.md .github/workflows/pages.yml .env.example
git commit -m "ci: prepare approval-gated campus quest release"
```

- [ ] **Step 6: Request owner approval for publication**

Present the verified commit, artifact checksum, Supabase project reference, content version/count, test summary, load metrics, rollback method, and intended GitHub Pages URL. Publish only after the owner explicitly approves.

## Plan Acceptance Gate

- The teacher can identify class-wide weak concepts, missed questions, misconception patterns, group patterns, and private individual needs.
- First, final, and retry evidence remain distinct in UI and exports.
- Session controls and recovery are teacher-scoped, time-limited, and audited.
- CSV exports are teacher-only and safe from spreadsheet formula execution.
- Accessibility, privacy-boundary, and 30-student load tests pass.
- Operations, retention, rollback, and release procedures are documented.
- A production artifact can be deployed to GitHub Pages only through an explicit owner approval gate.
