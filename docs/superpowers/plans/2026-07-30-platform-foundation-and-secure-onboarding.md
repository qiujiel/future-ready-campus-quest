# Platform Foundation and Secure Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tested React/Supabase foundation in which a teacher can open a short-lived cohort join window and students can join without email, password, or PIN, create private identities, and safely manage a group identity.

**Architecture:** GitHub Pages serves a public React shell. Supabase Auth, Postgres, Storage, and Edge Functions hold all identities and protected state. Every privileged mutation goes through an Edge Function; Row Level Security is the second enforcement layer. Student sessions use server-created synthetic Auth users and never expose service-role credentials.

**Tech Stack:** Node.js 24 LTS, pnpm, React 19.2, TypeScript 6.0, Vite 8.1, React Router, `@supabase/supabase-js` 2.x, Supabase CLI, Vitest, React Testing Library, Playwright 1.62, pgTAP, GitHub Actions.

**Global Constraints:**

- Read the approved product and technical specifications before changing code.
- Do not put either source PDF, the protected blueprint, question text, answers, student names, or Supabase secrets in Git history or the browser bundle.
- The student join path has no email, password, or PIN. It uses a 15-minute teacher-controlled join token, a teacher-assigned group number, a required real name, and an optional nickname.
- Real names and individual scores are teacher-only. Group members see nicknames and the group-visible identity.
- Teacher authentication uses Supabase email/password or an approved OAuth provider with a `teacher` role.
- Support a default class of five groups with six students each, but store group count and capacity as cohort configuration.
- All server-side mutations must be idempotent where retries are possible.
- Meet WCAG 2.2 AA, work at 360 CSS pixels, provide keyboard access, and respect reduced-motion preferences.
- Use local synthetic fixtures in tests. Never use real student data.

## File Structure

```text
.
├── .env.example
├── .github/workflows/ci.yml
├── .github/workflows/pages.yml
├── package.json
├── pnpm-lock.yaml
├── playwright.config.ts
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── app/App.tsx
│   ├── app/router.tsx
│   ├── main.tsx
│   ├── shared/api/contracts.ts
│   ├── shared/api/supabase.ts
│   ├── shared/config/env.ts
│   └── test/setup.ts
├── tests/
│   ├── app-shell.test.tsx
│   └── e2e/shell.spec.ts
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 202607300001_identity_schema.sql
    │   ├── 202607300002_identity_rls.sql
    │   ├── 202607300003_recovery_and_audit.sql
    │   └── 202607300004_group_media.sql
    ├── functions/
    │   ├── _shared/auth.ts
    │   ├── _shared/cors.ts
    │   ├── _shared/http.ts
    │   ├── join-cohort/index.ts
    │   ├── recover-student/index.ts
    │   ├── manage-join-window/index.ts
    │   └── manage-group-identity/index.ts
    └── tests/
        ├── identity_rls.test.sql
        ├── join_cohort.test.ts
        ├── recovery.test.ts
        └── group_media_rls.test.sql
```

## Shared Contracts

Create these types once in `src/shared/api/contracts.ts`; later plans must import them rather than redefining them:

```ts
export type Role = "teacher" | "student";
export type ConceptId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8";
export type SupportState = "needs_support" | "developing" | "secure";
export type LearningPhase = "diagnostic" | "mission" | "final" | "retry" | "reflection";

export interface JoinCohortInput {
  joinToken: string;
  groupNumber: number;
  realName: string;
  nickname?: string;
}

export interface StudentIdentity {
  studentId: string;
  cohortId: string;
  groupId: string;
  groupNumber: number;
  nickname: string;
  isGroupIdentityEditor: boolean;
}

export interface JoinCohortOutput {
  identity: StudentIdentity;
  accessToken: string;
  refreshToken: string;
}

export interface PublicGroupIdentity {
  groupId: string;
  groupNumber: number;
  displayName: string;
  imageObjectPath: string | null;
  lockedAt: string | null;
}
```

