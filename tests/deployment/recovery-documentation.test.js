import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (name) => readFile(
  `${process.cwd()}/docs/operations/${name}`,
  "utf8",
);

describe("Free-plan recovery operations", () => {
  it("documents complete encrypted backup custody and hosted rehearsal", async () => {
    const runbook = await read("free-plan-recovery.md");
    for (const phrase of [
      "ghohuwwjxgjqnbsauvzq",
      "vadyhuipwbtgbzpeisbn",
      "group-images",
      "roles.sql",
      "history_data.sql",
      "age",
      "SHA-256",
      "latest three",
      "30 days",
      "less than 24 hours",
      "Singapore",
    ]) expect(runbook).toContain(phrase);
    expect(runbook).toMatch(/never.*restore.*vadyhuipwbtgbzpeisbn/is);
  });

  it("requires every evidence field in the formal checklist", async () => {
    const checklist = await read("release-checklist.md");
    for (const field of [
      "backup evidence ID",
      "backup creation time",
      "encrypted archive SHA-256",
      "restore rehearsal evidence ID",
      "cloud-copy",
      "offline-copy",
      "load-test project reactivated",
    ]) expect(checklist.toLowerCase()).toContain(field.toLowerCase());
  });

  it("keeps the readiness decision on HOLD until external controls finish", async () => {
    const review = await read("deployment-readiness-review.md");
    expect(review).toMatch(/decision:\s*hold/i);
    expect(review).toContain("ghohuwwjxgjqnbsauvzq");
    expect(review).toContain("vadyhuipwbtgbzpeisbn");
    expect(review).toMatch(/GitHub.*environment/is);
    expect(review).toMatch(/restore rehearsal/is);
  });
});
