# Simplified Classroom Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give teachers a two-field class setup and give students a secure, recoverable name-and-four-digit-passcode account scoped to one shared class link.

**Architecture:** Add a stable opaque student-access ID to each cohort and keep group codes as time-limited enrollment credentials. Extend the trusted join boundary to store a PBKDF2 passcode credential atomically with the student profile, then add a separate public login boundary that rate-limits neutral name/passcode verification and issues a replacement Supabase session. Keep all authorization in Edge Functions, SQL functions, and RLS; the React app only presents the two-mode student form and simplified teacher setup.

**Tech Stack:** React 19, TypeScript 6, React Router 7, Supabase Auth/Postgres/Edge Functions, Zod 4, Vitest 4, Testing Library, Playwright, SQL regression tests.

## Global Constraints

- Teacher setup asks only for class name and a group count from 1 through 20.
- Every new group retains a fixed internal capacity of 20 students.
- All groups in one class share one stable class URL; each group retains a distinct eight-character, time-limited join code.
- Initial student entry requires name, group code, a four-digit passcode entered twice, and a leader choice.
- Returning entry on the class URL requires only name and the same four-digit passcode.
- Passcodes, passcode hashes, salts, and name lookup hashes never appear in public tables, API responses, logs, audits, exports, or frontend storage; real names remain in the existing teacher-only RLS boundary.
- Five failed logins for one class/name in ten minutes produce a cooldown; the shared-network allowance remains at least 90 attempts per minute for a 30-student class.
- The first successful leader claim wins atomically; only the teacher can change that leader afterward.
- Authentication, group-code validation, rate limiting, capacity controls, replay protection, RLS, student isolation, and teacher authorization cannot be weakened.
- No production migration, function deployment, Pages deployment, or environment approval occurs without a separate explicit deployment approval.

---

## File Structure

- `src/shared/api/contracts.ts`: public request, response, identity, readiness, and teacher-control types.
- `supabase/functions/_shared/student-credentials-core.ts`: name normalization/HMAC and PBKDF2 passcode hashing/verification only.
- `supabase/functions/_shared/student-login-core.ts`: returning-login validation, neutral candidate matching, and session orchestration only.
- `supabase/functions/_shared/join-core.ts`: first-time join orchestration, extended with class scope, credential material, and leader choice.
- `supabase/functions/join-cohort/index.ts`: HTTP boundary and trusted adapters for enrollment.
- `supabase/functions/student-login/index.ts`: HTTP boundary and trusted adapters for returning login.
- `supabase/migrations/20260810000100_simplified_student_login.sql`: class access IDs, private credentials, rate ledger, join changes, login RPCs, and readiness leader data.
- `src/features/join/JoinPage.tsx`: class-scoped first-time and returning student forms.
- `src/features/join/StudentPasscodeFields.tsx`: reusable four-digit passcode/confirmation fields.
- `src/features/teacher/TeacherSetupPage.tsx`: two-field create-and-open teacher experience.
- `src/features/group/GroupStudio.tsx`: leader-only identity editing with no student transfer control.
- `src/features/teacher/ClassroomReadiness.tsx`: class link guidance and teacher leader assignment.
- `src/shared/api/authGateway.ts`: browser adapters for class creation, first join, and returning login.
- `supabase/config.toml`, `supabase/functions/production-readiness/core.ts`, and deployment tests/docs: register and validate the new public function and secret inventory.

---

### Task 1: Define Credential Primitives and Public Contracts

**Files:**
- Create: `supabase/functions/_shared/student-credentials-core.ts`
- Modify: `src/shared/api/contracts.ts`
- Modify: `src/shared/api/authGateway.ts`
- Test: `supabase/tests/student-credentials.test.ts`

**Interfaces:**
- Produces: `normalizeStudentName(value: string): string`
- Produces: `deriveStudentNameLookupHash(classAccessId: string, normalizedName: string, secret: string): Promise<string>`
- Produces: `hashStudentPasscode(passcode: string, options?: { salt?: Uint8Array; iterations?: number }): Promise<StoredPasscode>`
- Produces: `verifyStudentPasscode(passcode: string, stored: StoredPasscode): Promise<boolean>`
- Produces: `JoinCohortInput`, `StudentLoginInput`, `StudentLoginOutput`, and leader-aware readiness types used by every later task.

Define the stored credential shape exactly once in the credential core:

```ts
export interface StoredPasscode {
  salt: string;
  hash: string;
  iterations: number;
}
```

- [ ] **Step 1: Write failing credential tests**

Create `supabase/tests/student-credentials.test.ts` with real Web Crypto assertions:

