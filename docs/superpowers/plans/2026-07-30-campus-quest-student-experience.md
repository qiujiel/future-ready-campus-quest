# Campus Quest Student Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the secure learning engine into an inviting, mobile-first “Future-Ready Campus Quest” that feels playful and social while keeping interaction clear, accessible, and achievable within 30 minutes.

**Architecture:** React route features consume only the contracts delivered by Plans 1 and 2. A small design system supplies color, typography, cards, feedback, and motion. The campus map visualizes the fixed learning sequence; accessible controls provide equivalent non-drag interactions. Group identity and the team leaderboard reveal only cohort-safe fields.

**Tech Stack:** React 19.2, TypeScript 6.0, React Router, Motion 12, CSS custom properties, CSS Modules, React Testing Library, `jest-axe`, Playwright 1.62, and the APIs delivered by Plans 1 and 2.

**Global Constraints:**

- Complete Plans 1 and 2 first. Import their contracts; do not create competing client-side domain rules.
- Match the approved “Future-Ready Campus Quest” direction: bright, colorful, optimistic, contemporary, and game-like, not childish or visually noisy.
- Use the campus map, friendly guide, springy cards, progress trail, badges, and brief celebrations as functional feedback.
- Keep all learning decisions aligned with the PDFs and protected blueprint.
- Make the primary interaction usable by touch, mouse, and keyboard. Do not require dragging.
- Support a 360-pixel-wide viewport, 200% text zoom, WCAG 2.2 AA contrast, visible focus, and 44×44-pixel touch targets.
- Respect `prefers-reduced-motion`; progress, state, and feedback must remain understandable with animation disabled.
- Show only team ranks and scores to students. Individual results and real names remain private.
- Avoid speed pressure, countdown panic, public shaming, confetti overload, and audio that starts automatically.

## File Structure

```text
src/
├── app/router.tsx
├── styles/
│   ├── tokens.css
│   ├── global.css
│   └── utilities.css
├── ui/
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Dialog.tsx
│   ├── ProgressTrail.tsx
│   ├── QuestGuide.tsx
│   ├── StatusPill.tsx
│   ├── ToastRegion.tsx
│   └── motion/MotionProvider.tsx
├── features/
│   ├── join/
│   │   ├── JoinPage.tsx
│   │   ├── GroupPicker.tsx
│   │   └── IdentityForm.tsx
│   ├── group/
│   │   ├── GroupStudio.tsx
│   │   └── GroupImageUploader.tsx
│   ├── quest/
│   │   ├── CampusMap.tsx
│   │   ├── QuestShell.tsx
│   │   ├── MissionCard.tsx
│   │   ├── ChoiceInteraction.tsx
│   │   ├── SortInteraction.tsx
│   │   └── FeedbackPanel.tsx
│   └── results/
│       ├── PersonalDebrief.tsx
│       ├── TeamLeaderboard.tsx
│       └── ReflectionCard.tsx
├── assets/
│   ├── campus-map.svg
│   ├── quest-guide.svg
│   └── badges.svg
└── test/
    └── renderWithProviders.tsx
tests/
├── ui/design-system.test.tsx
├── ui/join-flow.test.tsx
├── ui/group-studio.test.tsx
├── ui/quest-shell.test.tsx
├── ui/interactions.test.tsx
├── ui/results.test.tsx
├── accessibility/student-a11y.test.tsx
└── e2e/student-experience.spec.ts
```

## Visual System

Use these token names so visual values remain centralized:

```css
:root {
  --color-ink: #15213d;
  --color-surface: #fffdf8;
  --color-surface-raised: #ffffff;
  --color-campus-blue: #3568e8;
  --color-quest-purple: #7a4ce0;
  --color-energy-coral: #ed5f55;
  --color-growth-green: #16866f;
  --color-sun: #f5bd32;
  --color-focus: #0a58ca;
  --shadow-card: 0 12px 32px rgb(21 33 61 / 14%);
  --radius-card: 22px;
  --radius-control: 14px;
  --space-unit: 0.25rem;
  --content-max: 72rem;
}
```

Confirm final foreground/background pairs with automated contrast tests. Token names are stable; values may be adjusted to satisfy contrast.

## Task 1: Build the Accessible Quest Design System

**Files:**

- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/styles/utilities.css`
- Create: `src/ui/Button.tsx`
- Create: `src/ui/Card.tsx`
- Create: `src/ui/Dialog.tsx`
- Create: `src/ui/StatusPill.tsx`
- Create: `src/ui/ToastRegion.tsx`
- Create: `src/ui/motion/MotionProvider.tsx`
- Test: `tests/ui/design-system.test.tsx`

- [ ] **Step 1: Write failing semantic and reduced-motion tests**

Test button states, focus visibility, dialog naming and focus return, live-region politeness, contrast, and that `MotionProvider` returns zero-duration transitions when reduced motion is requested.

```tsx
expect(screen.getByRole("button", { name: "Begin diagnostic" })).toBeEnabled();
expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
```

Run: `pnpm vitest run tests/ui/design-system.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 2: Implement tokens and global behavior**

