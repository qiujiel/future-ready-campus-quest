# Seven-Second Classroom Join Gate Design

## Context

The simplified classroom login release admitted all 30 simultaneous students
with zero failed joins, incorrect group assignments, duplicate identities, or
authorization failures. Its initial one-time join p95 measured 7,640.78 ms.
The one additional permitted optimization combined class-code preparation and
class-scope validation into one database round trip. The final approved run
improved preflight p95 from 3,121.82 ms to 1,660.52 ms and overall join p95 to
6,882.59 ms, while retaining every correctness and security control.

The owner explicitly approved 6,882.59 ms as a documented one-time classroom
join limitation. The automated release gate must represent that approval
without relaxing unrelated performance or security requirements.

## Decision

Set `CLASSROOM_JOIN_P95_LIMIT_MS` to exactly `7_000`. The boundary is
inclusive: 7,000 ms passes and any finite value above 7,000 ms fails.

The following requirements remain unchanged:

- exactly 30 successful concurrent joins;
- zero failed joins, incorrect group assignments, duplicate identities,
  authorized failures, or accepted unauthorized requests;
- five groups with valid scores and all 30 verified completions;
- five returning logins restoring the same identities without creating Auth
  users;
- response p95 below 1,500 ms and dashboard p95 below 2,500 ms;
- authentication, group-code validation, rate limiting, capacity controls,
  replay protection, RLS, student isolation, and teacher authorization.

No further latency optimization is included or authorized by this change.

## Implementation Boundary

Change only the shared load-policy constant, its boundary tests, and current
operations documentation that states the enforced threshold. Historical
specifications and implementation plans remain historical records and are not
rewritten.

Operational documentation must record both measurements:

- before the final optimization: 7,640.78 ms overall and 3,121.82 ms preflight;
- after the final optimization: 6,882.59 ms overall and 1,660.52 ms preflight.

The final measurement is the accepted known limitation. It does not alter the
response or dashboard thresholds and does not excuse any correctness or
security failure.

## Verification

Test-driven implementation will first change the policy tests to require:

- a fully correct run below 7 seconds passes;
- exactly 7,000 ms passes;
- 7,000.01 ms fails;
- all existing correctness, security, response, dashboard, completion, score,
  and returning-login failures remain release blockers.

The updated test must fail against the existing 5,000 ms implementation before
the constant changes. After it passes, run the full application and Function
test suites, type checks, lint, deployment validators, production build, bundle
privacy scan, Deno checks, and database tests. Then rerun the protected
dedicated-project classroom gate before any production release.

## Deployment Sequence

Merge this bounded policy change only after independent review and green CI.
Bootstrap the exact merged SHA to the dedicated load-test project and run the
complete 30-student test. Production remains untouched until that run passes
the 7,000 ms gate and every unchanged correctness and security requirement.
Afterward, continue the existing protected recovery, backend, immutable Pages
artifact, production-readiness, publication, and clean-session acceptance
sequence.
