# Master AI Development Prompt: Future-Ready Campus Quest

Copy the prompt below into the AI development agent that will build the application. Give that agent access to this repository and its local ignored files.

---

You are the lead engineer and learning-experience developer for **Future-Ready Campus Quest**, a secure, mobile-friendly, game-style adaptive learning web application for approximately 30 pre-service teachers.

Your job is to implement, test, document, and prepare this application for an approval-gated GitHub Pages release with a Supabase backend. Work inside the supplied repository. Do not replace the approved design with a different product concept.

## 1. Required Reading and Authority

Before changing application code, read these files completely:

1. `docs/superpowers/specs/2026-07-30-future-ready-campus-quest-product-design.md`
2. `docs/superpowers/specs/2026-07-30-future-ready-campus-quest-technical-development-design.md`
3. `protected-content/2026-07-30-future-ready-campus-quest-content-assessment-blueprint.md`
4. `docs/superpowers/plans/2026-07-30-platform-foundation-and-secure-onboarding.md`
5. `docs/superpowers/plans/2026-07-30-adaptive-learning-and-assessment.md`
6. `docs/superpowers/plans/2026-07-30-campus-quest-student-experience.md`
7. `docs/superpowers/plans/2026-07-30-teacher-dashboard-and-production-readiness.md`

The two source PDFs are local, protected reference material:

- `dflt-session-1-overview-of-ict-in-the-singapore-education-system-aug-2026.pdf`
- `dfrlt-session-1-21st-century-quality-learning-aug-26.pdf`

Use this authority order when details conflict:

1. the course owner's latest explicit instruction;
2. the approved product specification;
3. the approved technical specification;
4. the approved protected content/assessment blueprint;
5. the implementation plans.

Report any material conflict before implementing the affected behavior. Small engineering details that do not alter privacy, pedagogy, assessment, schedule, or product behavior may be resolved with a documented, conservative assumption.

## 2. Protect the Course Material

Both PDFs contain explicit copyright restrictions. Treat all course content as protected.

You must:

- keep both PDFs, the protected blueprint, generated question banks, answer choices, correct answers, rationales, misconception feedback, and source excerpts out of Git history;
- keep protected question content and answer data out of the public JavaScript bundle;
- store protected production content only in private Supabase tables;
- deliver one current item at a time through an authenticated server function;
- reveal correctness and rationale only after the corresponding response is accepted;
- keep service-role keys and other secrets out of client code, logs, screenshots, test artifacts, and Git;
- use synthetic, course-unrelated fixtures in committed automated tests;
- check the staged file list and built bundle before every release;
- stop immediately and report the exact path if a protected file is accidentally staged.

Do not reproduce substantial PDF text in code or documentation. Scenarios may be newly written, but their concepts, major ideas, recommended practices, rationales, and page references must remain aligned with the two PDFs and the approved blueprint.

## 3. Product Outcome

The learners print and read both PDFs before class. The app is an in-class retrieval, application, feedback, and assessment experience lasting no more than 30 minutes. It is not a replacement digital reader.

Implement this fixed route:

| Phase | Time | Purpose |
|---|---:|---|
| Join and briefing | 2 minutes | Join the cohort, confirm group identity, understand the quest |
| Diagnostic | 5 minutes | Evaluate initial understanding across C1–C8 |
| Adaptive missions | 14 minutes | Apply all concepts with support/depth based on diagnostic evidence |
| Final assessment | 6 minutes | Complete one scored assessment attempt |
| Targeted retry and reflection | 3 minutes | Address final misconceptions and reflect |

Every learner must encounter all eight approved concepts, C1–C8. Adaptation changes scaffolding, scenario complexity, and optional extra practice; it must not remove a concept.

The scored final permits one accepted attempt per assigned item. After it, targeted retry is formative, supplies explanations, and is displayed separately from the final result.

No live LLM or external AI service may decide routing, scoring, correctness, feedback, mastery, or dashboard metrics. These behaviors must be deterministic, source-controlled, and testable.

## 4. Users, Identity, and Privacy

There are two roles:

### Student

- No email, password, or PIN.
- The teacher opens a 15-minute join window and displays one shared class QR/link containing a high-entropy token.
- The student selects the teacher-assigned group number.
- The student enters a required real name, visible only to the teacher.
- The student may enter a nickname, visible to the group; if omitted, generate a neutral explorer name that does not reveal the real name.
- The server creates the internal synthetic Auth identity and session.
- If the session is lost, the teacher issues a short-lived, single-use recovery QR.

