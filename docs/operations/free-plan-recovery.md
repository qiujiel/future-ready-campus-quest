# Supabase Free-Plan Backup and Restore Rehearsal

## Authority and project identities

This runbook documents commands for an explicitly approved future operation.
It is not authorization to read production, create a backup, change either
Supabase project, configure GitHub, or perform a restore.

The only production project is `ghohuwwjxgjqnbsauvzq`. The dedicated load-test
project is `vadyhuipwbtgbzpeisbn`. Stop before reading data unless two operators
confirm that the Supabase CLI is locally linked to the exact production project
and not the load-test project. Never restore production data into
`vadyhuipwbtgbzpeisbn`.

Every remote phase below requires its named approval. A repository change,
release record, or earlier approval does not grant a later approval.

## Required tools and private custody

Use the approved release commit, its pinned Supabase CLI, the official Supabase
database and Storage migration guidance, `age`, `tar`, and `shasum` on an
institution-controlled operator machine. The operator and an independent
reviewer must be named before starting.

The recovery custodian holds the `age` private identity separately from the
encrypted archive. Neither the private identity, recipient configuration,
database password, Storage administration credential, connection string,
plaintext manifest, nor object path may enter Git, GitHub, shell history,
captured output, a command argument, or the public release record.

After approval, link the pinned CLI by entering the database password only at
its interactive hidden prompt:

```bash
pnpm exec supabase link --project-ref ghohuwwjxgjqnbsauvzq
```

Do not add a password flag, connection string, environment echo, or redirection
to this template. Independently compare the linked identity with
`ghohuwwjxgjqnbsauvzq` before each export command and stop on any mismatch.

## Evidence identifiers

Allocate opaque identifiers only after authority and identity checks pass:

- backup: `frcq-backup-YYYYMMDDTHHMMSSZ-xxxxxxxx`;
- restore rehearsal: `frcq-restore-YYYYMMDDTHHMMSSZ-xxxxxxxx`.

Each `x` is lowercase hexadecimal. Names must disclose no project, school,
teacher, class, learner, cohort, or content. The internal encrypted manifest
records component filenames, sizes, SHA-256 digests, approved commit, exact
source ref, pinned CLI version, command version, and UTC recovery point. The
public record contains only the aggregate evidence listed below.

## Phase A — approve and quiesce production

1. Obtain written release-owner, database-owner, and privacy-contact approval
   for this backup window; record approval by opaque evidence ID and UTC time.
2. Confirm the approved full release commit and exact production identity with
   two people. Stop if the local link is absent, differs from
   `ghohuwwjxgjqnbsauvzq`, or equals `vadyhuipwbtgbzpeisbn`.
3. Close joining, pause new quest starts, stop importers and all other writers,
   and record the UTC recovery point. No writes are permitted after that point.
4. Start a new controlled shell that does not persist history. Create private
   staging and install an always-run cleanup trap before any plaintext export:

   ```bash
   umask 077
   staging_dir="$(mktemp -d)"
   cleanup() { find "$staging_dir" -type f -exec shred -f {} \; 2>/dev/null || true; rm -rf "$staging_dir"; }
   trap cleanup EXIT HUP INT TERM
   cd "$staging_dir"
   ```

   Confirm the directory is mode `0700`. Platform filesystems may not guarantee
   overwrite semantics, so encryption and access restriction remain mandatory;
   the cleanup check must confirm removal rather than assume `shred` succeeded.

## Phase B — export roles, schema, data, and migration history

With production still quiesced and the exact link re-confirmed, an authorized
future operator runs the five supported logical exports from private staging:

```bash
pnpm exec supabase db dump --linked -f roles.sql --role-only
pnpm exec supabase db dump --linked -f schema.sql
pnpm exec supabase db dump --linked -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
pnpm exec supabase db dump --linked -f history_schema.sql --schema supabase_migrations
pnpm exec supabase db dump --linked -f history_data.sql --use-copy --data-only --schema supabase_migrations
```

The linked CLI must obtain the database password through its interactive hidden
prompt or approved private credential store; never place it or a connection
string in an argument, shell history, output, or committed file. Stop if any
command fails, any required export is absent, or a production write occurs.
Record only component completion flags, byte sizes, and digests outside the
encrypted internal manifest—never SQL or row contents.

## Phase C — export and inventory `group-images`

Database dumps contain Storage metadata, not the underlying objects. Follow
the official Supabase Storage CLI/API migration guidance to enumerate and
download every object in the private `group-images` bucket into controlled
staging. Supply the temporary Storage administration credential only through a
hidden prompt or an access-controlled process input. Do not embed it, object
paths, signed URLs, or filenames in commands, logs, screenshots, or evidence.

Create an internal manifest with each opaque object path, byte size, media type
when available, and SHA-256 digest. Measure object count and byte total before
and after export; any inventory change invalidates the recovery point. The
public record receives only the final aggregate count, byte total, and a pass or
fail digest-validation result.

## Phase D — package, encrypt, copy, and verify

Verify all five SQL exports, all Storage objects, and both internal manifests
are present. Create one archive stream and encrypt it directly with `age`
recipient encryption to an approved destination outside plaintext staging:

```bash
tar -C "$staging_dir" -cf - . | age --recipients-file "$APPROVED_RECIPIENTS_FILE" -o "$ENCRYPTED_ARCHIVE"
shasum -a 256 "$ENCRYPTED_ARCHIVE"
```

The variables above are operator-supplied references held outside Git; the
templates contain no values and grant no access. Record only the encrypted
archive SHA-256 and byte size. Copy the encrypted archive to both approved
custody locations: institution-controlled cloud storage and encrypted
offline/local storage. Read each copy back in full and run `shasum -a 256` on
it. Both the cloud-copy and offline-copy digest and size must match the source;
copy success alone is insufficient.

Run the cleanup trap immediately after both read-back checks, then verify that
no plaintext, credential, archive, or protected manifest remains in staging,
the checkout, shell history, Git status, or captured output. A package is valid
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
email, and no production or load-test credential. Configure new-table exposure
and network access according to the approved rehearsal controls.

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

- migrations through `20260730021100`, required database objects, RPCs,
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
release; the backup operator cannot waive it.

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

The production owner compares each value with the separately held release
record before approving `production-backend`. GitHub validation proves only
format and freshness; it cannot prove archive custody, digest read-back, no
writes after the recovery point, or rehearsal success.

GitHub evidence may additionally record encrypted byte size, approved commit,
source ref, aggregate component/Storage results, both copy-verification flags,
temporary target ref, tester/reviewer, and UTC completion times. It must never
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
