import { describe, expect, it, vi } from "vitest";
import {
  EDGE_FUNCTION_NAMES,
  evaluateReadinessReport,
  probeEdgeFunctions,
  readPreflightConfiguration,
} from "../../scripts/production-preflight-core.mjs";

function environment(overrides = {}) {
  return {
    PRODUCTION_SUPABASE_URL: "https://production-project.supabase.co",
    PRODUCTION_SUPABASE_PROJECT_REF: "production-project",
    LOAD_SUPABASE_PROJECT_REF: "vadyhuipwbtgbzpeisbn",
    PRODUCTION_SUPABASE_PUBLISHABLE_KEY:
      "synthetic-public-publishable-key-for-tests",
    PRODUCTION_SUPABASE_SERVICE_ROLE_KEY:
      "synthetic-service-role-key-for-tests",
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
    latestGateDMigration: "20260730020700",
    requiredFunctionsPresent: true,
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
      latestGateDMigration: "20260730020700",
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
      latestGateDMigration: "20260730020700",
      basePath: "/campus-quest/",
    });
  });
});

describe("Edge Function readiness probes", () => {
  it("requires the deployed method boundary from all ten functions", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 405 }));
    const configuration = readPreflightConfiguration(environment(), {
      backendOnly: true,
    });

    await expect(probeEdgeFunctions(configuration, fetcher)).resolves.toEqual({
      edgeFunctionsReady: 10,
    });
    expect(fetcher).toHaveBeenCalledTimes(EDGE_FUNCTION_NAMES.length);
    expect(fetcher).toHaveBeenCalledWith(
      "https://production-project.supabase.co/functions/v1/teacher-controls",
      {
        method: "GET",
        headers: {
          apikey: "synthetic-public-publishable-key-for-tests",
          Authorization:
            "Bearer synthetic-service-role-key-for-tests",
          Origin: "https://school.example",
        },
      },
    );
  });

  it.each([404, 500])(
    "rejects an unavailable function response with status %s",
    async (status) => {
      const fetcher = vi.fn(async (url) =>
        new Response(null, {
          status: String(url).endsWith("/teacher-controls") ? status : 405,
        })
      );
      const configuration = readPreflightConfiguration(environment(), {
        backendOnly: true,
      });

      await expect(probeEdgeFunctions(configuration, fetcher)).rejects.toThrow(
        new RegExp(`teacher-controls returned ${status}`),
      );
    },
  );
});
