import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { validateProductionContentImportConfiguration } from
  "../../scripts/production-content-import-config.mjs";

const workflowPath = resolve(
  process.cwd(),
  ".github/workflows/production-content-import.yml",
);

async function loadWorkflow() {
  return load(await readFile(workflowPath, "utf8"));
}

describe("production protected-content import workflow", () => {
  it("is main-only, approval-gated, immutable, and production-targeted", async () => {
    const workflow = await loadWorkflow();
    expect(() =>
      validateProductionContentImportConfiguration(workflow)
    ).not.toThrow();
  });

  it("rejects a workflow that can target the load-test project", async () => {
    const workflow = await loadWorkflow();
    workflow.jobs.import.env.PRODUCTION_SUPABASE_PROJECT_REF =
      "${{ vars.LOAD_SUPABASE_PROJECT_REF }}";

    expect(() => validateProductionContentImportConfiguration(workflow))
      .toThrow(/production project/i);
  });

  it("rejects a workflow that exposes protected content as an artifact", async () => {
    const workflow = await loadWorkflow();
    workflow.jobs.import.steps.push({
      uses: "actions/upload-artifact@50769540e7f4bd5e21e526ee35c689e35e0d6874",
      with: { path: "/tmp/campus-quest-protected-content.json" },
    });

    expect(() => validateProductionContentImportConfiguration(workflow))
      .toThrow(/artifact/i);
  });

  it("rejects legacy production service-role credentials", async () => {
    const workflow = await loadWorkflow();
    workflow.jobs.import.steps[0].env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY =
      "${{ secrets.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY }}";

    expect(() => validateProductionContentImportConfiguration(workflow))
      .toThrow(/legacy service-role/i);
  });

  it("rejects a workflow without the exact approved content version", async () => {
    const workflow = await loadWorkflow();
    workflow.jobs.import.steps[0].run = workflow.jobs.import.steps[0].run
      .replace(
        'test "$EXPECTED_CONTENT_VERSION" = "2026-07-30-approved-blueprint-v1"',
        'test -n "$EXPECTED_CONTENT_VERSION"',
      );

    expect(() => validateProductionContentImportConfiguration(workflow))
      .toThrow(/identity validation/i);
  });
});
