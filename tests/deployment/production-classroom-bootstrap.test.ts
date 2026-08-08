import { describe, expect, it } from "vitest";
import {
  RETENTION_QUERY,
  assertBootstrapConfiguration,
  type BootstrapConfiguration,
} from "../../scripts/production-classroom-bootstrap";

const validConfiguration: BootstrapConfiguration = {
  supabaseUrl: "https://ghohuwwjxgjqnbsauvzq.supabase.co",
  productionProjectRef: "ghohuwwjxgjqnbsauvzq",
  loadProjectRef: "vadyhuipwbtgbzpeisbn",
  secretKey: "synthetic-modern-secret",
  accessToken: "synthetic-management-token",
  teacherEmail: "teacher@example.test",
  teacherPassword: "Example@2026",
  retentionDays: 90,
  authorizationId: "course-owner-2026-08-08",
};

describe("production classroom bootstrap configuration", () => {
  it("accepts only the exact approved production configuration", () => {
    expect(() => assertBootstrapConfiguration(validConfiguration)).not.toThrow();
  });

  it("rejects the load-test project as the production target", () => {
    expect(() => assertBootstrapConfiguration({
      ...validConfiguration,
      productionProjectRef: "vadyhuipwbtgbzpeisbn",
    })).toThrow(/production identity/i);
  });

  it("rejects a retention period outside the course-owner approval", () => {
    expect(() => assertBootstrapConfiguration({
      ...validConfiguration,
      retentionDays: 89,
    })).toThrow(/retention authorization/i);
  });

  it("rejects a weak temporary teacher credential", () => {
    expect(() => assertBootstrapConfiguration({
      ...validConfiguration,
      teacherPassword: "short",
    })).toThrow(/teacher credential policy/i);
  });

  it("uses only parameter placeholders in the fixed retention query", () => {
    expect(RETENTION_QUERY).toContain("private.data_retention_configuration");
    expect(RETENTION_QUERY).toContain("$1");
    expect(RETENTION_QUERY).toContain("$2");
    expect(RETENTION_QUERY).not.toMatch(/90|course-owner/);
  });
});
