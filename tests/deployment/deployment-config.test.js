import { describe, expect, it } from "vitest";
import {
  validateDeploymentConfiguration,
} from "../../scripts/deployment-config.mjs";

const pinnedCheckout =
  "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09";
const pinnedSetupNode =
  "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444";
const productionProjectRef = "ghohuwwjxgjqnbsauvzq";
const loadProjectRef = "vadyhuipwbtgbzpeisbn";
const productionUrl = `https://${productionProjectRef}.supabase.co`;
const identityScript = [
  "if ! printf '%s' \"$EXPECTED_SHA\" | grep -Eq '^[0-9a-f]{40}$'; then",
  "  echo \"expected_sha must be a full lowercase commit SHA\" >&2",
  "  exit 1",
  "fi",
  "test \"$EXPECTED_SHA\" = \"$GITHUB_SHA\"",
  "test \"$CONFIRMED_PROJECT_REF\" = \"$PRODUCTION_SUPABASE_PROJECT_REF\"",
  `test "$CONFIRMED_PROJECT_REF" = "${productionProjectRef}"`,
  `test "$PRODUCTION_SUPABASE_PROJECT_REF" = "${productionProjectRef}"`,
  `test "$LOAD_SUPABASE_PROJECT_REF" = "${loadProjectRef}"`,
  `test "$PRODUCTION_SUPABASE_URL" = "${productionUrl}"`,
  "test \"$PRODUCTION_SUPABASE_PROJECT_REF\" != \"$LOAD_SUPABASE_PROJECT_REF\"",
].join("\n");

const authorizationValidatorStep = (configuration) =>
  configuration.backend.jobs.validate_release_authorization.steps.find((step) =>
    step.run?.includes("production-release-authorization.mjs")
  );

const bootstrapPreflightStep = (configuration) =>
  configuration.backend.jobs.release.steps.find((step) =>
    step.name === "Verify empty production bootstrap state"
  );

const identityStep = (configuration) =>
  configuration.backend.jobs.release.steps.find((step) =>
    step.name === "Validate protected release identity"
  );