```ts
import {
  deriveStudentNameLookupHash,
  hashStudentPasscode,
  normalizeStudentName,
  verifyStudentPasscode,
} from "../functions/_shared/student-credentials-core";

it("normalizes names without exposing them in the lookup hash", async () => {
  const normalized = normalizeStudentName("  Alex   Tan  ");
  const hash = await deriveStudentNameLookupHash(
    "40000000-0000-4000-8000-000000000001",
    normalized,
    "0123456789abcdef0123456789abcdef",
  );
  expect(normalized).toBe("Alex Tan");
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(hash).not.toContain("Alex");
});

it("accepts only four digits and verifies the salted PBKDF2 result", async () => {
  const stored = await hashStudentPasscode("4826", {
    salt: new Uint8Array(16).fill(7),
    iterations: 10,
  });
  await expect(verifyStudentPasscode("4826", stored)).resolves.toBe(true);
  await expect(verifyStudentPasscode("4827", stored)).resolves.toBe(false);
  await expect(hashStudentPasscode("123", { iterations: 10 })).rejects.toThrow(
    "INVALID_STUDENT_PASSCODE",
  );
});
```

- [ ] **Step 2: Run the credential tests and confirm RED**

Run: `pnpm vitest run --config vitest.functions.config.ts supabase/tests/student-credentials.test.ts`

Expected: FAIL because `student-credentials-core.ts` does not exist.

- [ ] **Step 3: Implement the credential core and contracts**

Implement the core with `STUDENT_PASSCODE_ITERATIONS = 210_000`, a 16-byte random salt, PBKDF2/SHA-256, HMAC/SHA-256 for name lookup, base64url storage, and constant-time byte comparison. Define these exact shapes in `src/shared/api/contracts.ts`:

```ts
export interface JoinCohortInput {
  classAccessId: string;
  joinCode: string;
  displayName: string;
  passcode: string;
  wantsLeader: boolean;
  requestKey: string;
}

export interface StudentLoginInput {
  classAccessId: string;
  displayName: string;
  passcode: string;
  requestKey: string;
}

export interface StudentLoginOutput extends SessionTokens {
  identity: StudentIdentity;
}
```

Add `loginStudent?(input: StudentLoginInput): Promise<StudentLoginOutput>` to `AuthGateway` so this foundation does not break existing test gateways before Task 5 switches the UI. Add `isGroupLeader: boolean` to `TeacherRosterStudent`. Defer the breaking `JoinCohortInput` fields and removal of `CreateCohortRequest.groupCapacity` until Tasks 3 and 6, where their call sites are updated in the same test cycle. Keep `TeacherCohortListItem.groupCapacity` because existing records and readiness still report enforced capacity.

- [ ] **Step 4: Run targeted tests and type checking**

Run: `pnpm vitest run --config vitest.functions.config.ts supabase/tests/student-credentials.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS because the new login gateway method is optional until Task 5 and existing join/create contracts remain unchanged in this task.

- [ ] **Step 5: Commit the credential foundation**

```bash
git add src/shared/api/contracts.ts src/shared/api/authGateway.ts supabase/functions/_shared/student-credentials-core.ts supabase/tests/student-credentials.test.ts
git commit -m "feat: define secure student credentials"
```

---

### Task 2: Add Class Scope, Private Credentials, Rate Ledger, and Leader-Claim SQL

**Files:**
- Create: `supabase/migrations/20260810000100_simplified_student_login.sql`
- Create: `supabase/tests/simplified_student_login.test.sql`
- Create: `tests/deployment/simplified-student-login-migration.test.js`

**Interfaces:**
- Consumes: hexadecimal name hashes and base64url PBKDF2 fields from Task 1.
- Produces: `cohorts.student_access_id`.
- Produces: `public.complete_student_code_join(text, uuid, uuid, text, uuid, text, text, text, integer, boolean)`.
- Produces: `public.begin_student_login(uuid, text, text, uuid)` and `public.finish_student_login(uuid, uuid, boolean)` for service-role-only use.

- [ ] **Step 1: Write failing migration-shape and SQL behavior tests**

The JavaScript deployment test must read the migration and assert all of these strings or equivalent parsed clauses exist:

```js
expect(sql).toMatch(/student_access_id uuid not null default gen_random_uuid\(\)/i);
expect(sql).toMatch(/create table private\.student_login_credentials/i);
expect(sql).toMatch(/create table private\.student_login_attempts/i);
expect(sql).toMatch(/revoke all on table private\.student_login_credentials from/i);
expect(sql).toMatch(/grant execute on function public\.begin_student_login[^;]+ to service_role/i);
expect(sql).toMatch(/identity_editor_id is null[\s\S]+p_wants_leader/i);
expect(sql).not.toMatch(/grant (select|insert|update|delete) on table private\.student_login_credentials to (anon|authenticated)/i);
```

The pgTAP test must create one teacher/class with two groups and prove:

```sql
select isnt(student_access_id, null, 'a class receives an opaque student access id')
from public.cohorts where id = '40000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select * from public.begin_student_login(
    '40000000-0000-4000-8000-000000000099', repeat('a', 64), repeat('b', 64),
    '50000000-0000-4000-8000-000000000001'
  ) $$,
  'P0001', 'STUDENT_LOGIN_NOT_ACCEPTED',
  'unknown class access is neutral'
);
```

Add concurrent or sequential assertions that two `p_wants_leader = true` joins leave exactly one `groups.identity_editor_id`, that `p_wants_leader = false` never claims it, that closing the join window blocks enrollment but not `begin_student_login`, and that five failed finalized attempts cause the sixth name-scoped attempt to raise `STUDENT_LOGIN_NOT_ACCEPTED` without returning credential rows.

- [ ] **Step 2: Run the migration tests and confirm RED**

Run: `pnpm vitest run tests/deployment/simplified-student-login-migration.test.js`

Expected: FAIL because the migration file does not exist.

After local Supabase is running, run: `pnpm exec supabase test db --debug`

Expected: the new pgTAP file cannot pass until the migration exists.

- [ ] **Step 3: Implement the migration**

Add the following schema, with checks and indexes kept private:

```sql
alter table public.cohorts
  add column student_access_id uuid not null default gen_random_uuid();
