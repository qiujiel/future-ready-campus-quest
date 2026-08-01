# Supabase Production Release Procedure

This procedure changes production only when the protected
`Release Production Backend` workflow is dispatched from `main` and approved.
Reading this document or merging its workflow does not authorize a deployment.

## Preconditions

1. Complete the configuration inventory in `github-environments.md`.
2. Confirm the release commit is on `main`, signed off by the release owner,
   and contains migrations through `20260730020900`.
3. Record a current managed-backup or point-in-time recovery identifier and its
   recoverable timestamp. If production has neither, the release is blocked.
4. Complete a restore rehearsal into a non-production project and record the
   target ref, restored timestamp, result, and tester. Never rehearse against
   production or `vadyhuipwbtgbzpeisbn`.
5. Confirm joins are closed and quest starts are paused for the release window.
6. Confirm the previous compatible Edge Function commit and the rollback owner.

## Protected workflow invocation

From GitHub Actions, select `Release Production Backend`, choose the `main`
branch, and enter:

- `expected_sha`: the approved full 40-character `main` commit SHA;
- `production_project_ref`: the exact protected production project ref.

Do not enter a password, token, URL, or secret as a workflow input. The job
halts before protected work if either identity differs from the workflow event
or environment configuration. The production owner then reviews the recorded
backup evidence and approves or rejects `production-backend`.

## Authoritative sequence

The workflow performs one ordered sequence from the approved commit:

1. run repository, workflow, lint, type, unit, Edge Function, Deno, database,
   pgTAP, black-box integration, build, and bundle-privacy gates locally;
2. link the Supabase CLI to the confirmed production ref;
3. record `supabase migration list`;
4. run `supabase db push --dry-run` and review the pending timestamps;
5. apply pending migrations once with `supabase db push`;
6. set the four custom Edge Function secrets from a mode-restricted temporary
   file outside the checkout;
7. deploy all ten functions together from `supabase/config.toml`;
8. run `production-preflight.mjs --backend-only` to verify exact project
   identity, migrations through `20260730020700`, required RPCs, Auth health,
   and all function method boundaries;
9. delete temporary secret material in an always-run step.

Expected deploy set:

- `join-cohort`, `manage-join-window`, `recover-student`;
- `manage-group-identity`, `get-next-item`, `submit-response`, `complete-quest`;
- `teacher-dashboard`, `teacher-controls`, `export-cohort`.

Do not run a second migration command manually after a partially failed
workflow until the release owner has compared the remote migration list with
the approved commit. Database migrations are forward-only.

## Protected-content import

The backend workflow deliberately does not import course content. After the
backend preflight succeeds, the authorized course owner may run the protected
content importer from the same approved commit. Every non-local invocation must
include `--confirm-project-ref=<exact-production-ref>` and must first display a
URL whose project ref matches that confirmation. Record version key and counts,
not content or credentials. The expected release dataset is 24 items covering
8 concepts.

## Post-backend evidence

Record the backend workflow run, approved SHA, production project ref, applied
migration timestamps, function deploy result, backend-preflight output, backup
evidence, approver, and completion time. Then run the Pages workflow; do not
approve publication until its separate production-readiness output passes.

If any check fails, leave joining closed, do not import content or publish
Pages, and follow `rollback.md`.
