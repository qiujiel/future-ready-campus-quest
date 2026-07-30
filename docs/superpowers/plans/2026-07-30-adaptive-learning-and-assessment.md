# Adaptive Learning and Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, source-aligned learning engine that evaluates all eight concepts, adjusts support and depth without skipping concepts, delivers a scored final assessment and targeted retry, and calculates fair team scores.

**Architecture:** Protected content is converted and imported locally into private Supabase tables. Edge Functions select items and score responses; the browser receives only the current item and receives explanations only after submission. Pure TypeScript domain functions implement routing and scoring so behavior is fully testable without a live model or external AI service.

**Tech Stack:** The platform stack from Plan 1 plus Zod, seeded test fixtures, Supabase Postgres functions, Deno Edge Functions, Vitest, pgTAP, and Playwright.

**Global Constraints:**

- Complete Plan 1 first and reuse its contracts, identity model, and RLS helpers.
- Read both approved specifications and the ignored protected content/assessment blueprint.
- Use concepts C1–C8 exactly as defined in the blueprint. Every learner must encounter every concept.
- Derive scenarios from the PDFs only when the concept, rationale, and recommended practice stay aligned with the source.
- Do not commit production question text, answer choices, rationales, misconception feedback, or the converted protected content file.
- The final assessment has one scored attempt. Targeted retry is formative and reported separately.
- No speed points. Team score is 60% final mastery, 25% improvement, 10% mission completion, and 5% reflection.
- Do not use a live LLM for routing, scoring, feedback, or dashboard aggregation.
- Treat client timestamps and client-supplied scores as untrusted.

## File Structure

```text
src/
├── shared/api/contracts.ts
├── learning/
│   ├── domain/mastery.ts
│   ├── domain/router.ts
│   ├── domain/scoring.ts
│   ├── domain/types.ts
│   ├── api/learningClient.ts
│   └── offline/submissionQueue.ts
scripts/
├── convert-protected-blueprint.ts
├── import-protected-content.ts
└── protected-content.schema.ts
tests/
├── fixtures/public-synthetic-bank.json
├── learning/mastery.test.ts
├── learning/router.test.ts
├── learning/scoring.test.ts
├── learning/submissionQueue.test.ts
└── e2e/adaptive-journey.spec.ts
supabase/
├── migrations/
│   ├── 202607300101_learning_content.sql
│   ├── 202607300102_learning_state.sql
│   ├── 202607300103_learning_rls.sql
│   └── 202607300104_learning_rpc.sql
├── functions/
│   ├── get-next-item/index.ts
│   ├── submit-response/index.ts
│   └── complete-quest/index.ts
└── tests/
    ├── learning_rls.test.sql
    ├── response_idempotency.test.ts
    └── quest_completion.test.ts
```

## Domain Contracts

Extend, but do not duplicate, `src/shared/api/contracts.ts`:

```ts
export interface LearningItemPayload {
  itemId: string;
  conceptId: ConceptId;
  phase: LearningPhase;
  stem: string;
  options: Array<{ id: string; text: string }>;
  interaction: "single-choice" | "multi-select" | "scenario-sort";
  support: {
    conceptReminder?: string;
    sourcePageLabel?: string;
  };
}

export interface ResponseSubmission {
  attemptId: string;
  itemId: string;
  idempotencyKey: string;
  selectedOptionIds: string[];
  clientSequence: number;
}

export interface ResponseResult {
  responseId: string;
  correct: boolean;
  explanation: string;
  misconceptionTag: string | null;
  conceptState: SupportState;
  nextPhase: LearningPhase;
}
```

## Task 1: Implement Mastery and Team-Scoring Domain Functions

**Files:**

- Create: `src/learning/domain/types.ts`
- Create: `src/learning/domain/mastery.ts`
- Create: `src/learning/domain/scoring.ts`
- Test: `tests/learning/mastery.test.ts`
- Test: `tests/learning/scoring.test.ts`

- [x] **Step 1: Write failing mastery-state tests**

Test the lower-confidence cases, including one correct response followed by one incorrect response, missing evidence, and final-response weighting.

```ts
expect(classifyConcept({ correct: 0, total: 1 })).toBe("needs_support");
expect(classifyConcept({ correct: 1, total: 2 })).toBe("developing");
expect(classifyConcept({ correct: 2, total: 2 })).toBe("secure");
```

