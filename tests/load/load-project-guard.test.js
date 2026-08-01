import { describe, expect, it } from "vitest";
import {
  readDedicatedLoadConfiguration,
} from "../../scripts/load-project-guard.mjs";

const dedicatedRef = "vadyhuipwbtgbzpeisbn";

function validEnvironment() {
  return {
    LOAD_SUPABASE_PROJECT_REF: dedicatedRef,
    LOAD_SUPABASE_URL: `https://${dedicatedRef}.supabase.co`,
    LOAD_SUPABASE_ANON_KEY: "load-anon-key",
    LOAD_SUPABASE_SERVICE_ROLE_KEY: "load-service-key",
    LOAD_TEACHER_ACCESS_TOKEN: "load-teacher-token",
    LOAD_COHORT_ID: "00000000-0000-0000-0000-000000000001",
    LOAD_JOIN_TOKEN: "load-join-token",
    LOAD_CONTENT_VERSION_ID: "00000000-0000-0000-0000-000000000002",
  };
}

describe("dedicated live-load project guard", () => {
  it("accepts only the exact dedicated project URL and ref", () => {
    expect(readDedicatedLoadConfiguration(validEnvironment())).toMatchObject({
      projectRef: dedicatedRef,
      apiUrl: `https://${dedicatedRef}.supabase.co`,
    });
  });

  it("rejects a production URL before returning live credentials", () => {
    const environment = validEnvironment();
    environment.LOAD_SUPABASE_URL =
      "https://abcdefghijklmnopqrst.supabase.co";

    expect(() => readDedicatedLoadConfiguration(environment)).toThrow(
      /dedicated load-test project/i,
    );
  });

  it("rejects a misconfigured load project reference", () => {
    const environment = validEnvironment();
    environment.LOAD_SUPABASE_PROJECT_REF = "abcdefghijklmnopqrst";

    expect(() => readDedicatedLoadConfiguration(environment)).toThrow(
      /dedicated load-test project/i,
    );
  });

  it.each([
    `https://user@${dedicatedRef}.supabase.co`,
    `https://${dedicatedRef}.supabase.co:444`,
  ])("rejects non-literal dedicated project URL %s", (apiUrl) => {
    expect(() => readDedicatedLoadConfiguration({
      ...validEnvironment(),
      LOAD_SUPABASE_URL: apiUrl,
    })).toThrow(/exact dedicated load-test project/i);
  });
});