## Task 1: Scaffold the Public Shell and Verification Toolchain

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `playwright.config.ts`
- Create: `.env.example`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/router.tsx`
- Create: `src/shared/config/env.ts`
- Create: `src/shared/api/supabase.ts`
- Create: `src/test/setup.ts`
- Test: `tests/app-shell.test.tsx`
- Test: `tests/e2e/shell.spec.ts`

- [ ] **Step 1: Write the failing shell and environment tests**

```tsx
// tests/app-shell.test.tsx
import { render, screen } from "@testing-library/react";
import { App } from "../src/app/App";

it("renders a public shell without protected learning content", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /future-ready campus quest/i })).toBeVisible();
  expect(screen.getByText(/join a teacher-led quest/i)).toBeVisible();
  expect(screen.queryByText(/answer key/i)).not.toBeInTheDocument();
});
```

Run: `pnpm vitest run tests/app-shell.test.tsx`

Expected: FAIL because the application and test configuration do not exist.

- [ ] **Step 2: Create the Vite application and strict configuration**

Pin the approved major/minor versions in `package.json`. Set `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`. Configure Vite `base` from `VITE_BASE_PATH`, defaulting to `/`.

```ts
// src/shared/config/env.ts
import { z } from "zod";

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_BASE_PATH: z.string().default("/"),
});

export const env = schema.parse(import.meta.env);
```

The client may contain only the Supabase URL and publishable/anonymous key. It must not read a service-role key.

- [ ] **Step 3: Implement a hash-based router and public landing shell**

Use `createHashRouter` so deep links work on GitHub Pages without server rewrites. Include public routes for `/`, `/join/:token`, and `/teacher/sign-in`; place authenticated routes behind role-aware loaders.

- [ ] **Step 4: Run the unit, type, and production-build checks**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all commands exit 0; `dist/` contains no source PDF filename, question answer, service-role key, or protected blueprint filename.

- [ ] **Step 5: Add the first browser smoke test**

```ts
// tests/e2e/shell.spec.ts
import { expect, test } from "@playwright/test";

test("landing page works at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /future-ready campus quest/i })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
```

Run: `pnpm playwright test tests/e2e/shell.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit the foundation**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts playwright.config.ts .env.example src tests
git commit -m "feat: scaffold secure campus quest shell"
```

## Task 2: Create the Identity Schema and Row Level Security

**Files:**

- Create: `supabase/config.toml`
- Create: `supabase/migrations/202607300001_identity_schema.sql`
- Create: `supabase/migrations/202607300002_identity_rls.sql`
- Test: `supabase/tests/identity_rls.test.sql`

- [ ] **Step 1: Write failing pgTAP tests for identity privacy**

Cover these assertions:

1. A student can read their own private profile.
2. A student cannot read another student's real name.
3. A student can read group-visible nicknames only for their cohort.
4. A teacher can read profiles only for cohorts they own.
5. An anonymous caller cannot read cohorts, profiles, or join-window rows.

Run: `supabase test db`

Expected: FAIL because tables and policies do not exist.

- [ ] **Step 2: Create normalized identity tables**

Use UUID primary keys and `timestamptz`. Core tables:

```sql
create type public.app_role as enum ('teacher', 'student');

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null
);

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id),
  title text not null,
  group_count smallint not null default 5 check (group_count between 1 and 20),
  group_capacity smallint not null default 6 check (group_capacity between 1 and 20),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  group_number smallint not null,
  display_name text not null,
  identity_editor_id uuid,
  identity_locked_at timestamptz,
  unique (cohort_id, group_number)
);