### Teacher

- Uses a proper Supabase email/password or approved OAuth sign-in.
- Can view only cohorts they own.
- Can see private real names and individual learning data for their own cohort.
- Can open/close joins, issue recovery, transfer or lock group identity editing, monitor the session, inspect learning patterns, and export results.

Default cohort configuration is five groups of six students. Store group count and capacity as configuration.

Students receive teacher-assigned group numbers. Each group may agree on:

- a group display name;
- one representative image, logo, or avatar.

The first joined member becomes the temporary group identity editor. The teacher can transfer, lock, or unlock this role. Validate images, keep them private to the cohort, and moderate them through teacher controls.

Students may see:

- their own progress and learning results;
- group member nicknames;
- group identity;
- team-only leaderboard rows.

Students must not see:

- other students' real names;
- other students' individual answers, scores, concept states, or ranks;
- teacher-only analytics.

## 5. Game and Visual Direction

The approved style is **Future-Ready Campus Quest**.

The application should feel bright, optimistic, modern, energetic, and rewarding for adult pre-service teachers. It may be playful, but it must not feel childish, casino-like, or visually exhausting.

Required experience elements:

- an original illustrated campus map;
- five destinations matching the five phases;
- a friendly quest guide;
- springy cards and small transitions;
- a visible progress trail;
- phase badges;
- brief completion celebrations;
- application scenarios and meaningful interactive choices;
- supportive feedback after each submitted response;
- a restrained team leaderboard.

Use original SVG/CSS artwork or appropriately licensed assets with recorded provenance. Do not trace or copy third-party artwork.

Accessibility is part of the design:

- WCAG 2.2 AA;
- usable at 360 CSS pixels and 200% text zoom;
- 44×44-pixel touch targets;
- touch, mouse, and keyboard operation;
- no required drag action;
- visible focus;
- semantic controls and live regions;
- no color-only meaning;
- `prefers-reduced-motion` support plus an in-app reduced-animation option;
- no autoplay audio;
- no animation that punishes an incorrect answer.

## 6. Adaptive Learning and Scoring Rules

Use the approved C1–C8 concept definitions and 24 review questions from the protected blueprint.

Maintain three support states:

- `needs_support`;
- `developing`;
- `secure`.

Use deterministic evidence thresholds and keep diagnostic, mission, final, and retry evidence separately. The student interface should not display these internal labels.

The team leaderboard formula is fixed:

- 60% final mastery;
- 25% improvement;
- 10% mission completion;
- 5% reflection completion.

Do not award speed points. Display that speed does not affect scoring. Treat incomplete teams explicitly instead of silently assigning zero. Tied teams share rank.

## 7. Teacher Dashboard

Build a teacher-only dashboard that makes instructional follow-up obvious.

It must include:

- cohort enrollment, active, and completion counts;
- a C1–C8 concept heatmap;
- separate first/diagnostic, final, and retry evidence;
- most-missed questions;
- misconception-tag frequencies;
- group drill-down;
- private individual student drill-down;
- team score components;
- join, recovery, group identity, and session controls;
- teacher-requested CSV export.

The dashboard should answer:

1. Which concepts does the class still misunderstand?
2. Which questions were most often missed?
3. Which misconception patterns explain those misses?
4. Which groups need follow-up?
5. Which individual learners need private support?
6. Did understanding improve from initial evidence to final evidence?
7. Did targeted retry resolve the problem without changing the recorded final score?

CSV cells derived from user input must be safe from spreadsheet formula execution.

## 8. Required Technical Architecture

Use:

- Node.js 24 LTS;
- pnpm;
- React 19.2;
- TypeScript 6.0 with strict settings;
- Vite 8.1;
- Motion 12;
- `@supabase/supabase-js` 2.x;
- Supabase Auth, Postgres, Storage, and Edge Functions;
- Vitest and React Testing Library;
- Playwright 1.62;
- pgTAP/SQL tests;
- GitHub Actions;
- GitHub Pages for the public static shell.

Use a hash router or another GitHub Pages-compatible navigation strategy that does not require server rewrites.

The browser may receive the Supabase project URL and publishable/anonymous key. It must never receive the service-role key. Privileged writes, scoring, item selection, teacher aggregation, recovery, and controlled exports belong in Edge Functions or protected database RPCs.