create unique index cohorts_student_access_id_uidx
  on public.cohorts (student_access_id);

create table private.student_login_credentials (
  student_id uuid primary key references auth.users(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  name_lookup_hash text not null check (name_lookup_hash ~ '^[a-f0-9]{64}$'),
  passcode_salt text not null,
  passcode_hash text not null,
  passcode_iterations integer not null check (passcode_iterations >= 210000),
  created_at timestamptz not null default now()
);
create index student_login_credentials_lookup_idx
  on private.student_login_credentials (cohort_id, name_lookup_hash);

create table private.student_login_attempts (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  name_lookup_hash text not null check (name_lookup_hash ~ '^[a-f0-9]{64}$'),
  rate_key_hash text not null check (rate_key_hash ~ '^[a-f0-9]{64}$'),
  succeeded boolean,
  attempted_at timestamptz not null default now(),
  finalized_at timestamptz
);
```

Replace the current join SQL functions so class access is validated before profile creation, credential insertion occurs in the same transaction, and leader assignment is:

```sql
update public.groups as groups
set identity_editor_id = p_student_id
where groups.id = v_group.id
  and p_wants_leader
  and groups.identity_editor_id is null;
```

`begin_student_login` must lock the matching cohort, delete attempts older than ten minutes, reject five recent failed attempts for the same class/name or 90 attempts for the same client hash in one minute, insert an unfinalized attempt, and return at most four active credential candidates. `finish_student_login` must finalize exactly that attempt and accept a successful student only when the credential belongs to the attempt's cohort. Revoke all new private tables/functions from `public`, `anon`, and `authenticated`; grant the two login RPCs and extended join RPC only to `service_role`.

Extend `get_teacher_classroom_readiness` so every roster student includes:

```sql
'isGroupLeader', groups.identity_editor_id = private_profiles.student_id
```

- [ ] **Step 4: Run migration tests and confirm GREEN**

Run: `pnpm vitest run tests/deployment/simplified-student-login-migration.test.js`

Expected: PASS.

Run: `pnpm exec supabase db reset`

Run: `pnpm exec supabase test db --debug`

Expected: all SQL tests PASS, including rate limits, closed-join returning login, class isolation, and single-leader assignment.

- [ ] **Step 5: Commit the database boundary**

```bash
git add supabase/migrations/20260810000100_simplified_student_login.sql supabase/tests/simplified_student_login.test.sql tests/deployment/simplified-student-login-migration.test.js
git commit -m "feat: add private student login storage"
```

---

### Task 3: Extend First-Time Join Without Weakening Existing Gates

**Files:**
- Modify: `supabase/functions/_shared/join-core.ts`
- Modify: `supabase/functions/join-cohort/index.ts`
- Modify: `supabase/tests/join_cohort.test.ts`
- Modify: `supabase/tests/join-edge.integration.test.ts`
- Modify: `tests/load/class-session.js`
- Modify: `tests/load/load-test-fixture.test.js`

**Interfaces:**
- Consumes: `JoinCohortInput` and credential helpers from Task 1.
- Consumes: the extended `complete_student_code_join` RPC from Task 2.
- Produces: a first-time join that stores a private credential, respects class scope, and returns the existing `JoinCohortOutput` shape.

- [ ] **Step 1: Add failing join-core tests**

Update `baseInput` and add assertions like:

```ts
const baseInput: JoinCohortInput = {
  classAccessId: "40000000-0000-4000-8000-000000000099",
  joinCode: "FJP5-Z8YN",
  displayName: "  Synthetic   Learner  ",
  passcode: "4826",
  wantsLeader: true,
  requestKey: "50000000-0000-4000-8000-000000000001",
};

it("passes private credential material and leader intent only to completion", async () => {
  const dependencies = createDependencies();
  const complete = vi.spyOn(dependencies, "completeJoin");
  await joinStudent(baseInput, dependencies);
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({
    classAccessId: baseInput.classAccessId,
    wantsLeader: true,
    nameLookupHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    passcodeHash: expect.not.stringContaining("4826"),
  }));
});
```

Add tests rejecting a non-UUID class access ID and any non-four-digit passcode before Auth user creation. Preserve every existing invalid-code, capacity, replay, orphan cleanup, and concurrent completion test.

- [ ] **Step 2: Run the join tests and confirm RED**

Run: `pnpm vitest run --config vitest.functions.config.ts supabase/tests/join_cohort.test.ts`

Expected: FAIL because the parser and dependencies do not handle class scope or credentials.

- [ ] **Step 3: Implement the extended join orchestration**

Extend `CompleteJoinInput` with:

```ts
classAccessId: string;
wantsLeader: boolean;
nameLookupHash: string;
passcodeSalt: string;
passcodeHash: string;
passcodeIterations: number;
```

Add `createCredential(classAccessId, displayName, passcode)` to `JoinDependencies`. In the HTTP adapter, require `STUDENT_LOGIN_SIGNING_SECRET` with at least 32 characters, derive the HMAC name lookup and PBKDF2 credential after trusted join preflight, and pass only hash/salt/iterations into `complete_student_code_join`. Map class mismatch to the existing neutral `INVALID_JOIN_CODE`; never include the passcode or name in timing output or thrown errors.

- [ ] **Step 4: Update the real boundary and load fixtures**

Change integration and load payloads to include a class access ID, unique four-digit passcodes, and `wantsLeader: studentIndexWithinGroup === 0`. Read the class access ID from the teacher-created class receipt or authorized cohort query. Add assertions that all 30 students join, exactly one leader exists in each of five groups, no passcode appears in readiness JSON, and existing join p95/security policy remains unchanged.

- [ ] **Step 5: Run targeted join verification**

Run: `pnpm vitest run --config vitest.functions.config.ts supabase/tests/join_cohort.test.ts`

Run: `pnpm vitest run tests/load/load-test-fixture.test.js tests/load/class-session-policy.test.js`

Run with local Supabase integration variables: `pnpm test:integration`

Expected: all targeted tests PASS with the original invalid-code, capacity, replay, RLS, and 30-student expectations intact.

- [ ] **Step 6: Commit first-time account creation**

```bash
git add supabase/functions/_shared/join-core.ts supabase/functions/join-cohort/index.ts supabase/tests/join_cohort.test.ts supabase/tests/join-edge.integration.test.ts tests/load/class-session.js tests/load/load-test-fixture.test.js
git commit -m "feat: create recoverable student accounts"
```

---

### Task 4: Add Neutral, Rate-Limited Returning Student Login

**Files:**
- Create: `supabase/functions/_shared/student-login-core.ts`
- Create: `supabase/functions/student-login/index.ts`
- Create: `supabase/tests/student-login.test.ts`
- Modify: `supabase/tests/join-edge.integration.test.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `StudentLoginInput`, `StudentLoginOutput`, credential verification, login RPCs, and existing `issueSessionForExistingUser`.
- Produces: unauthenticated `POST /functions/v1/student-login` with allowed-Origin enforcement and neutral failures.

