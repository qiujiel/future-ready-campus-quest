import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const knownFalsePositive =
  "571c995d7214c5579f4569b3801c43fca257ac54:supabase/tests/join_cohort.test.ts:generic-api-key:232";

describe("Gitleaks fingerprint ignore", () => {
  it("allows only the confirmed historical test finding", () => {
    const ignoredFindings = readFileSync(
      resolve(process.cwd(), ".gitleaksignore"),
      "utf8",
    ).trim().split(/\r?\n/).filter(Boolean);

    expect(ignoredFindings).toEqual([knownFalsePositive]);
  });

  it("does not allow nearby generic-api-key findings", () => {
    const ignoredFindings = readFileSync(
      resolve(process.cwd(), ".gitleaksignore"),
      "utf8",
    ).trim().split(/\r?\n/).filter(Boolean);

    expect(ignoredFindings).not.toContain(
      "571c995d7214c5579f4569b3801c43fca257ac54:supabase/tests/join_cohort.test.ts:generic-api-key:233",
    );
    expect(ignoredFindings).not.toContain(
      "571c995d7214c5579f4569b3801c43fca257ac54:supabase/tests/join_cohort.test.ts:generic-api-key:244",
    );
  });
});