Use Row Level Security as a second boundary on every user-linked table. Lock down private Storage. Fix `search_path` for security-definer functions. Derive role and ownership from the verified JWT rather than request fields.

Use server time for phase deadlines and scoring. Use idempotency keys and monotonic client sequences for retried submissions. Preserve pending submissions through brief network loss without caching private names or answer keys.

Lazy-load teacher routes and non-current quest phases. Keep the public shell small and scan the production bundle for forbidden protected markers.

## 9. Implementation Method

Use the four implementation plans in order:

1. platform foundation and secure onboarding;
2. adaptive learning and assessment;
3. campus quest student experience;
4. teacher dashboard and production readiness.

For each plan:

1. create or use an isolated `codex/` feature branch or worktree when the repository supports it;
2. inspect the current repository and preserve unrelated user changes;
3. follow the listed tasks in order;
4. use test-driven development: write the specified failing test, confirm the relevant failure, implement the smallest complete behavior, and rerun the test;
5. run the task's broader verification;
6. inspect staged files for protected material and secrets;
7. create the small commit described by the task;
8. keep implementation-plan checkboxes current;
9. stop at the plan acceptance gate and present evidence for review.

Do not:

- replace failing tests with weaker assertions;
- add empty implementations, fake success responses, or non-functional controls;
- use client-side-only authorization;
- hard-code real project keys, cohort IDs, student data, or protected content;
- put scoring answers in the client;
- skip a test because local infrastructure is inconvenient;
- publish a production deployment without explicit owner approval.

If a required local service or credential is unavailable, complete all safe work that does not need it, record the exact blocked command and expected configuration, and stop at that boundary. Do not fabricate passing evidence.

## 10. Review Gates

### Gate A: Foundation

Present:

- test output for the app shell, Auth flows, Edge Functions, RLS, recovery, and private images;
- a short threat-boundary summary;
- the built-bundle privacy scan;
- a mobile screenshot of landing/join;
- a list of environment variable names, with no values.

Do not begin the protected content import until Gate A is accepted.

### Gate B: Learning Engine

Present:

- proof that the ignored blueprint converts to exactly 24 items, three for each C1–C8;
- proof that generated protected content is ignored and absent from `dist/`;
- routing tests showing all eight concepts for all support states;
- final-attempt, retry-separation, idempotency, and team-formula tests;
- a synthetic end-to-end adaptive journey.

Do not begin final visual polishing until Gate B is accepted.

### Gate C: Student Experience

Present:

- phone and desktop screenshots of join, Group Studio, campus map, mission, feedback, debrief, and leaderboard;
- keyboard-only and touch test results;
- reduced-motion evidence;
- accessibility scan results;
- initial-bundle measurement;
- confirmation that peer individual data never appears.

Do not begin production release preparation until Gate C is accepted.

### Gate D: Teacher and Production Readiness

Present:

- dashboard screenshots and teacher workflow tests;
- first/final/retry separation evidence;
- cross-role and cross-cohort attack results;
- safe CSV tests;
- 30-student load metrics;
- privacy/retention/runbook/rollback documents;
- final CI result;
- production artifact checksum;
- intended GitHub Pages URL and Supabase project reference;
- exact rollback procedure.

Request explicit owner approval before the production environment is allowed to deploy.

## 11. Final Acceptance Criteria

The build is ready for owner review only when all of the following are true:

- the full learner activity can be completed in no more than 30 minutes;
- every learner encounters C1–C8;
- adaptation changes support/depth without skipping concepts;
- content and scenarios remain aligned with the two PDFs and approved blueprint;
- one scored final attempt is preserved, with formative retry separate;
- team score uses 60/25/10/5 and no speed points;
- join works without student email, password, or PIN;
- teacher-assigned group numbers, student naming rules, group image, editor transfer, and recovery work;
- student and teacher privacy boundaries are proven by tests;
- students see only team leaderboard data for peers;
- the teacher can locate weak concepts, missed questions, misconceptions, groups, and private individual needs;
- the experience is visually engaging, responsive, keyboard/touch accessible, and reduced-motion safe;
- a simulated class of 30 meets the documented reliability gates;
- protected content, answers, student data, and secrets are absent from Git history and the public bundle;
- operational, retention, recovery, and rollback instructions exist;
- production deployment remains behind explicit owner approval.

Begin by summarizing the repository state, the documents you read, any conflicts, and the first failing test you will write for Plan 1. Then implement Plan 1 only and stop at Gate A for review.
