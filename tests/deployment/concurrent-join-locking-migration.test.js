import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260808000200_concurrent_join_locking.sql",
);

describe("concurrent classroom join locking migration", () => {
  it("keeps exact rate enforcement without exclusive class-wide row locks", async () => {
    const sql = (await readFile(migration, "utf8")).toLowerCase();

    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("count(*) >= 45");
    expect(sql).toContain("count(*) >= 90");
    expect(sql).toContain("for share of codes, windows");
    expect(sql).toContain("for update of groups");
    expect(sql).toContain("create or replace function public.complete_student_join");
    expect(sql).not.toContain("for update of codes, windows, groups");
    expect(sql).not.toContain("delete from private.join_attempts");
  });
});