Define the login-core boundary as:

```ts
export interface StudentLoginCandidate {
  studentId: string;
  credential: StoredPasscode;
}

export interface StudentLoginDependencies {
  beginAttempt(
    classAccessId: string,
    normalizedName: string,
    requestKey: string,
  ): Promise<{ attemptId: string; candidates: StudentLoginCandidate[] }>;
  verifyPasscode(passcode: string, credential: StoredPasscode): Promise<boolean>;
  dummyCredential: StoredPasscode;
  finishAttempt(attemptId: string, succeeded: boolean, studentId?: string): Promise<void>;
  loadIdentity(studentId: string): Promise<StudentIdentity>;
  issueSession(studentId: string): Promise<SessionTokens>;
}
```

- [ ] **Step 1: Write failing login-core tests**

Define dependency-driven tests for these exact outcomes:

```ts
const validInput: StudentLoginInput = {
  classAccessId: "40000000-0000-4000-8000-000000000099",
  displayName: "Alex Tan",
  passcode: "4826",
  requestKey: "50000000-0000-4000-8000-000000000001",
};

function storedCandidate(studentId: string, passcode: string): StudentLoginCandidate {
  return {
    studentId,
    credential: { salt: "fixture", hash: `match-${passcode}`, iterations: 210000 },
  };
}

function dependencies(options: { candidates: StudentLoginCandidate[] }): StudentLoginDependencies {
  return {
    async beginAttempt() {
      return {
        attemptId: "70000000-0000-4000-8000-000000000001",
        candidates: options.candidates,
      };
    },
    async verifyPasscode(passcode, credential) {
      return credential.hash === `match-${passcode}`;
    },
    dummyCredential: { salt: "dummy", hash: "match-never", iterations: 210000 },
    async finishAttempt() {},
    async loadIdentity() {
      return {
      studentId: "student-1",
      cohortId: "cohort-1",
      groupId: "group-1",
      groupNumber: 1,
      nickname: "Explorer 1",
      isGroupIdentityEditor: false,
      };
    },
    async issueSession() {
      return {
      accessToken: "replacement-access",
      refreshToken: "replacement-refresh",
      };
    },
  };
}

it("issues a replacement session only for one matching active candidate", async () => {
  const result = await loginStudent(validInput, dependencies({
    candidates: [storedCandidate("student-1", "4826")],
  }));
  expect(result).toMatchObject({
    identity: { studentId: "student-1", groupNumber: 1 },
    accessToken: "replacement-access",
  });
});

it.each([
  ["unknown name", []],
  ["wrong passcode", [storedCandidate("student-1", "1111")]],
  ["ambiguous duplicate", [
    storedCandidate("student-1", "4826"),
    storedCandidate("student-2", "4826"),
  ]],
])("returns the same neutral failure for %s", async (_label, candidates) => {
  await expect(loginStudent(validInput, dependencies({ candidates })))
    .rejects.toMatchObject({ code: "STUDENT_LOGIN_NOT_ACCEPTED", status: 401 });
});
```

