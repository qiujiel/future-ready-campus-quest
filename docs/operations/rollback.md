# Production Rollback and Recovery

The incident owner chooses the smallest safe path below. Record decisions,
workflow run IDs, full commits, migration timestamps, opaque cohort IDs, and
times. Never record raw tokens, names, answers, reflections, exports, database
passwords, or service-role keys.

## Immediate containment

1. Stop approving pending production workflows.
2. Close every join window and pause new quest starts with teacher controls.
3. Revoke affected recovery material by closing the session or issuing a
   replacement; never copy raw material into the incident record.
4. Keep the last verified Pages artifact serving unless it is the fault.
5. Name the incident owner, database owner, application owner, and privacy
   contact; record the containment timestamp.

If controls are unavailable, the production owner may temporarily disable the
affected Edge Function from the provider console while preserving evidence.
That exceptional action and restoration must be recorded.

## Pages rollback within 90 days

Use the retained artifact; never rebuild an old commit with current tooling.

1. Open the prior successful `Package and Publish GitHub Pages` workflow run.
2. Copy its numeric run ID, recorded full commit SHA, and manifest SHA-256 from
   the job summary. Confirm its `github-pages` artifact has not expired.
3. Compare those values with the signed release record and select the most
   recent version known to be compatible with the current backend.
4. From `main`, dispatch `Roll Back GitHub Pages` with `source_run_id`,
   `expected_commit_sha`, and `expected_manifest_digest`.
5. The preparation job downloads that run's `artifact.tar`, verifies its exact
   file inventory, hashes, metadata commit, and manifest digest, then re-uploads
   the unchanged archive. A mismatch stops the workflow.
6. Review its summary and approve `github-pages`. Verify the resulting URL and
   embedded `release-metadata.json` commit.

Exit when teacher and student smoke checks pass and no new backend incompatibility
appears. If the artifact is missing or its digest differs, do not publish it.

## First release or expired artifact

The retained-artifact workflow cannot help when no known-good artifact exists.
Before the first production release, prepare and independently review a static
maintenance artifact that contains no Supabase URL, key, login form, analytics,
or protected content. Record its artifact ID, commit, digest, and tested Pages
URL in the release record. Use the same verification and `github-pages` approval
path to publish it during containment.

If no reviewed maintenance artifact exists, leave Pages unpublished or keep the
current provider-served page. Do not improvise a production build during an
incident.

## Edge Function rollback

Choose the last commit documented as compatible with the migrations already
present in production. Database migrations are not reversed by this procedure.

1. Review the diff from the current function commit to the target, including
   `supabase/config.toml`, shared modules, JWT settings, and secret names.
2. Check out that exact commit in a clean, access-controlled release checkout;
   install its frozen dependencies and run its function, Deno, database-contract,
   integration, build, and privacy tests.
3. Link the pinned Supabase CLI to the explicitly confirmed production ref.
   Compare `supabase migration list`; stop if the old functions cannot tolerate
   every migration already applied.
4. With `SUPABASE_ACCESS_TOKEN` available only to the release process, deploy
   all functions from the target checkout with:

   ```sh
   pnpm exec supabase functions deploy --project-ref <confirmed-production-ref>
   ```

5. Run `node scripts/production-preflight.mjs --backend-only` using protected
   production-readiness configuration, then smoke teacher/student boundaries.

This is a production mutation and requires the same production owner approval
as a normal backend release. Never substitute `vadyhuipwbtgbzpeisbn`.

## Database compensation

Production migrations are forward-only. Never use `supabase db reset`, delete
migration history, or apply destructive history repair.

For a failed additive change:

1. stop callers of the new contract and deploy compatibility functions that
   tolerate both schemas;
2. write a later timestamped compensating migration;
3. restore the pre-release backup into a separate non-production project;
4. apply production migrations through the failed change and then the
   compensation;
5. run all pgTAP, integration, privacy, ownership, retention, and smoke tests;
6. obtain database-owner review and apply the compensation through the protected
   backend workflow;
7. re-enable traffic only after read-only production readiness passes.

Do not delete immutable responses, evidence, scores, or audit history merely to
restore application behavior. Any policy-authorized destruction requires a
separate data-owner decision and evidence review.

## Backup restoration

Use only the backup/PITR identifier recorded before the release. Restoration is
an incident decision by the database owner and privacy contact, not an automatic
rollback step. Restore into a new non-production project first, verify the exact
timestamp, ownership/RLS, opaque evidence counts, private Storage access, and
that expired join/recovery material is not reopened. Only then may the owner
authorize the provider's production recovery procedure.

After recovery, rotate affected credentials, reconcile group images by opaque
path, run the complete readiness suite, and keep joining closed until teacher
acceptance.

## Exit criteria

- the exact serving Pages commit and artifact digest are known;
- deployed function commit and production migration list are recorded;
- teacher ownership, sign-in, dashboard, controls, and export boundaries pass;
- unauthorized callers receive neutral errors;
- joining is closed by default and new starts remain controlled;
- C1–C8 immutable evidence remains consistent;
- cleanup scheduling and retention configuration are intact;
- incident owner, privacy contact, start/end times, actions, and follow-up owner
  are recorded without sensitive classroom data.
