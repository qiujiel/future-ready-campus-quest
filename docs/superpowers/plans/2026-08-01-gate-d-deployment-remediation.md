# Gate D Deployment Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make Gate D deployable only through auditable, project-separated, approval-gated backend, readiness, Pages publication, and rollback controls without performing any remote deployment.

**Architecture:** Add testable Node release utilities and forward-only Supabase migrations, then make thin GitHub workflows call those verified boundaries. Backend mutation, read-only production readiness, final Pages publication, and Pages rollback use separate protected jobs and exact commit/artifact identities.

**Tech Stack:** Node.js 24, Vitest 4, js-yaml 4.3, GitHub Actions, pnpm 11, Supabase CLI 2.110, PostgreSQL 17, pgTAP, pg_cron, Deno 2.

## Global Constraints

- Base all work on 47835657d3705d3d756a9e84f120679eb77aa988.
- The load-test project is exactly vadyhuipwbtgbzpeisbn and must never be accepted as production.
- Do not deploy, publish, dispatch a workflow, approve an environment, link a remote project, push migrations, import protected content, or read secret values.
- Keep production content, service-role keys, tokens, and database credentials out of Git, logs, screenshots, and artifacts.
- Use forward-only migrations; never use production db reset or migration-history repair.
- Pin every action used by a production or rollback workflow to a reviewed full commit SHA.
- Preserve unrelated work and the current checkout.

---

### Task 1: Testable deployment configuration validator

**Files:**
- Create: scripts/deployment-config.mjs
- Create: tests/deployment/deployment-config.test.js
- Modify: package.json
- Modify: pnpm-lock.yaml

**Interfaces:**
- Consumes: parsed GitHub workflow objects.
- Produces: validateDeploymentConfiguration(configuration): void and pnpm check:deployment.

- [ ] **Step 1: Add the direct YAML parser dependency**

    pnpm add --save-dev --offline js-yaml@4.3.0

Add this package script:

    "check:deployment": "node scripts/deployment-config.mjs"

- [ ] **Step 2: Write failing behavioral tests**

    import { validateDeploymentConfiguration } from "../../scripts/deployment-config.mjs";

    it("rejects a backend workflow that can target the load project", () => {
      const configuration = validConfiguration();
      delete configuration.backend.jobs.release.steps[0].env.LOAD_SUPABASE_PROJECT_REF;
      expect(() => validateDeploymentConfiguration(configuration)).toThrow(
        /load project separation/i,
      );
    });

    it("rejects Pages publication without a distinct readiness job", () => {
      const configuration = validConfiguration();
      configuration.pages.jobs.deploy.needs = "package";
      expect(() => validateDeploymentConfiguration(configuration)).toThrow(
        /production-readiness/i,
      );
    });

    it("rejects mutable action references", () => {
      const configuration = validConfiguration();
      configuration.pages.jobs.package.steps[0].uses = "actions/checkout@v5";
      expect(() => validateDeploymentConfiguration(configuration)).toThrow(
        /full commit sha/i,
      );
    });

- [ ] **Step 3: Verify RED**

    pnpm vitest run tests/deployment/deployment-config.test.js

Expected: FAIL because scripts/deployment-config.mjs does not exist.

- [ ] **Step 4: Implement the validator and CLI**

Implement semantic checks over parsed YAML rather than source-text matching:

    export function validateDeploymentConfiguration({ backend, pages, rollback }) {
      requireEnvironment(backend.jobs.release, "production-backend");
      requireRunBoundary(backend.jobs.release, "LOAD_SUPABASE_PROJECT_REF");
      requireRunBoundary(backend.jobs.release, "db push --dry-run");
      requireRunBoundary(backend.jobs.release, "functions deploy");
      requireEnvironment(pages.jobs.preflight, "production-readiness");
      requireNeeds(pages.jobs.deploy, "preflight");
      requireEnvironment(pages.jobs.deploy, "github-pages");
      requireRetention(pages.jobs.package, 90);
      requireEnvironment(rollback.jobs.deploy, "github-pages");
      requirePinnedActions({ backend, pages, rollback });
    }

The CLI loads backend-production.yml, pages.yml, and pages-rollback.yml, validates them, and prints one non-sensitive success line.

- [ ] **Step 5: Verify GREEN and commit**

    pnpm vitest run tests/deployment/deployment-config.test.js
    git add package.json pnpm-lock.yaml scripts/deployment-config.mjs tests/deployment/deployment-config.test.js
    git commit -m "test: define deployment workflow boundaries"

### Task 2: Harden production project and readiness validation

**Files:**
- Create: scripts/production-preflight-core.mjs
- Create: tests/deployment/production-preflight.test.js
- Modify: scripts/production-preflight.mjs

