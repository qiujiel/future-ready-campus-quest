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

Expired join windows are closed automatically. Expired recovery-token records
and rate-limit events are removed by the service-role cleanup job after their
short operational grace period.

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