function validConfiguration() {
  return {
    ci: {
      permissions: { contents: "read", "pull-requests": "read" },
      jobs: {
        secrets: {
          steps: [
            {
              uses: "gitleaks/gitleaks-action@v2",
              env: {
                GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
              },
            },
          ],
        },
      },
    },
    backend: {
      on: {
        workflow_dispatch: {
          inputs: {
            expected_sha: { required: true },
            production_project_ref: { required: true },
            release_mode: {
              description: "Release authorization mode",
              required: true,
              type: "choice",
              default: "upgrade",
              options: ["upgrade", "bootstrap"],
            },
            bootstrap_authorization_id: {
              description: "Redaction-safe bootstrap authorization identifier",
              required: false,
              type: "string",
            },
            backup_evidence_id: {
              description: "Redaction-safe backup evidence identifier",
              required: false,
              type: "string",
            },
            backup_created_at_utc: {
              description: "Redaction-safe UTC backup completion timestamp",
              required: false,
              type: "string",
            },
            backup_archive_sha256: {
              description: "Redaction-safe SHA-256 for the backup archive",
              required: false,
              type: "string",
            },
            restore_rehearsal_evidence_id: {
              description:
                "Redaction-safe restore rehearsal evidence identifier",
              required: false,
              type: "string",
            },
          },
        },
      },
      jobs: {
        validate_release_authorization: {
          if: "github.ref == 'refs/heads/main'",
          "runs-on": "ubuntu-latest",
          "timeout-minutes": 5,
          permissions: { contents: "read" },
          steps: [
            {
              name: "Check out the approved source",
              uses: pinnedCheckout,
              with: {
                ref: "${{ github.sha }}",
                "fetch-depth": 0,
                "persist-credentials": false,
              },
            },
            {
              name: "Set up Node",
              uses: pinnedSetupNode,
              with: { "node-version": 24 },
            },
            {
              name: "Validate redaction-safe release authorization",
              env: {
                RELEASE_MODE: "${{ inputs.release_mode }}",
                BOOTSTRAP_AUTHORIZATION_ID:
                  "${{ inputs.bootstrap_authorization_id }}",
                BACKUP_EVIDENCE_ID: "${{ inputs.backup_evidence_id }}",
                BACKUP_CREATED_AT_UTC: "${{ inputs.backup_created_at_utc }}",
                BACKUP_ARCHIVE_SHA256:
                  "${{ inputs.backup_archive_sha256 }}",
                RESTORE_REHEARSAL_EVIDENCE_ID:
                  "${{ inputs.restore_rehearsal_evidence_id }}",
              },
              run: "node scripts/production-release-authorization.mjs",
            },
          ],
        },
        release: {
          if: "github.ref == 'refs/heads/main'",
          needs: "validate_release_authorization",
          environment: "production-backend",
          permissions: { contents: "read" },
          env: {
            LOAD_SUPABASE_PROJECT_REF:
              "${{ vars.LOAD_SUPABASE_PROJECT_REF }}",
            PRODUCTION_SUPABASE_PROJECT_REF:
              "${{ vars.PRODUCTION_SUPABASE_PROJECT_REF }}",
            PRODUCTION_SUPABASE_URL: "${{ vars.VITE_SUPABASE_URL }}",
            RELEASE_MODE: "${{ inputs.release_mode }}",
            BOOTSTRAP_AUTHORIZATION_ID:
              "${{ inputs.bootstrap_authorization_id }}",
          },
          steps: [
            { uses: pinnedCheckout },
            {
              name: "Validate protected release identity",
              env: {
                CONFIRMED_PROJECT_REF:
                  "${{ inputs.production_project_ref }}",
              },
              run: identityScript,
            },
            {
              name: "Link the confirmed production project",
              run: "supabase link --project-ref \"$PRODUCTION_SUPABASE_PROJECT_REF\"",
            },
            {
              name: "Verify empty production bootstrap state",
              if: "${{ inputs.release_mode == 'bootstrap' }}",
              env: {
                BOOTSTRAP_AUTHORIZATION_ID:
                  "${{ inputs.bootstrap_authorization_id }}",
                PRODUCTION_SUPABASE_SECRET_KEY:
                  "${{ secrets.PRODUCTION_SUPABASE_SECRET_KEY }}",
                SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
              },
              run: "node scripts/production-bootstrap-preflight.mjs",
            },
            { run: "supabase migration list --linked" },
            { run: "supabase db push --dry-run --linked" },
            { run: "supabase db push --linked" },
            {
              run: [
                "node scripts/production-function-config.mjs",
                "supabase secrets set --env-file /tmp/functions.env",
              ].join("\n"),
            },
            { run: "supabase functions deploy --project-ref \"$PRODUCTION_SUPABASE_PROJECT_REF\"" },
            {
              run: "for readiness_function in join-cohort recover-student; do response_code=$(curl --silent --output /dev/null --write-out '%{http_code}' --header 'Origin: http://127.0.0.1:4173' http://127.0.0.1/functions/v1/$readiness_function); if [ \"$response_code\" = \"405\" ]; then break; fi; done",
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
              run: "for readiness_function in join-cohort recover-student; do response_code=$(curl --silent --output /dev/null --write-out '%{http_code}' --header 'Origin: http://127.0.0.1:4173' http://127.0.0.1/functions/v1/$readiness_function); if [ \"$response_code\" = \"405\" ]; then break; fi; done",
            },
            {
              run: "deno check --frozen --config supabase/functions/deno.json --lock supabase/functions/deno.lock supabase/functions/*/index.ts",
            },
            {
              env: {
                LOAD_SUPABASE_PROJECT_REF:
                  "${{ vars.LOAD_SUPABASE_PROJECT_REF }}",
              },
              run: "pnpm test:load:live",
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
          env: {
            PRODUCTION_READINESS_SECRET:
              "${{ secrets.PRODUCTION_READINESS_SECRET }}",
          },
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

  it("requires the automatic GitHub token for pull-request secret scans", () => {
    const configuration = validConfiguration();
    delete configuration.ci.jobs.secrets.steps[0].env.GITHUB_TOKEN;

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /Gitleaks scan requires only the automatic GitHub token/i,
    );
  });

  it("requires read-only pull-request access for secret scans", () => {
    const configuration = validConfiguration();
    delete configuration.ci.permissions["pull-requests"];

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /CI workflow requires contents and pull-requests read permission/i,
    );
  });

  it("rejects additional secret material in the Gitleaks step", () => {
    const configuration = validConfiguration();
    configuration.ci.jobs.secrets.steps[0].env.EXTRA_SECRET =
      "${{ secrets.PRODUCTION_READINESS_SECRET }}";

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /Gitleaks scan requires only the automatic GitHub token/i,
    );
  });

  it("rejects a backend workflow missing release authorization inputs", () => {
    const configuration = validConfiguration();
    delete configuration.backend.on.workflow_dispatch.inputs.backup_archive_sha256;
    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /canonical release workflow input backup_archive_sha256/i,
    );
  });

  it.each([
    ["default", (input) => {
      input.default = "bootstrap";
    }],
    ["choice options", (input) => {
      input.options = ["upgrade"];
    }],
    ["option order", (input) => {
      input.options.reverse();
    }],
    ["missing type", (input) => {
      delete input.type;
    }],
    ["wrong type", (input) => {
      input.type = "string";
    }],
    ["extra field", (input) => {
      input.unexpected = true;
    }],
  ])("rejects a release mode input with %s", (_scope, mutate) => {
    const configuration = validConfiguration();
    mutate(configuration.backend.on.workflow_dispatch.inputs.release_mode);

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /canonical release workflow input release_mode/i,
    );
  });

  it.each([
    ["default", (input) => {
      input.default = "evidence-already-present";
    }],
    ["choice options", (input) => {
      input.type = "choice";
      input.options = ["evidence-already-present"];
    }],
    ["missing type", (input) => {
      delete input.type;
    }],
    ["wrong type", (input) => {
      input.type = "boolean";
    }],
    ["extra field", (input) => {
      input.unexpected = true;
    }],
  ])("rejects a release workflow input with %s", (_scope, mutate) => {
    const configuration = validConfiguration();
    mutate(
      configuration.backend.on.workflow_dispatch.inputs.backup_evidence_id,
    );

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /canonical release workflow input backup_evidence_id/i,
    );
  });

  it("rejects release without the release authorization dependency", () => {
    const configuration = validConfiguration();
    delete configuration.backend.jobs.release.needs;
    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /release authorization.*dependency/i,
    );
  });

  it("rejects a release condition that can run after release authorization validation fails", () => {
    const configuration = validConfiguration();
    configuration.backend.jobs.release.if =
      "${{ always() && github.ref == 'refs/heads/main' }}";

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /release must require successful release authorization validation/i,
    );
  });

  it("rejects a protected or secret-bearing release authorization job", () => {
    const protectedConfiguration = validConfiguration();
    protectedConfiguration.backend.jobs.validate_release_authorization.environment =
      "production-backend";
    expect(() => validateDeploymentConfiguration(protectedConfiguration)).toThrow(
      /release authorization validation.*unprotected/i,
    );

    const secretConfiguration = validConfiguration();
    authorizationValidatorStep(secretConfiguration).env.EXTRA =
      "${{ secrets.PRODUCTION_SUPABASE_DB_PASSWORD }}";
    expect(() => validateDeploymentConfiguration(secretConfiguration)).toThrow(
      /release authorization validation.*secret/i,
    );
  });

  it("rejects release authorization validation with non-read-only permissions", () => {
    const configuration = validConfiguration();
    configuration.backend.jobs.validate_release_authorization.permissions.actions =
      "write";

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /only contents: read/i,
    );
  });

  it.each([
    ["validation job", (configuration) => {
      configuration.backend.jobs.validate_release_authorization[
        "continue-on-error"
      ] = true;
    }],
    ["validator step", (configuration) => {
      authorizationValidatorStep(configuration)["continue-on-error"] = true;
    }],
  ])("rejects continue-on-error on the release authorization %s", (_scope, mutate) => {
    const configuration = validConfiguration();
    mutate(configuration);

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /release authorization validation must be fail-closed/i,
    );
  });

  it("rejects a conditional validator step that can skip release authorization validation", () => {
    const configuration = validConfiguration();
    authorizationValidatorStep(configuration).if = false;

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /release authorization validator must run unconditionally/i,
    );
  });

  it("rejects a missing or echo-only validator invocation", () => {
    const missingConfiguration = validConfiguration();
    authorizationValidatorStep(missingConfiguration).run = "true";
    expect(() => validateDeploymentConfiguration(missingConfiguration)).toThrow(
      /run the repository validator/i,
    );

    const echoConfiguration = validConfiguration();
    authorizationValidatorStep(echoConfiguration).run =
      "echo node scripts/production-release-authorization.mjs";
    expect(() => validateDeploymentConfiguration(echoConfiguration)).toThrow(
      /run the repository validator/i,
    );
  });

  it("rejects a pre-validator step that can replace the repository validator", () => {
    const configuration = validConfiguration();
    configuration.backend.jobs.validate_release_authorization.steps.splice(2, 0, {
      run: "printf 'process.exit(0)\\n' > scripts/production-release-authorization.mjs",
    });

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /canonical ordered evidence steps/i,
    );
  });

  it.each([
    ["post-validator step", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps.push({
        run: "true",
      });
    }],
    ["checkout ref", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps[0].with.ref =
        "${{ github.ref }}";
    }],
    ["checkout depth", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps[0].with[
        "fetch-depth"
      ] = 1;
    }],
    ["checkout credential persistence omission", (configuration) => {
      delete configuration.backend.jobs.validate_release_authorization.steps[0]
        .with["persist-credentials"];
    }],
    ["checkout credential persistence", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps[0].with[
        "persist-credentials"
      ] = true;
    }],
    ["checkout redirected path", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps[0].with.path =
        "/tmp/redirected-checkout";
    }],
    ["checkout disabled cleanup", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps[0].with.clean =
        false;
    }],
    ["checkout Git LFS", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps[0].with.lfs =
        true;
    }],
    ["checkout submodules", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps[0].with.submodules =
        true;
    }],
    ["checkout sparse selection", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps[0].with[
        "sparse-checkout"
      ] = "scripts";
    }],
    ["Node version", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps[1].with[
        "node-version"
      ] = 22;
    }],
    ["step order", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps.reverse();
    }],
  ])("rejects a non-canonical release authorization %s", (_scope, mutate) => {
    const configuration = validConfiguration();
    mutate(configuration);

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /canonical ordered evidence steps/i,
    );
  });

  it.each([
    ["workflow NODE_OPTIONS", (configuration) => {
      configuration.backend.env = {
        NODE_OPTIONS: "--require ./bypass.cjs",
      };
    }],
    ["validation-job NODE_OPTIONS", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.env = {
        NODE_OPTIONS: "--require ./bypass.cjs",
      };
    }],
    ["workflow working directory", (configuration) => {
      configuration.backend.defaults = {
        run: { "working-directory": "/tmp/redirected-checkout" },
      };
    }],
    ["validation-job working directory", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.defaults = {
        run: { "working-directory": "/tmp/redirected-checkout" },
      };
    }],
  ])("rejects a %s inherited by release authorization validation", (_scope, mutate) => {
    const configuration = validConfiguration();
    mutate(configuration);

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /must not inherit execution overrides/i,
    );
  });

  it.each([
    ["runner", (configuration) => {
      configuration.backend.jobs.validate_release_authorization["runs-on"] =
        "self-hosted";
    }],
    ["container", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.container = {
        image: "example.invalid/redirected-node:latest",
      };
    }],
  ])("rejects a non-canonical release authorization job %s", (_scope, mutate) => {
    const configuration = validConfiguration();
    mutate(configuration);

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /canonical evidence job/i,
    );
  });

  it.each([
    ["workflow env using dot form", (configuration) => {
      configuration.backend.env = {
        INHERITED_SECRET:
          "${{ secrets.PRODUCTION_SUPABASE_DB_PASSWORD }}",
      };
    }],
    ["validation-job env using bracket form", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.env = {
        INHERITED_SECRET:
          '${{ secrets["PRODUCTION_SUPABASE_DB_PASSWORD"] }}',
      };
    }],
    ["validation-job defaults using toJSON", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.defaults = {
        run: { "working-directory": "${{ toJSON(secrets) }}" },
      };
    }],
    ["validation-step env using toJSON", (configuration) => {
      authorizationValidatorStep(configuration).env.EXTRA =
        "${{ toJSON(secrets) }}";
    }],
    ["validation-step run using toJSON", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps.unshift({
        run: "echo '${{ toJSON(secrets) }}'",
      });
    }],
    ["validation-step run with quoted closing braces before toJSON", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps.unshift({
        run: "echo \"${{ contains('}}', toJSON(secrets)) }}\"",
      });
    }],
    ["validation-step with using toJSON", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps[0].with = {
        token: "${{ toJSON(secrets) }}",
      };
    }],
    ["validation-step shell using toJSON", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.steps.unshift({
        run: "echo safe",
        shell: "${{ toJSON(secrets) }}",
      });
    }],
  ])("rejects a secrets context token in release authorization %s", (_scope, mutate) => {
    const configuration = validConfiguration();
    mutate(configuration);

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /release authorization validation.*secret/i,
    );
  });

  it.each([
    ["workflow default", (configuration) => {
      configuration.backend.defaults = { run: { shell: "bash {0}" } };
    }],
    ["validation-job default", (configuration) => {
      configuration.backend.jobs.validate_release_authorization.defaults = {
        run: { shell: "bash {0}" },
      };
    }],
    ["validator-step", (configuration) => {
      authorizationValidatorStep(configuration).shell = "bash {0}";
    }],
  ])("rejects a %s shell override around release authorization validation", (_scope, mutate) => {
    const configuration = validConfiguration();
    mutate(configuration);

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /release authorization validation.*shell override/i,
    );
  });

  it("rejects release authorization validation without every dispatch input mapping", () => {
    const configuration = validConfiguration();
    delete authorizationValidatorStep(configuration).env
      .RESTORE_REHEARSAL_EVIDENCE_ID;
    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /restore_rehearsal_evidence_id/i,
    );
  });

  it("rejects inexact or extra release input mappings", () => {
    const wrongInputConfiguration = validConfiguration();
    authorizationValidatorStep(wrongInputConfiguration).env.BACKUP_EVIDENCE_ID =
      "${{ inputs.restore_rehearsal_evidence_id }}";
    expect(() => validateDeploymentConfiguration(wrongInputConfiguration)).toThrow(
      /backup_evidence_id/i,
    );

    const extraMappingConfiguration = validConfiguration();
    authorizationValidatorStep(extraMappingConfiguration).env.EXTRA =
      "${{ inputs.backup_evidence_id }}";
    expect(() => validateDeploymentConfiguration(extraMappingConfiguration)).toThrow(
      /exactly six approved environment mappings/i,
    );
  });

  it("rejects release authorization validation without every release-mode mapping", () => {
    const configuration = validConfiguration();
    delete authorizationValidatorStep(configuration).env.RELEASE_MODE;

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /release_mode/i,
    );
  });

  it.each([
    ["condition", (step) => {
      step.if = "${{ inputs.release_mode != 'upgrade' }}";
    }],
    ["command", (step) => {
      step.run = "echo node scripts/production-bootstrap-preflight.mjs";
    }],
    ["missing authorization mapping", (step) => {
      delete step.env.BOOTSTRAP_AUTHORIZATION_ID;
    }],
    ["wrong secret-key mapping", (step) => {
      step.env.PRODUCTION_SUPABASE_SECRET_KEY =
        "${{ secrets.PRODUCTION_SUPABASE_DB_PASSWORD }}";
    }],
    ["extra mapping", (step) => {
      step.env.EXTRA = "${{ vars.PRODUCTION_SUPABASE_PROJECT_REF }}";
    }],
    ["continue on error", (step) => {
      step["continue-on-error"] = true;
    }],
  ])("rejects a non-canonical bootstrap preflight %s", (_scope, mutate) => {
    const configuration = validConfiguration();
    mutate(bootstrapPreflightStep(configuration));

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /canonical bootstrap preflight/i,
    );
  });

  it.each([
    ["migration list", "migration list"],
    ["migration dry-run", "db push --dry-run"],
    ["migration apply", "db push --linked"],
    ["Function secrets", "supabase secrets set"],
    ["Function deployment", "supabase functions deploy"],
  ])("rejects bootstrap preflight after %s", (_label, marker) => {
    const configuration = validConfiguration();
    const steps = configuration.backend.jobs.release.steps;
    const bootstrapIndex = steps.indexOf(bootstrapPreflightStep(configuration));
    const [bootstrap] = steps.splice(bootstrapIndex, 1);
    const markerIndex = steps.findIndex((step) =>
      String(step.run ?? "").includes(marker)
    );
    steps.splice(markerIndex + 1, 0, bootstrap);

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /bootstrap preflight must run after linking and before production mutations/i,
    );
  });

  it.each([
    [
      "production project",
      `test "$PRODUCTION_SUPABASE_PROJECT_REF" = "${productionProjectRef}"`,
      "test \"$PRODUCTION_SUPABASE_PROJECT_REF\" = \"wrongproductionref123\"",
      /exact production project/i,
    ],
    [
      "load project",
      `test "$LOAD_SUPABASE_PROJECT_REF" = "${loadProjectRef}"`,
      "test \"$LOAD_SUPABASE_PROJECT_REF\" = \"wrongloadprojectref123\"",
      /exact load project/i,
    ],
    [
      "production URL",
      `test "$PRODUCTION_SUPABASE_URL" = "${productionUrl}"`,
      `test "$PRODUCTION_SUPABASE_URL" = "https://${loadProjectRef}.supabase.co"`,
      /exact production URL/i,
    ],
  ])("rejects mutation of the exact %s assertion", (_label, required, mutation, error) => {
    const configuration = validConfiguration();
    identityStep(configuration).run = identityStep(configuration).run.replace(
      required,
      mutation,
    );

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(error);
  });

  it("rejects an echo-only production identity assertion", () => {
    const configuration = validConfiguration();
    const required =
      `test "$PRODUCTION_SUPABASE_PROJECT_REF" = "${productionProjectRef}"`;
    identityStep(configuration).run = identityStep(configuration).run.replace(
      required,
      `echo '${required}'`,
    );

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /exact production project/i,
    );
  });

  it("rejects fail-open shell semantics in production identity validation", () => {
    const configuration = validConfiguration();
    identityStep(configuration).run =
      `set +e\n${identityStep(configuration).run}`;

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /canonical fail-closed identity script/i,
    );
  });

  it.each([
    ["workflow", (configuration) => {
      configuration.backend.defaults = { run: { shell: "bash {0}" } };
    }, /release authorization validation.*shell override/i],
    ["release job", (configuration) => {
      configuration.backend.jobs.release.defaults = {
        run: { shell: "bash {0}" },
      };
    }, /canonical fail-closed identity execution/i],
    ["identity step", (configuration) => {
      identityStep(configuration).shell = "bash {0}";
    }, /canonical fail-closed identity execution/i],
  ])("rejects a %s shell override around production identity validation", (_scope, mutate, error) => {
    const configuration = validConfiguration();
    mutate(configuration);

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(error);
  });

  it("rejects continue-on-error for production identity validation", () => {
    const configuration = validConfiguration();
    identityStep(configuration)["continue-on-error"] = true;

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /canonical fail-closed identity execution/i,
    );
  });

  it("rejects a production mutation configured to run after identity failure", () => {
    const configuration = validConfiguration();
    configuration.backend.jobs.release.steps.find((step) =>
      step.run?.includes("supabase db push --linked")
    ).if = "always()";

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /production mutation must require successful identity validation/i,
    );
  });

  it("rejects production mutation steps before exact identity validation", () => {
    const configuration = validConfiguration();
    const steps = configuration.backend.jobs.release.steps;
    const validationIndex = steps.indexOf(identityStep(configuration));
    const [validation] = steps.splice(validationIndex, 1);
    const mutationIndex = steps.findIndex((step) =>
      String(step.run ?? "").includes("db push --linked")
    );
    steps.splice(mutationIndex + 1, 0, validation);

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /identity validation must precede production mutation/i,
    );
  });

  it("rejects a backend workflow that does not compare the load project", () => {
    const configuration = validConfiguration();
    identityStep(configuration).run = identityStep(configuration).run.replace(
      "test \"$PRODUCTION_SUPABASE_PROJECT_REF\" != \"$LOAD_SUPABASE_PROJECT_REF\"",
      "true",
    );

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /load project separation/i,
    );
  });

  it("rejects production Function secrets that bypass hosted URL validation", () => {
    const configuration = validConfiguration();
    const secretStep = configuration.backend.jobs.release.steps.find((step) =>
      step.run?.includes("supabase secrets set")
    );
    secretStep.run = secretStep.run.replace(
      "node scripts/production-function-config.mjs",
      "true",
    );

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /Function configuration validation.*secrets/i,
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

  it("rejects integration startup waits that omit recovery", () => {
    const configuration = validConfiguration();
    configuration.pages.jobs.package.steps[1].run =
      "response_code=$(curl --write-out '%{http_code}' --header 'Origin: test' http://127.0.0.1/functions/v1/join-cohort); test \"$response_code\" = 405";

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /join and recovery/i,
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

  it("rejects a live load gate without the dedicated project ref", () => {
    const configuration = validConfiguration();
    const liveLoad = configuration.pages.jobs.package.steps.find((step) =>
      step.run === "pnpm test:load:live"
    );
    delete liveLoad.env.LOAD_SUPABASE_PROJECT_REF;

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /live load.*project ref/i,
    );
  });

  it("rejects privileged Supabase credentials in the readiness job", () => {
    const configuration = validConfiguration();
    configuration.pages.jobs.preflight.env
      .PRODUCTION_SUPABASE_SECRET_KEY =
        "${{ secrets.PRODUCTION_SUPABASE_SECRET_KEY }}";

    expect(() => validateDeploymentConfiguration(configuration)).toThrow(
      /readiness.*privileged Supabase/i,
    );
  });
});
