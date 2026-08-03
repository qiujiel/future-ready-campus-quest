# Privacy and Retention

## Purpose and scope

Future-Ready Campus Quest is a teacher-led classroom learning tool, not a
public social-profile service. Data is collected only to admit students to a
teacher-owned cohort, deliver the C1–C8 quest, preserve learning evidence,
support recovery, and help the teacher plan follow-up instruction.

## Data inventory and visibility

| Data | Purpose | Visibility |
| --- | --- | --- |
| Teacher account and cohort | Ownership and authorization | Owning teacher |
| Student real name | Classroom identification and recovery | Owning teacher only |
| Nickname and group identity | In-group collaboration | Student's group and teacher |
| Responses, evidence state, scores | Learning and progress | Student's own evidence; owning teacher |
| Reflection choice and note | Private metacognition | Student and owning teacher |
| Group image | Classroom group identity | Authorized cohort/group via expiring URL |
| Join/recovery token hashes | Time-limited admission and recovery | Server only |
| Audit events | Security and operational accountability | Opaque IDs and action classes only |

Logs and audit rows must never contain names, nicknames, question text,
selected answers, raw tokens, reflection text, or exported CSV contents.

## Storage and exports

The `group-images` bucket is private. Reads use short-lived signed URLs;
direct public object URLs are not supported. Replaced and removed images are
marked for cleanup.

CSV files are generated only after a teacher request, formula-escaped, sent
with `Cache-Control: private, no-store`, and not saved to Storage or the
repository. The teacher is responsible for storing and deleting downloaded
copies according to school policy.

## Retention configuration

`private.data_retention_configuration.cohort_retention_days` is deliberately
`NULL`. Production release is blocked until the course owner approves a
period and records the approver and approval time. Do not substitute an
undocumented default. Local/test projects may remain unconfigured.

Migration `20260730020900_retention_cleanup_schedule.sql` registers one daily
`pg_cron` job named `campus-quest-expired-artifact-cleanup` at `17 3 * * *`.
It invokes `run_expired_artifact_cleanup()` as the hosted database owner. The
function is otherwise executable only by the service role. It closes expired
join windows and removes recovery-token and rate-limit records after their
one-day operational grace period.

Before release, rehearse this job in a non-production project with synthetic
expired and unexpired records. Record before/after counts proving that only
expired join windows, recovery records, and rate-limit events changed. Also
verify exactly one active cron row exists for the stable job name. Production
readiness is blocked if the schedule is absent, duplicated under any owner,
inactive, owned by the wrong role, targets the wrong database, or if its
command/schedule is altered. Migration
`20260730021000_release_schedule_readiness.sql` introduced the schedule gate;
`20260730021100_release_schedule_uniqueness.sql` enforces its unique owner and
database identity. Readiness also fails if the course-owner retention period
remains unapproved.

## Archive, anonymize, and delete

Archiving closes joining and prevents new quest starts. A teacher-requested
purge requires the exact cohort confirmation string. It replaces real names
and nicknames with neutral archived labels, removes private reflection text,
invalidates recovery records, and removes group images. Immutable response
and score evidence remains under opaque identifiers so class-level learning
records and audits stay internally consistent.

If school policy requires full destruction rather than anonymization, the
data owner must approve a separate cascade-delete procedure and its evidence
implications before execution.

## Incident ownership

Before production, the course owner must name the operational contact in the
release checklist. That contact coordinates access revocation, token
invalidation, artifact removal, incident notes, and required school privacy
notifications.

Free-plan recovery uses a two-copy custody rule: each verified encrypted archive
is read back from institution-controlled cloud storage and encrypted
offline/local storage. Retain each of the latest three successful pre-release
backups for at least 30 days in both locations. A package may be deleted only
when it is at least 30 days old and three newer verified packages exist in both
locations, with data-owner approval.

The institution-designated recovery custodian holds the `age` private identity
separately from every archive and its storage locations. Plaintext may exist
only in a newly created, mode-`0700` controlled staging or hosted-rehearsal
workspace for the approved operation, protected by an always-run cleanup trap.
It must not persist outside that workspace or enter shell history, logs, Git,
GitHub, general temporary storage, or an operator backup.

Backup and restore evidence uses opaque identifiers, aggregate counts, archive
digest/size, and pass/fail results only. A restore rehearsal must target a
separate non-production project, verify that RLS and private Storage remain
private, and prove expired credentials are not reactivated. GitHub evidence
must never contain a backup, classroom export, restored personal data, database
row or SQL, Storage path, filename, signed URL, credential, encryption recipient
or key material, or protected internal manifest.
