import { describe, expect, it, vi } from "vitest";
import {
  evaluateReadinessReport,
  fetchReadinessReport,
  readPreflightConfiguration,
} from "../../scripts/production-preflight-core.mjs";

function environment(overrides = {}) {
  return {
    PRODUCTION_SUPABASE_URL: "https://production-project.supabase.co",
    PRODUCTION_SUPABASE_PROJECT_REF: "production-project",
    LOAD_SUPABASE_PROJECT_REF: "vadyhuipwbtgbzpeisbn",
    PRODUCTION_SUPABASE_PUBLISHABLE_KEY:
      "synthetic-public-publishable-key-for-tests",
    PRODUCTION_READINESS_SECRET:
      "synthetic-readiness-secret-at-least-32-bytes",
    PRODUCTION_FRONTEND_ORIGIN: "https://school.example",
    PRODUCTION_CONTENT_VERSION: "approved-v1",
    PRODUCTION_SMOKE_TEACHER_ID:
      "00000000-0000-0000-0000-000000000001",
    PRODUCTION_SMOKE_COHORT_ID:
      "00000000-0000-0000-0000-000000000002",
    VITE_BASE_PATH: "/campus-quest/",
    ...overrides,
  };
}

function readinessReport(overrides = {}) {
  return {
    requiredMigrationsPresent: true,
    latestGateDMigration: "20260806000700",
    requiredFunctionsPresent: true,
    cleanupScheduleReady: true,
    edgeFunctionsReady: 10,
    openJoinWindows: 0,
    openRecoveryTokens: 0,
    contentVersion: {
      versionKey: "approved-v1",
      itemCount: 24,
      conceptCount: 8,
    },
    smokeFixtureReady: true,
    retentionDays: 365,
    ...overrides,
  };
}

describe("production preflight configuration", () => {
  it("rejects the dedicated load project as production", () => {
    expect(() =>
      readPreflightConfiguration(
        environment({
          PRODUCTION_SUPABASE_URL:
            "https://vadyhuipwbtgbzpeisbn.supabase.co",
          PRODUCTION_SUPABASE_PROJECT_REF: "vadyhuipwbtgbzpeisbn",
        }),
      )
    ).toThrow(/load-test project/i);
  });

  it("rejects a production URL that does not match the confirmed ref", () => {
    expect(() =>
      readPreflightConfiguration(
        environment({ PRODUCTION_SUPABASE_PROJECT_REF: "another-project" }),
      )
    ).toThrow(/does not match/i);
  });

  it.each([
    "https://user@production-project.supabase.co",
    "https://production-project.supabase.co:8443",
  ])("rejects a non-canonical production URL: %s", (url) => {
    expect(() =>
      readPreflightConfiguration(
        environment({ PRODUCTION_SUPABASE_URL: url }),
      )
    ).toThrow(/project root/i);
  });

  it("requires full-release fixtures only outside backend-only mode", () => {
    const withoutFixtures = environment({
      PRODUCTION_CONTENT_VERSION: "",
      PRODUCTION_SMOKE_TEACHER_ID: "",
      PRODUCTION_SMOKE_COHORT_ID: "",
    });

    expect(() => readPreflightConfiguration(withoutFixtures)).toThrow(
      /PRODUCTION_CONTENT_VERSION/,
    );
    expect(() =>
      readPreflightConfiguration(withoutFixtures, { backendOnly: true })
    ).not.toThrow();
  });
});

describe("production readiness report", () => {
  it("accepts authoritative Gate D evidence", () => {
    const configuration = readPreflightConfiguration(environment());

    expect(evaluateReadinessReport(readinessReport(), configuration)).toEqual({
      latestGateDMigration: "20260806000700",
      cleanupScheduleReady: true,
      edgeFunctionsReady: 10,
      contentVersion: {
        versionKey: "approved-v1",
        itemCount: 24,
        conceptCount: 8,
      },
      smokeFixtureReady: true,
      retentionDays: 365,
      basePath: "/campus-quest/",
    });
  });

  it("rejects missing migrations and atomic session-close support", () => {
    const configuration = readPreflightConfiguration(environment(), {
      backendOnly: true,
    });

    expect(() =>
      evaluateReadinessReport(
        readinessReport({
          requiredMigrationsPresent: false,
          requiredFunctionsPresent: false,
        }),
        configuration,
      )
    ).toThrow(/required Gate D migrations.*required Gate D functions/i);
  });

  it("omits classroom fixtures from backend-only evidence", () => {
    const configuration = readPreflightConfiguration(environment(), {
      backendOnly: true,
    });

    expect(evaluateReadinessReport(readinessReport(), configuration)).toEqual({
      latestGateDMigration: "20260806000700",
      cleanupScheduleReady: true,
      edgeFunctionsReady: 10,
      basePath: "/campus-quest/",
    });
  });

  it("rejects a missing, disabled, duplicated, or altered cleanup schedule", () => {
    const configuration = readPreflightConfiguration(environment(), {
      backendOnly: true,
    });

    expect(() => evaluateReadinessReport(
      readinessReport({ cleanupScheduleReady: false }),
      configuration,
    )).toThrow(/cleanup schedule/i);
  });

  it("rejects incomplete server-side function probes", () => {
    const configuration = readPreflightConfiguration(environment(), {
      backendOnly: true,
    });

    expect(() => evaluateReadinessReport(
      readinessReport({ edgeFunctionsReady: 9 }),
      configuration,
    )).toThrow(/Edge Function boundaries/i);
  });
});

describe("least-privilege readiness endpoint", () => {
  it("uses the dedicated readiness secret instead of a service-role key", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify(readinessReport()),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const configuration = readPreflightConfiguration(environment(), {
      backendOnly: true,
    });

    await expect(fetchReadinessReport(configuration, fetcher)).resolves
      .toMatchObject({ cleanupScheduleReady: true });
    expect(fetcher).toHaveBeenCalledWith(
      "https://production-project.supabase.co/functions/v1/production-readiness",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-production-readiness-key":
            "synthetic-readiness-secret-at-least-32-bytes",
        }),
      }),
    );
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("service-role");
  });
});
