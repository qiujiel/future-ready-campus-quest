# Supabase Free-Plan Backup and Restore Rehearsal

## Authority and project identities

This runbook documents commands for an explicitly approved future operation.
It is not authorization to read production, create a backup, change either
Supabase project, configure GitHub, or perform a restore.

The only production project is `ghohuwwjxgjqnbsauvzq`, and its canonical API
URL is `https://ghohuwwjxgjqnbsauvzq.supabase.co`. The dedicated load-test
project is `vadyhuipwbtgbzpeisbn`. Stop before reading data unless two operators
confirm that the Supabase CLI link and API URL identify the exact production
project and not the load-test project. Never restore production data into
`vadyhuipwbtgbzpeisbn`.

Every remote phase below requires its named approval. A repository change,
release record, or earlier approval does not grant a later approval.

## Required tools and private custody

Use the approved release commit, its pinned Supabase CLI version `2.110.0`, the
official Supabase database and Storage migration guidance, `age`, `tar`, and `shasum` on an
institution-controlled operator machine. The operator and an independent
reviewer must be named before starting.

The recovery custodian holds the `age` private identity separately from the
encrypted archive. Neither the private identity, recipient configuration,
database password, Storage administration credential, connection string,
plaintext manifest, nor object path may enter Git, GitHub, shell history,
captured output, a command argument, or the public release record.

## Evidence identifiers

Allocate opaque identifiers only after authority and identity checks pass:

- backup: `frcq-backup-YYYYMMDDTHHMMSSZ-xxxxxxxx`;
- restore rehearsal: `frcq-restore-YYYYMMDDTHHMMSSZ-xxxxxxxx`.

Each `x` is lowercase hexadecimal. Names must disclose no project, school,
teacher, class, learner, cohort, or content. The internal encrypted manifest
records component filenames, sizes, SHA-256 digests, component-completion
flags, the approved full 40-character source SHA (the source commit), exact
source ref, pinned CLI version, command versions, the quiesced recovery point,
the archive creation/completion time, and the source aggregate counts defined
in Phase B. The public record contains only the aggregate evidence listed below.

## Phase A — approve and quiesce production

1. Obtain written release-owner, database-owner, and privacy-contact approval
   for this backup window; record approval by opaque evidence ID and UTC time.
2. Confirm the approved full release commit and exact production identity with
   two people. Stop if the local link is absent, differs from
   `ghohuwwjxgjqnbsauvzq`, or equals `vadyhuipwbtgbzpeisbn`.

   Before linking the CLI, reading production, or creating staging, start a new
   controlled shell that does not persist history and establish the approved
   checkout. Run the repository privacy/history check and the recovery-artifact
   guard from that checkout:

   ```bash
   approved_checkout="$(git rev-parse --show-toplevel)"
   cd "$approved_checkout"
   pnpm check:repo
   pnpm exec vitest run tests/deployment/recovery-artifact-guard.test.js
   ```

   Record only aggregate pass/fail results. After an independent reviewer accepts both local guard results,
   capture the exact Git status baseline without displaying it:

   ```bash
   set +x
   git_status_baseline="$(git status --porcelain --untracked-files=all)"
   ```

   Never echo, log, or otherwise print this value; it may contain protected paths
   or backup filenames. Keep command tracing disabled, and retain the value in
   the same controlled shell through the final comparison. Only then link the
   pinned CLI by entering the database password at its interactive hidden prompt:

   ```bash
   pnpm exec supabase link --project-ref ghohuwwjxgjqnbsauvzq
   ```

   Do not add a password flag, connection string, environment echo, or
   redirection to this template. Independently compare the linked identity and
   API URL with `ghohuwwjxgjqnbsauvzq` and
   `https://ghohuwwjxgjqnbsauvzq.supabase.co` before each export command, and
   stop on any mismatch.
3. Close joining, pause new quest starts, stop importers and all other writers,
   and record the UTC recovery point. No writes are permitted after that point.
