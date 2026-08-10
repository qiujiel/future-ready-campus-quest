# Classroom Session Runbook

## Before class

1. Begin the scheduled health check early enough before class to allow an
   authorized owner to reactivate a Supabase Free project paused after
   inactivity and still complete every readiness check. Do not generate
   synthetic keepalive traffic to avoid a provider pause.
2. Confirm the exact intended local/test or production project is awake and the
   health endpoint responds. If reactivation was needed, wait for normal health
   and record only project identity, status, and time.
3. After the project is healthy, re-run migration readiness and confirm the
   reviewed series through `20260810001000`, then re-run approved protected-content readiness with 24 items across
   C1–C8, Auth health, and all application-function method-boundary readiness.
   A prior result from before a pause is insufficient.
4. Sign in with the provisioned teacher account. Never share that account or
   use a student account for teacher checks.
5. Open an existing class or create the planned class by entering only its name
   and number of groups. New groups keep the internal 20-student safety cap;
   teachers do not enter a group capacity. Leave joining closed while preparing
   the room unless creation intentionally uses **Create class and open joining**.
6. Privately review the complete question bank, accepted responses, rationales,
   sources, and concept coverage from the teacher dashboard. This view must
   never be projected or shared with students.
7. Check projection legibility, keyboard access, reduced-motion behavior, and
   the device/network path students will use.

## Admit students

1. Open the 15-minute join window only when ready.
2. Project the one class-specific student URL shared by every group. Give each
   table only its distinct short group code. A first-time student enters their
   teacher-recognizable name, group code, a private four-digit passcode twice,
   and whether they are the group leader. Never collect, announce, project, or
   record a passcode.
3. Confirm student names, counts, assigned groups, and the single group leader
   on the dashboard. The first successful leader claim wins; the teacher may
   assign a different same-group leader when needed. Resolve
   duplicate display names by group and move a student only through the
   audited teacher control.
4. Launch the quest from the teacher dashboard only after the roster is ready.
   Students must remain at the waiting state until this launch succeeds.
5. Close joining once the class is present. Reopen only through a new,
   time-limited window.

## During the quest

1. Monitor enrolled, active, and completed counts without refreshing at a
   high frequency.
2. Use C1–C8 first evidence to plan immediate support. Keep final evidence and
   formative retry separate.
3. Use most-missed labels and misconception distributions to decide what to
   explain; reveal protected item detail only in the private teacher view.
4. Pause new starts or extend a phase only after reading the named
   confirmation. A single extension is capped at five minutes.
5. For a lost browser session, give the student the same class URL. They choose
   **Log back in** and enter the same name and four-digit passcode, even after
   joining is closed. Use a five-minute teacher recovery QR only when the
   passcode is forgotten or for a pre-migration student; never read or announce
   its raw token.
6. Use Reset attempt only for the named student after reading the confirmation.
   Use Remove student only when access must be revoked; removal invalidates the
   active student session and is recorded in the audit trail.

## Finish and export

1. Confirm group completion and the `60/25/10/5` score version; speed is not a
   score input.
2. Download an aggregate or teacher-private CSV only when needed. Treat the
   downloaded file as school-controlled private data.
3. Close the session, close joining, and archive the cohort when teaching use
   is complete.
4. Record anomalies with opaque cohort/request IDs and error classes—never
   learner text or tokens.

## If something fails

Stop new joins, preserve visible error codes and timestamps, and follow
`rollback.md`. Do not repeatedly retry a destructive control or reset the
database during a live class.

## Verified local rehearsal

For a disposable local Supabase stack only, an operator may create the
synthetic teacher and a three-group classroom with:

```sh
pnpm bootstrap:local
```

The command refuses hosted Supabase URLs. Start the local Edge Functions with
the documented local-only secrets, start the app with `pnpm dev`, and run the
environment-gated browser rehearsal in `tests/e2e/hosted-classroom.spec.ts`.
The rehearsal covers two-field class creation, one shared class link and
distinct group codes, invalid codes, isolated leader/member sessions,
first-time passcodes, teacher launch, a safe response, session loss and
name/passcode restoration after joining closes, progress persistence, and
teacher route/API denial. Synthetic local credentials and receipts are not
production evidence.
