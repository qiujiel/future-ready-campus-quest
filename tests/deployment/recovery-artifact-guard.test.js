import { describe, expect, it } from "vitest";
import { forbiddenRecoveryArtifactPaths } from
  "../../scripts/recovery-artifact-guard.mjs";

describe("recovery artifact repository guard", () => {
  it("rejects encrypted packages, dumps, manifests, and recovery directories", () => {
    expect(forbiddenRecoveryArtifactPaths([
      "private/frcq-backup.age",
      "roles.sql",
      "data.sql",
      "history_schema.sql",
      "history_data.sql",
      "storage-manifest.json",
      "tmp/recovery-package/objects/opaque.webp",
      "archive/project.backup",
      "archive/project.dump",
    ])).toHaveLength(9);
  });

  it("allows migrations, recovery documentation, and public fixtures", () => {
    expect(forbiddenRecoveryArtifactPaths([
      "supabase/migrations/20260730021100_production_readiness.sql",
      "docs/operations/free-plan-recovery.md",
      "tests/fixtures/public-synthetic-bank.json",
    ])).toEqual([]);
  });

  it("returns sorted unique violations", () => {
    expect(forbiddenRecoveryArtifactPaths([
      "z.dump",
      "a.age",
      "z.dump",
    ])).toEqual(["a.age", "z.dump"]);
  });
});
