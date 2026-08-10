import { describe, expect, it, vi } from "vitest";
import * as productionPreflight from "../../scripts/production-preflight-core.mjs";
import {
  evaluateReadinessReport,
  fetchReadinessReport,
  readPreflightConfiguration,
} from "../../scripts/production-preflight-core.mjs";

function functionEnvironment(overrides = {}) {
  return {
    PRODUCTION_FRONTEND_ORIGIN: "https://qiujiel.github.io",
    VITE_BASE_PATH: "/future-ready-campus-quest/",
    ALLOWED_FRONTEND_ORIGINS: "https://qiujiel.github.io",
    FRONTEND_APP_URL:
      "https://qiujiel.github.io/future-ready-campus-quest",
    JOIN_TOKEN_SIGNING_SECRET: "j".repeat(32),
    RECOVERY_TOKEN_SIGNING_SECRET: "r".repeat(32),
    STUDENT_LOGIN_SIGNING_SECRET: "s".repeat(32),
    PRODUCTION_READINESS_SECRET: "p".repeat(32),
    ...overrides,
  };
}

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
    latestGateDMigration: "20260810001000",
    requiredFunctionsPresent: true,
    studentLoginObjectsPresent: true,
    studentLoginSecurityReady: true,
    cleanupScheduleReady: true,
    edgeFunctionsReady: 11,
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

describe("production Edge Function configuration", () => {
  const readFunctionConfiguration = (environment) =>
    productionPreflight.readProductionFunctionConfiguration(environment);

  it("derives the hosted application URL from the origin and Pages base path", () => {
    expect(readFunctionConfiguration(functionEnvironment())).toEqual({
      frontendOrigin: "https://qiujiel.github.io",
      basePath: "/future-ready-campus-quest/",
      frontendAppUrl:
        "https://qiujiel.github.io/future-ready-campus-quest",
      allowedOriginCount: 1,
      secretCount: 4,
    });
  });

  it("rejects a frontend application URL that omits the Pages base path", () => {
    expect(() =>
      readFunctionConfiguration(
        functionEnvironment({
          FRONTEND_APP_URL: "https://qiujiel.github.io",
        }),
      )
    ).toThrow(/FRONTEND_APP_URL.*VITE_BASE_PATH/i);
  });

  it("allows one trailing slash on the frontend application URL", () => {
    const configuration = readFunctionConfiguration(
      functionEnvironment({
        FRONTEND_APP_URL:
          "https://qiujiel.github.io/future-ready-campus-quest/",
      }),
    );

    expect(configuration.frontendAppUrl).toBe(
      "https://qiujiel.github.io/future-ready-campus-quest",
    );
  });

  it.each([
    "https://qiujiel.github.io/future-ready-campus-quest",
    "https://qiujiel.github.io,https://school.example",
  ])("rejects a production CORS allow-list that is not the exact origin: %s", (value) => {
    expect(() =>
      readFunctionConfiguration(
        functionEnvironment({ ALLOWED_FRONTEND_ORIGINS: value }),
      )
    ).toThrow(/ALLOWED_FRONTEND_ORIGINS.*origin/i);
  });

  it("rejects short or reused protected secrets", () => {
    expect(() =>
      readFunctionConfiguration(
        functionEnvironment({ JOIN_TOKEN_SIGNING_SECRET: "too-short" }),
      )
    ).toThrow(/JOIN_TOKEN_SIGNING_SECRET.*32 bytes/i);

    const reused = "reused-secret-1234567890123456789012";
    expect(() =>
      readFunctionConfiguration(
        functionEnvironment({
          JOIN_TOKEN_SIGNING_SECRET: reused,
          RECOVERY_TOKEN_SIGNING_SECRET: reused,
        }),
      )
    ).toThrow(/must not be reused/i);
  });

  it("does not return protected secret values", () => {
    const environment = functionEnvironment();
    const result = JSON.stringify(readFunctionConfiguration(environment));

    expect(result).not.toContain(environment.JOIN_TOKEN_SIGNING_SECRET);
    expect(result).not.toContain(environment.RECOVERY_TOKEN_SIGNING_SECRET);
    expect(result).not.toContain(environment.STUDENT_LOGIN_SIGNING_SECRET);
    expect(result).not.toContain(environment.PRODUCTION_READINESS_SECRET);
  });

  it("requires a distinct strong student login signing secret", () => {
    expect(() =>
      readFunctionConfiguration(
        functionEnvironment({ STUDENT_LOGIN_SIGNING_SECRET: "too-short" }),
      )
    ).toThrow(/STUDENT_LOGIN_SIGNING_SECRET.*32 bytes/i);

    expect(() =>
      readFunctionConfiguration(
        functionEnvironment({
          STUDENT_LOGIN_SIGNING_SECRET: "j".repeat(32),
        }),
      )
    ).toThrow(/must not be reused/i);
  });
});

describe("production readiness report", () => {
  it("accepts authoritative Gate D evidence", () => {
    const configuration = readPreflightConfiguration(environment());

    expect(evaluateReadinessReport(readinessReport(), configuration)).toEqual({
      latestGateDMigration: "20260810001000",
      cleanupScheduleReady: true,
      edgeFunctionsReady: 11,
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

  it("rejects a database report that predates the security-readiness migration", () => {
    const configuration = readPreflightConfiguration(environment(), {
      backendOnly: true,
    });

    expect(() => evaluateReadinessReport(
      readinessReport({ latestGateDMigration: "20260810000900" }),
      configuration,
    )).toThrow(/required Gate D migrations/i);
  });

  it("rejects a database report missing the student-login RPCs or private objects", () => {
    const configuration = readPreflightConfiguration(environment(), {
      backendOnly: true,
    });

    expect(() => evaluateReadinessReport(
      readinessReport({
        studentLoginObjectsPresent: false,
      }),
      configuration,
    )).toThrow(/student-login RPCs or private objects/i);
  });

  it("rejects student-login ownership, RLS, search-path, or ACL drift", () => {
    const configuration = readPreflightConfiguration(environment(), {
      backendOnly: true,
    });

    expect(() => evaluateReadinessReport(
      readinessReport({ studentLoginSecurityReady: false }),
      configuration,
    )).toThrow(/student-login runtime security/i);
  });

  it("omits classroom fixtures from backend-only evidence", () => {
    const configuration = readPreflightConfiguration(environment(), {
      backendOnly: true,
    });

    expect(evaluateReadinessReport(readinessReport(), configuration)).toEqual({
      latestGateDMigration: "20260810001000",
      cleanupScheduleReady: true,
      edgeFunctionsReady: 11,
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