Use fluid type with conservative `clamp()`, a single-column default, safe-area padding, no horizontal page scrolling, and underlined links. Do not communicate state using color alone.

- [ ] **Step 3: Implement reusable primitives**

Buttons must expose busy and disabled states. Cards use meaningful headings rather than clickable generic containers. Dialogs trap focus and restore it. Toasts announce submission state without interrupting screen-reader speech.

- [ ] **Step 4: Implement motion preferences**

Use Motion only for transforms and opacity. Normal mode may use 160–320 ms transitions and a restrained spring on card arrival. Reduced mode uses immediate state changes or a short opacity change below 100 ms.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/ui/design-system.test.tsx && pnpm typecheck`

Expected: PASS.

```bash
git add src/styles src/ui tests/ui/design-system.test.tsx
git commit -m "feat: create accessible campus quest design system"
```

## Task 2: Implement Join, Profile, and Group Studio

**Files:**

- Create: `src/features/join/JoinPage.tsx`
- Create: `src/features/join/GroupPicker.tsx`
- Create: `src/features/join/IdentityForm.tsx`
- Create: `src/features/group/GroupStudio.tsx`
- Create: `src/features/group/GroupImageUploader.tsx`
- Modify: `src/app/router.tsx`
- Test: `tests/ui/join-flow.test.tsx`
- Test: `tests/ui/group-studio.test.tsx`

- [ ] **Step 1: Write failing join-flow tests**

Cover a valid token, expired window, invalid group, full group, required real name, optional nickname, disabled double-submit, mobile software keyboard layout, and clear privacy copy explaining who sees each name.

- [ ] **Step 2: Implement a three-step join**

Use:

1. `Choose your assigned group number`
2. `Create your explorer identity`
3. `Join the campus`

Keep the join token in memory or route state only. After the session is established, remove it from visible UI and analytics.

- [ ] **Step 3: Write failing group-studio tests**

Test first-member editor status, rename, image validation, preview, upload progress, editor transfer, teacher lock message, and a read-only view for ordinary members.

- [ ] **Step 4: Implement Group Studio**

Present group name and image choices as collaborative setup, not an individual profile competition. Show real names only in the current student's private confirmation; the member list uses nicknames. Include a teacher-contact recovery action when the session is absent.

- [ ] **Step 5: Verify join and group interaction**

Run: `pnpm vitest run tests/ui/join-flow.test.tsx tests/ui/group-studio.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit onboarding UI**

```bash
git add src/features/join src/features/group src/app/router.tsx tests/ui/join-flow.test.tsx tests/ui/group-studio.test.tsx
git commit -m "feat: add playful join and group studio"
```

## Task 3: Build the Campus Map and Timed Quest Shell

**Files:**

- Create: `src/assets/campus-map.svg`
- Create: `src/assets/quest-guide.svg`
- Create: `src/assets/badges.svg`
- Create: `src/ui/ProgressTrail.tsx`
- Create: `src/ui/QuestGuide.tsx`
- Create: `src/features/quest/CampusMap.tsx`
- Create: `src/features/quest/QuestShell.tsx`
- Test: `tests/ui/quest-shell.test.tsx`

- [ ] **Step 1: Write failing map and timing tests**

Test the five approved phases, current/complete/upcoming states, C1–C8 coverage indicator, server-deadline display, resume state, warning behavior, and reduced-motion rendering.

- [ ] **Step 2: Draw original vector assets**

Create an original campus map with five named destinations:

- Briefing Plaza
- Diagnostic Gate
- Adaptive Learning Labs
- Final Challenge Hall
- Reflection Garden

Use simple geometric SVG forms and CSS variables. Give informative SVGs titles/descriptions and mark decorative layers as hidden from assistive technology. Do not trace third-party artwork.

- [ ] **Step 3: Implement a responsive map**

Desktop uses a spatial campus route; mobile uses a compact vertical journey with the same locations and state. The map is navigation/progress, not a hidden-content puzzle.

- [ ] **Step 4: Implement time guidance without speed scoring**

Show phase time remaining and a calm warning near transition. Copy must state that speed does not affect score. If the server advances a phase, preserve the last submission acknowledgement and announce the transition.

- [ ] **Step 5: Add purposeful celebrations**

Use a small badge reveal when a phase completes and one larger completion moment after the quest. Never animate incorrect answers as punishment. Add a persistent “Reduce animation” preference in addition to the system preference.

- [ ] **Step 6: Verify and commit**

Run: `pnpm vitest run tests/ui/quest-shell.test.tsx && pnpm build`

Expected: PASS; original SVG assets are optimized and under 100 KB combined.

```bash
git add src/assets src/ui/ProgressTrail.tsx src/ui/QuestGuide.tsx src/features/quest/CampusMap.tsx src/features/quest/QuestShell.tsx tests/ui/quest-shell.test.tsx
git commit -m "feat: build the future-ready campus journey"
```

## Task 4: Implement Mission Interactions and Feedback

**Files:**

