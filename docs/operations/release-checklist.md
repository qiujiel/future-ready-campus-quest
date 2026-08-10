# Disposable Production Release Checklist

**Default decision: HOLD.** This checklist applies only while
`ghohuwwjxgjqnbsauvzq` contains the documented replaceable setup state. It
does not authorize deployment.

| Field | Value |
| --- | --- |
| Release owner | `________________` |
| Approved main commit (40 characters) | `________________` |
| Production Supabase project ref | `ghohuwwjxgjqnbsauvzq` |
| Dedicated load-test project ref | `vadyhuipwbtgbzpeisbn` |
| Backend workflow run | `________________` |
| Pages workflow run | `________________` |

## Preconditions

- [ ] Dispatch uses the exact approved 40-character `main` SHA and exact
  production project ref; the load project is not a target.
- [ ] `release_mode` is `disposable-upgrade` and the bootstrap identifier is
  empty, or it is the separately authorized `bootstrap` path.
- [ ] The aggregate disposable-state preflight completes before mutation and
  proves the exact marked owner, closed five-group classroom, zero protected
  user/application state, zero `group-images` objects, and no query, aggregate,
  identity, or project-target error.
- [ ] Any nonzero or unverifiable result stops the release; no data is deleted
  to make the preflight pass.
- [ ] Joining is closed and new quest starts are paused.

## Automated and deployment gates

- [ ] Repository, deployment, lint, typecheck, unit, function, database,
  integration, build, bundle/privacy, and applicable live-load gates pass.
- [ ] Exact SHA/ref/URL checks, secret scanning, protected credential scope,
  migration list, migration dry run, ordered forward-only migrations, exact
  Function set, RLS/authorization tests, and backend readiness pass.
- [ ] A new complete live-load run from the exact approved `main` SHA reports
  all 30 students in five correct groups, zero incorrect assignments, duplicate
  identities, duplicate responses, authorized failures, or accepted
  unauthorized calls; response p95 below 1.5 seconds; dashboard p95 below 2.5
  seconds; and one-time join p95 at or below 7 seconds.
- [ ] Historical policy evidence records `6,882.59 ms overall` and
  `1,660.52 ms preflight` as the owner-approved one-time initial-entry
  limitation only. New evidence need not reproduce those measurements exactly.
- [ ] The immutable Pages artifact ID, approved commit, and manifest digest are
  recorded before separate Pages publication and remain available for rollback.

## Outcome

Any unchecked item means **HOLD**. When protected state exists, stop using
`disposable-upgrade`, preserve the state, and obtain an owner-approved
data-bearing recovery strategy before another backend deployment.

- [ ] **GO** — every applicable gate passed.
- [ ] **HOLD** — blocker/owner: `________________________________________`.
- [ ] **ROLL BACK** — use the immutable Pages artifact or compatible
  forward-redeploy path in `rollback.md`.

Release owner signature/time: `________________________________________`
