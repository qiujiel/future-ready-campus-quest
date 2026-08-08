import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import {
  readLoadBootstrapConfiguration,
} from "../../scripts/load-test-bootstrap.mjs";
import {
  validateLoadTestBootstrapConfiguration,
} from "../../scripts/deployment-config.mjs";

const root = resolve(import.meta.dirname, "../..");
const loadRef = "vadyhuipwbtgbzpeisbn";
const productionRef = "ghohuwwjxgjqnbsauvzq";

describe("dedicated load-test bootstrap", () => {
  it("accepts only the dedicated load project and exact production exclusion", () => {
    expect(readLoadBootstrapConfiguration({
      LOAD_SUPABASE_PROJECT_REF: loadRef,
      PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
      SUPABASE_ACCESS_TOKEN: "token",
    })).toMatchObject({ projectRef: loadRef, productionRef });
  });

  it.each([productionRef, "abcdefghijklmnopqrst"])(
    "rejects unsafe load target %s",
    (unsafeRef) => {
      expect(() => readLoadBootstrapConfiguration({
        LOAD_SUPABASE_PROJECT_REF: unsafeRef,
        PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
        SUPABASE_ACCESS_TOKEN: "token",
      })).toThrow(/dedicated load-test project/i);
    },
  );

  it("pins the one-time workflow to main and the protected backend token scope", async () => {
    const workflow = load(await readFile(resolve(
      root,
      ".github/workflows/load-test-bootstrap.yml",
    ), "utf8"));
    const job = workflow.jobs.bootstrap;
    const serialized = JSON.stringify(workflow);

    expect(job.environment).toBe("production-backend");
    expect(job.if).toContain("refs/heads/main");
    expect(serialized).toContain(loadRef);
    expect(serialized).toContain(productionRef);
    expect(serialized).toContain("scripts/load-test-bootstrap.mjs");
    expect(serialized).toContain("supabase functions deploy");
    expect(serialized).not.toContain("PRODUCTION_SUPABASE_SECRET_KEY");
    expect(serialized).not.toContain("PRODUCTION_SUPABASE_DB_PASSWORD");
    expect(serialized).not.toContain("LOAD_SUPABASE_SECRET_KEY");
    expect(() => validateLoadTestBootstrapConfiguration(workflow)).not.toThrow();
  });

  it("rejects a bootstrap workflow that can receive a production secret key", async () => {
    const workflow = load(await readFile(resolve(
      root,
      ".github/workflows/load-test-bootstrap.yml",
    ), "utf8"));
    workflow.jobs.bootstrap.steps[0].env.PRODUCTION_SUPABASE_SECRET_KEY =
      "${{ secrets.PRODUCTION_SUPABASE_SECRET_KEY }}";

    expect(() => validateLoadTestBootstrapConfiguration(workflow)).toThrow(
      /must not receive production or load application keys/i,
    );
  });
});
