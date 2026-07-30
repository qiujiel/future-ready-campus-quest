import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("orders migrations with the identity RLS helpers before join policies", () => {
  const directory = join(process.cwd(), "supabase", "migrations");
  const migrations = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  const identityRls = migrations.findIndex((name) => name.includes("identity_rls"));
  const joinWindows = migrations.findIndex((name) => name.includes("join_windows"));

  expect(identityRls).toBeGreaterThanOrEqual(0);
  expect(joinWindows).toBeGreaterThan(identityRls);
  expect(migrations.every((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))).toBe(
    true,
  );
});

it("scans every reachable Git object for protected historical paths", () => {
  const source = readFileSync(
    join(process.cwd(), "scripts", "check-repository.mjs"),
    "utf8",
  );

  expect(source).toContain("rev-list");
  expect(source).toContain("--objects");
  expect(source).toContain("--all");
  expect(() =>
    execFileSync("node", ["scripts/check-repository.mjs"], {
      cwd: process.cwd(),
      stdio: "pipe",
    }),
  ).not.toThrow();
});