**Interfaces:**
- Consumes: environment configuration, readiness JSON, injected fetch, and --backend-only.
- Produces: readPreflightConfiguration, evaluateReadinessReport, probeEdgeFunctions, and redaction-safe CLI output.

- [ ] **Step 1: Write failing project-separation tests**

    it("rejects the dedicated load project as production", () => {
      expect(() => readPreflightConfiguration({
        PRODUCTION_SUPABASE_URL: "https://vadyhuipwbtgbzpeisbn.supabase.co",
        PRODUCTION_SUPABASE_PROJECT_REF: "vadyhuipwbtgbzpeisbn",
        LOAD_SUPABASE_PROJECT_REF: "vadyhuipwbtgbzpeisbn",
        PRODUCTION_SUPABASE_PUBLISHABLE_KEY: "public-key-with-safe-test-length",
        PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: "service-role-test-value",
        PRODUCTION_FRONTEND_ORIGIN: "https://school.example",
        VITE_BASE_PATH: "/campus-quest/",
      })).toThrow(/load-test project/i);
    });

    it("rejects a report missing atomic session close", () => {
      expect(() => evaluateReadinessReport({
        requiredMigrationsPresent: true,
        latestGateDMigration: "20260730020700",
        requiredFunctionsPresent: false,
      }, { backendOnly: true })).toThrow(/required Gate D functions/i);
    });

- [ ] **Step 2: Verify RED**

    pnpm vitest run tests/deployment/production-preflight.test.js

Expected: FAIL because the core module does not exist.

- [ ] **Step 3: Implement pure validation**

    export function projectRefFromSupabaseUrl(value) {
      const url = new URL(value);
      if (!url.hostname.endsWith(".supabase.co")) {
        throw new Error("Production URL must use a Supabase project hostname.");
      }
      return url.hostname.slice(0, -".supabase.co".length);
    }

Always check project identity, migrations, and RPCs. Full mode also checks tokens, content counts, smoke fixtures, and retention.

- [ ] **Step 4: Write failing Edge Function probe tests**

Inject fetch returning literal 405 responses for all ten exact function names. Mutate one response to 404 and another to 500; both must reject with only function name and status.

- [ ] **Step 5: Verify RED and implement probes**

Run the focused test and observe the missing-probe failure. Implement parallel safe GET probes with Origin, apikey, and Authorization headers. Accept only HTTP 405 as proof that the deployed method boundary ran.

- [ ] **Step 6: Refactor the CLI onto the core**

The CLI reads --backend-only, checks Auth health, readiness RPC, and Edge probes. It prints project ref, latest Gate D migration, count 10, and in full mode only content counts, smoke readiness, retention, and base path.

- [ ] **Step 7: Verify GREEN and commit**

    pnpm vitest run tests/deployment/production-preflight.test.js
    git add scripts/production-preflight.mjs scripts/production-preflight-core.mjs tests/deployment/production-preflight.test.js
    git commit -m "fix: make production preflight authoritative"

### Task 3: Require exact confirmation for every remote content import

**Files:**
- Modify: tests/learning/content-import.test.ts
- Modify: scripts/import-protected-content.ts
- Modify: .env.example

**Interfaces:**
- Consumes: local or hosted Supabase URL plus confirmedProjectRef.
- Produces: refusal of every unconfirmed hosted import and unchanged local behavior.

- [ ] **Step 1: Write the failing hosted-project test**

    it("requires exact confirmation for every hosted import", () => {
      expect(() => assertImportConfiguration({
        supabaseUrl: "https://staging-project.supabase.co",
        serviceRoleKey: "synthetic-service-role-key",
      })).toThrow(/confirm-project-ref=staging-project/i);

      expect(() => assertImportConfiguration({
        supabaseUrl: "https://staging-project.supabase.co",
        serviceRoleKey: "synthetic-service-role-key",
        confirmedProjectRef: "different-project",
      })).toThrow(/confirm-project-ref=staging-project/i);
    });

- [ ] **Step 2: Verify RED**

    pnpm vitest run tests/learning/content-import.test.ts

Expected: FAIL because an unlabelled hosted project is currently accepted.

- [ ] **Step 3: Implement the guard**

For any project ref other than local, require confirmedProjectRef === projectRef. Remove the optional productionProjectRef branch and environment dependency.

- [ ] **Step 4: Verify GREEN and commit**

    pnpm vitest run tests/learning/content-import.test.ts
    git add .env.example scripts/import-protected-content.ts tests/learning/content-import.test.ts
    git commit -m "fix: require explicit remote content import target"

### Task 4: Make database readiness and cleanup scheduling authoritative