Run: `pnpm vitest run tests/learning/mastery.test.ts`

Expected: FAIL because the domain module does not exist.

- [x] **Step 2: Implement transparent mastery thresholds**

Use integer counts rather than floating-point equality:

- `needs_support`: no evidence or accuracy below 50%;
- `developing`: accuracy from 50% through 79%;
- `secure`: accuracy at or above 80%.

The diagnostic establishes an initial state. Mission and final evidence are stored separately so the dashboard can show change rather than overwrite the baseline.

- [x] **Step 3: Write failing team-score tests**

```ts
expect(teamScore({
  finalMastery: 80,
  improvement: 60,
  missionCompletion: 100,
  reflection: 100,
})).toBe(78);
```

Also test bounds, rounding, incomplete teams, and that duration has no effect.

- [x] **Step 4: Implement score normalization**

```ts
export function teamScore(parts: TeamScoreParts): number {
  const bounded = Object.fromEntries(
    Object.entries(parts).map(([key, value]) => [key, Math.max(0, Math.min(100, value))]),
  ) as unknown as TeamScoreParts;

  return Math.round(
    bounded.finalMastery * 0.60 +
    bounded.improvement * 0.25 +
    bounded.missionCompletion * 0.10 +
    bounded.reflection * 0.05,
  );
}
```

