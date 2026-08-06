# Student-Ready Production Design

## Outcome

Future-Ready Campus Quest will be a hosted full-stack classroom application. Students open the same public HTTPS URL, select **Student**, enter a recognizable name and the teacher-provided group code, and receive a unique authenticated Supabase identity without email, invitation, password, or verification. Teachers remain on separate password-protected routes.

## Current verified foundation

The verified branch already contains the adaptive learning sequence, persistent attempts and responses, teacher analytics, recovery links, RLS, retention controls, protected-content import validation, Edge Functions, and an approval-gated GitHub Pages workflow. The production gaps are the shared-URL student entry, recoverable classroom join codes, teacher roster/readiness operations, atomic activity launch/reset, production content/backend configuration, and hosted multi-browser verification.

## Student entry and secure group codes

The homepage Student action opens `/join`. The form contains only a student name, a teacher-provided group code, a short privacy notice, and **Join Group**. A returning student session is detected before the form is shown and offers **Continue Activity** or **Start a new student session**.

Each open join window has one opaque, classroom-friendly code per group. Codes use an unambiguous uppercase alphabet and contain enough entropy to resist guessing during a 15-minute window. A code is derived in the trusted Edge Function from the join-window request key, group number, and `JOIN_TOKEN_SIGNING_SECRET`; only its SHA-256 hash is stored. The teacher can recover the displayed codes after refreshing because the trusted function can deterministically re-derive them. Students submit the code to `join-cohort`; the function hashes it and resolves the active cohort and group on the server. Existing rate limiting applies by code and client address. Codes are invalid after the window closes or expires, and a teacher can disable an individual group code.

The existing synthetic-auth-user implementation remains the selected alternative to Supabase anonymous auth. It already creates a unique confirmed internal student user, never returns internal credentials to the student, stores the session through the Supabase client, and keeps teacher authentication separate. The generated email and password remain server-only.

## Cohort readiness and controls

The teacher workspace lists owned cohorts, creates a cohort, and navigates directly to its dashboard. Its readiness view returns only teacher-owned data and shows group number/name, currently displayed join code, joining state, roster, join time, last activity, attempt phase/status, and submission state.

Teacher roster actions are trusted Edge Function commands backed by security-definer RPCs:

- **Move student** is allowed before an attempt starts. It atomically updates private/public membership and the join record, validates capacity, and transfers group-editor ownership safely.
- **Remove student** soft-removes the membership, abandons any active attempt, invalidates access through RLS membership helpers, and preserves historical records for audit/recovery.
- **Reset activity** abandons the active attempt and creates a fresh attempt only when starts are allowed; prior responses remain immutable history.
- **Disable group joining** invalidates only that group code.
- **Close joining** invalidates every code for the window.

Errors return stable public codes; student and teacher UIs map them to nontechnical messages.

## Activity launch and persistence

**Launch activity** is an idempotent server transaction. It verifies teacher ownership and a complete active content version, enables starts, and creates a diagnostic attempt with phase progress for every active student without an active/completed attempt. A student who joins while starts are allowed receives an attempt at join completion. Student progress continues to use the existing server-scored assignments, immutable response records, IndexedDB retry queue, and Supabase session restoration.

## Content and teacher visibility

The protected 24-item, eight-concept question bank remains outside Git. The existing guarded import command loads it using a service-role credential supplied only at execution time. A teacher-only question-bank view reads sanitized item metadata and stems from a trusted function; correctness keys and scoring internals are never sent to students.

## Deployment and verification

Local full-stack verification uses Supabase CLI, all migrations, the complete protected bank, Edge Functions, a real teacher fixture, and at least three unique student browser sessions across multiple groups. Production follows the repository runbook: verify backup/rollback evidence, link only project `ghohuwwjxgjqnbsauvzq`, apply migrations in order, deploy functions, set secrets, import content, configure teacher auth and redirect/origin URLs, configure GitHub variables/secrets and the protected environment, merge the verified PR, and approve the Pages deployment.

Hosted verification uses clean current Chrome and Safari sessions against the final HTTPS URL. It covers teacher login/logout, cohort creation/opening, codes, three students, invalid/closed codes, launch, refresh/return, full completion/submission, roster actions, RLS privacy probes, console/server/network inspection, and a second-device reachability check. The load-test project `vadyhuipwbtgbzpeisbn` is never linked, migrated, seeded, or treated as production.

## Safety boundaries

- No service-role key, signing secret, teacher password, protected answer key, or raw token is logged, committed, or returned to an unauthorized browser.
- RLS remains enabled and forced where currently required.
- Production writes occur only after the exact project reference and migration/content artifacts are verified.
- Existing production data is not deleted. Student removal and reset preserve history.
- Backup and rollback evidence is checked before the first production schema write.

