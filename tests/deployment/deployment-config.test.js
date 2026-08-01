import { describe, expect, it } from "vitest";
import {
  validateDeploymentConfiguration,
} from "../../scripts/deployment-config.mjs";

const pinnedCheckout =
  "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09";

function validConfiguration() {
  return {
    backend: {
      on: {
        workflow_dispatch: {
          inputs: {
            expected_sha: { required: true },
            production_project_ref: { required: true },
          },
        },
      },
      jobs: {
        release: {
          environment: "production-backend",
          permissions: { contents: "read" },
          steps: [
            { uses: pinnedCheckout },
            {
              env: {
                LOAD_SUPABASE_PROJECT_REF:
                  "${{ vars.LOAD_SUPABASE_PROJECT_REF }}",
                PRODUCTION_SUPABASE_PROJECT_REF:
                  "${{ vars.PRODUCTION_SUPABASE_PROJECT_REF }}",
              },
              run: "test \"$PRODUCTION_SUPABASE_PROJECT_REF\" != \"$LOAD_SUPABASE_PROJECT_REF\"\ntest \"$PRODUCTION_SUPABASE_PROJECT_REF\" != vadyhuipwbtgbzpeisbn",
            },
            { run: "supabase migration list --linked" },
            { run: "supabase db push --dry-run --linked" },
            { run: "supabase db push --linked" },
            { run: "supabase secrets set --env-file /tmp/functions.env" },
            { run: "supabase functions deploy --project-ref \"$PRODUCTION_SUPABASE_PROJECT_REF\"" },
            {
              run: "response_code=$(curl --silent --output /dev/null --write-out '%{http_code}' --header 'Origin: http://127.0.0.1:4173' http://127.0.0.1/functions/v1/join-cohort)\nif [ \"$response_code\" = \"405\" ]; then break; fi",
            },
            {
              run: "deno check --frozen --config supabase/functions/deno.json --lock supabase/functions/deno.lock supabase/functions/*/index.ts",
            },
          ],
        },
      },
    },
    pages: {
      jobs: {
        package: {
          permissions: { contents: "read" },
          steps: [
            { uses: pinnedCheckout },
            {
              run: "response_code=$(curl --silent --output /dev/null --write-out '%{http_code}' --header 'Origin: http://127.0.0.1:4173' http://127.0.0.1/functions/v1/join-cohort)\nif [ \"$response_code\" = \"405\" ]; then break; fi",
            },
            {
              run: "deno check --frozen --config supabase/functions/deno.json --lock supabase/functions/deno.lock supabase/functions/*/index.ts",
            },
            {
              id: "pages-artifact",
              uses:
                "actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b",
              with: { path: "dist", "retention-days": 90 },
            },
          ],
        },
        preflight: {
          needs: "package",
          environment: "production-readiness",
          steps: [
            {
              uses:
                "actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0",
              with: { "artifact-ids": "${{ needs.package.outputs.artifact_id }}" },
            },
          ],
        },
        deploy: {
          needs: "preflight",
          environment: "github-pages",
          permissions: { pages: "write", "id-token": "write" },
          steps: [
            {
              uses:
                "actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e",
            },
          ],
        },
      },
    },
    rollback: {
      on: {
        workflow_dispatch: {
          inputs: {
            source_run_id: { required: true },
            expected_commit_sha: { required: true },
            expected_manifest_digest: { required: true },
          },
        },
      },
      jobs: {
        prepare: {
          permissions: { actions: "read", contents: "read" },
          steps: [
            {
              uses:
                "actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0",
            },
            {
              uses:
                "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
            },
          ],
        },
        deploy: {
          needs: "prepare",
          environment: "github-pages",
          permissions: { pages: "write", "id-token": "write" },
          steps: [
            {
              uses:
                "actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e",
            },
          ],
        },
      },
    },
  };
}

describe("deployment workflow boundaries", () => {
  it("accepts separated, least-privilege, immutable release workflows", () => {
    expect(() => validateDeploymentConfiguration(validConfiguration())).not
      .toThrow();
  });

  it("rejects a backend workflow that does not compare the load project", () => {
    const configuration = validConfiguration();
    configuration.backend.jobs.release.steps[1].run =
      "test \"$PRODUCTION_SUPABASE_PROJECT_REF\" != vadyhuipwbtgbzpeisbn";

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
      /full commit SHA/i,
    );
  });

  it("rejects elevated Pages packaging permissions", () => {
    const configuration = validConfiguration();
    configuration.pages.jobs.package.permissions.pages = "write";

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /package job.*contents: read/i,
    );
  });

  it("rejects rollback-expiring Pages artifacts", () => {
    const configuration = validConfiguration();
    configuration.pages.jobs.package.steps.find((step) =>
      step.uses?.startsWith("actions/upload-pages-artifact@")
    ).with["retention-days"] = 1;

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /90-day retention/i,
    );
  });

  it("rejects an Edge readiness wait that accepts a startup 503", () => {
    const configuration = validConfiguration();
    configuration.pages.jobs.package.steps[1].run =
      "if curl --silent http://127.0.0.1/functions/v1/join-cohort; then break; fi";

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /Edge readiness.*405/i,
    );
  });

  it("rejects Edge checks without the committed frozen Deno lock", () => {
    const configuration = validConfiguration();
    const denoStep = configuration.backend.jobs.release.steps.find((step) =>
      step.run?.startsWith("deno check")
    );
    denoStep.run = "deno check supabase/functions/*/index.ts";

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /frozen Deno dependency graph/i,
    );
  });
});
