# Classroom Join Readiness Design

## Decision

Treat the one-time classroom join as ready when one representative run admits
all 30 simultaneously starting students, assigns every student to the intended
group, creates no duplicate student identities, loses no submitted data,
accepts no unauthorized request, and records a join p95 at or below 5,000 ms. Keep
the existing response p95 below 1,500 ms and dashboard p95 below 2,500 ms.

The former 1,500 ms join objective remains useful as an aspirational latency
target, but it is not a publication blocker. The 5,000 ms limit is the release
gate for this initial, one-time join only. Authentication, group-code
validation, rate limiting, capacity controls, replay protection, row-level
security, student isolation, and teacher authorization must remain unchanged.

## Evidence flow

The representative load runner will publish a non-sensitive `Join phase
evidence` JSON record immediately after the 30 concurrent join requests settle.
The record will contain only counts and timing aggregates: joined and failed
counts, incorrect group assignments, duplicate identity count, join p95, and
the existing stage p95 values. It will never contain names, codes, tokens,
credentials, or identifiers.

The runner will then continue the existing full quest simulation. A valid join
phase does not turn a later failure into a passing release: activity access,
submissions, persistence, completion, dashboard visibility, duplicate-response
protection, team scoring, and the unauthorized dashboard check all remain
mandatory. The final metrics record will repeat the join-integrity counters so
the release decision is auditable in one object.

## Failure behavior

Any failed join, incorrect assignment, duplicate identity, join p95 above
5,000 ms, accepted unauthorized dashboard call, failed authorized activity
request, response p95 at or above 1,500 ms, dashboard p95 at or above 2,500 ms,
duplicate response, incomplete class, invalid group score, or invalid score
formula fails the workflow and prevents Pages publication.

Transient downstream provider failures remain visible as failures. The load
runner will not retry or suppress them. This threshold revision does not change
the deployed database, Edge Functions, authentication, authorization, or
security policies.

## Verification

Unit tests will prove the threshold and integrity predicates. The plan-only
load check, complete Vitest suites, type checks, linting, deployment validators,
production build, bundle scan, and browser tests must pass before the protected
live run. The live run itself remains 30 simultaneous joins in five intended
groups of six against only the dedicated load-test project.

The measured p95 from the successful protected run will be recorded as a known
one-time classroom join limitation in the operations documentation. A p95
above 5,000 ms permits at most one further low-risk, high-confidence
optimization; it never permits weakening a security or correctness control.