**Files:**
- Create: supabase/migrations/20260730020800_release_preflight_hardening.sql
- Create: supabase/migrations/20260730020900_retention_cleanup_schedule.sql
- Create: supabase/tests/release_readiness.test.sql

**Interfaces:**
- Consumes: Supabase migration history, Gate D RPC catalog, and pg_cron.
- Produces: readiness JSON with verified history through 20700 and one named daily cleanup job.

- [ ] **Step 1: Write failing pgTAP tests**

    select plan(3);
    select is(
      public.get_production_readiness_report(
        'missing-version',
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid
      )->>'latestGateDMigration',
      '20260730020700',
      'readiness records the last required Gate D migration'
    );
    select ok(
      (public.get_production_readiness_report(
        'missing-version',
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid
      )->>'requiredMigrationsPresent')::boolean,
      'all required Gate D migrations are present'
    );
    select is(
      (select count(*)::integer from cron.job
       where jobname = 'campus-quest-expired-artifact-cleanup'),
      1,
      'cleanup has one schedule'
    );

- [ ] **Step 2: Verify RED**

Start/reset local Supabase and run the focused pgTAP file. Expected: FAIL because the report fields and cron job do not exist.

- [ ] **Step 3: Implement migration 20800**

Replace the readiness RPC. Calculate requiredMigrationsPresent from literal versions 20260730020500, 20260730020600, and 20260730020700 in supabase_migrations.schema_migrations. Check RPC signatures for dashboard, teacher control, purge, scope assertion, cleanup, and atomic close.

- [ ] **Step 4: Implement migration 20900**

Enable pg_cron. Replace the cleanup function so only service_role or current_user = 'postgres' may execute it. Unschedule an existing stable job and schedule:

    select cron.schedule(
      'campus-quest-expired-artifact-cleanup',
      '17 3 * * *',
      'select public.run_expired_artifact_cleanup();'
    );

- [ ] **Step 5: Verify GREEN and commit**

    pnpm exec supabase db reset
    pnpm exec supabase test db
    git add supabase/migrations/20260730020800_release_preflight_hardening.sql supabase/migrations/20260730020900_retention_cleanup_schedule.sql supabase/tests/release_readiness.test.sql
    git commit -m "feat: verify Gate D migrations and schedule cleanup"

### Task 5: Create verifiable Pages artifact utilities

**Files:**
- Create: scripts/pages-artifact.mjs
- Create: tests/deployment/pages-artifact.test.js

**Interfaces:**
- Consumes: built dist, commit SHA, run ID, expected commit, and expected manifest digest.
- Produces: release-metadata.json, artifact-sha256.txt, manifest digest, and verification result.

- [ ] **Step 1: Write failing create/verify tests**

Use a real temporary directory and literal files. Verify sorted manifest output, metadata, digest stability, rejection after file mutation, rejection of a wrong commit, and rejection of an unexpected symlink.

- [ ] **Step 2: Verify RED**

    pnpm vitest run tests/deployment/pages-artifact.test.js

Expected: FAIL because the artifact module does not exist.

- [ ] **Step 3: Implement creation and verification**

Use node:crypto, node:fs/promises, and node:path. Hash regular files only, sort normalized relative paths, exclude the manifest, and reject symlinks. Append these outputs when GITHUB_OUTPUT exists:

    manifest_digest=<64 lowercase hexadecimal characters>
    commit_sha=<40 lowercase hexadecimal characters>

- [ ] **Step 4: Verify GREEN and commit**

    pnpm vitest run tests/deployment/pages-artifact.test.js
    git add scripts/pages-artifact.mjs tests/deployment/pages-artifact.test.js
    git commit -m "feat: verify immutable Pages artifact contents"

### Task 6: Implement protected backend, Pages, and rollback workflows

**Files:**
- Create: .github/workflows/backend-production.yml
- Create: .github/workflows/pages-rollback.yml
- Modify: .github/workflows/pages.yml
- Modify: .github/workflows/ci.yml

**Interfaces:**
- Consumes: approved GitHub environments and the variable/secret names in the design.
- Produces: inert-until-approved backend release, two-stage Pages release, and prior-artifact rollback workflows.

- [ ] **Step 1: Verify RED against missing workflows**

    pnpm check:deployment

Expected: FAIL because backend/rollback workflows do not exist and Pages has one approval gate.

- [ ] **Step 2: Implement backend-production.yml**

Use workflow_dispatch with exact SHA/project inputs, job-level contents read, environment production-backend, project separation before CLI link, local verification, migration list, dry-run, one db push, temporary secret file, all-function deployment, backend-only preflight, and always-run secret-file removal.

