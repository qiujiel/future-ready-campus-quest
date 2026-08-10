# Simplified Classroom Login Design

## Goal

Make the classroom entry flow understandable without prior training. A teacher
signs in, creates a class by choosing only its name and number of groups, and
receives one class link plus one code per group. Students create a recoverable
account with a name and four-digit passcode. A returning student uses the same
class link and signs back in with the same name and passcode.

This revision preserves authentication, rate limiting, capacity enforcement,
join-code validation, replay protection, row-level security, student isolation,
and teacher authorization.

## Teacher Experience

The teacher continues to use email and password authentication. After sign-in,
the setup page uses classroom language and asks for only:

- class name;
- number of groups, from 1 through 20.

The user-facing students-per-group field is removed. New classes use the
existing safe maximum of 20 students per group internally, so removing the
field does not remove capacity protection.

One primary action, **Create class and open joining**, creates the class and
opens a time-limited join window. The resulting screen shows:

- one class-specific student link, shared by every student in that class;
- one distinct short code for each group;
- the join-window expiry;
- controls to close or reopen joining.

If class creation succeeds but opening the join window fails, the class remains
closed. The teacher is taken to its dashboard and can safely retry opening
joining. Existing classes remain available from the teacher workspace.

## Student URLs and Group Codes

Each class has a stable, opaque public access identifier. Its student URL has a
class-scoped route such as `/#/class/<opaque-id>`. The identifier is not an
authorization credential; database policies and server functions remain the
authorization boundaries.

Every group in an open join window has a different eight-character group code.
The class link is the same across all groups. The class link supplies the class
scope, while the group code selects the assigned group. Codes remain
time-limited and teacher-controlled. Closing joining or disabling a group code
prevents new accounts but does not stop an existing student from signing back
in.

## First-Time Student Join

The class page presents two clear choices: **Join for the first time** and
**Log back in**. First-time join asks for:

1. the student's teacher-recognizable name;
2. the group code supplied by the teacher;
3. a four-digit numeric passcode entered twice;
4. a yes/no answer to **Are you the group leader?**

The server normalizes the name, validates the class and group code, enforces
the open join window and group capacity, applies existing replay protection,
and creates the synthetic Supabase Auth identity. The passcode is salted and
hashed at the trusted server boundary and is never stored or logged in plain
text. The frontend never receives the hash.

Real names remain teacher-only. Group peers continue to see only the existing
neutral explorer nickname.

## Returning Student Login

On the class-specific page, **Log back in** asks only for the student's name
and four-digit passcode. Successful verification issues a new session for the
existing synthetic Auth identity and resumes the saved activity. It does not
create a second profile, change the student's group, or reset progress.

The login function scopes name lookup to the class identified by the URL. It
returns the same neutral error for an unknown name and an incorrect passcode so
student names cannot be enumerated. Duplicate real names are allowed. The
trusted function checks matching candidates within the class and accepts only
a single matching name/passcode pair. If two accounts have the same normalized
name and passcode, login fails safely and the teacher must resolve the duplicate
from the roster.

The browser stores only the class route and normal Supabase session tokens. It
never stores the student's passcode. If a student opens the generic landing
page or uses a different device, the teacher supplies the same class link
again.

## Passcode Security and Abuse Controls

Four digits are intentionally optimized for an in-class activity, so the
server compensates for the small credential space:

- passcodes are hashed with a slow, salted password hash in a private table;
- login attempts are rate-limited by class, normalized-name hash, and client
  address without writing names or passcodes to logs;
- repeated failures produce a short cooldown and a neutral response;
- successful login rotates the student session;
- no teacher, student, API response, audit event, or export can read a passcode
  or passcode hash.

Teacher-issued recovery links remain available as the exceptional recovery
path when a student forgets a passcode. Passcode reset is not added to the
student interface in this revision.

## Group Leader Rules

The first student in a group who answers **Yes** becomes that group's sole
leader, using an atomic first-claim-wins update. A later student selecting
**Yes** joins normally but does not replace the existing leader. The interface
explains that the group already has a leader.

Only the leader may edit the shared group name and image. Ordinary group
members have view-only access. Student-to-student editor transfer is removed
from the group interface to simplify the model. The teacher can assign or
change the leader and can lock group identity editing. These checks remain
enforced in database functions and row-level policies, not only in the UI.

## Data and Service Changes

The database adds:

- an opaque student-access identifier for each class;
- a private student credential record containing the student ID, class ID,
  normalized-name lookup hash, and salted passcode hash;
- private failed-login counters or a rate-limit ledger containing no plain-text
  student identifiers;
- an atomic leader-claim operation that assigns the editor only when the group
  has no current leader.

The existing join boundary is extended to accept the class access identifier,
passcode, and leader choice. A separate public student-login boundary verifies
returning credentials and issues a replacement session. Both endpoints use the
existing origin restrictions, neutral error handling, audit conventions, and
trusted service-role access. Public clients receive only the resulting student
identity and short-lived Supabase session tokens.

Existing valid student browser sessions continue to work after migration.
Students created before this revision do not have passcodes; the teacher-issued
recovery mechanism remains their supported re-entry path. Production rollout
must confirm or remove test-only students before enabling the revised join
flow.

## Interface Changes

User-facing copy replaces **cohort** with **class** where teachers and students
see it. The teacher setup becomes a short two-field form. The class dashboard
keeps its existing join-code table and student link, with clearer instructions
that every group uses the same link but a different code.

The student class page uses two compact forms rather than a multi-page account
wizard. It provides field-level validation for names, four-digit passcodes,
passcode confirmation, and group-code formatting. Busy states prevent duplicate
submission. Authentication failures remain neutral, while closed joining,
disabled group codes, and full groups retain actionable classroom messages.

## Verification

Implementation follows test-driven development. Required automated coverage
includes:

- teacher setup requests only class name and group count and applies the fixed
  internal capacity;
- one class link is shared across all group-code receipts;
- first-time join requires and confirms a four-digit passcode;
- passcodes never appear in public rows, logs, responses, or exports;
- returning login restores the same student, group, and saved progress;
- returning login works after joining closes;
- wrong-name and wrong-passcode responses are indistinguishable;
- rate limiting and cooldown behavior cannot be bypassed by replay;
- group capacity and group-code validation remain enforced;
- concurrent leader claims result in exactly one leader;
- non-leaders cannot edit group information;
- teachers can change or lock the leader permission;
- duplicate identity creation and cross-class/cross-group access are rejected;
- accessibility checks cover both first-time and returning forms.

After targeted tests pass, verification runs the complete unit, function,
integration, accessibility, end-to-end, type-check, lint, production-build, and
deployment-configuration suites. A production migration and function release
require a separate explicit deployment approval after review and verification.