4. In that same controlled shell, create private staging and install an
   always-run cleanup trap before any plaintext export:

   ```bash
   cd "$approved_checkout"
   umask 077
   staging_dir="$(mktemp -d)"
   cleanup() {
     (
       cd "$approved_checkout" || exit 1
       find "$staging_dir" -type f -exec shred -f {} \; 2>/dev/null || true
       rm -rf -- "$staging_dir" 2>/dev/null
     )
   }
   cleanup_and_verify() {
     set +x
     trap - EXIT
     trap '' HUP INT TERM
     cleanup_result=0
     cleanup || cleanup_result=1
     test ! -e "$staging_dir" || cleanup_result=1
     git_status_after_cleanup="$(git status --porcelain --untracked-files=all)" || cleanup_result=1
     test "$git_status_after_cleanup" = "$git_status_baseline" || cleanup_result=1
     unset git_status_after_cleanup git_status_baseline
     trap - HUP INT TERM
     if test "$cleanup_result" -ne 0; then
       echo "Cleanup verification is a cleanup failure and a privacy incident." >&2
       return 1
     fi
   }
   finalize_on_exit() {
     exit_status="$?"
     if ! cleanup_and_verify; then
       exit_status=1
     fi
     exit "$exit_status"
   }
   trap finalize_on_exit EXIT
   trap 'cleanup_and_verify || exit 1; exit 129' HUP
   trap 'cleanup_and_verify || exit 1; exit 130' INT
   trap 'cleanup_and_verify || exit 1; exit 143' TERM
   ```

   Keep the approved checkout as the working directory so repository-pinned
   package resolution and `supabase/.temp/project-ref` remain in scope. Confirm
   the staging directory is mode `0700`. Platform filesystems may not guarantee
   overwrite semantics, so encryption and access restriction remain mandatory;
   the cleanup check must confirm removal rather than assume `shred` succeeded.
   The removal command suppresses path-bearing diagnostics without discarding its failure status,
   which the generic finalizer reports without naming the staging directory.

## Phase B — export roles, schema, data, and migration history

With production still quiesced and the exact link re-confirmed, an authorized
future operator remains in the approved checkout and writes the five supported
logical exports to absolute staging paths:

Before those dumps, capture one quiesced source-count baseline in a single
read-only, repeatable-read transaction against the verified production link.
Write named nonnegative integers directly into the internal manifest in
staging—never to the terminal or public evidence—for:

- `auth.users` as `auth_users`;
- `public.cohorts` as `cohorts`;
- `public.student_private_profiles` as `student_private_profiles`;
- `public.student_public_profiles` as `student_public_profiles`;
- `public.quest_attempts` as `quest_attempts`;
- `public.student_responses` as `student_responses`;
- `public.concept_evidence` as `concept_evidence`;
- `public.audit_events` as `audit_events`.

Reject a missing, duplicate, negative, non-integer, or separately sampled
value. These are the immutable source counts used by the exact rehearsal
source-to-target count comparison; a successful dump alone is insufficient.

Only after that source-count baseline succeeds, run the five exports:

```bash
pnpm exec supabase db dump --linked -f "$staging_dir/roles.sql" --role-only
pnpm exec supabase db dump --linked -f "$staging_dir/schema.sql"
pnpm exec supabase db dump --linked -f "$staging_dir/data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
pnpm exec supabase db dump --linked -f "$staging_dir/history_schema.sql" --schema supabase_migrations
pnpm exec supabase db dump --linked -f "$staging_dir/history_data.sql" --use-copy --data-only --schema supabase_migrations
```

The linked CLI must obtain the database password through its interactive hidden
prompt or approved private credential store; never place it or a connection
string in an argument, shell history, output, or committed file. Stop if any
command fails, any required export is absent, or a production write occurs.
Keep every plaintext component filename, byte size, and digest only inside the
encrypted internal manifest. Outside it, record only component completion
flags, aggregate Storage count/bytes, and the encrypted archive evidence
defined in Phase D—never SQL or row contents.

## Phase C — export and inventory `group-images`

Database dumps contain Storage metadata, not the underlying objects. Storage export procedure `storage-export-v1`
is the following versioned process, pinned by the approved Git commit and
recorded inside the internal manifest:

1. With command tracing disabled and before accepting a credential, parse the
   Storage API base URL without printing it. Require exact equality with
   `https://ghohuwwjxgjqnbsauvzq.supabase.co`; require the derived project ref
   to equal `ghohuwwjxgjqnbsauvzq` and reject `vadyhuipwbtgbzpeisbn` or any
   other ref. Recheck that identity before both inventory passes.
2. Supply the temporary Storage administration credential only through a
   hidden prompt or access-controlled process input. Follow the official
   Supabase Storage CLI/API migration contract with a fixed page size of `100`,
   stable ordering, and a zero offset for each prefix. Recurse through every
   prefix, advance by the returned page length, and continue until a page returns fewer than `100` entries.
   Reject every non-success response or malformed/repeated page. Explicitly
   reject duplicate object paths before any object is written.
