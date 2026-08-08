import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260808000100_classroom_nat_join_capacity.sql",
);

describe("classroom NAT join capacity migration", () => {
  it("supports a 30-student shared network while retaining the window cap", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).toContain("count(*) >= 90");
    expect(sql).toContain("count(*) >= 45");
    expect(sql).not.toContain("count(*) >= 12");
    expect(sql).toContain("private.join_attempts");
  });
});
