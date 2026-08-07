# Student Preview Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the synthetic student preview visit Briefing Plaza and Diagnostic Gate before Adaptive Learning Labs.

**Architecture:** Extend the local `PreviewStep` state machine with two presentation-only stages rendered through the existing `QuestShell`. Protect the consumer-visible order with a fast component journey test and the existing browser journey.

**Tech Stack:** React 19, TypeScript, Testing Library, Vitest, Playwright

## Global Constraints

- Keep the preview synthetic, local, and independent of Supabase.
- Do not modify production gateways, routes, persistence, or deployment workflows.
- Reuse `QuestShell`, `Button`, and `preview-callout` styling.
- Route order must be Group Studio → Briefing Plaza → Diagnostic Gate → Adaptive Learning Labs.

---

### Task 1: Protect the preview route order

**Files:**
- Create: `tests/ui/student-experience-preview.test.tsx`
- Modify: `tests/e2e/student-experience.spec.ts`
- Test: `tests/ui/student-experience-preview.test.tsx`

**Interfaces:**
- Consumes: `StudentExperiencePreview` and its accessible form/button/heading contracts.
- Produces: Regression coverage for the ordered preview destinations.

- [ ] **Step 1: Write the failing component journey test**

Render `StudentExperiencePreview`, complete the real synthetic join form, enter
the map from Group Studio, and assert the literal heading sequence `Briefing
Plaza`, `Diagnostic Gate`, and `Adaptive Learning Labs` after clicking the
corresponding unique navigation buttons.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
pnpm vitest run tests/ui/student-experience-preview.test.tsx
```

Expected: FAIL because the current preview advances directly to `Adaptive
Learning Labs` and cannot find `Briefing Plaza`.

- [ ] **Step 3: Extend the Playwright journey expectation**

After `Continue to campus map`, assert `Briefing Plaza`, click `Enter Diagnostic
Gate`, assert `Diagnostic Gate`, click `Continue to Learning Labs`, then retain
the existing `Adaptive Learning Labs` assertion.

### Task 2: Add the two preview stages

**Files:**
- Modify: `src/features/preview/StudentExperiencePreview.tsx`
- Test: `tests/ui/student-experience-preview.test.tsx`

**Interfaces:**
- Consumes: `QuestShell`, `Button`, `PreviewStep`, and the existing synthetic group state.
- Produces: `briefing` and `diagnostic` preview states and navigation controls.

- [ ] **Step 1: Extend the state machine**

Add `briefing` and `diagnostic` to `PreviewStep`. Change Group Studio's button
to advance to `briefing`.

- [ ] **Step 2: Render Briefing Plaza**

Render `QuestShell` with `phase="briefing"`, no completed phases or visited
concepts, concise group/teacher-led copy, and a unique `Enter Diagnostic Gate`
button that advances to `diagnostic`.

- [ ] **Step 3: Render Diagnostic Gate**

Render `QuestShell` with `phase="diagnostic"`, `briefing` completed, no concepts
visited yet, baseline/non-ranking copy, and a unique `Continue to
Learning Labs` button that advances to `map`.

- [ ] **Step 4: Verify the red test turns green**

Run:

```bash
pnpm vitest run tests/ui/student-experience-preview.test.tsx
```

Expected: PASS.

### Task 3: Verify and deliver

**Files:**
- Verify all modified files from Tasks 1 and 2.

**Interfaces:**
- Consumes: The completed preview route.
- Produces: A verified local preview and updated draft pull request.

- [ ] **Step 1: Run targeted browser coverage**

Run the desktop `student-experience.spec.ts` Playwright project and confirm the
complete route passes.

- [ ] **Step 2: Run repository verification**

Run the full Vitest suites, Edge Function tests, type checks, lint, repository
and deployment validators, production build, and bundle privacy scan.

- [ ] **Step 3: Refresh and inspect the local preview**

Rebuild and restart the preview with `VITE_BASE_PATH=/future-ready-campus-quest/`.
Exercise the new route in the in-app browser and inspect browser/server errors.

- [ ] **Step 4: Commit and push**

Stage only the design, plan, preview component, and journey tests. Commit with a
focused message and push `codex/gate-d-teacher-readiness` to update draft PR #1.
