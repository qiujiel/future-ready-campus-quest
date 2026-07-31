# Classroom Session Runbook

## Before class

1. Confirm the local/test or production Supabase project is awake and the
   health endpoint responds.
2. Verify the expected migrations and the approved protected-content version
   with 24 items across C1–C8.
3. Sign in with the provisioned teacher account. Never share that account or
   use a student account for teacher checks.
4. Create the cohort, confirm five groups of six when running a 30-student
   session, and leave joining closed while preparing the room.
5. Check projection legibility, keyboard access, reduced-motion behavior, and
   the device/network path students will use.

## Admit students

1. Open the 15-minute join window only when ready.
2. Project the generated QR/link. Do not copy the raw join token into chat,
   logs, screenshots, or documents.
3. Confirm student counts and assigned groups on the dashboard.
4. Close joining once the class is present. Reopen only through a new,
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
5. For a lost student session, issue a five-minute recovery QR to that exact
   student. The prior session is revoked. Never read or announce the raw
   recovery token.

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
