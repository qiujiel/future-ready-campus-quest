# Initial Production Bootstrap Design

## Context

The protected backend workflow currently requires a verified encrypted recovery
package and hosted restore rehearsal before every release. That is correct for
an established production system, but it creates a first-release deadlock:
production project `ghohuwwjxgjqnbsauvzq` has no application migrations or
tables, while the recovery procedure requires those application tables to
exist before it can capture and compare them.

The repository owner approved a one-time, fail-closed bootstrap path on
2026-08-07. The dedicated load-test project `vadyhuipwbtgbzpeisbn` remains
separate and is never a production, bootstrap, backup, or restore target.

## Goals

- Permit the first backend release only when the exact production project is
  demonstrably empty of application state.
- Preserve all existing repository, test, secret, identity, migration-order,
  function, and production-readiness checks.
- Keep the encrypted backup and hosted restore rehearsal mandatory for every
  release after bootstrap.
- Emit only redaction-safe aggregate evidence; never print credentials, Auth
  records, database contents, Storage paths, or function secrets.
- Fail closed on ambiguous, partial, or previously initialized production
  state.

## Non-goals

- No general bypass for recovery evidence.
- No production reset, migration-history repair, destructive rollback, or
  automatic cleanup after a partial release.
- No use of the load-test project as a rehearsal or bootstrap target.
- No frontend publication, protected-content import, teacher creation, or
  classroom fixture creation inside the bootstrap authorization check.

## Release modes

`Release Production Backend` gains a required `release_mode` choice with two
values:

- `bootstrap`: allowed only for the first release and only after the protected
  emptiness preflight passes.
- `upgrade`: the default for all later releases and the only mode that accepts
  the existing four recovery-evidence fields.

The four recovery inputs become optional at GitHub's form level so bootstrap
can leave them empty. Repository validation enforces the stricter semantic
rules: `upgrade` requires all four canonical recovery values, while `bootstrap`
requires every recovery field to be empty. A bootstrap dispatch also requires
an opaque redaction-safe authorization identifier using
`frcq-bootstrap-YYYYMMDDTHHMMSSZ-xxxxxxxx`; upgrade requires that field to be
empty. No credential, project URL, person, school, class, or content identifier
is accepted as workflow evidence.

## Protected emptiness preflight

The unprotected validation job checks only dispatch syntax. The authoritative
bootstrap decision runs inside the existing `production-backend` environment,
after exact commit and project identity checks and before any migration,
secret, or function write.

The preflight receives protected credentials only through environment secrets
and queries the exact project through authenticated HTTPS APIs. It requires all
of the following to be true in one run:

1. the project ref is exactly `ghohuwwjxgjqnbsauvzq` and differs from
   `vadyhuipwbtgbzpeisbn`;
2. no Supabase migration version has been applied remotely;
3. the public REST schema exposes no application table or RPC;
4. Auth contains zero users;
5. Storage contains zero buckets and therefore no application objects;
6. no application Edge Function is deployed.

The check rejects a failed request, pagination ambiguity, malformed response,
unexpected object, nonzero count, unknown migration, or identity mismatch. It
returns only the project ref, release mode, authorization ID, and zero/nonzero
aggregate results. Secrets and response bodies never appear in logs.

The protected environment inventory adds
`PRODUCTION_SUPABASE_SECRET_KEY`. It is used only by the bootstrap
preflight and later approved administrative setup; it is never a repository or
frontend variable and never enters the public bundle.

## Workflow sequence

For `bootstrap`, the release job performs the existing local verification,
links the confirmed production project, runs the protected emptiness preflight,
records the remote migration dry run, applies migrations in order, sets Edge
Function secrets, deploys all functions, and runs backend compatibility
preflight. For `upgrade`, the workflow preserves the current recovery-evidence
validation and release sequence unchanged.

Bootstrap is self-disabling: after the first migration, function, user, REST
object, or Storage bucket exists, the emptiness preflight rejects all future
bootstrap dispatches. A partial bootstrap remains on HOLD for operator review;
the workflow does not reset, delete, or retry production automatically.

## Rollback and recovery

Before bootstrap, there is no application or classroom data to restore. The
rollback boundary is therefore the verified empty-project state plus the
approved source commit. If a write fails, joining remains closed, frontend
publication remains blocked, and the operator records aggregate failure
evidence before deciding on a forward fix or separately approved project
recreation.

Immediately after the successful initial backend, content, and smoke-fixture
setup, the normal Free-plan encrypted backup and hosted restore rehearsal become
mandatory before any subsequent backend release. Bootstrap evidence is never
accepted as upgrade recovery evidence.

## Testing and documentation

Regression coverage will prove that:

- release-mode evidence validation accepts only the two canonical modes and
  their mutually exclusive fields;
- bootstrap emptiness evaluation rejects every nonempty or malformed surface;
- workflow configuration keeps protected credentials out of unprotected jobs;
- bootstrap preflight runs before the first production write;
- upgrade retains the four-field recovery gate;
- production and load-test identities cannot be interchanged;
- deployment, recovery, rollback, and GitHub environment documentation describe
  the one-time bootstrap boundary and subsequent mandatory recovery process.

The complete application tests, Function tests, lint, type checks, repository
privacy checks, deployment checks, Deno checks, production build, and bundle
scan remain required before the branch is merged or dispatched.