Assert that `finishAttempt(false)` runs for failure, `finishAttempt(true, studentId)` runs before session issue for success, every path performs at least one PBKDF2 verification using a dummy credential when no candidates exist, and raw names/passcodes never appear in thrown errors.

- [ ] **Step 2: Run login-core tests and confirm RED**

Run: `pnpm vitest run --config vitest.functions.config.ts supabase/tests/student-login.test.ts`

Expected: FAIL because the login core does not exist.

- [ ] **Step 3: Implement login core and Edge Function**

Validate class access UUID, normalized non-empty name up to 100 characters, exactly four digits, and request UUID. The Edge Function derives the name HMAC and client-address hash with `STUDENT_LOGIN_SIGNING_SECRET`, calls `begin_student_login`, verifies at most four candidates plus a dummy candidate when needed, finalizes the attempt, loads the existing private/public/group identity through service-role queries, and calls `issueSessionForExistingUser`.

Map unknown name, incorrect passcode, duplicate matches, removed students, and class mismatch to one response:

```json
{ "error": "STUDENT_LOGIN_NOT_ACCEPTED" }
```

Use HTTP 401 for credential failure, 429 with `LOGIN_NOT_AVAILABLE` for a cooldown, 403 for disallowed Origin, and no `Server-Timing` values containing identity-related labels. Register:

```toml
[functions.student-login]
verify_jwt = false
```

- [ ] **Step 4: Prove returning login works after joining closes**

Extend the integration test to create a student, close joining, call `student-login` with the class access ID/name/passcode, set the returned session in a clean client, and assert the same student ID, group ID, role, and saved attempt are visible. Add wrong-name and wrong-passcode requests and assert byte-for-byte equal JSON errors and no new Auth users. Seed one credentialless pre-revision student, keep its already-issued session active across the migration, and prove that session can still reach the quest while name/passcode login fails neutrally and teacher-issued recovery remains available.

- [ ] **Step 5: Run targeted login and integration tests**

Run: `pnpm vitest run --config vitest.functions.config.ts supabase/tests/student-login.test.ts`

Run: `pnpm test:integration`

Expected: PASS, including closed-joining re-entry and neutral failures.

- [ ] **Step 6: Commit returning login**

```bash
git add supabase/functions/_shared/student-login-core.ts supabase/functions/student-login/index.ts supabase/tests/student-login.test.ts supabase/tests/join-edge.integration.test.ts supabase/config.toml
git commit -m "feat: add returning student login"
```

---

### Task 5: Build the Class-Scoped Student Entry Interface

**Files:**
- Create: `src/features/join/StudentPasscodeFields.tsx`
- Modify: `src/features/join/JoinPage.tsx`
- Modify: `src/features/join/IdentityForm.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/shared/api/authGateway.ts`
- Modify: `tests/ui/join-flow.test.tsx`
- Modify: `tests/ui/student-entry.test.tsx`
- Modify: `tests/accessibility/student-a11y.test.tsx`

**Interfaces:**
- Consumes: `AuthGateway.joinCohort` and `AuthGateway.loginStudent` from Tasks 1, 3, and 4.
- Produces: `/class/:classAccessId` with first-time and returning modes; `/join` becomes a safe instruction page.

- [ ] **Step 1: Write failing first-time and returning UI tests**

Render `/class/40000000-0000-4000-8000-000000000099` and assert:

```ts
expect(screen.getByRole("button", { name: /join for the first time/i })).toBeVisible();
expect(screen.getByRole("button", { name: /log back in/i })).toBeVisible();

fireEvent.change(screen.getByLabelText(/^your name$/i), { target: { value: "Alex Tan" } });
fireEvent.change(screen.getByLabelText(/^group code$/i), { target: { value: "CAMPUS42" } });
fireEvent.change(screen.getByLabelText(/^create a 4-digit passcode$/i), { target: { value: "4826" } });
fireEvent.change(screen.getByLabelText(/^confirm passcode$/i), { target: { value: "4826" } });
fireEvent.click(screen.getByLabelText(/yes, i am the group leader/i));
fireEvent.click(screen.getByRole("button", { name: /^join group$/i }));

expect(joinCohort).toHaveBeenCalledWith(expect.objectContaining({
  classAccessId: "40000000-0000-4000-8000-000000000099",
  passcode: "4826",
  wantsLeader: true,
}));
```

Add a mismatch assertion that no gateway call occurs and the alert says `Passcodes must match.` Switch to returning mode, submit name/passcode only, and assert `loginStudent` receives no group code or leader field. Assert generic `/join` says `Use the class link your teacher shared.`