Define improvement as the cohort-configured aggregate of per-student concept-state gains, never a raw point advantage for students who began with lower scores.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/learning/mastery.test.ts tests/learning/scoring.test.ts && pnpm typecheck`

Expected: PASS.

```bash
git add src/learning/domain tests/learning/mastery.test.ts tests/learning/scoring.test.ts
git commit -m "feat: define mastery and fair team scoring"
```

## Task 2: Create the Private Content Schema and Deterministic Import Pipeline

**Files:**

- Create: `scripts/protected-content.schema.ts`
- Create: `scripts/convert-protected-blueprint.ts`
- Create: `scripts/import-protected-content.ts`
- Create: `tests/fixtures/public-synthetic-bank.json`
- Create: `tests/learning/content-import.test.ts`
- Create: `supabase/migrations/202607300101_learning_content.sql`
- Create: `supabase/migrations/202607300103_learning_rls.sql`
- Test: `supabase/tests/learning_rls.test.sql`

- [x] **Step 1: Write failing schema and conversion tests with synthetic content**

The public fixture must use invented placeholder-free questions unrelated to the course PDFs. Validate exactly eight concept IDs and three review items per concept in production mode, unique item IDs, non-empty rationales, valid correct option IDs, at least one PDF page reference, and an approved misconception tag.

- [x] **Step 2: Define the protected item schema**

```ts
export const ProtectedItemSchema = z.object({
  id: z.string().regex(/^C[1-8]-Q[1-3]$/),
  conceptId: z.enum(["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]),
  stem: z.string().min(20),
  options: z.array(z.object({ id: z.string(), text: z.string().min(1) })).min(3),
  correctOptionIds: z.array(z.string()).min(1),
  rationale: z.string().min(20),
  misconceptionTag: z.string().min(3),
  sourceRefs: z.array(z.object({
    document: z.enum(["overview-ict", "quality-learning"]),
    page: z.number().int().positive(),
  })).min(1),
});
```

- [x] **Step 3: Convert the ignored approved blueprint**

The converter reads:

`protected-content/2026-07-30-future-ready-campus-quest-content-assessment-blueprint.md`

and writes:

`protected-content/generated/question-bank.json`

It must fail loudly if it cannot extract exactly 24 items, three per C1–C8, with answers, rationales, misconception tags, and references. Log item IDs and counts only; never log protected text.

> **Local verification note (30 July 2026):** Docker Desktop's single-file bind mount stalled from the worktree path. The local stack was started from a temporary no-space runtime copy; repository migrations, database resets, and pgTAP tests then ran against that local stack successfully.

- [x] **Step 4: Create private database tables**

Create `concepts`, `learning_items`, `item_options`, and `item_source_refs`. Keep correctness and rationales in tables that have no direct `anon` or `authenticated` SELECT grant. Expose current-item payloads only through Edge Functions. Add a `content_version` table and include its immutable version ID on every attempt.

- [x] **Step 5: Implement the import transaction**

`import-protected-content.ts` requires `SUPABASE_SERVICE_ROLE_KEY` in the local process, validates the generated JSON, opens a transaction through a restricted import RPC, upserts the version, and verifies counts before commit. It must refuse to target a production project unless `--confirm-project-ref=<exact-ref>` is provided.

- [x] **Step 6: Prove content privacy**

Run:

```bash
pnpm test:content
supabase db reset
supabase test db
pnpm convert:protected-content
git check-ignore protected-content/generated/question-bank.json
```

Expected: tests pass, conversion reports 24 items and eight concepts, and Git confirms the generated bank is ignored.

- [x] **Step 7: Commit only pipeline code and synthetic fixtures**

```bash
git add scripts tests/fixtures/public-synthetic-bank.json tests/learning/content-import.test.ts supabase/migrations/202607300101_learning_content.sql supabase/migrations/202607300103_learning_rls.sql supabase/tests/learning_rls.test.sql package.json
git commit -m "feat: add private content import pipeline"
```

Before committing, run `git status --short` and confirm no file under `protected-content/` is staged.

## Task 3: Implement the 30-Minute Adaptive Route

**Files:**

- Create: `src/learning/domain/router.ts`
- Test: `tests/learning/router.test.ts`
- Create: `supabase/migrations/202607300102_learning_state.sql`

- [x] **Step 1: Write failing route tests**

Cover this timing contract:

- join/briefing: 2 minutes;
- diagnostic: 5 minutes;
- adaptive missions: 14 minutes;
- final assessment: 6 minutes;
- retry/reflection: 3 minutes.

Assert that C1–C8 all appear, support changes item depth and scaffolding, no state skips a concept, and a resumed attempt returns to its server-recorded phase.

- [x] **Step 2: Model attempts and concept evidence**

Create `quest_attempts`, `phase_progress`, `concept_evidence`, and `student_responses`. Store server timestamps, content version, current phase, last accepted sequence, and completion state. A student can have only one active attempt per cohort session.

- [x] **Step 3: Implement deterministic scheduling**

Use a seeded ordering derived from `attemptId` so retries and tests are reproducible:

```ts
export function supportFor(state: SupportState): SupportProfile {
  if (state === "needs_support") return { hintLevel: 2, scenarioComplexity: 1, itemCount: 2 };
  if (state === "developing") return { hintLevel: 1, scenarioComplexity: 2, itemCount: 1 };
  return { hintLevel: 0, scenarioComplexity: 3, itemCount: 1 };
}
```

The diagnostic and final routes must each reserve one encounter for every concept. The approximately six mission slots prioritise diagnosed weaknesses, cross-concept work, secure transfer, and synthesis within the 14-minute budget.

- [x] **Step 4: Add time-budget fallbacks**

If time is running short, reduce optional second practice items before reducing any required concept encounter. The server phase deadline governs transitions; a manipulated client clock cannot extend the scored final.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/learning/router.test.ts && supabase db reset`

Expected: PASS and all state migrations apply.

```bash
git add src/learning/domain/router.ts tests/learning/router.test.ts supabase/migrations/202607300102_learning_state.sql
git commit -m "feat: route every learner through all concepts"
```

## Task 4: Deliver Items and Score Idempotent Responses

**Files:**

- Create: `supabase/migrations/202607300104_learning_rpc.sql`
- Create: `supabase/functions/get-next-item/index.ts`
- Create: `supabase/functions/submit-response/index.ts`
- Create: `src/learning/api/learningClient.ts`
- Test: `supabase/tests/response_idempotency.test.ts`

- [ ] **Step 1: Write failing response-boundary tests**

Test that a current item omits correctness and rationale, a submitted item returns its explanation, a repeated idempotency key returns the original result, a stale sequence is rejected, another student's item cannot be submitted, and final responses cannot be changed after acceptance.

- [ ] **Step 2: Implement `get-next-item`**

Authorize the student, lock the active attempt, select the scheduled item, and return `LearningItemPayload`. The payload may contain a concept reminder and source page label based on support state, but never correct option IDs.

- [ ] **Step 3: Implement atomic `submit-response`**

Use one database RPC to:

1. verify attempt, item, phase, and sequence ownership;
2. check an existing idempotency key;
3. calculate correctness from private tables;
4. store the immutable response;
5. update concept evidence and phase progress;
6. return `ResponseResult`.

Use server time for every deadline and duration field.

- [ ] **Step 4: Verify the authorization and retry boundary**

Run: `pnpm test:functions responses && supabase test db`

Expected: all response, replay, cross-student, and answer-leak tests pass.

- [ ] **Step 5: Commit the learning API**

```bash
git add supabase/migrations/202607300104_learning_rpc.sql supabase/functions/get-next-item supabase/functions/submit-response src/learning/api supabase/tests/response_idempotency.test.ts
git commit -m "feat: deliver and score protected learning items"
```

## Task 5: Complete Final Assessment, Targeted Retry, Reflection, and Team Score

**Files:**

- Create: `supabase/functions/complete-quest/index.ts`
- Test: `supabase/tests/quest_completion.test.ts`
- Modify: `src/learning/domain/scoring.ts`
- Test: `tests/learning/scoring.test.ts`

- [ ] **Step 1: Write failing completion tests**

Assert:

- the scored final has one accepted response per assigned final item;
- retry items target final misconceptions and do not rewrite the final score;
- reflection completion contributes at most five team-score points;
- team ranking excludes speed and private individual results;
- incomplete students are shown separately rather than silently scored as zero;
- ties share rank and sort by group number for stable display.

- [ ] **Step 2: Implement finalization**

`complete-quest` calculates first evidence, final evidence, targeted-retry evidence, improvement, mission completion, and reflection completion. Persist raw components and the formula version in `quest_results` and `team_score_snapshots`.

- [ ] **Step 3: Generate targeted retry**

Select one retry item for each final misconception, capped by the three-minute phase. Return feedback immediately after each retry. Mark the retry as formative in every API response and dashboard field.

- [ ] **Step 4: Implement reflection**

Use one short structured prompt tied to the weakest concept plus an optional text note. Store the note privately for the student and teacher; the group receives only completion credit.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/learning/scoring.test.ts && pnpm test:functions quest_completion`

Expected: PASS.

```bash
git add supabase/functions/complete-quest src/learning/domain/scoring.ts tests/learning/scoring.test.ts supabase/tests/quest_completion.test.ts
git commit -m "feat: complete assessment retry and team scoring"
```

## Task 6: Add Offline-Safe Submission and Resume

**Files:**

- Create: `src/learning/offline/submissionQueue.ts`
- Test: `tests/learning/submissionQueue.test.ts`
- Modify: `src/learning/api/learningClient.ts`
- Test: `tests/e2e/adaptive-journey.spec.ts`

- [ ] **Step 1: Write failing queue tests**

Test one in-flight mutation, ordered replay, stable idempotency keys across page refresh, acknowledgement removal, stale-sequence reconciliation, and no caching of explanations beyond the current authenticated session.

- [ ] **Step 2: Implement a minimal durable queue**

Persist only pending response payloads and attempt identifiers in IndexedDB. Never persist real names, answer keys, or teacher data. Use exponential retry with jitter, stop on authorization errors, and request authoritative state after conflict.

- [ ] **Step 3: Add resume behavior**

On load, restore the Supabase session, fetch server attempt state, reconcile acknowledged submissions, and resume the active phase. If the Auth session is gone, direct the student to teacher-assisted recovery.

- [ ] **Step 4: Run the adaptive journey at mobile and desktop widths**

Run: `pnpm playwright test tests/e2e/adaptive-journey.spec.ts`

Expected: the test completes all C1–C8, simulates one network interruption, resumes without a duplicate response, and preserves one scored final attempt.

- [ ] **Step 5: Run the complete learning-engine gate and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm build && pnpm check:bundle`

Expected: all commands pass and the protected bank is absent from `dist/`.

```bash
git add src/learning tests/learning tests/e2e/adaptive-journey.spec.ts
git commit -m "feat: make quest progress resilient to reconnects"
```

## Plan Acceptance Gate

- The ignored approved blueprint converts to exactly 24 valid review items, three per C1–C8, and imports only into private tables.
- A diagnostic assigns support states; the mission route changes scaffolding and depth while covering all eight concepts.
- Scoring and explanations happen server-side without a live AI dependency.
- The final assessment permits one scored attempt, followed by a separately reported targeted retry and reflection.
- Team score matches the approved 60/25/10/5 formula and contains no speed component.
- Network retry and refresh do not duplicate responses or lose progress.
- Protected content and answer data are absent from the public repository and built application.
