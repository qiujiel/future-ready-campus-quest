# Approval-Gated Release Checklist

Production publication is not authorized by this checklist. Complete the
rehearsal, present the evidence below, and wait for explicit repository-owner
approval of the protected `github-pages` environment.

## Environment separation

- [ ] Local/test and production use different Supabase project references.
- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and
  `VITE_BASE_PATH` are repository variables; no private key is shipped to the
  browser.
- [ ] `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` is a GitHub secret used only by
  the read-only preflight inside the protected `github-pages` environment,
  after owner approval.
- [ ] Join and recovery signing secrets are configured in Supabase Edge
  Function secrets, never GitHub Pages variables.
- [ ] The dedicated load project uses separate `LOAD_*` variables/secrets.
- [ ] The Pages packaging workflow has the dedicated load secrets and variables;
  it cannot create a release artifact without a passing live 30-student run.

## Data-owner decisions

- [ ] Course owner approved the retention period and it is recorded in
  `private.data_retention_configuration` with approver and timestamp.
- [ ] Operational/privacy incident contact is named:
  `____________________________`.
- [ ] Teacher-private CSV handling aligns with school policy.

## Automated preflight

- [ ] Supabase Auth health responds.
- [ ] migration marker `20260730020400` and required Gate D functions exist.
- [ ] no open join window or live recovery token remains from testing.
- [ ] protected content version is `________________` with 24 items / 8
  concepts.
- [ ] smoke teacher ID and unarchived cohort ID are configured.
- [ ] Pages base path starts and ends with `/`.
- [ ] lint, typecheck, unit/function/pgTAP, accessibility, privacy, browser,
  build, repository, and bundle-privacy gates pass.
- [ ] dedicated-project live load report shows zero authorized failures, zero
  accepted unauthorized calls, join/response p95 below 1.5s, dashboard p95
  below 2.5s, no duplicates, and five teams of six.

## Rehearsal (do not publish)

- [ ] Run production build against non-production configuration.
- [ ] Record verified commit: `________________`.
- [ ] Record artifact SHA-256: `________________`.
- [ ] Record Supabase project reference: `________________`.
- [ ] Verify the CI artifact is uploaded once and the deploy job consumes
  exactly that artifact without rebuilding.
- [ ] Confirm the workflow is running from `refs/heads/main`; production
  credentials are never exposed to a manually selected branch.
- [ ] Exercise the rollback steps using the previous artifact.
- [ ] Leave the `github-pages` environment unapproved.

## Approval request

Present the verified commit, artifact checksum, project reference, content
version/count, test summary, live load metrics, rollback method, and intended
Pages URL to the repository owner.

Owner decision: `APPROVE / REJECT`
Owner: `________________`
Time: `________________`
