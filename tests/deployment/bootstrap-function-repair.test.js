import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { validateBootstrapFunctionRepairConfiguration } from
  "../../scripts/bootstrap-function-repair-config.mjs";

const workflowPath = resolve(
  process.cwd(),
  ".github/workflows/bootstrap-function-repair.yml",
);

function configuration() {
  return load(readFileSync(workflowPath, "utf8"));
}

describe("one-time bootstrap Function repair", () => {
  it("accepts the exact fail-closed Function-only workflow", () => {
    expect(() => validateBootstrapFunctionRepairConfiguration(configuration()))
      .not.toThrow();
  });

  it("rejects every database or content mutation", () => {
    const workflow = configuration();
    workflow.jobs.repair.steps.push({ run: "supabase db push --linked" });
    expect(() => validateBootstrapFunctionRepairConfiguration(workflow))
      .toThrow(/database or content mutation/i);
  });

  it("is bound to the recorded failed bootstrap run", () => {
    const workflow = configuration();
    const identity = workflow.jobs.repair.steps.find((step) =>
      step.name === "Validate one-time repair identity"
    );
    identity.run = identity.run.replace("31188390434", "31188390435");
    expect(() => validateBootstrapFunctionRepairConfiguration(workflow))
      .toThrow(/failed bootstrap run/i);
  });

  it("requires the protected production environment and modern secret", () => {
    const wrongEnvironment = configuration();
    wrongEnvironment.jobs.repair.environment = "github-pages";
    expect(() => validateBootstrapFunctionRepairConfiguration(wrongEnvironment))
      .toThrow(/production-backend/i);

    const missingSecret = configuration();
    const secretStep = missingSecret.jobs.repair.steps.find((step) =>
      String(step.run ?? "").includes("supabase secrets set")
    );
    delete secretStep.env.PRODUCTION_SUPABASE_SECRET_KEY;
    expect(() => validateBootstrapFunctionRepairConfiguration(missingSecret))
      .toThrow(/modern secret/i);
  });
});
