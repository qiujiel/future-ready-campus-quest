import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import {
  readProductionNatFixConfiguration,
} from "../../scripts/production-classroom-nat-fix.mjs";
import {
  validateProductionClassroomNatFixConfiguration,
} from "../../scripts/deployment-config.mjs";

const root = resolve(import.meta.dirname, "../..");
const productionRef = "ghohuwwjxgjqnbsauvzq";
const loadRef = "vadyhuipwbtgbzpeisbn";

describe("production classroom NAT join fix", () => {
  it("accepts only the exact production project and excludes load-test", () => {
    expect(readProductionNatFixConfiguration({
      PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
      LOAD_SUPABASE_PROJECT_REF: loadRef,
      SUPABASE_ACCESS_TOKEN: "token",
    })).toMatchObject({ projectRef: productionRef, loadProjectRef: loadRef });
  });

  it.each([loadRef, "abcdefghijklmnopqrst"])(
    "rejects unsafe production target %s",
    (unsafeRef) => {
      expect(() => readProductionNatFixConfiguration({
        PRODUCTION_SUPABASE_PROJECT_REF: unsafeRef,
        LOAD_SUPABASE_PROJECT_REF: loadRef,
        SUPABASE_ACCESS_TOKEN: "token",
      })).toThrow(/exact production project/i);
    },
  );

  it("uses guarded classroom forward migrations and no application credential", async () => {
    const workflow = load(await readFile(resolve(
      root,
      ".github/workflows/production-classroom-nat-fix.yml",
    ), "utf8"));
    const job = workflow.jobs.apply_fix;
    const serialized = JSON.stringify(workflow);

    expect(job.environment).toBe("production-backend");
    expect(job.if).toContain("refs/heads/main");
    expect(serialized).toContain(productionRef);
    expect(serialized).toContain(loadRef);
    expect(serialized).toContain("scripts/production-classroom-nat-fix.mjs");
    expect(serialized).toContain("reviewed forward migrations");
    expect(serialized).toContain("SUPABASE_ACCESS_TOKEN");
    expect(serialized).not.toContain("PRODUCTION_SUPABASE_SECRET_KEY");
    expect(serialized).not.toContain("PRODUCTION_SUPABASE_DB_PASSWORD");
    expect(serialized).not.toContain("LOAD_SUPABASE_SECRET_KEY");
    expect(() =>
      validateProductionClassroomNatFixConfiguration(workflow)
    ).not.toThrow();
  });

  it("matches PostgreSQL's normalized lowercase lock clauses", async () => {
    const script = await readFile(resolve(
      root,
      "scripts/production-classroom-nat-fix.mjs",
    ), "utf8");

    expect(script).toContain("'for share of codes, windows'");
    expect(script).toContain("'for update of groups'");
    expect(script).not.toContain("'FOR SHARE OF codes, windows'");
    expect(script).not.toContain("'FOR UPDATE OF groups'");
  });

  it("includes and verifies the combined join-preparation migration", async () => {
    const script = await readFile(resolve(
      root,
      "scripts/production-classroom-nat-fix.mjs",
    ), "utf8");

    expect(script).toContain("20260808000300_combined_join_preparation.sql");
    expect(script).toContain("prepare_student_code_join(text,uuid,text)");
    expect(script).toContain('3 = (');
    expect(script).toContain('combinedPreparationReady');
  });
});