- Create: `src/features/quest/MissionCard.tsx`
- Create: `src/features/quest/ChoiceInteraction.tsx`
- Create: `src/features/quest/SortInteraction.tsx`
- Create: `src/features/quest/FeedbackPanel.tsx`
- Test: `tests/ui/interactions.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

For every interaction, test keyboard completion, touch-sized controls, selected-state text, submit confirmation, busy state, reconnection message, answer locking, explanation after submission, misconception feedback, and source page label.

- [ ] **Step 2: Implement single-choice and multi-select**

Use native radio groups and checkboxes with fieldsets and legends. Require explicit submission; choosing an option must not submit automatically.

- [ ] **Step 3: Implement scenario sorting with a non-drag control**

Provide Move Up/Move Down buttons and position text. Optional pointer dragging may enhance the control, but the buttons and keyboard path are the canonical implementation.

- [ ] **Step 4: Implement adaptive support presentation**

Render only support supplied by the server:

- `needs_support`: concept reminder, simpler scenario framing, and a guided prompt;
- `developing`: concise cue;
- `secure`: no hint before submission and a more complex application scenario.

Do not display the support-state label to students.

- [ ] **Step 5: Implement constructive feedback**

After submission, show correct/incorrect status in text, a short rationale, the related misconception cue when present, and the source page label. Feedback should invite the learner to update their reasoning without moral judgment.

- [ ] **Step 6: Verify and commit**

Run: `pnpm vitest run tests/ui/interactions.test.tsx`

Expected: PASS.

```bash
git add src/features/quest tests/ui/interactions.test.tsx
git commit -m "feat: add adaptive scenario interactions"
```

## Task 5: Build Personal Debrief, Reflection, and Team Leaderboard

**Files:**

- Create: `src/features/results/PersonalDebrief.tsx`
- Create: `src/features/results/ReflectionCard.tsx`
- Create: `src/features/results/TeamLeaderboard.tsx`
- Test: `tests/ui/results.test.tsx`

- [ ] **Step 1: Write failing privacy and scoring-presentation tests**

Assert that:

- a student sees their own concept change and retry status;
- no other student's name, nickname, score, or rank appears;
- the leaderboard contains group name/image, rank, team score, and completion status only;
- the formula is explained as 60/25/10/5;
- ties share rank;
- speed is not displayed as a scoring input.

- [ ] **Step 2: Implement personal debrief**

Use C1–C8 labels with first evidence, final evidence, and retry status. Avoid false precision; show support-state language and concise next-step guidance.

- [ ] **Step 3: Implement reflection**

Present the server-selected weakest concept and one structured transfer question. Preserve the optional private text while offline and submit it through the protected learning API.

- [ ] **Step 4: Implement team leaderboard**

Animate rank changes only when motion is enabled and keep row movement easy to track. Show a neutral “awaiting completion” state for teams with incomplete data.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/ui/results.test.tsx`

Expected: PASS and privacy assertions find no individual peer data.

```bash
git add src/features/results tests/ui/results.test.tsx
git commit -m "feat: add private debrief and team leaderboard"
```

## Task 6: Prove Mobile, Accessibility, and Interaction Quality

**Files:**

- Create: `tests/accessibility/student-a11y.test.tsx`
- Create: `tests/e2e/student-experience.spec.ts`
- Modify: `src/styles/global.css`
- Modify: affected feature files

- [ ] **Step 1: Add automated accessibility checks**

Run `jest-axe` on join, group studio, diagnostic, mission, final, retry/reflection, and leaderboard states. Fail on serious or critical violations.

- [ ] **Step 2: Add Playwright device journeys**

Cover 360×800 touch, 390×844 touch, and 1280×800 keyboard-only journeys. Include zoom to 200%, reduced motion, one offline/reconnect event, and one invalid image.

- [ ] **Step 3: Add screenshot assertions for stable layout states**

Capture join, campus map, mission, feedback, and leaderboard at mobile and desktop widths. Mask dynamic timers and synthetic names. Review changes visually before accepting baselines.

- [ ] **Step 4: Measure the public shell**

Run a production build and keep initial compressed JavaScript below 250 KB unless a measured exception is documented. Lazy-load teacher routes and non-current quest phases. Ensure meaningful content renders promptly on a mid-tier mobile emulation.

- [ ] **Step 5: Run the complete student-experience gate**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:bundle
pnpm playwright test tests/e2e/student-experience.spec.ts
```

Expected: all commands pass, screenshots are approved, and no horizontal overflow appears at target widths or 200% zoom.

- [ ] **Step 6: Commit the experience gate**

```bash
git add src tests/accessibility tests/e2e/student-experience.spec.ts
git commit -m "test: verify mobile and accessible student quest"
```

## Plan Acceptance Gate

- The visual experience clearly reads as “Future-Ready Campus Quest,” with an original campus map, guide, badges, lively cards, and restrained celebrations.
- The complete student journey is usable within the approved 30-minute structure at phone and desktop widths.
- Join and Group Studio implement the approved group-number, naming, image, privacy, and editor rules.
- C1–C8 progress is visible without exposing adaptive labels or answers early.
- Every interaction has touch, mouse, and keyboard support, with no required drag action.
- Reduced-motion mode preserves meaning and removes spring/celebration movement.
- Students see only their own results plus team-level leaderboard data.