Immutable pins:

    actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09
    actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444
    pnpm/action-setup@f40ffcd9367d9f12939873eb1018b921a783ffaa
    denoland/setup-deno@22d081ff2d3a40755e97629de92e3bcbfa7cf2ed

- [ ] **Step 3: Refactor pages.yml**

Create package, preflight, and deploy jobs. Package has only contents read, creates metadata/manifest, uploads with 90-day retention, and exports artifact ID/digest. Preflight needs package, downloads by artifact ID, extracts artifact.tar, verifies it, and uses production-readiness. Deploy needs preflight, uses github-pages, and alone has Pages/OIDC permissions.

Additional pins:

    actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b
    actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0
    actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e

- [ ] **Step 4: Implement pages-rollback.yml**

Require source run ID, expected commit SHA, and manifest digest. A read-only prepare job downloads the prior artifact by run ID, verifies it, and re-uploads unchanged artifact.tar. A separate github-pages job deploys without a build.

    actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02

- [ ] **Step 5: Add deployment validation to CI**

Run pnpm check:deployment before test/build jobs pass.

- [ ] **Step 6: Verify GREEN and commit**

    pnpm check:deployment
    pnpm vitest run tests/deployment
    git add .github/workflows scripts/deployment-config.mjs tests/deployment
    git commit -m "ci: add protected production and rollback workflows"

### Task 7: Make operations procedures executable

**Files:**
- Modify: .env.example
- Modify: docs/operations/release-checklist.md
- Modify: docs/operations/rollback.md
- Modify: docs/operations/privacy-and-retention.md
- Create: docs/operations/backend-release.md
- Create: docs/operations/github-environments.md

**Interfaces:**
- Consumes: exact workflow inputs, environments, artifacts, migrations, and scripts.
- Produces: operator procedures containing names and commands but no values.

- [ ] **Step 1: Update the environment inventory**

Separate repository variables, repository load secrets, production-backend settings, production-readiness settings, hosted Supabase defaults, and custom Function secrets. Record LOAD_SUPABASE_PROJECT_REF=vadyhuipwbtgbzpeisbn as a public guard.

- [ ] **Step 2: Document backend release sequence**

Record workflow inputs, evidence to review, migration order through 20900, function deployment order, protected-content confirmation, and backend/full preflight distinction.

- [ ] **Step 3: Document GitHub environments**

List required reviewer, prevent-self-review, main-only policy, bypass restriction, variable names, and secret names for each environment.

- [ ] **Step 4: Replace aspirational rollback prose**

Document rollback inputs, obtaining the source run/artifact identity and manifest digest, first-release maintenance response, previous backend commit redeployment, forward compensating migrations, backup proof, restore rehearsal, containment, and exit criteria.

- [ ] **Step 5: Update retention and release checklists**

Require the named pg_cron job, last success, cleanup rehearsal, 90-day artifact retention, two approvals, and immutable artifact verification.

- [ ] **Step 6: Self-review and commit**

Scan for values, placeholders, conflicting scopes, old-release rebuilds, and any wording treating the load project as production.

    git add .env.example docs/operations
    git commit -m "docs: make deployment and rollback procedures executable"

### Task 8: Full verification and readiness audit

**Files:**
- Modify only files needed to fix failures caused by this plan.

**Interfaces:**
- Consumes: the complete remediation branch.
- Produces: fresh local evidence and an external-configuration checklist.

- [ ] **Step 1: Run static and unit gates**

    pnpm check:repo
    pnpm check:deployment
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm test:functions
    pnpm test:load

- [ ] **Step 2: Run Edge and database gates**

    deno check supabase/functions/*/index.ts
    pnpm exec supabase start
    pnpm exec supabase db reset
    pnpm exec supabase test db

Export only local credentials, serve local Functions with synthetic secrets, and run pnpm test:integration.

- [ ] **Step 3: Run browser and artifact gates**

    pnpm build
    pnpm check:bundle
    pnpm playwright test
    node scripts/pages-artifact.mjs create dist --commit 47835657d3705d3d756a9e84f120679eb77aa988 --run-id local-verification
    node scripts/pages-artifact.mjs verify dist --expected-commit 47835657d3705d3d756a9e84f120679eb77aa988

- [ ] **Step 4: Stop local services and inspect state**

    pnpm exec supabase stop --no-backup
    git diff --check
    git status --short
    git log --oneline --decorate -10

- [ ] **Step 5: Perform spec coverage review**

Confirm each design criterion has evidence. Report environment creation, real variable/secret population, production backup evidence, non-production rollback rehearsal, live load evidence, and approvals as external work not performed.

- [ ] **Step 6: Commit verification-only corrections if needed**

Stage only files corrected by verification and commit with:

    git commit -m "fix: close deployment verification gaps"