3. Stream each private `group-images` object into an opaque local staging name
   while calculating its byte size and SHA-256 digest. Only the encrypted
   internal Storage manifest maps that opaque local name to its protected
   object path and media type. Do not embed the credential, object paths,
   signed URLs, or filenames in commands, logs, screenshots, or evidence.
4. After export, restart pagination from the beginning and perform a second complete source digest inventory,
   hashing every source object to a discard
   sink. Its complete path set, count, byte total, and every per-object digest
   must match exactly both the first pass and the staged export. Any missing,
   added, duplicate, changed, or unreadable object invalidates the package.

The public record receives only the final aggregate count, byte total, and a
pass/fail digest-validation result. It never receives a protected path,
filename, per-object size, or per-object digest.

## Phase D — package, encrypt, copy, and verify

Verify all five SQL exports, all Storage objects, and both internal manifests
are present. Create one archive stream and encrypt it directly with `age`
recipient encryption to an approved destination outside plaintext staging:

```bash
tar -C "$staging_dir" -cf - . | age --recipients-file "$APPROVED_RECIPIENTS_FILE" -o "$ENCRYPTED_ARCHIVE"
archive_sha256="$(shasum -a 256 < "$ENCRYPTED_ARCHIVE" | awk '{print $1}')"
archive_bytes="$(wc -c < "$ENCRYPTED_ARCHIVE" | tr -d '[:space:]')"
```

After copying the encrypted archive with the approved custody tools, read back
the two complete copies without exposing their opaque filenames:

```bash
cloud_sha256="$(shasum -a 256 < "$CLOUD_ARCHIVE" | awk '{print $1}')"
offline_sha256="$(shasum -a 256 < "$OFFLINE_ARCHIVE" | awk '{print $1}')"
cloud_bytes="$(wc -c < "$CLOUD_ARCHIVE" | tr -d '[:space:]')"
offline_bytes="$(wc -c < "$OFFLINE_ARCHIVE" | tr -d '[:space:]')"
test "$cloud_sha256" = "$archive_sha256"
test "$offline_sha256" = "$archive_sha256"
test "$cloud_bytes" = "$archive_bytes"
test "$offline_bytes" = "$archive_bytes"
```

The variables above are operator-supplied references held outside Git; the
templates contain no values and grant no access. Record only the encrypted
archive SHA-256 and byte size. Record `backup_created_at_utc` as the canonical
UTC archive creation/completion time immediately after encryption succeeds;
do not reuse the earlier quiesced recovery point. Copy the encrypted archive to both approved
custody locations: institution-controlled cloud storage and encrypted
offline/local storage. The safe stdin hash commands above read each copy back
in full without printing a filename. Both the cloud-copy and offline-copy
digest and byte size must match the source; copy success alone is insufficient.

Run cleanup from the safe checkout and test the result without printing a
protected filename:

```bash
cd "$approved_checkout"
cleanup_and_verify || exit 1
```

The same finalizer runs on the explicit success path, ordinary shell exit, and
HUP, INT, or TERM. It disables tracing, disarms the EXIT handler to avoid
recursion, and ignores further terminating signals until cleanup and comparison
finish, then reports only a generic failure. Never print either status
value. Any incomplete cleanup or added, removed, or changed Git-status entry is
a cleanup failure and a privacy incident; follow the failure procedure without
disclosing the affected path or backup filename. Then verify that no plaintext,
credential, archive, or protected manifest remains in staging, the checkout,
shell history, Git status, or captured output. A package is valid
only while it is less than 24 hours old when the backend workflow starts and
the owner attests that no write occurred after its recovery point. It is
eligible for one release window only; any later write or release window requires
a new package and a new successful hosted rehearsal.

## Phase E — pause the load-test project with approval

After an independent reviewer verifies both encrypted copies, obtain a new
approval to pause the load-test project. Record its current identity and health
using aggregate status only, then pause `vadyhuipwbtgbzpeisbn`. Do not delete,
export, alter, or use it as a restore target. Pausing it only frees a Free-plan
active-project slot; it does not authorize project creation.

## Phase F — create the temporary Singapore recovery project with approval

Obtain separate approval to create a temporary recovery project in the
Singapore region. Give it a newly allocated opaque ref, no production frontend
origin, no automatic GitHub deployment, no real classroom traffic or outbound
email, and no production or load-test credential. Before any decryption or
restore, disable automatic exposure of new tables and independently verify that
setting together with the approved network controls.

Record only the opaque restore evidence ID, temporary project ref, region, UTC
time, approver, and reviewer. Creation does not authorize decrypting, restoring,
configuring, deploying, or deleting the project.

