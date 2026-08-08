import { describe, expect, it } from "vitest";
import {
  readDedicatedLoadConfiguration,
} from "../../scripts/load-project-guard.mjs";

const dedicatedRef = "vadyhuipwbtgbzpeisbn";

function validEnvironment() {
  return {
    LOAD_SUPABASE_PROJECT_REF: dedicatedRef,
    LOAD_SUPABASE_URL: `https://${dedicatedRef}.supabase.co`,
    LOAD_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_load-key",
    LOAD_SUPABASE_SECRET_KEY: "sb_secret_load-key",
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

  it("requires the modern load-test key names without static classroom credentials", () => {
    const configuration = readDedicatedLoadConfiguration(validEnvironment());

    expect(configuration).toEqual({
      projectRef: dedicatedRef,
      apiUrl: `https://${dedicatedRef}.supabase.co`,
      publishableKey: "sb_publishable_load-key",
      secretKey: "sb_secret_load-key",
    });
    expect(configuration).not.toHaveProperty("teacherToken");
    expect(configuration).not.toHaveProperty("joinToken");
    expect(configuration).not.toHaveProperty("cohortId");
  });

  it("rejects legacy load-test service-role configuration", () => {
    const environment = validEnvironment();
    delete environment.LOAD_SUPABASE_SECRET_KEY;
    environment.LOAD_SUPABASE_SERVICE_ROLE_KEY = "legacy-load-key";

    expect(() => readDedicatedLoadConfiguration(environment)).toThrow(
      /LOAD_SUPABASE_SECRET_KEY/,
    );
  });
});
