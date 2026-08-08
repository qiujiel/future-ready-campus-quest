import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  validateProductionJoinLatencyFixConfiguration,
} from "../../scripts/deployment-config.mjs";

const root = resolve(import.meta.dirname, "../..");
const productionRef = "ghohuwwjxgjqnbsauvzq";
const loadRef = "vadyhuipwbtgbzpeisbn";
const reviewedBaseline = "d456c2dc3f04386597d73d71124bb7a4c5ae1329";

describe("production join-latency Function fix", () => {
  it("deploys only the reviewed join Function to the exact production target", async () => {
    const workflow = load(await readFile(resolve(
      root,
      ".github/workflows/production-join-latency-fix.yml",
    ), "utf8"));
    const job = workflow.jobs.deploy_fix;
    const serialized = JSON.stringify(workflow);

    expect(job.environment).toBe("production-backend");
    expect(job.if).toContain("refs/heads/main");
    expect(job.permissions).toEqual({ contents: "read" });
    expect(serialized).toContain(productionRef);
    expect(serialized).toContain(loadRef);
    expect(serialized).toContain(reviewedBaseline);
    expect(serialized).toContain("functions deploy join-cohort");
    expect(serialized).toContain("SUPABASE_ACCESS_TOKEN");
    expect(serialized).toContain("PRODUCTION_READINESS_SECRET");
    expect(serialized).not.toContain("PRODUCTION_SUPABASE_SECRET_KEY");
    expect(serialized).not.toContain("PRODUCTION_SUPABASE_DB_PASSWORD");
    expect(serialized).not.toContain("LOAD_SUPABASE_SECRET_KEY");
    expect(() =>
      validateProductionJoinLatencyFixConfiguration(workflow)
    ).not.toThrow();
  });
});