- [ ] **Step 2: Run UI tests and confirm RED**

Run: `pnpm vitest run tests/ui/join-flow.test.tsx tests/ui/student-entry.test.tsx`

Expected: FAIL because the class route, passcode controls, and login mode do not exist.

- [ ] **Step 3: Implement the two-mode class page**

Add the class route before the generic join route:

```tsx
{ path: "/class/:classAccessId", element: <JoinPage /> },
{ path: "/join", element: <JoinPage /> },
```

Use explicit mode buttons with `aria-pressed`. First-time mode renders name, group code, passcode, confirmation, and leader yes/no radios defaulting to **No**. Returning mode renders only name and passcode. Normalize group codes and names exactly once before invoking the gateway. Do not put passcodes into component persistence, query strings, navigation state, analytics, or errors.

Implement `supabaseAuthGateway.loginStudent` by invoking `student-login`, preserving `STUDENT_LOGIN_NOT_ACCEPTED`/`LOGIN_NOT_AVAILABLE` through `throwAuthGatewayError`, setting the returned session, and navigating to `/quest` only after success.

- [ ] **Step 4: Run UI and accessibility tests**

Run: `pnpm vitest run tests/ui/join-flow.test.tsx tests/ui/student-entry.test.tsx tests/accessibility/student-a11y.test.tsx`

Expected: PASS with no serious accessibility violations, duplicate submissions blocked, native four-digit input constraints present, and neutral returning-login errors.

- [ ] **Step 5: Commit the student interface**

```bash
git add src/features/join/StudentPasscodeFields.tsx src/features/join/JoinPage.tsx src/features/join/IdentityForm.tsx src/app/router.tsx src/shared/api/authGateway.ts tests/ui/join-flow.test.tsx tests/ui/student-entry.test.tsx tests/accessibility/student-a11y.test.tsx
git commit -m "feat: simplify student class entry"
```

---

### Task 6: Simplify Teacher Setup and Generate One Stable Class Link

**Files:**
- Modify: `src/features/teacher/TeacherSetupPage.tsx`
- Modify: `src/shared/api/authGateway.ts`
- Modify: `supabase/functions/manage-join-window/index.ts`
- Modify: `supabase/functions/teacher-controls/index.ts`
- Modify: `supabase/functions/teacher-dashboard/index.ts`
- Modify: `tests/ui/teacher-readiness.test.tsx`
- Modify: `tests/auth-flows.test.tsx`
- Modify: `supabase/tests/join-edge.integration.test.ts`
- Modify: `supabase/tests/teacher_scope.test.ts`

**Interfaces:**
- Consumes: `cohorts.student_access_id` from Task 2.
- Produces: create request `{ title, groupCount, requestKey }` with server-fixed capacity 20.
- Produces: every join receipt/readiness report URL as `${frontendAppUrl()}/#/class/${studentAccessId}`.

- [ ] **Step 1: Write failing teacher setup tests**

Assert the setup has exactly two inputs, applies classroom copy, and performs create then open:

```ts
expect(screen.getByLabelText(/class name/i)).toBeVisible();
expect(screen.getByLabelText(/number of groups/i)).toBeVisible();
expect(screen.queryByLabelText(/students per group/i)).not.toBeInTheDocument();

fireEvent.click(screen.getByRole("button", { name: /create class and open joining/i }));
await waitFor(() => expect(createCohort).toHaveBeenCalledWith({
  title: "Friday class",
  groupCount: 4,
  requestKey: expect.any(String),
}));
expect(openJoinWindow).toHaveBeenCalledWith(cohortId, expect.any(String));
```

Add an open-failure test proving the class remains created and the teacher navigates to its closed dashboard instead of retrying creation. Update receipt tests so all groups share `/#/class/40000000-0000-4000-8000-000000000099` while codes remain distinct.

- [ ] **Step 2: Run teacher tests and confirm RED**

Run: `pnpm vitest run tests/ui/teacher-readiness.test.tsx tests/auth-flows.test.tsx`

Expected: FAIL on the removed capacity field, new button label, and automatic open call.

- [ ] **Step 3: Implement server-fixed capacity and stable URLs**

Change the `manage-join-window` create schema to omit capacity and call:

```ts
p_group_capacity: 20,
```

After opening, select the teacher-owned `cohorts.student_access_id` and construct:

```ts
const studentUrl = `${frontendAppUrl()}/#/class/${studentAccessId}`;
```

Use the same lookup and URL construction in `teacher-controls` and `teacher-dashboard`. A missing/unauthorized access ID must return the existing neutral teacher error. Do not expose internal cohort IDs in the student URL.

Update `TeacherSetupPage` to call create and open from one submit handler. On open success, navigate to the class dashboard; on open failure, also navigate to that dashboard, where joining remains closed and the existing **Open joining** control is available. Replace visible `cohort` setup text with `class`; internal type and route names may remain unchanged.

- [ ] **Step 4: Run teacher and boundary tests**

Run: `pnpm vitest run tests/ui/teacher-readiness.test.tsx tests/auth-flows.test.tsx supabase/tests/teacher_scope.test.ts`

Run with local Supabase integration variables: `pnpm test:integration`

Expected: PASS; new classes have capacity 20, the class URL is stable across reopen operations, and each open window still rotates group codes.

- [ ] **Step 5: Commit teacher simplification**

```bash
git add src/features/teacher/TeacherSetupPage.tsx src/shared/api/authGateway.ts supabase/functions/manage-join-window/index.ts supabase/functions/teacher-controls/index.ts supabase/functions/teacher-dashboard/index.ts tests/ui/teacher-readiness.test.tsx tests/auth-flows.test.tsx supabase/tests/join-edge.integration.test.ts supabase/tests/teacher_scope.test.ts
git commit -m "feat: simplify teacher class setup"
```

---

### Task 7: Make Leadership Explicit and Teacher-Controlled

**Files:**
- Modify: `src/features/group/GroupStudio.tsx`
- Modify: `src/features/group/groupStudioGateway.ts`
- Modify: `src/features/teacher/ClassroomReadiness.tsx`
- Modify: `src/shared/api/contracts.ts`
- Modify: `tests/ui/group-studio.test.tsx`
- Modify: `tests/ui/teacher-readiness.test.tsx`
- Modify: `supabase/tests/group_media.test.ts`
- Modify: `supabase/tests/roster_controls.test.sql`

**Interfaces:**
- Consumes: `TeacherRosterStudent.isGroupLeader` emitted by Task 2.
- Consumes: existing teacher `transfer-editor` control and database authorization.
- Produces: leader-only group editing, ordinary-member view-only UI, and teacher assignment controls.

- [ ] **Step 1: Write failing leader-interface tests**

Update group-studio tests so the leader can rename/upload but cannot transfer:

```ts
expect(screen.getByLabelText(/group name/i)).toBeVisible();
expect(screen.queryByLabelText(/next group editor/i)).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /transfer editing/i })).not.toBeInTheDocument();
```

Update teacher readiness fixtures with `isGroupLeader`. Assert the current leader has a visible `Group leader` label and that clicking **Make group leader** for a different student sends:

```ts
{
  action: "transfer-editor",
  cohortId,
  groupId,
  studentId: "20000000-0000-4000-8000-000000000002",
}
```

Add SQL assertions that an ordinary member still cannot rename or upload group media and a teacher can transfer leadership only to an active student in the same group.

- [ ] **Step 2: Run leader tests and confirm RED**

Run: `pnpm vitest run tests/ui/group-studio.test.tsx tests/ui/teacher-readiness.test.tsx --config vitest.config.ts`

Expected: FAIL because student transfer remains visible and readiness has no leader control.

- [ ] **Step 3: Implement the simplified leader UI**

Remove the `Next group editor` form and the student `transferEditor` gateway method. Keep rename/image commands unchanged for the authenticated editor. In `ClassroomReadiness`, render a `Group leader` status for the current leader and a secondary **Make group leader** action for other active members. Add a confirmation description stating that the selected student will become the only group-information editor. Continue to use the existing audited teacher control boundary.

- [ ] **Step 4: Run UI and database authorization tests**

Run: `pnpm vitest run tests/ui/group-studio.test.tsx tests/ui/teacher-readiness.test.tsx supabase/tests/group_media.test.ts`

Run: `pnpm exec supabase test db --debug`

Expected: PASS; exactly one editor exists per group, non-leaders receive database denial, and the teacher can transfer or lock editing.

- [ ] **Step 5: Commit leader permissions**

```bash
git add src/features/group/GroupStudio.tsx src/features/group/groupStudioGateway.ts src/features/teacher/ClassroomReadiness.tsx src/shared/api/contracts.ts tests/ui/group-studio.test.tsx tests/ui/teacher-readiness.test.tsx supabase/tests/group_media.test.ts supabase/tests/roster_controls.test.sql
git commit -m "feat: make group leadership explicit"
```

---

### Task 8: Register Deployment Requirements and Verify the Complete Classroom Flow

**Files:**
- Modify: `supabase/functions/production-readiness/core.ts`
- Modify: `supabase/tests/production_readiness.test.ts`
- Modify: `scripts/deployment-config.mjs`
- Modify: `scripts/production-preflight-core.mjs`
- Modify: `tests/deployment/deployment-config.test.js`
- Modify: `tests/deployment/production-preflight.test.js`
- Modify: `.github/workflows/pages.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/backend-production.yml`
- Modify: `tests/e2e/hosted-classroom.spec.ts`
- Modify: `tests/e2e/privacy-boundaries.spec.ts`
- Modify: `tests/load/class-session.js`
- Modify: `docs/operations/backend-release.md`
- Modify: `docs/operations/class-session-runbook.md`
- Modify: `docs/operations/github-environments.md`
- Modify: `docs/operations/release-checklist.md`

**Interfaces:**
- Consumes: the complete student account and teacher setup flow from Tasks 1–7.
- Produces: release validation for `student-login` and encrypted `STUDENT_LOGIN_SIGNING_SECRET`, plus end-to-end evidence without deploying.

- [ ] **Step 1: Write failing deployment inventory tests**

Require `student-login` in the public-function allowlist and `STUDENT_LOGIN_SIGNING_SECRET` in backend secret inventory only:

```js
expect(publicFunctions).toContain("student-login");
expect(requiredBackendSecrets).toContain("STUDENT_LOGIN_SIGNING_SECRET");
expect(requiredPagesVariables).not.toContain("STUDENT_LOGIN_SIGNING_SECRET");
expect(requiredPagesSecrets).not.toContain("STUDENT_LOGIN_SIGNING_SECRET");
```

Assert function-only deployment includes `student-login`, migration deployment runs before function deployment, and the Pages build never receives the login signing secret.

- [ ] **Step 2: Run deployment tests and confirm RED**

Run: `pnpm vitest run supabase/tests/production_readiness.test.ts tests/deployment/deployment-config.test.js`

Expected: FAIL because `student-login` and its protected secret are absent from inventories.

- [ ] **Step 3: Update readiness, workflows, and runbooks**

Add `student-login` to the exact required/public function set. Add `STUDENT_LOGIN_SIGNING_SECRET` to `readProductionFunctionConfiguration`, require at least 32 characters, require it to differ from the join/recovery/readiness secrets, and add only its name—not its value—to the protected backend secret inventory. Give CI, Pages packaging, and backend local integration steps distinct test-only literals through their temporary function environment files. Do not add the production secret to GitHub Pages variables, GitHub Pages secrets, frontend environment, build output, or logs. Document release order:

1. keep joining closed;
2. back up and apply `20260810000100_simplified_student_login.sql`;
3. configure the encrypted function secret;
4. deploy `join-cohort`, `student-login`, `manage-join-window`, `teacher-controls`, and `teacher-dashboard` from one reviewed commit;
5. run production readiness;
6. publish the matching frontend only after backend checks pass;
7. use clean teacher/student sessions for acceptance;
8. close joining and roll back frontend/functions before restoring the database if acceptance fails.

- [ ] **Step 4: Extend safe end-to-end and load coverage**

The hosted classroom test must use a clean teacher context and two isolated student contexts to prove: teacher login; two-field class creation; same class link for all groups; distinct codes; first-time student account creation; one successful leader claim; a non-leader edit denial; quest access and one safe sample response; browser-context loss; name/passcode re-login after joining closes; same student/group/progress persistence; teacher progress visibility; and student denial from teacher routes/APIs.

The load test must retain 30 concurrent joins, zero wrong groups, zero duplicate identities, zero failed joins, zero unauthorized acceptance, and the accepted five-second join p95. Add five post-join returning logins after closing joining and require five successful restorations with no new Auth identities.

- [ ] **Step 5: Run the full verification ladder**

Run in order:

```bash
pnpm test
pnpm test:functions
pnpm test:integration
pnpm typecheck
pnpm lint
pnpm build
pnpm check:bundle
pnpm check:deployment
pnpm exec playwright test tests/e2e/shell.spec.ts tests/e2e/privacy-boundaries.spec.ts tests/e2e/hosted-classroom.spec.ts
pnpm test:load
```

Expected: every command exits 0; bundle scan finds no passcode, credential hash, service-role key, or signing secret; hosted tests use only safe synthetic data; no public deployment runs.

- [ ] **Step 6: Perform a final secret and artifact scan**

Run:

```bash
git grep -nE 'service_role|STUDENT_LOGIN_SIGNING_SECRET|passcodeHash|passcodeSalt' -- ':!docs/superpowers' ':!tests' ':!supabase/functions'
pnpm check:repo
```

Expected: only intentional protected configuration references are reported, no literal credential values exist, and repository checks pass.

- [ ] **Step 7: Commit verified deployment preparation**

```bash
git add supabase/functions/production-readiness/core.ts supabase/tests/production_readiness.test.ts scripts/deployment-config.mjs scripts/production-preflight-core.mjs tests/deployment/deployment-config.test.js tests/deployment/production-preflight.test.js .github/workflows/pages.yml .github/workflows/ci.yml .github/workflows/backend-production.yml tests/e2e/hosted-classroom.spec.ts tests/e2e/privacy-boundaries.spec.ts tests/load/class-session.js docs/operations/backend-release.md docs/operations/class-session-runbook.md docs/operations/github-environments.md docs/operations/release-checklist.md
git commit -m "test: verify simplified classroom login"
```

---

## Completion Criteria

- The teacher enters only class name and number of groups, then receives one class link and distinct group codes.
- A new student creates exactly one account with name, group code, four-digit passcode, and leader choice.
- A returning student restores the same session identity and progress with name/passcode after joining is closed.
- Exactly one group leader can edit shared group information, and the teacher can change or lock that leader.
- Credential material remains private and neutral failures prevent name enumeration.
- All capacity, rate, replay, RLS, isolation, teacher authorization, artifact-integrity, and 30-student classroom gates pass.
- The verified branch is ready for independent review; production remains unchanged until separately approved.