create table public.student_private_profiles (
  student_id uuid primary key references auth.users(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  group_id uuid not null references public.groups(id),
  real_name text not null check (char_length(real_name) between 1 and 100),
  joined_at timestamptz not null default now()
);

create table public.student_public_profiles (
  student_id uuid primary key references auth.users(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  group_id uuid not null references public.groups(id),
  nickname text not null check (char_length(nickname) between 1 and 40)
);
```

Add an index for every foreign key used by RLS. Populate group display names as `Group 1` through the configured count when a cohort is created.

- [ ] **Step 3: Add helper functions and explicit policies**

Create stable, security-definer helpers `current_role()`, `teacher_owns_cohort(uuid)`, and `student_in_cohort(uuid)`. Fix `search_path` inside every security-definer function. Revoke direct write access to identity tables from `anon` and `authenticated`; Edge Functions perform controlled writes.

- [ ] **Step 4: Prove RLS and schema behavior**

Run: `supabase db reset && supabase test db`

Expected: schema reset succeeds and all identity privacy tests pass.

- [ ] **Step 5: Commit the identity boundary**

```bash
git add supabase/config.toml supabase/migrations/202607300001_identity_schema.sql supabase/migrations/202607300002_identity_rls.sql supabase/tests/identity_rls.test.sql
git commit -m "feat: enforce cohort identity privacy"
```

## Task 3: Implement Teacher-Controlled Join Windows and Anonymous-to-Student Join

**Files:**

- Modify: `src/shared/api/contracts.ts`
- Create: `supabase/functions/_shared/auth.ts`
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/manage-join-window/index.ts`
- Create: `supabase/functions/join-cohort/index.ts`
- Test: `supabase/tests/join_cohort.test.ts`

- [ ] **Step 1: Write failing Edge Function contract tests**

Test opening a 15-minute window, one successful student join, rejection after expiry, rejection for an invalid group, rejection when a group is full, normalization of whitespace, and non-disclosure of whether a real name already exists.

Run: `pnpm test:functions join_cohort`

Expected: FAIL because the functions do not exist.

- [ ] **Step 2: Add join-window storage**

Add `cohort_join_windows` with `token_hash`, `opens_at`, `expires_at`, `closed_at`, and `created_by`. Store only `sha256(token)`; return the raw 256-bit URL-safe token only when the teacher opens the window. Enforce a maximum lifetime of 15 minutes in the database.

- [ ] **Step 3: Implement teacher authorization for window management**

`manage-join-window` must:

1. Verify the caller's Supabase JWT.
2. Require the `teacher` role and cohort ownership.
3. Close an existing open window before issuing a new token.
4. Write an audit event.
5. Return `{ joinUrl, expiresAt }`.

- [ ] **Step 4: Implement atomic student join**

In `join-cohort`, validate `JoinCohortInput`, hash and look up the token, lock the target group row, check capacity, create a synthetic Auth user, write private and public profiles in one server-controlled transaction/RPC, and assign the first joined group member as `identity_editor_id`.

Generate the public nickname from the optional nickname or a neutral form such as `Explorer 4`; never fall back to the real name.

Return `JoinCohortOutput`. Do not return private profile fields.

- [ ] **Step 5: Verify retry and concurrency behavior**

Send simultaneous requests for the last available group place. Exactly one must succeed. Repeating a completed join request with the same idempotency key must return the same student identity, not create another user.

Run: `supabase functions serve --env-file .env.test`

In another terminal run: `pnpm test:functions join_cohort`

Expected: all contract and concurrency tests pass.

- [ ] **Step 6: Commit secure onboarding**

```bash
git add src/shared/api/contracts.ts supabase/migrations supabase/functions supabase/tests/join_cohort.test.ts
git commit -m "feat: add teacher-controlled student joining"
```

## Task 4: Add Single-Use Recovery and Group Identity Governance

**Files:**

- Create: `supabase/migrations/202607300003_recovery_and_audit.sql`
- Create: `supabase/functions/recover-student/index.ts`
- Create: `supabase/functions/manage-group-identity/index.ts`
- Test: `supabase/tests/recovery.test.ts`

- [ ] **Step 1: Write failing recovery and group-editor tests**

Cover teacher-issued recovery tokens, one successful redemption, replay rejection, expiry, wrong-cohort rejection, editor transfer, teacher lock, and denial of edits by an ordinary group member.

- [ ] **Step 2: Add hashed, single-use recovery records**

Store a token hash, student ID, issuing teacher, expiry, redeemed timestamp, and audit metadata. Limit lifetime to 10 minutes. The recovery function issues a new session for the existing synthetic Auth user without changing progress.

- [ ] **Step 3: Implement group identity rules**

`manage-group-identity` supports:

```ts
type GroupIdentityCommand =
  | { action: "rename"; groupId: string; displayName: string }
  | { action: "transfer-editor"; groupId: string; nextEditorId: string }
  | { action: "lock"; groupId: string }
  | { action: "unlock"; groupId: string };
```

Students may rename only when they are the current editor and the group is unlocked. Teachers may transfer, lock, and unlock groups in their own cohorts. Sanitize display names as plain text, 2–40 characters.

- [ ] **Step 4: Run recovery and authorization tests**

Run: `pnpm test:functions recovery && supabase test db`

Expected: all tests pass and every accepted or rejected privileged action has an audit record without storing raw tokens.

- [ ] **Step 5: Commit recovery and governance**

```bash
git add supabase/migrations/202607300003_recovery_and_audit.sql supabase/functions/recover-student supabase/functions/manage-group-identity supabase/tests/recovery.test.ts
git commit -m "feat: add safe recovery and group governance"
```

## Task 5: Add Private Group Image Uploads

**Files:**

- Create: `supabase/migrations/202607300004_group_media.sql`
- Modify: `supabase/functions/manage-group-identity/index.ts`
- Test: `supabase/tests/group_media_rls.test.sql`
- Test: `supabase/tests/group_media.test.ts`

- [ ] **Step 1: Write failing storage and validation tests**

Test accepted JPEG, PNG, and WebP uploads; reject SVG, GIF, oversized files, incorrect MIME signatures, files above 2 MB, and image dimensions above 2048×2048. Test that only cohort members and the cohort teacher can obtain a short-lived signed URL.

- [ ] **Step 2: Create the private `group-images` bucket and policies**

Object keys must be `cohortId/groupId/version.ext`. Do not make the bucket public. Grant direct reads only through signed URLs created after membership checks.

- [ ] **Step 3: Implement a two-step upload**

The function returns a short-lived signed upload URL after authorization. A finalize command verifies the stored object's size, decoded media type, and dimensions before saving `image_object_path` on the group. Replacing an image leaves an audit event and removes the prior object only after the new image is valid.

- [ ] **Step 4: Verify private media behavior**

Run: `supabase db reset && supabase test db && pnpm test:functions group_media`

Expected: all tests pass; an anonymous Storage URL returns no object.

- [ ] **Step 5: Commit group media**

```bash
git add supabase/migrations/202607300004_group_media.sql supabase/functions/manage-group-identity supabase/tests/group_media*
git commit -m "feat: secure group identity images"
```

## Task 6: Add CI and GitHub Pages Release Foundations

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Modify: `vite.config.ts`
- Modify: `tests/e2e/shell.spec.ts`

- [ ] **Step 1: Add a failing bundle-privacy check**

Add a script that builds and scans `dist/` for:

- both source PDF filenames;
- `protected-content`;
- `service_role`;
- sample answer-key markers from test fixtures.

The check must fail when a seeded forbidden marker is placed in a fixture build.

- [ ] **Step 2: Configure CI**

On pull requests and pushes, run dependency installation with a frozen lockfile, lint, typecheck, unit tests, Supabase database tests, production build, bundle-privacy scan, and Playwright mobile/desktop smoke tests. Cache only pnpm's package store, not environment files.

- [ ] **Step 3: Configure Pages packaging without automatic production publication**

The Pages workflow builds the public shell using repository variables for the public Supabase URL/key and uploads the artifact. Keep the production deployment job behind the protected `github-pages` environment so a repository owner approves publication.

- [ ] **Step 4: Run the same verification locally**

Run: `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm build && pnpm check:bundle && pnpm playwright test`

Expected: every command exits 0.

- [ ] **Step 5: Commit the release foundation**

```bash
git add .github/workflows vite.config.ts tests/e2e/shell.spec.ts package.json pnpm-lock.yaml
git commit -m "ci: verify and package the public shell"
```

## Plan Acceptance Gate

- A teacher can authenticate, create a cohort, and open/close a 15-minute join window.
- A student can join with the shared QR/link, assigned group number, real name, and optional nickname without email, password, or PIN.
- The first group member is the temporary identity editor, and the teacher can transfer or lock that role.
- Group images remain private and validated.
- A teacher can issue a single-use recovery QR without losing student progress.
- RLS tests prove that private names and cross-cohort data cannot leak.
- CI builds a GitHub Pages-compatible shell and proves protected content is absent from the bundle.
- No production deployment occurs until the repository owner approves the protected environment.
