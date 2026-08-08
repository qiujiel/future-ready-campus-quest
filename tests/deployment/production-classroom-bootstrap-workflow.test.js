import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { validateProductionClassroomBootstrapConfiguration } from
  "../../scripts/production-classroom-bootstrap-config.mjs";

const workflowPath = resolve(
  process.cwd(),
  ".github/workflows/production-classroom-bootstrap.yml",
);

async function loadWorkflow() {
  return load(await readFile(workflowPath, "utf8"));
}

describe("production classroom bootstrap workflow", () => {
  it("is immutable, main-only, approval-gated, and exact-targeted", async () => {
    const workflow = await loadWorkflow();
    expect(() =>
      validateProductionClassroomBootstrapConfiguration(workflow)
    ).not.toThrow();
  });

  it("rejects a workflow that maps production to the load project", async () => {
    const workflow = await loadWorkflow();
    workflow.jobs.bootstrap.env.PRODUCTION_SUPABASE_PROJECT_REF =
      "${{ vars.LOAD_SUPABASE_PROJECT_REF }}";
    expect(() => validateProductionClassroomBootstrapConfiguration(workflow))
      .toThrow(/production project/i);
  });

  it("rejects a workflow without the exact 90-day authorization", async () => {
    const workflow = await loadWorkflow();
    workflow.jobs.bootstrap.steps[0].run = workflow.jobs.bootstrap.steps[0].run
      .replace('test "$RETENTION_DAYS" = "90"', 'test -n "$RETENTION_DAYS"');
    expect(() => validateProductionClassroomBootstrapConfiguration(workflow))
      .toThrow(/identity validation/i);
  });

  it("rejects legacy production service-role credentials", async () => {
    const workflow = await loadWorkflow();
    const bootstrap = workflow.jobs.bootstrap.steps.find((step) =>
      step.name === "Bootstrap the closed production classroom"
    );
    bootstrap.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY =
      "${{ secrets.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY }}";
    expect(() => validateProductionClassroomBootstrapConfiguration(workflow))
      .toThrow(/legacy service-role/i);
  });

  it("rejects protected bootstrap artifacts", async () => {
    const workflow = await loadWorkflow();
    workflow.jobs.bootstrap.steps.push({
      uses: "actions/upload-artifact@50769540e7f4bd5e21e526ee35c689e35e0d6874",
      with: { path: "/tmp/campus-quest-classroom-bootstrap.json" },
    });
    expect(() => validateProductionClassroomBootstrapConfiguration(workflow))
      .toThrow(/artifact/i);
  });

  it("rejects bootstrap mutation before source verification", async () => {
    const workflow = await loadWorkflow();
    const steps = workflow.jobs.bootstrap.steps;
    const mutationIndex = steps.findIndex((step) =>
      step.name === "Bootstrap the closed production classroom"
    );
    const [mutation] = steps.splice(mutationIndex, 1);
    steps.splice(1, 0, mutation);
    expect(() => validateProductionClassroomBootstrapConfiguration(workflow))
      .toThrow(/verification must precede/i);
  });

  it("rejects missing always-run receipt cleanup", async () => {
    const workflow = await loadWorkflow();
    workflow.jobs.bootstrap.steps = workflow.jobs.bootstrap.steps.filter(
      (step) => step.name !== "Remove temporary bootstrap receipt",
    );
    expect(() => validateProductionClassroomBootstrapConfiguration(workflow))
      .toThrow(/cleanup/i);
  });

  it("rejects shell tracing in the protected job", async () => {
    const workflow = await loadWorkflow();
    workflow.jobs.bootstrap.steps[0].run =
      `set -x\n${workflow.jobs.bootstrap.steps[0].run}`;
    expect(() => validateProductionClassroomBootstrapConfiguration(workflow))
      .toThrow(/environment printing/i);
  });
});