## Phase G — restore and validate with approval

After separate restore approval, decrypt one verified archive into a new
mode-`0700` directory with another always-run cleanup trap. Verify the external
archive SHA-256, the internal component digests, and the exact approved commit
before use. Supply all target credentials through interactive hidden prompts or
protected process inputs; do not print them or a connection string.

Follow the official Supabase backup/restore ordering with error-stop and
transaction controls: roles, schema, data, migration-history schema, and
migration-history data. Recreate platform configuration from the approved
commit and upload the `group-images` objects following the official Storage
migration guidance. Any Edge Function deployment targets only the temporary
project, uses rehearsal-only secrets, and requires its own approval.

The rehearsal passes only if an independent reviewer confirms:

- migrations through `20260806000700`, required database objects, RPCs,
  triggers, cron configuration, constraints, indexes, and RLS policies;
- aggregate database and Auth counts, teacher ownership, isolation, and
  anonymous/student/teacher/unauthorized method boundaries;
- retention configuration, cleanup schedule, expired credential behavior, and
  immutable C1–C8 evidence consistency;
- the private `group-images` object count, byte total, per-object digests,
  signed access, and rejection of unauthorized or cross-cohort access;
- applicable repository, pgTAP, integration, privacy, and readiness checks;
- no production or load-test ref appears as the restore target.

Record aggregate-only evidence. Any mismatch fails the rehearsal and blocks
release; the backup operator cannot waive it. For every named table in Phase B,
the independently captured target counts must exactly equal the encrypted
source counts, including valid zero values. The independent reviewer records
only the aggregate source-to-target count comparison result outside the
encrypted manifest, never the individual counts or record contents.

## Phase H — teardown and reactivate load testing with approval

Clean decrypted plaintext first and verify its removal. After evidence review,
obtain explicit approval to delete the temporary recovery project. Record the
approval, deletion result, reviewer, and UTC time without credentials or data.
If deletion fails, revoke rehearsal credentials, isolate the project, notify
the privacy and operations owners, and keep release on HOLD.

Obtain separate approval to reactivate `vadyhuipwbtgbzpeisbn`. Confirm its exact
identity, migration/content fixture state, Auth and function readiness, and
health before any later load test. Never substitute production when load-test
reactivation or fixture validation fails.

## GitHub evidence entry

The backend dispatch accepts exactly four non-secret workflow inputs:

- `backup_evidence_id`;
- `backup_created_at_utc`;
- `backup_archive_sha256`;
- `restore_rehearsal_evidence_id`.

`backup_created_at_utc` is only the archive creation/completion time. The
quiesced recovery point is recorded separately in the release record for the
no-write attestation and is not substituted into that workflow input.

The production owner compares each value with the separately held release
record before approving `production-backend`. GitHub validation proves only
format and freshness; it cannot prove archive custody, digest read-back, no
writes after the recovery point, or rehearsal success.

GitHub evidence may additionally record the encrypted archive SHA-256 and byte size,
approved commit, source ref, component completion flags, aggregate
Storage results, both copy-verification flags, temporary target ref,
tester/reviewer, quiesced recovery point, and UTC completion times. It must never
contain a backup, database row, SQL content, Storage path, filename, signed URL,
credential, recipient, key material, protected manifest, or personal data.

## Failure and plaintext-cleanup procedure

On identity mismatch, production write, partial export, inventory change,
encryption error, digest mismatch, restore error, validation mismatch, cleanup
failure, teardown failure, or load-test reactivation failure: stop, keep joining
closed, make no production mutation, capture only opaque failure evidence, and
leave the decision on HOLD.

The cleanup trap runs on success, failure, interruption, and signal. Confirm
plaintext removal from staging and any rehearsal directory, quarantine an
incomplete encrypted output under privacy-owner control, and verify Git status
contains no recovery artifact. A cleanup failure is a privacy incident: isolate
the machine, restrict access, notify the privacy contact, and follow the
incident procedure. No failure authorizes a reset, migration-history repair,
destructive migration, second migration attempt, or production restore.

## Retention and deletion

Retain each of the latest three successful pre-release backups for at least
30 days in both verified custody locations. An encrypted backup is eligible for
deletion only when it is at least 30 days old and three newer verified backups
exist in both locations. A failed or unverified package does not count.

Deletion requires data-owner approval, independent confirmation of the exact
opaque evidence ID and custody copies, and an aggregate deletion record. Never
delete the only usable recovery package during an incident. Key retirement is
a separate custodian decision and must account for every retained archive.
